// Apply the requested lifelines to the two reviewed quizzes for their next run only.
import { rawPool } from '../dist/db.js';
const client=await rawPool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(4792121)');
  const previous=await client.query("SELECT value_text FROM lw_system_settings WHERE setting_key='week8_9_lifelines_enabled_20261019_v2'");
  if(previous.rows.length) {
    await client.query('COMMIT');
    console.log(JSON.stringify({event:'week8_9_lifelines_enabled',alreadyApplied:true}));
  } else {
  const results=[];
  for(const [id,title] of [[9,'Week 8 — Configuration Management and Ansible (40 Questions)'],[10,'Week 9 — Infrastructure as Code and Terraform (40 Questions)']]) {
    const {rows}=await client.query('SELECT id,title,status,lifeline_limit FROM lw_quizzes WHERE id=$1 FOR UPDATE',[id]);
    const quiz=rows[0];
    if(!quiz || quiz.title!==title)throw new Error('Reviewed quiz identity changed. No settings changed.');
    let changed=false;
    if(['draft','lobby','completed'].includes(quiz.status) && quiz.lifeline_limit===0) {
      await client.query('UPDATE lw_quizzes SET lifeline_limit=3 WHERE id=$1',[id]);changed=true;quiz.lifeline_limit=3;
    }
    results.push({id,title,status:quiz.status,lifelineLimit:quiz.lifeline_limit,changed});
  }
  await client.query("INSERT INTO lw_system_settings(setting_key,enabled,value_text) VALUES('week8_9_lifelines_enabled_20261019_v2',TRUE,$1)",[JSON.stringify(results)]);
  await client.query('COMMIT');
  console.log(JSON.stringify({event:'week8_9_lifelines_enabled',quizzes:results}));
  }
}catch(error){await client.query('ROLLBACK');throw error;}
finally{client.release();await rawPool.end();}
