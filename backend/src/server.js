import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pool } from './db.js';

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

app.listen(port, '0.0.0.0', () => {
  console.log(`Livingworth API listening on port ${port}`);
});

