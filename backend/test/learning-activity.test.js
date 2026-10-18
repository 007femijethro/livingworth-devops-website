import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerClassActivityRoutes } from '../dist/class-activities.js';

test('private class activity cannot be submitted before visible weekly materials are done', async () => {
  let materialStatus = 'in_progress';
  let attemptSaved = false;
  const execute = async (sql, params = []) => {
    if (sql.includes('SELECT id FROM learning_modules WHERE published')) return [[]];
    if (sql.includes('FROM learning_activities a JOIN learning_modules m')) return [[{ id: 9, moduleId: 2, title: 'Linux basics', allowRetakes: false, weekNumber: 1 }]];
    if (sql.includes('FROM learning_materials lm LEFT JOIN material_progress')) return [[{ id: 3, progressStatus: materialStatus }]];
    if (sql.includes('FROM activity_questions')) return [[{ id: 5, prompt: 'Which command shows the current directory?', questionType: 'single_choice', options: ['pwd', 'ls'], correctIndex: 0, correctAnswers: [], correctText: null, explanation: 'pwd prints the working directory.', sequenceNo: 1 }]];
    if (sql.includes('SELECT COUNT(*) AS count') && sql.includes('activity_attempts')) return [[{ count: attemptSaved ? 1 : 0, latest: attemptSaved ? 1 : 0 }]];
    if (sql.includes('INSERT INTO activity_attempts')) { attemptSaved = true; return [{ insertId: 21, affectedRows: 1 }]; }
    if (sql.includes('INSERT INTO activity_attempt_answers')) return [{ insertId: 22, affectedRows: 1 }];
    throw new Error(sql);
  };
  const pool = { getConnection: async () => ({ execute, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} }) };
  const app = express(); app.use(express.json());
  registerClassActivityRoutes(app, pool, (req, _res, next) => { req.user = { id: 7, role: 'student' }; next(); }, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${base}/api/student/class-activities/9/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: { 5: 0 } }) });
    assert.equal(response.status, 409);
    assert.equal(attemptSaved, false);

    materialStatus = 'done';
    response = await fetch(`${base}/api/student/class-activities/9/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: { 5: 0 } }) });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.score, 100);
    assert.equal(result.review[0].isCorrect, true);
    assert.equal(attemptSaved, true);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
