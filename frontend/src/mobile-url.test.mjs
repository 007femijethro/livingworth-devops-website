import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAcademyUrl } from './mobile-url.ts';
const origin = 'https://localhost';
test('routes API requests, parameters and uploaded files to the existing academy', () => {
  assert.equal(resolveAcademyUrl('/api/auth/me', origin), 'https://bridgess.co.uk/api/auth/me');
  assert.equal(resolveAcademyUrl('/api/staff/report?week=2&format=csv', origin), 'https://bridgess.co.uk/api/staff/report?week=2&format=csv');
  assert.equal(resolveAcademyUrl('https://localhost/uploads/course%20notes.pdf#page=2', origin), 'https://bridgess.co.uk/uploads/course%20notes.pdf#page=2');
});
test('keeps bundled assets, portal navigation and unrelated URL prefixes local', () => {
  for (const path of ['/livingworth-logo.jpeg', '/assets/index.js', '/portal/student/learning', '/apiary']) {
    assert.equal(resolveAcademyUrl(path, origin), origin + path);
  }
});
test('does not reroute third-party resources or blob download URLs', () => {
  for (const url of ['https://youtube.com/watch?v=example', 'https://other.example/api/data', 'blob:https://localhost/example']) {
    assert.equal(resolveAcademyUrl(url, origin), url);
  }
});
