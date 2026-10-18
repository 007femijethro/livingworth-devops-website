// @ts-nocheck
import { notifyStudents, notifyUser } from './notifications.js';

const reminderMinutes = Math.max(5, Number(process.env.REMINDER_CHECK_MINUTES || 5));
import { getAcademySettings } from './academy-settings.js';

async function claim(pool, key, type) {
  const [result] = await pool.execute(`INSERT INTO email_events (event_key, event_type) VALUES (?, ?)
    ON CONFLICT (event_key) DO NOTHING RETURNING event_key`, [key, type]);
  return result.affectedRows > 0;
}

function zonedParts(date = new Date()) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: getAcademySettings().classTimezone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { ...values, date: `${values.year}-${values.month}-${values.day}`, minutes: Number(values.hour) * 60 + Number(values.minute) };
}

async function sendClassReminder(pool) {
  const {classTime,classTimezone,classDays,classReminderMinutes,meetingUrl:meetingLink,academyName}=getAcademySettings();
  const now = zonedParts();
  const [hour, minute] = classTime.split(':').map(Number);
  let target = hour * 60 + minute - classReminderMinutes;
  const classDate=new Date(`${now.date}T00:00:00Z`);
  if (target < 0) { target += 1440; classDate.setUTCDate(classDate.getUTCDate()+1); }
  if (!classDays.includes(classDate.getUTCDay())) return;
  if (now.minutes < target || now.minutes >= target + reminderMinutes) return;
  if (!await claim(pool, `class:${classDate.toISOString().slice(0,10)}:${classTime}:${classReminderMinutes}`, 'class_reminder')) return;
  await notifyStudents(pool, {
    title: `Class starts in ${classReminderMinutes} minutes`,
    message: `Your ${academyName} DevOps class starts at ${classTime} (${classTimezone}).${meetingLink ? ` Join here: ${meetingLink}` : ' Open your student portal for class information.'}`,
    category: 'learning', actionTarget: 'Overview'
  });
}

async function sendQuizReminders(pool) {
  const {quizReminderMinutes}=getAcademySettings();
  const [quizzes] = await pool.execute(`SELECT id, title, join_code AS joinCode, scheduled_at AS scheduledAt
    FROM quizzes WHERE status = 'draft' AND scheduled_at > CURRENT_TIMESTAMP
      AND scheduled_at <= CURRENT_TIMESTAMP + (? * INTERVAL '1 minute')`, [quizReminderMinutes]);
  for (const quiz of quizzes) {
    if (!await claim(pool, `quiz:${quiz.id}:${new Date(quiz.scheduledAt).toISOString()}`, 'quiz_reminder')) continue;
    await notifyStudents(pool, {
      title: `Quiz reminder: ${quiz.title}`,
      message: `${quiz.title} opens in approximately ${quizReminderMinutes} minutes. Join code: ${quiz.joinCode}.`,
      category: 'review', actionTarget: 'Live quiz'
    });
  }
}

async function sendAssignmentReminders(pool) {
 const lead=getAcademySettings().assignmentReminderMinutes;
 const [items]=await pool.execute(`SELECT a.id,a.title,a.due_at AS dueAt,u.id AS userId FROM assignments a JOIN learning_modules m ON m.id=a.module_id CROSS JOIN users u LEFT JOIN assignment_submissions s ON s.assignment_id=a.id AND s.student_id=u.id WHERE m.published=TRUE AND a.closed_at IS NULL AND u.role='student' AND u.status='approved' AND a.due_at>NOW() AND a.due_at<=NOW()+(? * INTERVAL '1 minute') AND (s.id IS NULL OR s.status IN ('needs_correction','rejected'))`,[lead]);
 for(const item of items){if(!await claim(pool,`assignment:${item.id}:${item.userId}:${new Date(item.dueAt).toISOString()}`,'assignment_reminder'))continue;await notifyUser(pool,item.userId,{title:`Assignment due soon: ${item.title}`,message:`${item.title} is due ${new Date(item.dueAt).toLocaleString('en-GB',{timeZone:getAcademySettings().classTimezone})}. Open Assignments to finish your work.`,category:'learning',actionTarget:'Assignments'})}
}

async function run(pool) {
  if (!getAcademySettings().remindersEnabled) return;
  try { await Promise.all([sendClassReminder(pool), sendQuizReminders(pool), sendAssignmentReminders(pool)]); }
  catch (error) { console.error('Email reminder check failed:', error.message); }
}

export function startReminderScheduler(pool) {
  run(pool);
  setInterval(() => run(pool), reminderMinutes * 60_000).unref();
}
