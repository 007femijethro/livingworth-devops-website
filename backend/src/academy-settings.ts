// @ts-nocheck
import { createHash } from 'node:crypto';
import { logger } from './logger.js';

export function settingsDefaults() {
  return {
    academyName: 'Livingworth Academy', supportEmail: '', supportPhone: '', registrationOpen: true,
    classTime: /^\d{2}:\d{2}$/.test(process.env.CLASS_TIME || '') ? process.env.CLASS_TIME : '20:00',
    classTimezone: process.env.CLASS_TIMEZONE || 'Africa/Lagos', classDays: [1, 3, 5], classDurationMinutes: 60,
    meetingUrl: process.env.CLASS_MEETING_LINK || 'https://meet.google.com/paj-rthm-woe',
    expiryHours: 72, emailEnabled: true,
    remindersEnabled: String(process.env.EMAIL_REMINDERS_ENABLED).toLowerCase() === 'true',
    classReminderMinutes: Math.max(5, Number(process.env.CLASS_REMINDER_MINUTES || 60)),
    quizReminderMinutes: Math.max(5, Number(process.env.QUIZ_REMINDER_MINUTES || 30)),
    certificateRequiredScore: 75, attendanceAlertScore: 75, studentSessionHours: 8, classRepLimit: 2, mobileUpdatesEnabled: true,
  };
}
let current = settingsDefaults();
export const getAcademySettings = () => structuredClone(current);
const legacy = { expiryHours: 'class_code_expiry_hours', emailEnabled: 'email_notifications' };
const settingKey = key => legacy[key] || `academy_${key}`;
const keys = Object.keys(settingsDefaults());
export function validateSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length) throw new Error('Choose settings to save.');
  const result = {};
  const ranges = { expiryHours:[1,720], classDurationMinutes:[15,240], classReminderMinutes:[5,1440], quizReminderMinutes:[5,1440], certificateRequiredScore:[1,100], attendanceAlertScore:[1,100], studentSessionHours:[1,24], classRepLimit:[1,5] };
  for (const [key, value] of Object.entries(input)) {
    if (!keys.includes(key)) throw new Error(`Unknown setting: ${key}`);
    if (ranges[key]) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < ranges[key][0] || value > ranges[key][1]) throw new Error(`${key} must be a whole number between ${ranges[key][0]} and ${ranges[key][1]}.`);
      result[key] = value;
    } else if (['registrationOpen','emailEnabled','remindersEnabled','mobileUpdatesEnabled'].includes(key)) {
      if (typeof value !== 'boolean') throw new Error(`${key} must be on or off.`);
      result[key] = value;
    } else if (key === 'classDays') {
      if (!Array.isArray(value) || !value.length || value.length > 7 || value.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('Choose at least one valid class day.');
      result[key] = [...new Set(value)].sort();
    } else {
      if (typeof value !== 'string') throw new Error(`${key} must be text.`);
      const text = value.trim();
      if (key === 'academyName' && (!text || text.length > 100)) throw new Error('Portal name must contain 1–100 characters.');
      if (key === 'supportEmail' && text && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) || text.length > 180)) throw new Error('Enter a valid support email address.');
      if (key === 'supportPhone' && text && !/^[+0-9 ()-]{5,30}$/.test(text)) throw new Error('Enter a valid support phone number.');
      if (key === 'classTime' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw new Error('Choose a valid class time.');
      if (key === 'classTimezone') { try { new Intl.DateTimeFormat('en', {timeZone:text}).format(); } catch { throw new Error('Choose a valid IANA time zone.'); } }
      if (key === 'meetingUrl') {
        try { const url = new URL(text); if (url.protocol !== 'https:' || url.hostname !== 'meet.google.com' || url.username || url.password) throw new Error(); }
        catch { throw new Error('Enter an HTTPS Google Meet link.'); }
      }
      result[key] = text;
    }
  }
  return result;
}

async function readSettings(pool, lock = false) {
  const [rows] = await pool.execute(`SELECT setting_key AS settingKey, enabled, value_text AS valueText, updated_at AS updatedAt FROM system_settings${lock ? ' FOR UPDATE' : ''}`);
  const settings = settingsDefaults();
  for (const key of keys) {
    const row = rows.find(row => row.settingKey === settingKey(key));
    if (!row) continue;
    try {
      const value = key === 'emailEnabled' ? row.enabled : key === 'expiryHours' ? Number(row.valueText) : JSON.parse(row.valueText);
      settings[key] = validateSettings({[key]:value})[key];
    } catch { /* An invalid legacy setting retains its documented default. */ }
  }
  const revision = createHash('sha256').update(JSON.stringify(rows.map(row=>[row.settingKey,row.enabled,row.valueText,row.updatedAt]).sort(([a],[b])=>a.localeCompare(b)))).digest('hex');
  return {settings,revision};
}
export async function loadAcademySettings(pool) { const result=await readSettings(pool);current=result.settings;return result; }
export function registerAcademySettingsRoutes(app,pool,requireAuth,requireAdmin) {
  app.get('/api/academy-settings',(_req,res)=>{
    const {academyName,supportEmail,supportPhone,registrationOpen,classTime,classTimezone,classDays,classDurationMinutes,meetingUrl,certificateRequiredScore,classRepLimit}=getAcademySettings();
    res.set('Cache-Control','no-store').json({academyName,supportEmail,supportPhone,registrationOpen,classTime,classTimezone,classDays,classDurationMinutes,meetingUrl,certificateRequiredScore,classRepLimit});
  });
  app.get('/api/admin/settings',requireAuth,requireAdmin,async(_req,res,next)=>{
    try {res.json(await loadAcademySettings(pool));}catch(error){next(error)}
  });
  app.patch('/api/admin/settings',requireAuth,requireAdmin,async(req,res,next)=>{
    let changes;
    try {changes=validateSettings(req.body.settings)}catch(error){return res.status(400).json({message:error.message})}
    const connection=await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute('SELECT pg_advisory_xact_lock(4792101)');
      const before=await readSettings(connection,true);
      if (req.body.revision !== before.revision) {await connection.rollback();return res.status(409).json({message:'Settings changed since you opened this page. Reload settings before saving.'})}
      for (const [key,value] of Object.entries(changes)) await connection.execute(`INSERT INTO system_settings (setting_key,enabled,value_text,updated_by,updated_at)
        VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT (setting_key) DO UPDATE SET enabled=EXCLUDED.enabled,value_text=EXCLUDED.value_text,updated_by=EXCLUDED.updated_by,updated_at=CURRENT_TIMESTAMP`,
        [settingKey(key),key==='emailEnabled'?value:true,key==='expiryHours'?String(value):JSON.stringify(value),req.user.id]);
      if ('expiryHours' in changes) await connection.execute(`UPDATE live_classes SET attendance_expires_at=scheduled_at + (? * INTERVAL '1 hour') WHERE attendance_code IS NOT NULL AND attendance_finalized_at IS NULL`,[changes.expiryHours]);
      await connection.commit();
      const result=await loadAcademySettings(pool);
      logger.info('academy_settings_updated',{actorId:req.user.id,changedSettings:Object.keys(changes)});
      res.json({...result,message:'Settings saved. New settings are now active.'});
    }catch(error){await connection.rollback();next(error)}finally{connection.release()}
  });
}
