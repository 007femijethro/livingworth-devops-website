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
      assert.ok([1, 2].includes(params[1]), 'every published week must be loaded for assignment access');
      return params[1] === 1 ? [[
        { submissionId: null },
        { submissionId: 9, submissionStatus: 'rejected' },
        { submissionId: 10, submissionStatus: 'needs_correction' },
        { submissionId: 11, submissionStatus: 'submitted' },
        { submissionId: 12, submissionStatus: 'completed' }
      ]] : [[
        { submissionId: null },
        { submissionId: 13, submissionStatus: 'completed' }
      ]];
    }
  };
  registerLearningRoutes(app, pool, (req, _res, next) => { req.user = { id: 1, role: req.headers['x-test-role'] || 'student' }; next(); }, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/assignments/pending-count`;
  try {
    assert.deepEqual(await (await fetch(url)).json(), { count: 3 });
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

test('named uploads allow empty or partial submissions and preserve untouched files on resubmission', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const app = express(); app.use(express.json());
  let stored = [];
  const slots = [{ id: 'script', label: 'Bash script' }, { id: 'evidence', label: 'Screenshot' }];
  const pool = {
    query: async () => [[{ id: 1 }]],
    execute: async (sql, params) => {
      if (sql.includes('INSERT INTO assignment_submissions')) { stored = JSON.parse(params[6]); return [{ affectedRows: 1 }]; }
      if (sql.includes('FROM assignment_submissions')) return [[{ files: stored }]];
      if (sql.includes('learning_materials')) return [[]];
      return [[{ id: 1, uploadSlots: slots }]];
    }
  };
  registerLearningRoutes(app, pool, (req, _res, next) => { req.user = { id: 1, role: 'student' }; next(); }, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/student/assignments/1/submission`;
  async function submit(ids) {
    const data = new FormData(); data.set('fileSlots', JSON.stringify(ids));
    ids.forEach(id => data.append('file', new Blob([id]), `${id}.txt`));
    return fetch(url, { method: 'PUT', body: data });
  }
  try {
    assert.equal((await submit([])).status, 200);
    assert.deepEqual(stored, []);
    assert.equal((await submit(['script'])).status, 200);
    assert.deepEqual(stored.map(f => f.label), ['Bash script']);
    assert.equal((await submit(['unknown', 'evidence'])).status, 400);
    assert.equal((await submit(['evidence'])).status, 200);
    assert.deepEqual(stored.map(f => f.label), ['Bash script', 'Screenshot']);
    assert.equal(stored[0].name, 'script.txt');
    const oldScript = stored[0].path, oldEvidence = stored[1].path;
    assert.equal((await submit(['script'])).status, 200);
    assert.equal(stored[1].path, oldEvidence);
    assert.notEqual(stored[0].path, oldScript);
    await assert.rejects(fs.stat(path.resolve('uploads/.assignments', oldScript)), { code: 'ENOENT' });
  } finally {
    await Promise.all(stored.map(f => fs.unlink(path.resolve('uploads/.assignments', f.path)).catch(() => {})));
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});

test('a rejected assignment can be redone even after the assignment is closed', async () => {
  const app = express(); app.use(express.json());
  let resubmitted = false;
  const pool = {
    query: async () => [[{ id: 1 }]],
    execute: async sql => {
      if (sql.includes('learning_materials')) return [[]];
      if (sql.includes('FROM assignments a LEFT JOIN')) return [[{ id: 1, assignmentType: 'portal', closedAt: '2026-09-20T20:00:00Z', uploadSlots: [], submissionId: 4, submissionStatus: 'rejected' }]];
      if (sql.includes('FROM assignment_submissions')) return [[{ status: 'rejected', files: [] }]];
      if (sql.includes('INSERT INTO assignment_submissions')) {
        assert.match(sql, /status = 'submitted'/);
        assert.match(sql, /reviewed_at = NULL/);
        assert.match(sql, /reviewed_by = NULL/);
        resubmitted = true;
        return [{ affectedRows: 1 }];
      }
      throw new Error(sql);
    }
  };
  registerLearningRoutes(app, pool, (req, _res, next) => { req.user = { id: 1, role: 'student' }; next(); }, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/student/assignments/1/submission`, { method: 'PUT', body: new FormData() });
    assert.equal(response.status, 200);
    assert.equal(resubmitted, true);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
