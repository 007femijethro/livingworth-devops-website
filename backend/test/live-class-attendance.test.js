import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerLiveClassRoutes } from '../dist/live-classes.js';

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return server;
}

test('staff scheduling creates a six-character code with a 72-hour deadline', async () => {
  const app = express();
  app.use(express.json());
  let inserted;
  const pool = {
    execute: async (sql, params) => {
      assert.match(sql, /attendance_code,attendance_expires_at/);
      inserted = params;
      return [{ insertId: 41, affectedRows: 1 }];
    }
  };
  const auth = (req, _res, next) => { req.user = { id: 3, role: 'admin', status: 'approved' }; next(); };
  registerLiveClassRoutes(app, pool, auth, auth);
  const server = await listen(app);
  try {
    const scheduledAt = '2026-10-10T12:00:00.000Z';
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/staff/live-classes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'DevOps Class', scheduledAt, durationMinutes: 60, meetingUrl: 'https://meet.google.com/paj-rthm-woe' })
    });
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.match(data.attendanceCode, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(new Date(inserted[6]).getTime() - new Date(scheduledAt).getTime(), 72 * 60 * 60 * 1000);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('approved student attendance code submission records presence once', async () => {
  const app = express();
  app.use(express.json());
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    execute: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('FROM live_classes WHERE attendance_code')) return [[{
        id: 9, title: 'Linux Class', scheduledAt: new Date(Date.now() - 60_000).toISOString(),
        attendanceExpiresAt: new Date(Date.now() + 60_000).toISOString(), createdBy: 3
      }]];
      if (sql.startsWith('SELECT id FROM live_class_attendance_submissions')) return [[]];
      return [{ affectedRows: 1 }];
    }
  };
  const pool = { getConnection: async () => connection };
  const auth = (req, _res, next) => { req.user = { id: 12, role: 'student', status: 'approved' }; next(); };
  registerLiveClassRoutes(app, pool, auth, (_req, _res, next) => next());
  const server = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/live-classes/attendance`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'ABC234' })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls.filter(call => typeof call === 'string'), ['begin', 'commit', 'release']);
    assert.ok(calls.some(call => typeof call === 'object' && call.sql.includes('INSERT INTO live_class_attendance_submissions')));
    assert.ok(calls.some(call => typeof call === 'object' && call.sql.includes('INSERT INTO attendance')));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
