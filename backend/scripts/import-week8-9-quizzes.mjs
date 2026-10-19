// Reviewed, one-time content import. Answer banks are encrypted with a server-only key.
import fs from 'node:fs';
import { createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const marker = 'reviewed_week8_9_quizzes_20261019_v1';
export function validateBank(bank) {
  if (!bank || bank.version !== 1 || bank.quizzes?.length !== 2) throw new Error('Invalid reviewed quiz bank.');
  for (const [index, quiz] of bank.quizzes.entries()) {
    if (quiz.week !== index + 8 || !quiz.title?.trim() || quiz.title.length > 180 || quiz.questions?.length !== 40 || !quiz.materials?.length) throw new Error('Expected forty reviewed questions for each week.');
    const counts = [0, 0, 0, 0], prompts = new Set();
    let longest = 0;
    for (const q of quiz.questions) {
      if (!q.prompt?.trim() || !q.source?.trim() || !Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim() || o !== o.trim()) || new Set(q.options.map(o => o.toLowerCase())).size !== 4 || !Number.isInteger(q.correctIndex) || q.correctIndex < 0 || q.correctIndex > 3 || prompts.has(q.prompt.toLowerCase())) throw new Error('Incomplete or duplicated reviewed question.');
      prompts.add(q.prompt.toLowerCase()); counts[q.correctIndex]++;
      if (q.options[q.correctIndex].length > Math.max(...q.options.filter((_, i) => i !== q.correctIndex).map(o => o.length))) longest++;
    }
    if (counts.some(n => n !== 10) || longest > 12) throw new Error('Answer-position or length balance failed.');
  }
  return bank;
}
export async function importReviewedQuizzes(client, readBank) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(4792120)');
    const previous = await client.query('SELECT value_text FROM lw_system_settings WHERE setting_key=$1', [marker]);
    if (previous.rows.length) {
      // Respect later staff edits; never reseed or overwrite existing quizzes.
      await client.query('COMMIT');
      return {applied:false, reason:'already_imported', quizzes:JSON.parse(previous.rows[0].value_text).quizzes};
    }
    const bank = validateBank(await readBank());
    const admins = await client.query("SELECT id FROM lw_users WHERE LOWER(email)=$1 AND role='admin' AND status='approved'", ['admin@livingworthacademy.com']);
    if (admins.rows.length !== 1) throw new Error('The approved academy administrator was not found.');
    const created = [];
    for (const quiz of bank.quizzes) {
      for (const expected of quiz.materials) {
        const {rows} = await client.query('SELECT l.id,l.title,l.lesson_content,l.resource_url,m.week_number,m.title AS module_title FROM lw_learning_materials l JOIN lw_learning_modules m ON m.id=l.module_id WHERE l.id=$1 FOR SHARE OF l,m', [expected.id]);
        const actual = rows[0];
        if (!actual || actual.week_number !== quiz.week || actual.title !== expected.title || actual.module_title !== quiz.moduleTitle || actual.resource_url !== expected.resourceUrl || createHash('sha256').update(actual.lesson_content || '').digest('hex') !== expected.contentSha256) throw new Error(`Week ${quiz.week} materials changed; re-review required.`);
      }
      if (!quiz.materials.some(m => m.id === quiz.materialId)) throw new Error('Quiz reporting material is not in reviewed sources.');
      const duplicate = await client.query('SELECT id FROM lw_quizzes WHERE title=$1', [quiz.title]);
      if (duplicate.rows.length) throw new Error('A quiz with the reviewed title already exists. No quizzes changed.');
      const code = randomBytes(4).toString('hex').toUpperCase();
      const inserted = await client.query("INSERT INTO lw_quizzes(title,material_id,join_code,status,question_time_seconds,navigation_mode,speed_scoring,scheduled_at,ranking_visibility,created_by) VALUES($1,$2,$3,'draft',60,'manual',FALSE,NULL,'full',$4) RETURNING id", [quiz.title,quiz.materialId,code,admins.rows[0].id]);
      const id = inserted.rows[0].id;
      for (const [i, q] of quiz.questions.entries()) {
        await client.query("INSERT INTO lw_quiz_questions(quiz_id,prompt,topic,options_json,correct_index,question_type,correct_answers_json,correct_text,sequence_no) VALUES($1,$2,$3,$4,$5,'single_choice','[]',NULL,$6)", [id,q.prompt,q.source,JSON.stringify(q.options),q.correctIndex,i+1]);
      }
      const saved = await client.query('SELECT prompt,options_json,correct_index,sequence_no FROM lw_quiz_questions WHERE quiz_id=$1 ORDER BY sequence_no', [id]);
      if (saved.rows.length !== 40 || saved.rows.some((q,i) => q.prompt !== quiz.questions[i].prompt || q.correct_index !== quiz.questions[i].correctIndex || q.sequence_no !== i+1 || JSON.stringify(q.options_json) !== JSON.stringify(quiz.questions[i].options))) throw new Error('Saved question verification failed.');
      created.push({id,week:quiz.week,title:quiz.title,status:'draft',questionCount:40,questionTimeSeconds:60,navigationMode:'manual',speedScoring:false});
    }
    await client.query('INSERT INTO lw_system_settings(setting_key,enabled,value_text,updated_by) VALUES($1,TRUE,$2,$3)', [marker,JSON.stringify({quizzes:created,appliedAt:new Date().toISOString()}),admins.rows[0].id]);
    await client.query('COMMIT');
    return {applied:true,quizzes:created};
  } catch (error) {await client.query('ROLLBACK'); throw error;}
}
async function main() {
  const {rawPool} = await import('../dist/db.js');
  let client;
  try {
    client = await rawPool.connect();
    const result = await importReviewedQuizzes(client, async () => {
      const key = fs.readFileSync('/app/mobile-private/week8-9-quiz-import-key');
      const envelope = JSON.parse(fs.readFileSync(new URL('./week8-9-quizzes.encrypted.json', import.meta.url),'utf8'));
      const decipher = createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
      decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data,'base64')),decipher.final()]).toString('utf8'));
    });
    console.log(JSON.stringify({event:'reviewed_week8_9_quiz_import',...result}));
  } finally {client?.release();await rawPool.end();}
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {console.error('Reviewed quiz import failed:',error.message);process.exitCode=1;});
