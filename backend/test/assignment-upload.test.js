import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerLearningRoutes } from '../src/learning.js';

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
