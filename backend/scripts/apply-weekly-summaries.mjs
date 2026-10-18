import 'dotenv/config';
import { pool, rawPool } from '../dist/db.js';
import { applyWeeklySummaries } from '../dist/weekly-summaries.js';
try { console.log(JSON.stringify({ event: 'weekly_summaries_update', ...await applyWeeklySummaries(pool) })); }
catch (error) { console.error('Weekly summaries were not applied:', error.message); process.exitCode = 1; }
finally { await rawPool.end(); }
