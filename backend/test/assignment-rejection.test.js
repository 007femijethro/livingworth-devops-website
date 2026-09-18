import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerLearningRoutes } from '../src/learning.js';

test('rejection requires a reason and preserves it in the student notification', async () => {
  const app = express(); app.use(express.json());
  let rejected = false;
  const notifications = [];
  const pool = { execute: async (sql, values) => {
    if (sql.includes('JOIN assignments')) return [[{ studentId: 7, title: 'Node health', status: rejected ? 'rejected' : 'submitted' }]];
    if (sql.startsWith('UPDATE assignment_submissions')) {
      assert.equal(values[0], 'Missing the required script.');
      if (rejected) return [{ affectedRows: 0 }];
      rejected = true; return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO notifications')) { notifications.push(values); return [{ affectedRows: 1 }]; }
    if (sql.includes('FROM users')) return [[]];
    throw new Error(sql);
  }};
  registerLearningRoutes(app, pool, (req, res, next) => { req.user = { id: 1 }; next(); }, (req, res, next) => next());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/staff/submissions/1/reject`;
  const reject = reason => fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
  try {
    assert.equal((await reject(' ')).status, 400);
    assert.equal((await reject('x'.repeat(501))).status, 400);
    assert.equal(rejected, false);
    assert.equal((await reject('Missing the required script.')).status, 200);
    assert.deepEqual(notifications[0], [7, 'Assignment rejected', 'Missing the required script.', 'review', 'Assignments']);
    assert.equal((await reject('Missing the required script.')).status, 409);
    assert.equal(notifications.length, 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
