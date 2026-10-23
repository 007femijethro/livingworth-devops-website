import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {probationDecision,evaluateProbation,probationPolicy,probationView,registerProbationRoutes} from '../dist/probation.js';
import {settingsDefaults,validateSettings} from '../dist/academy-settings.js';
import {requireAdmin} from '../dist/auth.js';
const settings={probationEnabled:true,probationThreshold:50,probationWeeks:2};
const began='2030-01-01T12:00:00.000Z',deadline='2030-01-15T12:00:00.000Z';
const existing={id:1,probationStartedAt:began,probationPolicy:probationPolicy(settings)};

test('probation defaults, exact threshold and settings types',()=>{
 const defaults=settingsDefaults();assert.equal(defaults.probationThreshold,50);assert.equal(defaults.probationWeeks,2);assert.equal(defaults.probationEnabled,true);
 for(const body of [{probationEnabled:'false'},{probationThreshold:0},{probationThreshold:101},{probationWeeks:0},{probationWeeks:1.5},{probationWeeks:53}])assert.throws(()=>validateSettings(body));
 assert.deepEqual(validateSettings(settings),settings);
 for(const score of [50,75,null,NaN])assert.equal(probationDecision(existing,score,settings,new Date(deadline)).action,'clear');
 assert.equal(probationDecision(existing,0,settings,new Date(began)).action,'probation');
});
test('a new low score gets a full fourteen days, not a backdated deadline',()=>{
 assert.deepEqual(probationDecision({},49,settings,new Date(began)),{action:'probation',start:began,due:deadline,policy:'50:2'});
 assert.equal(probationDecision(existing,49,settings,new Date('2030-01-15T11:59:59.999Z')).action,'probation');
 assert.equal(probationDecision(existing,49,settings,new Date(deadline)).action,'expel');
});
test('recovery, policy changes, disabling and manual reinstatement reset the grace period',()=>{
 assert.equal(probationDecision(existing,49,{...settings,probationEnabled:false},new Date(deadline)).action,'clear');
 const recovered=probationDecision(existing,50,settings,new Date(deadline));
 assert.equal(probationDecision({probationStartedAt:recovered.start,probationPolicy:recovered.policy},49,settings,new Date(deadline)).due,'2030-01-29T12:00:00.000Z');
 assert.equal(probationDecision(existing,49,{...settings,probationThreshold:60},new Date(deadline)).action,'probation');
 assert.equal(probationDecision(existing,49,{...settings,probationWeeks:1},new Date(deadline)).due,'2030-01-22T12:00:00.000Z');
 assert.equal(probationDecision({probationStartedAt:null,probationPolicy:null},49,settings,new Date(deadline)).action,'probation');
});
function database({students=[existing],score=40,at=deadline,disabled=false,failCommit=false}={}){
 const writes=[],events=[];
 const connection={beginTransaction:async()=>events.push('begin'),commit:async()=>{if(failCommit)throw Error('commit failed');events.push('commit')},rollback:async()=>events.push('rollback'),release:()=>events.push('release'),query:async sql=>{
  if(sql.startsWith('SELECT CURRENT_TIMESTAMP'))return [[{evaluatedAt:at}]];
  assert.match(sql,/status='approved'.*FOR UPDATE/);return [students];
 },execute:async(sql,p=[])=>{writes.push({sql,p});return [{affectedRows:1}]}};
 return {pool:{getConnection:async()=>connection},writes,events,dependencies:{readSettings:async()=>({settings:{...settings,probationEnabled:!disabled}}),scoreboard:async()=>({leaderboard:students.map(student=>({id:student.id,overallScore:score}))})}};
}
test('automatic expulsion uses the existing access block and invalidates sessions and recovery links after the full grace period',async()=>{
 const db=database();let disconnected=0;const io={sockets:{sockets:new Map([['student',{user:{id:1,role:'student'},disconnect:()=>{assert.ok(db.events.includes('commit'));disconnected++}}],['other',{user:{id:2,role:'student'},disconnect:()=>assert.fail('Unrelated student disconnected')}]])}};
 assert.deepEqual(await evaluateProbation(db.pool,io,db.dependencies),{expelled:[1]});
 const expel=db.writes.find(x=>x.sql.includes("status='expelled'"));assert.match(expel.sql,/session_version=session_version\+1/);assert.match(expel.sql,/is_class_rep=FALSE/);assert.match(expel.sql,/role='student' AND status='approved'/);assert.match(expel.p[0],/40\/100 stayed below 50\/100 for 2 continuous weeks/);
 assert.ok(db.writes.some(x=>x.sql.startsWith('UPDATE password_reset_tokens')));assert.ok(db.writes.some(x=>x.sql.startsWith('UPDATE email_change_tokens')));assert.equal(disconnected,1);
});
test('fresh below-threshold students, recovered students, and null scores cannot be expelled',async()=>{
 for(const options of [{students:[{id:1}],score:0},{score:50},{score:null}]){
  const db=database(options);assert.deepEqual(await evaluateProbation(db.pool,null,db.dependencies),{expelled:[]});assert.ok(!db.writes.some(x=>x.sql.includes("status='expelled'")));
 }
});
test('disabled policy clears active timers without reinstating expelled students or accessing scores',async()=>{
 const db=database({disabled:true});db.dependencies.scoreboard=()=>assert.fail('Scores should not be read when off');
 await evaluateProbation(db.pool,null,db.dependencies);const update=db.writes.find(x=>x.sql.startsWith('UPDATE users'));assert.match(update.sql,/probation_started_at=NULL/);assert.match(update.sql,/status='approved'/);assert.doesNotMatch(update.sql,/SET status='approved'/);
});
test('a failed transaction rolls back and never disconnects a student',async()=>{
 const db=database({failCommit:true});const io={sockets:{sockets:new Map([['student',{user:{id:1,role:'student'},disconnect:()=>assert.fail('Must not disconnect before commit')} ]])}};
 await assert.rejects(evaluateProbation(db.pool,io,db.dependencies),/commit failed/);assert.ok(db.events.includes('rollback'));assert.ok(db.events.includes('release'));
});
test('probation APIs enforce admin/own-account access, hide obsolete timers, and do not make policy decisions during reads',async()=>{
 const student={...existing,status:'approved',overallScore:40,probationDueAt:deadline};
 assert.equal(probationView(student,{...settings,probationThreshold:60}).onProbation,false);
 assert.equal(probationView(student,{...settings,probationEnabled:false}).onProbation,false);
 const app=express();const pool={execute:async(sql,p)=>{assert.deepEqual(p,[12]);return [[student]]},query:async()=>[[student]]};
 registerProbationRoutes(app,pool,(req,res,next)=>{const role=req.get('x-role');if(!role)return res.sendStatus(401);req.user={id:12,role};next()},requireAdmin);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;
 try{
  assert.equal((await fetch(base+'/admin/probation')).status,401);
  assert.equal((await fetch(base+'/admin/probation',{headers:{'x-role':'student'}})).status,403);
  assert.equal((await fetch(base+'/student/probation',{headers:{'x-role':'mentor'}})).status,403);
  const response=await fetch(base+'/student/probation?studentId=999',{headers:{'x-role':'student'}});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal((await response.json()).onProbation,true);
  assert.equal((await fetch(base+'/admin/probation',{headers:{'x-role':'admin'}})).status,200);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
