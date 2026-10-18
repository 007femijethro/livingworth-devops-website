import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { requireStaff } from '../dist/auth.js';
import { registerClassActivityRoutes } from '../dist/class-activities.js';

test('attempt deletion requires staff, removes only the chosen attempt and handles stale IDs', async () => {
  const attempts = new Map([['11', { activityId: 3, studentId: 21 }], ['12', { activityId: 3, studentId: 22 }]]);
  const calls = [];
  const pool = { execute: async (sql, params) => {
    assert.match(sql, /^DELETE FROM activity_attempts WHERE id = \?/);
    assert.match(sql, /RETURNING activity_id AS activityId, student_id AS studentId/);
    calls.push(params[0]);
    const row = attempts.get(params[0]);
    attempts.delete(params[0]);
    return [{ affectedRows: row ? 1 : 0, rows: row ? [row] : [] }];
  }};
  const app = express();
  registerClassActivityRoutes(app, pool, (req, res, next) => {
    const role = req.get('x-test-role');
    if (!role) return res.status(401).json({ message: 'Please log in.' });
    req.user = { id: 7, role }; next();
  }, requireStaff);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/staff/class-activities/attempts/`;
  const remove = (id, role) => fetch(url + id, { method: 'DELETE', headers: role ? { 'x-test-role': role } : {} });
  try {
    assert.equal((await remove('11')).status, 401);
    assert.equal((await remove('11', 'student')).status, 403);
    assert.equal(calls.length, 0);
    for (const id of ['0', '-1', 'abc', '1.5']) assert.equal((await remove(id, 'admin')).status, 400);
    assert.equal(calls.length, 0);
    const deleted = await remove('11', 'admin');
    assert.equal(deleted.status, 200);
    assert.match((await deleted.json()).message, /Learner attempt deleted/);
    assert.equal(attempts.has('11'), false);
    assert.equal(attempts.has('12'), true);
    assert.equal((await remove('11', 'admin')).status, 404);
    assert.equal((await remove('12', 'mentor')).status, 200);
    assert.deepEqual(calls, ['11', '11', '12']);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
