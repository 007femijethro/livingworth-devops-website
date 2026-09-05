import jwt from 'jsonwebtoken';

const secret = () => process.env.JWT_SECRET || 'development-only-secret';

export function createToken(user) {
  return jwt.sign({ id: user.id, role: user.role, status: user.status }, secret(), { expiresIn: '8h' });
}

export function verifyToken(token) {
  return jwt.verify(token, secret());
}

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Please log in.' });
  try {
    req.user = jwt.verify(token, secret());
    next();
  } catch {
    res.status(401).json({ message: 'Your session has expired. Please log in again.' });
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
