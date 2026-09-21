import jwt from 'jsonwebtoken';
import { pool } from './db.js';

const secret = () => {
  const value = process.env.JWT_SECRET?.trim();
  if (!value) throw new Error('JWT_SECRET must be configured.');
  return value;
};

export function createToken(user) {
  const payload = {
    id: user.id,
    role: user.role,
    status: user.status,
    sessionVersion: Number(user.session_version ?? user.sessionVersion ?? 0),
    mustChangePassword: Boolean(user.must_change_password ?? user.mustChangePassword)
  };
  return user.role === 'student'
    ? jwt.sign(payload, secret(), { expiresIn: '8h' })
    : jwt.sign(payload, secret());
}

export function verifyToken(token) {
  return jwt.verify(token, secret());
}

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Please log in.' });
  try {
    req.user = jwt.verify(token, secret());
    const [accounts] = await pool.execute(
      'SELECT role, status, session_version AS sessionVersion FROM users WHERE id = ?',
      [req.user.id]
    );
    const account = accounts[0];
    if (!account) return res.status(401).json({ message: 'Please log in again.' });
    if (req.user.role === 'student' && account.status === 'expelled') {
      return res.status(401).json({ message: 'Your account has been expelled from Livingworth Academy. Please contact the Lead Mentor.' });
    }
    if (req.user.role === 'student' && account.status !== 'approved') {
      return res.status(401).json({ message: 'Your student account is no longer active. Please contact the Lead Mentor.' });
    }
    if (Number(req.user.sessionVersion || 0) !== Number(account.sessionVersion || 0)) {
      return res.status(401).json({ message: 'Your student session has expired. Please log in again.' });
    }
    req.user.role = account.role;
    req.user.status = account.status;
    req.user.sessionVersion = Number(account.sessionVersion || 0);
    if (req.user.mustChangePassword && !['/api/auth/me', '/api/auth/change-password'].includes(req.path)) {
      return res.status(403).json({ message: 'Change your temporary password before using the portal.' });
    }
    next();
  } catch (error) {
    res.status(401).json({
      message: error?.name === 'TokenExpiredError'
        ? 'Your student session has expired. Please log in again.'
        : 'Please log in again.'
    });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Administrator access required.' });
  next();
}

export function requireStaff(req, res, next) {
  if (!['admin', 'mentor'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Staff access required.' });
  }
  next();
}
