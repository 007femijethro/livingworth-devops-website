import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesShortAnswer, regradeShortAnswers } from '../dist/class-activities.js';

const github = 'GitHub|a GitHub account|GitHub account|GitHub.com';
test('accepts the complete expected answer in longer responses, regardless of case', () => {
  for (const answer of ['github and aws', 'AWS and GITHUB', 'I created a GitHub account.', 'GitHub, AWS and Slack', '(github)', '  GiThUb   and AWS!']) {
    assert.equal(matchesShortAnswer(answer, github), true, answer);
  }
  assert.equal(matchesShortAnswer('I use Secure   Shell to connect.', 'SSH|Secure Shell'), true);
  assert.equal(matchesShortAnswer('The command returns exit code 0.', '0|zero'), true);
  assert.equal(matchesShortAnswer('Use terraform.tfstate for this.', 'terraform.tfstate'), true);
});
test('rejects blank answers, unrelated answers and fragments inside longer words or numbers', () => {
  for (const answer of ['', '   ', 'AWS', 'hub', 'githubber', 'mygithubaccount', 'égithubé']) {
    assert.equal(matchesShortAnswer(answer, github), false, answer);
  }
  assert.equal(matchesShortAnswer('port 1443', '443'), false);
  assert.equal(matchesShortAnswer('exit code 10', '0'), false);
  assert.equal(matchesShortAnswer('terraformXtfstate', 'terraform.tfstate'), false);
  assert.equal(matchesShortAnswer('anything', ' | '), false);
});
test('regrading updates only newly matching saved answers, recalculates each affected attempt and is idempotent', async () => {
  const rows = [
    { id: 1, attemptId: 11, answer: 'github and aws', correctText: github },
    { id: 2, attemptId: 11, answer: 'Use SSH to connect', correctText: 'SSH|Secure Shell' },
    { id: 3, attemptId: 12, answer: 'AWS', correctText: github },
    { id: 4, attemptId: 13, answer: 'exit code 0', correctText: '0|zero' }
  ];
  const corrected = new Set(), recalculated = [];
  let commits = 0, releases = 0;
  const connection = {
    beginTransaction: async () => {}, commit: async () => { commits++; },
    rollback: async () => assert.fail('unexpected rollback'), release: () => { releases++; },
    execute: async (sql, params = []) => {
      if (sql.startsWith('SELECT')) return [rows.filter(row => !corrected.has(row.id))];
      if (sql.startsWith('UPDATE activity_attempt_answers')) { corrected.add(params[0]); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('UPDATE activity_attempts')) { recalculated.push(params[0]); return [{ affectedRows: 1 }]; }
      throw new Error(sql);
    }
  };
  const pool = { getConnection: async () => connection };
  assert.deepEqual(await regradeShortAnswers(pool), { correctedAnswers: 3, attempts: 2 });
  assert.deepEqual([...corrected], [1, 2, 4]);
  assert.deepEqual(recalculated, [11, 13]);
  assert.deepEqual(await regradeShortAnswers(pool), { correctedAnswers: 0, attempts: 0 });
  assert.equal(commits, 2);
  assert.equal(releases, 2);
  assert.equal(rows[0].answer, 'github and aws');
});
test('regrading rolls back and releases the database connection on failure', async () => {
  let rolledBack = false, released = false;
  const pool = { getConnection: async () => ({
    beginTransaction: async () => {},
    execute: async () => { throw new Error('database unavailable'); },
    commit: async () => assert.fail('must not commit'),
    rollback: async () => { rolledBack = true; }, release: () => { released = true; }
  }) };
  await assert.rejects(regradeShortAnswers(pool), /database unavailable/);
  assert.equal(rolledBack, true);
  assert.equal(released, true);
});
