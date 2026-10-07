// @ts-nocheck
import crypto from 'node:crypto';

const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const configuredLevel = String(process.env.LOG_LEVEL || 'info').toLowerCase();
const minimumLevel = levels[configuredLevel] || levels.info;
const sensitiveKey = /password|token|secret|authorization|cookie|answer|content|file/i;

function clean(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (value instanceof Error) return { name: value.name, message: value.message, code: value.code, stack: value.stack };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 20).map(item => clean(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? '[redacted]' : clean(item, depth + 1)]));
  }
  if (typeof value === 'string') return value.slice(0, 2000);
  return value;
}

export function log(level, event, details = {}) {
  if ((levels[level] || levels.info) < minimumLevel) return;
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, service: 'livingworth-backend', event, ...clean(details) });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

export const logger = {
  debug: (event, details) => log('debug', event, details),
  info: (event, details) => log('info', event, details),
  warn: (event, details) => log('warn', event, details),
  error: (event, details) => log('error', event, details)
};

export function identityHash(value) {
  return value ? crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex').slice(0, 12) : null;
}

export function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  req.requestId = String(req.headers['x-request-id'] || crypto.randomUUID()).slice(0, 100);
  res.setHeader('X-Request-Id', req.requestId);
  res.on('finish', () => {
    if (req.path === '/api/health' && process.env.LOG_HEALTHCHECKS !== 'true') return;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const details = {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(1)),
      userId: req.user?.id || null,
      role: req.user?.role || null,
      ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress,
      responseBytes: Number(res.getHeader('content-length') || 0) || null
    };
    if (res.statusCode >= 500) logger.error('http_request', details);
    else if (res.statusCode >= 400) logger.warn('http_request', details);
    else logger.info('http_request', details);
  });
  next();
}
