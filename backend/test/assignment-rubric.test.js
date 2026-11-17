import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRubric, scoreRubric } from '../dist/assignment-rubric.js';

test('rubric totals must match the assignment and published marks must fit every criterion', () => {
  assert.throws(() => parseRubric('Deployment | 70\nEvidence | 20', 100));
  assert.throws(() => parseRubric('Deployment | 50\ndeployment | 50', 100));
  const rubric = parseRubric('Deployment | 70\nEvidence | 30', 100);
  assert.throws(() => scoreRubric(rubric, [71, 20], false, 100));
  assert.throws(() => scoreRubric(rubric, [65, null], false, 100));
  assert.deepEqual(scoreRubric(rubric, [65, null], true, 100).breakdown.map(row => row.points), [65, null]);
  assert.equal(scoreRubric(rubric, [65, 17], false, 100).score, 82);
});

test('saving a draft does not publish a grade or notify the learner', async t => {
  const { default: express } = await import('express');
  const { registerLearningRoutes } = await import('../dist/learning.js');
  const app = express();
  app.use(express.json());
  const writes = [];
  const pool = { execute: async (sql, params) => {
    if (sql.startsWith('SELECT a.max_score')) return [[{ maxScore: 100, rubric: parseRubric('Deployment | 70\nEvidence | 30', 100), gradeBreakdown: null }]];
    if (sql.startsWith('SELECT student_id')) return [[]];
    writes.push([sql, params]);
    return [{ affectedRows: 1 }];
  }};
  registerLearningRoutes(app, pool, (req, _res, next) => { req.user = { id: 1 }; next(); }, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise(resolve => server.once('listening', resolve));
  const send = body => fetch(`http://127.0.0.1:${server.address().port}/api/staff/submissions/5/review`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  assert.equal((await send({draft:true, scores:[65,null]})).status, 200);
  assert.equal(writes.length, 1);
  assert.match(writes[0][0], /SET review_draft = /);
  assert.equal((await send({scores:[65,null],feedback:'Final feedback'})).status, 400);
  assert.equal(writes.length, 1);
  assert.equal((await send({scores:[65,17],score:100,feedback:'Final feedback'})).status, 200);
  assert.equal(writes[1][1][0], 82);
  assert.deepEqual(JSON.parse(writes[1][1][2]).map(row => row.points), [65,17]);
  assert.match(writes[1][0], /review_draft = NULL/);
});
