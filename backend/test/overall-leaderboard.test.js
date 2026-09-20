import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerAnalyticsRoutes } from '../src/analytics.js';

test('overall leaderboard normalizes quiz, assignment and attendance scores over 100', async () => {
  const app = express();
  const pool = { query: async sql => {
    if (sql.includes("FROM users WHERE role = 'student'")) return [[
      { id: 1, fullName: 'Ada Student', email: 'ada@example.com' },
      { id: 2, fullName: 'Ben Student', email: 'ben@example.com' }
    ]];
    if (sql.includes('FROM quiz_attempts')) return [[
      { studentId: 1, quizId: 10, correctCount: 1, totalQuestions: 2 },
      { studentId: 1, quizId: 10, correctCount: 2, totalQuestions: 2 },
      { studentId: 1, quizId: 11, correctCount: 1, totalQuestions: 2 }
    ]];
    if (sql.includes('FROM assignment_submissions')) return [[
      { studentId: 1, score: 80, maxScore: 100 },
      { studentId: 1, score: 40, maxScore: 50 }
    ]];
    if (sql.includes('FROM attendance')) return [[
      { studentId: 1, status: 'present' }, { studentId: 1, status: 'late' },
      { studentId: 1, status: 'absent' }, { studentId: 1, status: 'excused' },
      { studentId: 2, status: 'present' }
    ]];
    throw new Error(sql);
  }};
  registerAnalyticsRoutes(app, pool, (req, _res, next) => { req.user = { role: 'mentor' }; next(); }, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/staff/overall-leaderboard`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.leaderboard[0].fullName, 'Ada Student');
    assert.deepEqual(data.leaderboard[0], {
      id: 1, fullName: 'Ada Student', email: 'ada@example.com',
      quizScore: 75, quizCount: 2, assignmentScore: 80, assignmentCount: 2,
      attendanceScore: 67, attendanceCount: 3, categoriesCounted: 3, overallScore: 74
    });
    assert.equal(data.leaderboard[1].overallScore, 100);
    assert.equal(data.leaderboard[1].categoriesCounted, 1);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
