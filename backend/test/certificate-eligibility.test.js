import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { registerCertificateRoutes } from '../dist/certificates.js';

function performancePool(correctCount) {
  return {
    query: async sql => {
      if (sql.includes("FROM users WHERE role = 'student'")) return [[{ id: 1, fullName: 'Ada Student', email: 'ada@example.com' }]];
      if (sql.includes('FROM quiz_attempts')) return [[{ studentId: 1, quizId: 10, correctCount, totalQuestions: 100 }]];
      if (sql.includes('FROM assignment_submissions') || sql.includes('FROM attendance')) return [[]];
      throw new Error(sql);
    },
    execute: async sql => {
      if (sql.includes("role = 'student' AND status = 'approved'")) return [[{ id: 1 }]];
      throw new Error(sql);
    }
  };
}

test('student certificate eligibility requires an overall score of at least 75', async () => {
  const app = express(); app.use(express.json());
  registerCertificateRoutes(app, performancePool(74), (req, _res, next) => { req.user = { id: 1, role: 'student' }; next(); }, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/student/certificate-eligibility`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { overallScore: 74, requiredScore: 75, eligible: false });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('certificate issuing is blocked when the student score is below 75', async () => {
  const app = express(); app.use(express.json());
  registerCertificateRoutes(app, performancePool(74), (req, _res, next) => { req.user = { id: 99, role: 'admin' }; next(); }, (_req, _res, next) => next());
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/staff/certificates`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ studentId: 1, courseTitle: 'DevOps Engineering Bootcamp', completionDate: '2026-01-01' })
    });
    assert.equal(response.status, 422);
    assert.match((await response.json()).message, /74\/100.*75\/100/);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
