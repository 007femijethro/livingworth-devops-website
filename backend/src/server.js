import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { createToken, requireAdmin, requireAuth } from './auth.js';

const app = express();
const port = Number(process.env.PORT || 5000);

app.use(helmet());
app.use(cors());
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
    if (portal !== user.role) return res.status(403).json({ message: `Please use the ${user.role} login.` });
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
  app.listen(port, '0.0.0.0', () => console.log(`Livingworth API listening on port ${port}`));
}

start().catch((error) => { console.error('Failed to start API', error); process.exit(1); });
