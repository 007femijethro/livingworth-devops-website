import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { pool } from './db.js';
import { createToken, requireAdmin, requireAuth, requireStaff, verifyToken } from './auth.js';
import { configureQuizSockets, ensureQuizSchema, registerQuizRoutes } from './quiz.js';
import { sendApplicationDecision, sendApplicationEmails, sendPasswordReset } from './mailer.js';
import { ensureLearningSchema, registerLearningRoutes } from './learning.js';
import { ensureAnnouncementSchema, registerAnnouncementRoutes } from './announcements.js';
import { registerAnalyticsRoutes } from './analytics.js';

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, { cors: { origin: true, credentials: true } });
const port = Number(process.env.PORT || 5000);

app.use(helmet());
app.use(cors());
app.use('/api/admin/quizzes/import', express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }));
app.use(express.json());
app.use('/uploads', express.static(process.env.UPLOAD_DIR || '/app/uploads'));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});

app.get('/api/courses', async (_req, res, next) => {
  try {
    const [courses] = await pool.query(
      'SELECT id, title, description, duration, level FROM courses ORDER BY id'
    );
    res.json(courses);
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, phone = '', gender, country, stateCity,
      employmentStatus, educationalLevel, courseChoice, learningMode, techExperience, termsAccepted } = req.body;
    const required = [firstName, lastName, email, phone, gender, country, stateCity, employmentStatus,
      educationalLevel, courseChoice, learningMode, techExperience];
    if (required.some(value => !String(value || '').trim()) || !password) {
      return res.status(400).json({ message: 'Please complete every required field.' });
    }
    if (termsAccepted !== 'on' && termsAccepted !== true) return res.status(400).json({ message: 'You must accept the Livingworth Academy Terms and Conditions.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must contain at least 8 characters.' });
    const normalEmail = email.trim().toLowerCase();
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [normalEmail]);
    if (existing.length) return res.status(409).json({ message: 'An account already exists for this email.' });
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.execute(
      `INSERT INTO users (full_name, first_name, last_name, email, password_hash, phone, gender, country,
        state_city, employment_status, educational_level, course_choice, learning_mode, tech_experience, terms_accepted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [`${firstName.trim()} ${lastName.trim()}`, firstName.trim(), lastName.trim(), normalEmail, passwordHash,
        phone.trim(), gender, country, stateCity.trim(), employmentStatus, educationalLevel, courseChoice, learningMode, techExperience]
    );
    const emailResults = await sendApplicationEmails({
      fullName: `${firstName.trim()} ${lastName.trim()}`,
      email: normalEmail,
      courseChoice
    });
    const emailSent = emailResults[0].status === 'fulfilled' && emailResults[0].value === true;
    res.status(201).json({
      message: 'Registration received. You can log in after an administrator approves your account.',
      emailSent
    });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password, portal = 'student' } = req.body;
    const [rows] = await pool.execute('SELECT *, locked_until > NOW() AS is_locked FROM users WHERE email = ?', [email?.trim().toLowerCase()]);
    const user = rows[0];
    if (user?.is_locked) return res.status(429).json({ message: 'Too many incorrect attempts. Try again in 15 minutes.' });
    if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
      if (user) await pool.execute(`UPDATE users SET failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE WHEN failed_login_attempts + 1 >= 5 THEN DATE_ADD(NOW(), INTERVAL 15 MINUTE) ELSE locked_until END WHERE id = ?`, [user.id]);
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }
    if (!['student', 'staff'].includes(portal)) return res.status(400).json({ message: 'Choose Student or Staff login.' });
    const correctPortal = portal === 'student' ? user.role === 'student' : ['mentor', 'admin'].includes(user.role);
    if (!correctPortal) return res.status(403).json({ message: `This account belongs in the ${user.role === 'student' ? 'Student' : 'Staff'} login.` });
    if (user.role === 'student' && user.status !== 'approved') {
      return res.status(403).json({ message: user.status === 'pending' ? 'Your registration is awaiting administrator approval.' : 'Your registration was not approved.' });
    }
    await pool.execute('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
    res.json({ token: createToken(user), user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role, status: user.status, mustChangePassword: Boolean(user.must_change_password) } });
  } catch (error) { next(error); }
});

app.post('/api/auth/forgot-password', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const [users] = await pool.execute("SELECT id, full_name AS fullName, email FROM users WHERE email = ? AND status = 'approved'", [email]);
    if (users.length) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await pool.execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [users[0].id]);
      await pool.execute('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))', [users[0].id, tokenHash]);
      const publicUrl = String(process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      await sendPasswordReset(users[0], `${publicUrl}/?reset=${token}`);
    }
    res.json({ message: 'If an approved account exists for that email, a password-reset link has been sent.' });
  } catch (error) { next(error); }
});

app.post('/api/auth/reset-password', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const tokenHash = crypto.createHash('sha256').update(String(req.body.token || '')).digest('hex');
    const password = String(req.body.password || '');
    if (password.length < 8) return res.status(400).json({ message: 'Password must contain at least 8 characters.' });
    await connection.beginTransaction();
    const [tokens] = await connection.execute(`SELECT id, user_id AS userId FROM password_reset_tokens
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE`, [tokenHash]);
    if (!tokens.length) { await connection.rollback(); return res.status(400).json({ message: 'This reset link is invalid or has expired.' }); }
    const passwordHash = await bcrypt.hash(password, 12);
    await connection.execute('UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, must_change_password = FALSE WHERE id = ?', [passwordHash, tokens[0].userId]);
    await connection.execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', [tokens[0].userId]);
    await connection.commit();
    res.json({ message: 'Password changed successfully. You can now sign in.' });
  } catch (error) { await connection.rollback(); next(error); }
  finally { connection.release(); }
});

app.patch('/api/auth/change-password', requireAuth, async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 8) return res.status(400).json({ message: 'New password must contain at least 8 characters.' });
    const [users] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!users.length || !(await bcrypt.compare(currentPassword, users[0].password_hash))) return res.status(400).json({ message: 'Your current password is incorrect.' });
    await pool.execute('UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE id = ?', [await bcrypt.hash(newPassword, 12), req.user.id]);
    res.json({ message: 'Password changed successfully.', token: createToken({ ...req.user, mustChangePassword: false }) });
  } catch (error) { next(error); }
});

app.patch('/api/admin/users/:id/password', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const password = String(req.body.password || '');
    if (password.length < 8) return res.status(400).json({ message: 'Temporary password must contain at least 8 characters.' });
    const [result] = await pool.execute("UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL, must_change_password = TRUE WHERE id = ? AND role IN ('student','mentor')", [await bcrypt.hash(password, 12), req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Student or mentor account not found.' });
    res.json({ message: 'Temporary password saved and account unlocked.' });
  } catch (error) { next(error); }
});

app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT id, full_name AS fullName, email, phone, experience_level AS experienceLevel, learning_goal AS learningGoal, role, status, must_change_password AS mustChangePassword, created_at AS createdAt FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ message: 'Account not found.' });
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.get('/api/admin/students', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : '';
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = 10;
    const where = ["role = 'student'"];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (search) {
      where.push('(full_name LIKE ? OR email LIKE ? OR phone LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    const [totals] = await pool.query("SELECT status, COUNT(*) AS count FROM users WHERE role = 'student' GROUP BY status");
    const [countRows] = await pool.execute(`SELECT COUNT(*) AS count FROM users WHERE ${where.join(' AND ')}`, params);
    const total = Number(countRows[0].count);
    const pages = Math.max(1, Math.ceil(total / limit));
    const currentPage = Math.min(page, pages);
    const offset = (currentPage - 1) * limit;
    const [students] = await pool.execute(
      `SELECT id, full_name AS fullName, first_name AS firstName, last_name AS lastName, email, phone, gender,
        country, state_city AS stateCity, employment_status AS employmentStatus, educational_level AS educationalLevel,
        course_choice AS courseChoice, learning_mode AS learningMode, tech_experience AS techExperience,
        experience_level AS experienceLevel, learning_goal AS learningGoal, status,
        rejection_reason AS rejectionReason, created_at AS createdAt, updated_at AS updatedAt
       FROM users WHERE ${where.join(' AND ')}
       ORDER BY FIELD(status, 'pending', 'approved', 'rejected'), created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const summary = { total: 0, pending: 0, approved: 0, rejected: 0 };
    for (const row of totals) { summary[row.status] = Number(row.count); summary.total += Number(row.count); }
    res.json({ students, summary, pagination: { page: currentPage, pages, total, limit } });
  } catch (error) { next(error); }
});

