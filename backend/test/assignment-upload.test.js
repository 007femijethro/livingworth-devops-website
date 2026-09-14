import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerLearningRoutes } from '../src/learning.js';

test('assignment badge counts student actions and staff reviews separately', async () => {
  const app = express();
  const pool = {
    query: async sql => sql.includes('COUNT(*)') ? [[{ count: '3' }]] : [[{ id: 1 }, { id: 2 }]],
    execute: async (sql, params) => {
      if (sql.includes('learning_materials')) return [[]];
      assert.equal(params[1], 1, 'locked second week must not be loaded');
      return [[
        { submissionId: null },
        { submissionId: 10, submissionStatus: 'needs_correction' },
        { submissionId: 11, submissionStatus: 'submitted' },
        { submissionId: 12, submissionStatus: 'completed' }
      ]];
    }
  };
  registerLearningRoutes(app, pool, (req, _res, next) => { req.user = { id: 1, role: req.headers['x-test-role'] || 'student' }; next(); }, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/assignments/pending-count`;
  try {
    assert.deepEqual(await (await fetch(url)).json(), { count: 2 });
    assert.deepEqual(await (await fetch(url, { headers: { 'x-test-role': 'mentor' } })).json(), { count: 3 });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('assignment upload rejects oversized files and protects attachment ownership', async () => {
  const app = express();
  const pool = { execute: async () => [[{ studentId: 2, filePath: 'private-file', fileName: 'work.txt' }]] };
  registerLearningRoutes(app, pool, (req, _res, next) => { req.user = { id: 1, role: 'student' }; next(); }, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const data = new FormData();
    data.set('file', new Blob([new Uint8Array(15 * 1024 * 1024 + 1)]), 'work.txt');
    const oversized = await fetch(`${base}/api/student/assignments/1/submission`, { method: 'PUT', body: data });
    assert.equal(oversized.status, 400);
    assert.match((await oversized.json()).message, /15 MB/);
    const forbidden = await fetch(`${base}/api/submissions/1/file`);
    assert.equal(forbidden.status, 403);
    const unsupported = new FormData();
    unsupported.set('file', new Blob(['test']), 'work.html');
    const rejected = await fetch(`${base}/api/student/assignments/1/submission`, { method: 'PUT', body: unsupported });
    assert.equal(rejected.status, 400);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
