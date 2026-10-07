// @ts-nocheck
import crypto from 'node:crypto';
import { logger } from './logger.js';

const publicClassFields = `lc.id, lc.title, lc.scheduled_at AS "scheduledAt", lc.duration_minutes AS "durationMinutes",
  lc.meeting_url AS "meetingUrl", lc.status, lc.started_at AS "startedAt", lc.ended_at AS "endedAt",
  lc.attendance_expires_at AS "attendanceExpiresAt", lc.created_at AS "createdAt", creator.full_name AS "createdBy",
  (SELECT COUNT(*) FROM live_class_attendance_submissions submission WHERE submission.class_id = lc.id) AS "attendanceCount"`;

function validId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validMeetingUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' && url.hostname === 'meet.google.com' ? url.toString() : null;
  } catch { return null; }
}

function attendanceCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(6), byte => alphabet[byte % alphabet.length]).join('');
}

export function registerLiveClassRoutes(app, pool, requireAuth, requireStaff) {
  app.get('/api/live-classes', requireAuth, async (req, res, next) => {
    try {
      const staff = ['admin', 'mentor'].includes(req.user.role);
      const where = staff ? '' : `WHERE lc.status IN ('scheduled','live') OR lc.attendance_expires_at >= CURRENT_TIMESTAMP`;
      const ownSubmission = staff ? ', lc.attendance_code AS "attendanceCode"' : `,
        EXISTS (SELECT 1 FROM live_class_attendance_submissions own WHERE own.class_id=lc.id AND own.student_id=?) AS "attendanceSubmitted"`;
      const [rows] = await pool.query(`SELECT ${publicClassFields}${ownSubmission}
        FROM live_classes lc JOIN users creator ON creator.id = lc.created_by ${where}
        ORDER BY CASE lc.status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, lc.scheduled_at DESC LIMIT 40`, staff ? [] : [req.user.id]);
      res.json(rows.map(row => ({ ...row, attendanceCount: Number(row.attendanceCount || 0) })));
    } catch (error) { next(error); }
  });

  app.post('/api/staff/live-classes', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const title = String(req.body.title || '').trim().slice(0, 180);
      const scheduledAt = new Date(req.body.scheduledAt);
      const durationMinutes = Number.parseInt(req.body.durationMinutes, 10) || 60;
      const meetingUrl = validMeetingUrl(req.body.meetingUrl || process.env.CLASS_MEETING_LINK);
      if (title.length < 3) return res.status(400).json({ message: 'Enter a class title.' });
      if (Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ message: 'Choose a valid class date and time.' });
      if (durationMinutes < 15 || durationMinutes > 240) return res.status(400).json({ message: 'Class duration must be between 15 and 240 minutes.' });
      if (!meetingUrl) return res.status(400).json({ message: 'Enter a valid Google Meet link beginning with https://meet.google.com/.' });
      const code = attendanceCode();
      const expiresAt = new Date(scheduledAt.getTime() + 72 * 60 * 60 * 1000);
      const roomName = `google-meet-${crypto.randomBytes(12).toString('hex')}`;
      const [result] = await pool.execute(`INSERT INTO live_classes
        (title,scheduled_at,duration_minutes,room_name,meeting_url,attendance_code,attendance_expires_at,created_by)
        VALUES (?,?,?,?,?,?,?,?)`, [title, scheduledAt.toISOString(), durationMinutes, roomName, meetingUrl, code, expiresAt.toISOString(), req.user.id]);
      logger.info('google_meet_class_scheduled', { classId: result.insertId, userId: req.user.id, scheduledAt, expiresAt });
      res.status(201).json({ id: result.insertId, attendanceCode: code, attendanceExpiresAt: expiresAt, message: 'Google Meet class scheduled and attendance code generated.' });
    } catch (error) { next(error); }
  });

  app.patch('/api/staff/live-classes/:id/start', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const id = validId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Choose a valid class.' });
      const [result] = await pool.execute("UPDATE live_classes SET status='live', started_at=COALESCE(started_at,CURRENT_TIMESTAMP), ended_at=NULL WHERE id=? AND status IN ('scheduled','live')", [id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Scheduled class not found.' });
      logger.info('google_meet_class_started', { classId: id, userId: req.user.id });
      res.json({ message: 'Class started. Students can now open Google Meet.' });
    } catch (error) { next(error); }
  });

  app.patch('/api/staff/live-classes/:id/end', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const id = validId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Choose a valid class.' });
      const [result] = await pool.execute("UPDATE live_classes SET status='ended', ended_at=CURRENT_TIMESTAMP WHERE id=? AND status='live'", [id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Live class not found.' });
      logger.info('google_meet_class_ended', { classId: id, userId: req.user.id });
      res.json({ message: 'Class ended. The attendance code remains valid until its 72-hour deadline.' });
    } catch (error) { next(error); }
  });

  app.delete('/api/staff/live-classes/:id', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const id = validId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Choose a valid class.' });
      const [result] = await pool.execute("DELETE FROM live_classes WHERE id=? AND status <> 'live'", [id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Class not found or still live. End it before deleting.' });
      res.json({ message: 'Scheduled class and its code submissions were deleted.' });
    } catch (error) { next(error); }
  });

  app.get('/api/staff/live-classes/:id/attendance', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const id = validId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Choose a valid class.' });
      const [rows] = await pool.execute(`SELECT u.id AS "studentId", u.full_name AS "fullName", u.email,
        submission.submitted_at AS "submittedAt"
        FROM users u CROSS JOIN live_classes lc
        LEFT JOIN live_class_attendance_submissions submission ON submission.class_id=lc.id AND submission.student_id=u.id
        WHERE lc.id=? AND u.role='student' AND u.status='approved'
        ORDER BY CASE WHEN submission.id IS NULL THEN 1 ELSE 0 END, u.full_name`, [id]);
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.post('/api/live-classes/attendance', requireAuth, async (req, res, next) => {
    if (req.user.role !== 'student' || req.user.status !== 'approved') return res.status(403).json({ message: 'Approved student access required.' });
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) return res.status(400).json({ message: 'Enter the six-character attendance code.' });
    let connection;
    let transactionStarted = false;
    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();
      transactionStarted = true;
      const [classes] = await connection.execute(`SELECT id,title,scheduled_at AS "scheduledAt",attendance_expires_at AS "attendanceExpiresAt",created_by AS "createdBy"
        FROM live_classes WHERE attendance_code=? FOR UPDATE`, [code]);
      if (!classes.length) { await connection.rollback(); return res.status(404).json({ message: 'That attendance code is not valid.' }); }
      const liveClass = classes[0];
      const now = new Date();
      if (now < new Date(liveClass.scheduledAt)) { await connection.rollback(); return res.status(400).json({ message: 'This attendance code is not active yet.' }); }
      if (now > new Date(liveClass.attendanceExpiresAt)) { await connection.rollback(); return res.status(410).json({ message: 'This attendance code expired after 72 hours. Contact your mentor.' }); }
      const [existing] = await connection.execute('SELECT id FROM live_class_attendance_submissions WHERE class_id=? AND student_id=?', [liveClass.id, req.user.id]);
      if (existing.length) { await connection.rollback(); return res.status(409).json({ message: 'You already submitted attendance for this class.' }); }
      await connection.execute('INSERT INTO live_class_attendance_submissions (class_id,student_id) VALUES (?,?)', [liveClass.id, req.user.id]);
      const sessionDate = new Date(liveClass.scheduledAt).toISOString().slice(0, 10);
      await connection.execute(`INSERT INTO attendance (student_id,session_date,status,note,marked_by)
        VALUES (?,?,?,?,?) ON CONFLICT (student_id,session_date) DO UPDATE SET
        status='present',note=EXCLUDED.note,marked_by=EXCLUDED.marked_by,marked_at=CURRENT_TIMESTAMP`,
      [req.user.id, sessionDate, 'present', `Attendance code submitted for ${liveClass.title}`, liveClass.createdBy]);
      await connection.commit();
      transactionStarted = false;
      logger.info('class_attendance_code_submitted', { classId: liveClass.id, userId: req.user.id });
      res.json({ message: `Attendance recorded for ${liveClass.title}.` });
    } catch (error) {
      if (transactionStarted) await connection.rollback();
      next(error);
    } finally { connection?.release(); }
  });
}