app.get('/api/admin/students/export', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : '';
    const where = ["role = 'student'"];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (search) {
      where.push('(full_name LIKE ? OR email LIKE ? OR phone LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    const [rows] = await pool.execute(
      `SELECT full_name, email, phone, gender, country, state_city, employment_status, educational_level,
        course_choice, learning_mode, tech_experience, status, rejection_reason, created_at
       FROM users WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, params
    );
    const columns = ['full_name','email','phone','gender','country','state_city','employment_status','educational_level','course_choice','learning_mode','tech_experience','status','rejection_reason','created_at'];
    const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [columns.join(','), ...rows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="livingworth-applications-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (error) { next(error); }
});

app.patch('/api/admin/students/:id/status', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    const rejectionReason = String(req.body.rejectionReason || '').trim().slice(0, 500);
    if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ message: 'Choose pending, approved or rejected.' });
    if (status === 'rejected' && !rejectionReason) return res.status(400).json({ message: 'Add a reason before rejecting this application.' });
    const [result] = await pool.execute(
      "UPDATE users SET status = ?, rejection_reason = ? WHERE id = ? AND role = 'student'",
      [status, status === 'rejected' ? rejectionReason : null, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Student not found.' });
    const [students] = await pool.execute("SELECT full_name AS fullName, email FROM users WHERE id = ?", [req.params.id]);
    if (students[0] && status !== 'pending') void sendApplicationDecision(students[0], status);
    res.json({ message: `Student ${status}.` });
  } catch (error) { next(error); }
});

app.get('/api/staff/students', requireAuth, requireStaff, async (_req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT id, full_name AS fullName, email, phone, experience_level AS experienceLevel, learning_goal AS learningGoal, status, created_at AS createdAt FROM users WHERE role = 'student' AND status = 'approved' ORDER BY full_name");
    res.json(rows);
  } catch (error) { next(error); }
});

app.get('/api/admin/mentors', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT id, full_name AS fullName, email, phone, status, created_at AS createdAt FROM users WHERE role = 'mentor' ORDER BY created_at DESC");
    res.json(rows);
  } catch (error) { next(error); }
});

app.post('/api/admin/mentors', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { fullName, email, phone = '', password } = req.body;
    if (!fullName?.trim() || !email?.trim() || !password) return res.status(400).json({ message: 'Name, email and temporary password are required.' });
    if (password.length < 8) return res.status(400).json({ message: 'Temporary password must contain at least 8 characters.' });
    const normalEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.execute("INSERT INTO users (full_name, email, password_hash, phone, role, status) VALUES (?, ?, ?, ?, 'mentor', 'approved')", [fullName.trim(), normalEmail, passwordHash, phone.trim()]);
    res.status(201).json({ message: 'Mentor account created.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'An account already exists for this email.' });
    next(error);
  }
});

function validClassDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && [1, 3, 5].includes(date.getUTCDay());
}

app.get('/api/staff/attendance', requireAuth, requireStaff, async (req, res, next) => {
  try {
    const date = String(req.query.date || '');
    if (!validClassDate(date)) return res.status(400).json({ message: 'Choose a Monday, Wednesday or Friday.' });
    const [rows] = await pool.execute(
      `SELECT u.id AS studentId, u.full_name AS fullName, u.email,
              a.status, COALESCE(a.note, '') AS note, a.marked_at AS markedAt
       FROM users u
       LEFT JOIN attendance a ON a.student_id = u.id AND a.session_date = ?
       WHERE u.role = 'student' AND u.status = 'approved'
       ORDER BY u.full_name`,
      [date]
    );
    res.json({ date, records: rows });
  } catch (error) { next(error); }
});

app.put('/api/staff/attendance', requireAuth, requireStaff, async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { date, records } = req.body;
    if (!validClassDate(date)) return res.status(400).json({ message: 'Attendance can only be marked for Monday, Wednesday or Friday.' });
    if (!Array.isArray(records) || !records.length) return res.status(400).json({ message: 'Add at least one attendance record.' });
    await connection.beginTransaction();
    for (const record of records) {
      if (!['present', 'late', 'absent', 'excused'].includes(record.status)) throw new Error('Every student needs a valid attendance status.');
      const [student] = await connection.execute("SELECT id FROM users WHERE id = ? AND role = 'student' AND status = 'approved'", [record.studentId]);
      if (!student.length) throw new Error('One of the selected students is not an approved learner.');
      await connection.execute(
        `INSERT INTO attendance (student_id, session_date, status, note, marked_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note), marked_by = VALUES(marked_by)`,
        [record.studentId, date, record.status, String(record.note || '').trim().slice(0, 255), req.user.id]
      );
    }
    await connection.commit();
    res.json({ message: `Attendance saved for ${date}.` });
  } catch (error) {
    await connection.rollback();
    if (error.message.includes('valid attendance') || error.message.includes('approved learner')) return res.status(400).json({ message: error.message });
    next(error);
  } finally { connection.release(); }
});

app.get('/api/student/attendance', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
    const [records] = await pool.execute(
      `SELECT session_date AS sessionDate, status, COALESCE(note, '') AS note, marked_at AS markedAt
       FROM attendance WHERE student_id = ? ORDER BY session_date DESC`,
      [req.user.id]
    );
    const counted = records.filter(record => record.status !== 'excused');
    const attended = counted.filter(record => ['present', 'late'].includes(record.status)).length;
    res.json({ records, summary: { attended, total: counted.length, percentage: counted.length ? Math.round((attended / counted.length) * 100) : 0 } });
  } catch (error) { next(error); }
});

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());
}

function currentWeekDates() {
  const today = new Date();
  const day = today.getUTCDay();
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - ((day + 6) % 7));
  const wednesday = new Date(monday);
  wednesday.setUTCDate(monday.getUTCDate() + 2);
  return {
    monday: monday.toISOString().slice(0, 10),
    wednesday: wednesday.toISOString().slice(0, 10),
    canWarn: today >= wednesday
  };
}

async function attendanceReport(query) {
  const from = String(query.from || '');
  const to = String(query.to || '');
  if (!validDate(from) || !validDate(to) || from > to) throw new Error('Choose a valid attendance date range.');
  const studentId = Number.parseInt(query.studentId, 10) || 0;
  const status = ['present', 'late', 'absent', 'excused'].includes(query.status) ? query.status : '';
  const where = ['a.session_date BETWEEN ? AND ?'];
  const params = [from, to];
  if (studentId) { where.push('a.student_id = ?'); params.push(studentId); }
  if (status) { where.push('a.status = ?'); params.push(status); }
  const [records] = await pool.execute(
    `SELECT a.student_id AS studentId, u.full_name AS fullName, u.email, a.session_date AS sessionDate,
      a.status, COALESCE(a.note, '') AS note, a.marked_at AS markedAt
     FROM attendance a JOIN users u ON u.id = a.student_id
     WHERE ${where.join(' AND ')} ORDER BY a.session_date DESC, u.full_name`, params
  );
  const aggregateWhere = ['u.role = \'student\'', "u.status = 'approved'"];
  const aggregateParams = [from, to];
  if (studentId) { aggregateWhere.push('u.id = ?'); aggregateParams.push(studentId); }
  const [students] = await pool.execute(
    `SELECT u.id AS studentId, u.full_name AS fullName, u.email,
      SUM(a.status = 'present') AS present, SUM(a.status = 'late') AS late,
      SUM(a.status = 'absent') AS absent, SUM(a.status = 'excused') AS excused,
      SUM(a.status <> 'excused') AS counted, SUM(a.status IN ('present','late')) AS attended
     FROM users u LEFT JOIN attendance a ON a.student_id = u.id AND a.session_date BETWEEN ? AND ?
     WHERE ${aggregateWhere.join(' AND ')} GROUP BY u.id ORDER BY u.full_name`, aggregateParams
  );
  const week = currentWeekDates();
  const [warnings] = week.canWarn ? await pool.execute(
    `SELECT student_id AS studentId FROM attendance WHERE session_date IN (?, ?) AND status = 'absent'
     GROUP BY student_id HAVING COUNT(DISTINCT session_date) = 2`, [week.monday, week.wednesday]
  ) : [[]];
  const warningIds = new Set(warnings.map(row => row.studentId));
  const studentSummaries = students.map(row => ({
    ...row,
    present: Number(row.present || 0), late: Number(row.late || 0), absent: Number(row.absent || 0),
    excused: Number(row.excused || 0), counted: Number(row.counted || 0), attended: Number(row.attended || 0),
    percentage: Number(row.counted) ? Math.round((Number(row.attended) / Number(row.counted)) * 100) : 0,
    warning: warningIds.has(row.studentId)
  }));
  const summary = records.reduce((result, record) => {
    result.total += 1;
    result[record.status] += 1;
    return result;
  }, { total: 0, present: 0, late: 0, absent: 0, excused: 0 });
  return { records, students: studentSummaries, summary, range: { from, to }, warningWeek: week };
}

app.get('/api/staff/attendance/report', requireAuth, requireStaff, async (req, res, next) => {
  try { res.json(await attendanceReport(req.query)); }
  catch (error) {
    if (error.message.includes('date range')) return res.status(400).json({ message: error.message });
    next(error);
  }
});

app.get('/api/staff/attendance/export', requireAuth, requireStaff, async (req, res, next) => {
  try {
    const report = await attendanceReport(req.query);
    const columns = ['fullName', 'email', 'sessionDate', 'status', 'note', 'markedAt'];
    const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [columns.join(','), ...report.records.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="livingworth-attendance-${report.range.from}-to-${report.range.to}.csv"`);
    res.send(csv);
  } catch (error) {
    if (error.message.includes('date range')) return res.status(400).json({ message: error.message });
    next(error);
  }
});

