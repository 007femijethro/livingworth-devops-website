import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerQuizRoutes } from '../dist/quiz.js';

test('student pending quizzes include conducted quizzes without a completed attempt', async () => {
  const app = express();
  const pool = {
    query: async sql => {
      if (sql.startsWith('UPDATE quizzes')) return [{ affectedRows: 0 }];
      throw new Error(sql);
    },
    execute: async (sql, params) => {
      assert.match(sql, /q\.status IN \('lobby', 'live', 'completed'\)/);
      assert.match(sql, /qa\.status = 'completed'/);
      assert.deepEqual(params, [12]);
      return [[
        { id: 4, title: 'Git Quiz', joinCode: 'ABC123', status: 'completed', scheduledAt: null, materialTitle: 'Git' },
        { id: 5, title: 'AWS Quiz', joinCode: 'XYZ789', status: 'lobby', scheduledAt: null, materialTitle: 'AWS' }
      ]];
    }
  };
  registerQuizRoutes(app, pool, (req, _res, next) => { req.user = { id: 12, role: 'student' }; next(); }, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/student/pending-quizzes`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.length, 2);
    assert.equal(data[0].status, 'completed');
    assert.equal(data[1].status, 'lobby');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
