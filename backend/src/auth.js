import jwt from 'jsonwebtoken';

const secret = () => {
  const value = process.env.JWT_SECRET?.trim();
  if (!value) throw new Error('JWT_SECRET must be configured.');
  return value;
};

export function createToken(user) {
  const payload = { id: user.id, role: user.role, status: user.status, mustChangePassword: Boolean(user.must_change_password ?? user.mustChangePassword) };
  return user.role === 'student'
    ? jwt.sign(payload, secret(), { expiresIn: '8h' })
    : jwt.sign(payload, secret());
}

export function verifyToken(token) {
  return jwt.verify(token, secret());
}

export function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Please log in.' });
  try {
    req.user = jwt.verify(token, secret());
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
