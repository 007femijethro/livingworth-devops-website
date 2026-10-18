import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerClassActivityRoutes } from '../dist/class-activities.js';

async function withServer(pool, role, action) {
  const app = express(); app.use(express.json());
  registerClassActivityRoutes(app, pool, (req, _res, next) => { req.user = { id: 7, role }; next(); }, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await action(`http://127.0.0.1:${server.address().port}`); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

const transaction = execute => ({ execute, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} });

test('saving true/false preserves both answer keys and rejects invalid or missing keys', async () => {
  const saved = [];
  const execute = async (sql, params = []) => {
    if (sql.includes('SELECT id, week_number')) return [[{ id: 1, weekNumber: 1 }]];
    if (sql.includes('SELECT id FROM learning_activities')) return [[]];
    if (sql.includes('INSERT INTO learning_activities')) return [{ insertId: 9 }];
    if (sql.includes('INSERT INTO activity_questions')) { saved.push(params); return [{ affectedRows: 1 }]; }
    throw new Error(sql);
  };
  await withServer({ getConnection: async () => transaction(execute) }, 'admin', async base => {
    const save = questions => fetch(`${base}/api/staff/class-activities/1`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Weekly activity', questions }) });
    const response = await save([0, 1].map(correctIndex => ({ prompt: 'A statement', questionType: 'true_false', correctIndex })));
    assert.equal(response.status, 200);
    assert.deepEqual(saved.map(params => params[4]), [0, 1]);
    assert.deepEqual(saved.map(params => JSON.parse(params[3])), [['True', 'False'], ['True', 'False']]);
    for (const correctIndex of [undefined, null, '', 2, -1, 0.5]) {
      assert.equal((await save([{ prompt: 'Invalid key', questionType: 'true_false', correctIndex }])).status, 400);
    }
  });
});

test('grading accepts answer variants in any case and scores true/false correctly', async () => {
  const questions = [
    { id: 1, prompt: 'Name the service', questionType: 'short_answer', correctText: 'Amazon S3|S3|Amazon Simple Storage Service' },
    { id: 2, prompt: 'Name the protocol', questionType: 'short_answer', correctText: 'SSH|Secure Shell|the SSH protocol' },
    { id: 3, prompt: 'True statement', questionType: 'true_false', options: ['True', 'False'], correctIndex: 0 },
    { id: 4, prompt: 'False statement', questionType: 'true_false', options: ['True', 'False'], correctIndex: 1 }
  ];
  const execute = async sql => {
    if (sql.includes('SELECT id FROM learning_modules WHERE published')) return [[]];
    if (sql.includes('FROM learning_activities a JOIN learning_modules m')) return [[{ id: 9, moduleId: 1, title: 'Answer types', allowRetakes: true, weekNumber: 1 }]];
    if (sql.includes('FROM learning_materials lm LEFT JOIN material_progress')) return [[]];
    if (sql.includes('FROM activity_questions')) return [questions];
    if (sql.includes('SELECT COUNT(*) AS count')) return [[{ count: 0, latest: 0 }]];
    if (sql.includes('INSERT INTO activity_attempts')) return [{ insertId: 21 }];
    if (sql.includes('INSERT INTO activity_attempt_answers')) return [{ affectedRows: 1 }];
    throw new Error(sql);
  };
  await withServer({ getConnection: async () => transaction(execute) }, 'student', async base => {
    const submit = async answers => {
      const response = await fetch(`${base}/api/student/class-activities/9/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) });
      assert.equal(response.status, 200);
      return response.json();
    };
    const right = await submit({ 1: ' aMaZoN   sImPlE sToRaGe SeRvIcE. ', 2: 'sEcUrE ShElL', 3: 0, 4: 1 });
    assert.equal(right.score, 100);
    assert.ok(right.review.every(answer => answer.isCorrect));
    const wrong = await submit({ 1: 'S3 is not the answer', 2: 'FTP', 3: 1, 4: 0 });
    assert.equal(wrong.score, 0);
  });
});

test('extending an attempted activity keeps original questions and results intact', async () => {
  const existing = [
    { id: 41, prompt: 'Existing choice', questionType: 'single_choice', options: ['A', 'B'], correctIndex: 1, correctAnswers: [], correctText: null, explanation: 'Existing explanation' },
    { id: 42, prompt: 'Existing short answer', questionType: 'short_answer', options: [], correctIndex: null, correctAnswers: [], correctText: 'SSH|Secure Shell', explanation: 'A protocol' }
  ];
  const inserted = [], updatedKeys = [];
  const execute = async (sql, params = []) => {
    if (sql.includes('SELECT id, week_number')) return [[{ id: 1, weekNumber: 1 }]];
    if (sql.includes('SELECT id FROM learning_activities')) return [[{ id: 9 }]];
    if (sql.includes('SELECT COUNT(*) AS count')) return [[{ count: 1 }]];
    if (sql.includes('FROM activity_questions WHERE activity_id')) return [structuredClone(existing)];
    if (sql.includes('UPDATE activity_questions SET correct_text')) { updatedKeys.push(params); return [{ affectedRows: 1 }]; }
    if (sql.includes('UPDATE learning_activities')) return [{ affectedRows: 1 }];
    if (sql.includes('INSERT INTO activity_questions')) { inserted.push(params); return [{ affectedRows: 1 }]; }
    throw new Error(sql);
  };
  await withServer({ getConnection: async () => transaction(execute) }, 'admin', async base => {
    const save = async questions => fetch(`${base}/api/staff/class-activities/1`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Expanded activity', questions }) });
    const proposed = structuredClone(existing);
    proposed[1].correctText += '|SSH protocol|the SSH protocol';
    proposed.push({ prompt: 'New false statement', questionType: 'true_false', correctIndex: 1 });
    assert.equal((await save(proposed)).status, 200);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0][4], 1);
    assert.equal(inserted[0][8], 3);
    assert.equal(updatedKeys[0][1], 42);
    for (const mutate of [
      qs => { qs[0].correctIndex = 0; },
      qs => { qs[0].options.reverse(); },
      qs => { qs[1].correctText = 'SSH'; },
      qs => { qs[0].prompt = 'Changed prompt'; },
      qs => { qs.reverse(); },
      qs => { qs.splice(0, 1); }
    ]) {
      const invalid = structuredClone(proposed); mutate(invalid);
      assert.equal((await save(invalid)).status, 409);
    }
    assert.equal(inserted.length, 1);
  });
});
