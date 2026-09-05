import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { pool } from './db.js';
import { createToken, requireAdmin, requireAuth, requireStaff, verifyToken } from './auth.js';
import { configureQuizSockets, registerQuizRoutes } from './quiz.js';

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, { cors: { origin: true, credentials: true } });
const port = Number(process.env.PORT || 5000);

app.use(helmet());
app.use(cors());
app.use('/api/admin/quizzes/import', express.text({ type: ['text/csv', 'text/plain'], limit: '2mb' }));
app.use(express.json());

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
    const { fullName, email, password, phone = '', experienceLevel = '', learningGoal = '' } = req.body;
    if (!fullName?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: 'Full name, email and password are required.' });
    }
    if (password.length < 8) return res.status(400).json({ message: 'Password must contain at least 8 characters.' });
    const normalEmail = email.trim().toLowerCase();
    const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [normalEmail]);
    if (existing.length) return res.status(409).json({ message: 'An account already exists for this email.' });
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.execute(
      `INSERT INTO users (full_name, email, password_hash, phone, experience_level, learning_goal)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [fullName.trim(), normalEmail, passwordHash, phone.trim(), experienceLevel, learningGoal.trim()]
    );
    res.status(201).json({ message: 'Registration received. You can log in after an administrator approves your account.' });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password, portal = 'student' } = req.body;
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email?.trim().toLowerCase()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }
    if (!['student', 'mentor', 'admin'].includes(portal)) return res.status(400).json({ message: 'Choose a valid portal.' });
    if (portal !== user.role) return res.status(403).json({ message: `This account belongs in the ${user.role} portal.` });
    if (user.role === 'student' && user.status !== 'approved') {
      return res.status(403).json({ message: user.status === 'pending' ? 'Your registration is awaiting administrator approval.' : 'Your registration was not approved.' });
    }
    res.json({ token: createToken(user), user: { id: user.id, fullName: user.full_name, email: user.email, role: user.role, status: user.status } });
  } catch (error) { next(error); }
});

app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT id, full_name AS fullName, email, phone, experience_level AS experienceLevel, learning_goal AS learningGoal, role, status, created_at AS createdAt FROM users WHERE id = ?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ message: 'Account not found.' });
    res.json(rows[0]);
  } catch (error) { next(error); }
});

app.get('/api/admin/students', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT id, full_name AS fullName, email, phone, experience_level AS experienceLevel, learning_goal AS learningGoal, status, created_at AS createdAt FROM users WHERE role = 'student' ORDER BY FIELD(status, 'pending', 'approved', 'rejected'), created_at DESC");
    res.json(rows);
  } catch (error) { next(error); }
});

app.patch('/api/admin/students/:id/status', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: 'Choose approved or rejected.' });
    const [result] = await pool.execute("UPDATE users SET status = ? WHERE id = ? AND role = 'student'", [status, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Student not found.' });
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

registerQuizRoutes(app, pool, requireAuth, requireStaff);
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
  res.status(500).json({ message: 'Something went wrong.' });
});

async function start() {
  // Keep long-lived Docker volumes compatible with new portal releases. The
  // init script only runs when MySQL creates a volume for the first time.
  await pool.query("ALTER TABLE users MODIFY role ENUM('student', 'mentor', 'admin') NOT NULL DEFAULT 'student'");
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
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await pool.execute(
      `INSERT INTO users (full_name, email, password_hash, role, status)
       VALUES ('Livingworth Administrator', ?, ?, 'admin', 'approved')
       ON DUPLICATE KEY UPDATE role = 'admin', status = 'approved', password_hash = VALUES(password_hash)`,
      [adminEmail, passwordHash]
    );
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
