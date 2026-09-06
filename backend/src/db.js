import pg from 'pg';

const { Pool } = pg;
const logicalTables = [
  'quiz_attempt_answers', 'assignment_submissions', 'password_reset_tokens', 'announcement_reads',
  'learning_materials', 'material_progress', 'learning_modules', 'quiz_questions', 'quiz_attempts',
  'quiz_answers', 'announcements', 'assignments', 'notifications', 'attendance', 'enquiries',
  'email_events', 'quizzes', 'courses', 'users'
];
const idTables = new Set(logicalTables.filter(name => !['announcement_reads', 'material_progress'].includes(name)));

function placeholders(sql) {
  let index = 0, quote = null, result = '';
  for (let position = 0; position < sql.length; position += 1) {
    const character = sql[position];
    if ((character === "'" || character === '"') && sql[position - 1] !== '\\') quote = quote === character ? null : quote || character;
    result += character === '?' && !quote ? `$${++index}` : character;
  }
  return result;
}

function postgresSql(source) {
  let sql = source;
  for (const table of logicalTables) sql = sql.replace(new RegExp(`\\b${table}\\b`, 'g'), `lw_${table}`);
  sql = sql
    .replace(/\bAS\s+([a-z]+[A-Z][A-Za-z0-9]*)/g, 'AS "$1"')
    .replace(/CURDATE\(\)/g, 'CURRENT_DATE')
    .replace(/DATE_ADD\(NOW\(\),\s*INTERVAL\s+(\d+)\s+MINUTE\)/g, "(NOW() + INTERVAL '$1 minutes')")
    .replace(/CURRENT_DATE\s*-\s*INTERVAL\s+(\d+)\s+DAY/g, "CURRENT_DATE - INTERVAL '$1 days'")
    .replace(/SUM\(([^()]+?)\s+IN\s+\(([^)]+)\)\)/g, 'SUM(CASE WHEN $1 IN ($2) THEN 1 ELSE 0 END)')
    .replace(/SUM\(([^()]+?)\s*<>\s*('[^']+')\)/g, 'SUM(CASE WHEN $1 <> $2 THEN 1 ELSE 0 END)')
    .replace(/SUM\(([^()]+?)\s*=\s*('[^']+')\)/g, 'SUM(CASE WHEN $1 = $2 THEN 1 ELSE 0 END)')
    .replace(/SUM\((qaa\.is_correct)\)/g, 'SUM((qaa.is_correct)::int)');
  sql = placeholders(sql);
  const insert = sql.match(/^\s*INSERT\s+INTO\s+lw_([a-z_]+)/i);
  if (insert && idTables.has(insert[1]) && !/\bRETURNING\b/i.test(sql)) sql += ' RETURNING id';
  return sql;
}

export const translateSql = postgresSql;

function databaseError(error) {
  if (error.code === '23505') error.code = 'ER_DUP_ENTRY';
  return error;
}

function response(result, sql) {
  if (/^\s*(SELECT|WITH|SHOW)\b/i.test(sql)) return [result.rows, result.fields];
  return [{ insertId: result.rows[0]?.id, affectedRows: result.rowCount, rows: result.rows }, result.fields];
}

async function run(client, sql, params = []) {
  const translated = postgresSql(sql);
  try { return response(await client.query(translated, params), translated); }
  catch (error) { throw databaseError(error); }
}

export const rawPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: String(process.env.DATABASE_SSL || 'true').toLowerCase() === 'false' ? false : { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_SIZE || 10), idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000
});

export const pool = {
  query(sql, params) { return run(rawPool, sql, params); },
  execute(sql, params) { return run(rawPool, sql, params); },
  async getConnection() {
    const client = await rawPool.connect();
    return {
      query(sql, params) { return run(client, sql, params); },
      execute(sql, params) { return run(client, sql, params); },
      beginTransaction() { return client.query('BEGIN'); }, commit() { return client.query('COMMIT'); },
      rollback() { return client.query('ROLLBACK'); }, release() { client.release(); }
    };
  }
};
