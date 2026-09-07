import test from 'node:test';
import assert from 'node:assert/strict';
import { translateSql } from '../src/db.js';

test('prefixes Livingworth tables and keeps camel-case response fields', () => {
  const sql = translateSql('SELECT u.full_name AS fullName FROM users u JOIN attendance a ON a.student_id = u.id WHERE u.id = ?');
  assert.match(sql, /FROM lw_users/);
  assert.match(sql, /JOIN lw_attendance/);
  assert.match(sql, /AS "fullName"/);
  assert.match(sql, /u\.id = \$1/);
});

test('converts MySQL date and boolean aggregate expressions', () => {
  const sql = translateSql("SELECT SUM(status IN ('present','late')) AS attended FROM attendance WHERE session_date >= CURDATE() - INTERVAL 30 DAY");
  assert.match(sql, /SUM\(CASE WHEN status IN \('present','late'\) THEN 1 ELSE 0 END\)/);
  assert.match(sql, /CURRENT_DATE - INTERVAL '30 days'/);
});

test('adds insert id returns for identity tables', () => {
  assert.match(translateSql('INSERT INTO enquiries (name, email, message) VALUES (?, ?, ?)'), /RETURNING id$/);
  assert.doesNotMatch(translateSql('INSERT INTO material_progress (material_id, student_id) VALUES (?, ?)'), /RETURNING id/);
  assert.doesNotMatch(translateSql("INSERT INTO system_settings (setting_key, enabled) VALUES ('email_notifications', ?)"), /RETURNING id/);
});
