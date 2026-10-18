import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerLearningRoutes } from '../dist/learning.js';

test('class activities unlock after visible materials are done and hold the week gate until submitted', async () => {
  let materialStatus = 'in_progress';
  let activitySubmittedAt = null;
  let savedResponse = null;
  const pool = {
    query: async sql => {
      if (sql.includes('COUNT(*) AS total FROM learning_modules')) return [[{ total: 1 }]];
      if (sql.includes('FROM learning_modules')) return [[{ id: 1, weekNumber: 1, title: 'Linux', summary: '', published: true }]];
      throw new Error(sql);
    },
    execute: async (sql, params) => {
      if (sql.includes('FROM learning_materials lm LEFT JOIN material_progress')) return [[{ id: 3, title: 'Linux basics', progressStatus: materialStatus }]];
      if (sql.includes('FROM assignments a LEFT JOIN assignment_submissions')) return [[]];
      if (sql.includes('FROM learning_activities a LEFT JOIN activity_submissions')) return [[{ id: 9, title: 'Run a web server', instructions: 'Start nginx.', submissionResponse: savedResponse, submittedAt: activitySubmittedAt }]];
      if (sql.includes('AS gradedCount')) return [[{ gradedCount: 0, earnedPoints: 0, possiblePoints: 0 }]];
      if (sql.includes('AS unavailable')) return [[{ total: 0, completed: 0, unavailable: 0 }]];
      if (sql.includes('INSERT INTO activity_submissions')) {
        savedResponse = params[2];
        activitySubmittedAt = new Date().toISOString();
        return [{ affectedRows: 1 }];
      }
      throw new Error(sql);
    }
  };
  const app = express(); app.use(express.json());
  registerLearningRoutes(app, pool, (req, _res, next) => { req.user = { id: 7, role: 'student' }; next(); }, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${base}/api/student/learning`);
    let data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.modules[0].isComplete, false);

    response = await fetch(`${base}/api/student/learning/activities/9/submission`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: 'I started nginx.' }) });
    assert.equal(response.status, 409);

    materialStatus = 'done';
    response = await fetch(`${base}/api/student/learning/activities/9/submission`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response: 'I started nginx and confirmed the page loaded.' }) });
    assert.equal(response.status, 200);

    response = await fetch(`${base}/api/student/learning`);
    data = await response.json();
    assert.equal(data.modules[0].isComplete, true);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
