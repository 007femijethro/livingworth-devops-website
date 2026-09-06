import 'dotenv/config';
import mysql from 'mysql2/promise';
import { rawPool } from '../src/db.js';
import { ensurePostgresSchema } from '../src/schema.js';

const tables = [
  'users', 'courses', 'enquiries', 'password_reset_tokens', 'quizzes', 'quiz_questions',
  'quiz_attempts', 'quiz_attempt_answers', 'quiz_answers', 'attendance', 'announcements',
  'announcement_reads', 'learning_modules', 'learning_materials', 'assignments',
  'assignment_submissions', 'material_progress', 'notifications'
];
const booleanColumns = new Set([
  'users.terms_accepted', 'users.must_change_password', 'quizzes.allow_retakes',
  'quiz_attempt_answers.is_correct', 'quiz_answers.is_correct', 'learning_modules.published'
]);
const jsonColumns = new Set(['quiz_questions.options_json']);

function valueFor(table, column, value) {
  if (value == null) return null;
  if (booleanColumns.has(`${table}.${column}`)) return Boolean(value);
  if (jsonColumns.has(`${table}.${column}`)) return typeof value === 'string' ? value : JSON.stringify(value);
  return value;
}

const legacy = await mysql.createConnection({
  host: process.env.DB_HOST || 'mysql', port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || process.env.MYSQL_USER,
  password: process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD,
  database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'livingworth_academy'
});
const target = await rawPool.connect();

try {
  await ensurePostgresSchema(target);
  const existing = [];
  for (const table of tables) {
    const { rows } = await target.query(`SELECT COUNT(*)::int AS count FROM lw_${table}`);
    if (rows[0].count) existing.push(`lw_${table} (${rows[0].count})`);
  }
  if (existing.length) throw new Error(`Migration stopped because target tables are not empty: ${existing.join(', ')}`);

  await target.query('BEGIN');
  const summary = [];
  for (const table of tables) {
    let rows;
    try { [rows] = await legacy.query(`SELECT * FROM \`${table}\``); }
    catch (error) {
      if (error.code === 'ER_NO_SUCH_TABLE') { summary.push({ table: `lw_${table}`, copied: 0, sourceMissing: true }); continue; }
      throw error;
    }
    for (const row of rows) {
      const columns = Object.keys(row);
      const names = columns.map(column => `"${column}"`).join(', ');
      const parameters = columns.map((_, index) => `$${index + 1}`).join(', ');
      const values = columns.map(column => valueFor(table, column, row[column]));
      await target.query(`INSERT INTO lw_${table} (${names}) VALUES (${parameters})`, values);
    }
    summary.push({ table: `lw_${table}`, copied: rows.length });
  }
  for (const table of tables.filter(name => !['announcement_reads', 'material_progress'].includes(name))) {
    await target.query(`SELECT setval(pg_get_serial_sequence('lw_${table}', 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM lw_${table}`);
  }
  await target.query('COMMIT');

  for (const item of summary) {
    const { rows } = await target.query(`SELECT COUNT(*)::int AS count FROM ${item.table}`);
    if (!item.sourceMissing && rows[0].count !== item.copied) throw new Error(`${item.table} verification failed: expected ${item.copied}, found ${rows[0].count}`);
  }
  console.table(summary);
  console.log('Legacy MySQL migration completed and verified. The old database was not changed.');
} catch (error) {
  await target.query('ROLLBACK').catch(() => {});
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  target.release();
  await legacy.end();
  await rawPool.end();
}
