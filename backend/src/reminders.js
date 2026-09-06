import { notifyStudents } from './notifications.js';

const reminderMinutes = Math.max(5, Number(process.env.REMINDER_CHECK_MINUTES || 5));
const quizReminderMinutes = Math.max(5, Number(process.env.QUIZ_REMINDER_MINUTES || 30));
const classReminderMinutes = Math.max(5, Number(process.env.CLASS_REMINDER_MINUTES || 60));
const classTime = /^\d{2}:\d{2}$/.test(process.env.CLASS_TIME || '') ? process.env.CLASS_TIME : '20:00';
const classTimezone = process.env.CLASS_TIMEZONE || 'Africa/Lagos';
const meetingLink = String(process.env.CLASS_MEETING_LINK || '').trim();

async function claim(pool, key, type) {
  const [result] = await pool.execute(`INSERT INTO email_events (event_key, event_type) VALUES (?, ?)
    ON CONFLICT (event_key) DO NOTHING RETURNING event_key`, [key, type]);
  return result.affectedRows > 0;
}

function zonedParts(date = new Date()) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: classTimezone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { ...values, date: `${values.year}-${values.month}-${values.day}`, minutes: Number(values.hour) * 60 + Number(values.minute) };
}

async function sendClassReminder(pool) {
  const now = zonedParts();
  if (!['Mon', 'Wed', 'Fri'].includes(now.weekday)) return;
  const [hour, minute] = classTime.split(':').map(Number);
  const target = hour * 60 + minute - classReminderMinutes;
  if (now.minutes < target || now.minutes >= target + reminderMinutes) return;
  if (!await claim(pool, `class:${now.date}:${classReminderMinutes}`, 'class_reminder')) return;
  await notifyStudents(pool, {
    title: `Class starts in ${classReminderMinutes} minutes`,
    message: `Your Livingworth Academy DevOps class starts at ${classTime} (${classTimezone}).${meetingLink ? ` Join here: ${meetingLink}` : ' Open your student portal for class information.'}`,
    category: 'learning', actionTarget: 'Overview'
  });
}

async function sendQuizReminders(pool) {
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

async function run(pool) {
  try { await Promise.all([sendClassReminder(pool), sendQuizReminders(pool)]); }
  catch (error) { console.error('Email reminder check failed:', error.message); }
}

export function startReminderScheduler(pool) {
  if (String(process.env.EMAIL_REMINDERS_ENABLED).toLowerCase() !== 'true') return;
  run(pool);
  setInterval(() => run(pool), reminderMinutes * 60_000).unref();
}