registerQuizRoutes(app, pool, requireAuth, requireStaff);
registerLearningRoutes(app, pool, requireAuth, requireStaff);
registerAnnouncementRoutes(app, pool, requireAuth, requireStaff);
registerAnalyticsRoutes(app, pool, requireAuth, requireStaff);
configureQuizSockets(io, pool, verifyToken);

app.post('/api/enquiries', async (req, res, next) => {
  try {
    const { name, email, message } = req.body;
    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return res.status(400).json({ message: 'Name, email and message are required.' });
    }
    const [result] = await pool.execute(
      'INSERT INTO enquiries (name, email, message) VALUES (?, ?, ?)',
      [name.trim(), email.trim(), message.trim()]
    );
    res.status(201).json({ id: result.insertId, message: 'Thank you. We will contact you soon.' });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'The file is larger than 10 MB.' });
  if (error.message?.startsWith('Upload a PDF')) return res.status(400).json({ message: error.message });
  res.status(500).json({ message: 'Something went wrong.' });
});

async function start() {
  // Keep long-lived Docker volumes compatible with new portal releases. The
  // init script only runs when MySQL creates a volume for the first time.
  await pool.query("ALTER TABLE users MODIFY role ENUM('student', 'mentor', 'admin') NOT NULL DEFAULT 'student'");
  const registrationColumns = {
    first_name: 'VARCHAR(80) NULL', last_name: 'VARCHAR(80) NULL', gender: 'VARCHAR(30) NULL',
    country: 'VARCHAR(80) NULL', state_city: 'VARCHAR(120) NULL', employment_status: 'VARCHAR(100) NULL',
    educational_level: 'VARCHAR(80) NULL', course_choice: 'VARCHAR(120) NULL', learning_mode: 'VARCHAR(60) NULL',
    tech_experience: 'VARCHAR(100) NULL', terms_accepted: 'BOOLEAN NOT NULL DEFAULT FALSE'
    , rejection_reason: 'VARCHAR(500) NULL', failed_login_attempts: 'INT NOT NULL DEFAULT 0', locked_until: 'DATETIME NULL',
    must_change_password: 'BOOLEAN NOT NULL DEFAULT FALSE'
  };
  const [existingColumns] = await pool.query('SHOW COLUMNS FROM users');
  const existingNames = new Set(existingColumns.map(column => column.Field));
  const requireInitialAdminPasswordChange = !existingNames.has('must_change_password');
  for (const [column, definition] of Object.entries(registrationColumns)) {
    if (!existingNames.has(column)) await pool.query(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS attendance (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    session_date DATE NOT NULL,
    status ENUM('present', 'late', 'absent', 'excused') NOT NULL,
    note VARCHAR(255),
    marked_by INT NOT NULL,
    marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY one_attendance_per_session (student_id, session_date),
    INDEX attendance_session_date (session_date),
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (marked_by) REFERENCES users(id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL, used_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX password_reset_user (user_id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  await ensureLearningSchema(pool);
  await ensureAnnouncementSchema(pool);
  await ensureQuizSchema(pool);
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const updateExisting = requireInitialAdminPasswordChange
      ? ', password_hash = VALUES(password_hash), must_change_password = TRUE'
      : '';
    await pool.execute(`INSERT INTO users (full_name, email, password_hash, role, status, must_change_password)
      VALUES ('Livingworth Administrator', ?, ?, 'admin', 'approved', TRUE)
      ON DUPLICATE KEY UPDATE role = 'admin', status = 'approved'${updateExisting}`, [adminEmail, passwordHash]);
  }
  const mentorEmail = process.env.MENTOR_EMAIL?.trim().toLowerCase();
  const mentorPassword = process.env.MENTOR_PASSWORD;
  if (mentorEmail && mentorPassword) {
    const passwordHash = await bcrypt.hash(mentorPassword, 12);
    await pool.execute(
      `INSERT INTO users (full_name, email, password_hash, role, status)
       VALUES (?, ?, ?, 'mentor', 'approved')
       ON DUPLICATE KEY UPDATE role = 'mentor', status = 'approved', password_hash = VALUES(password_hash)`,
      [process.env.MENTOR_NAME?.trim() || 'Livingworth Mentor', mentorEmail, passwordHash]
    );
  }
  httpServer.listen(port, '0.0.0.0', () => console.log(`Livingworth API and live quiz server listening on port ${port}`));
}

start().catch((error) => { console.error('Failed to start API', error); process.exit(1); });
