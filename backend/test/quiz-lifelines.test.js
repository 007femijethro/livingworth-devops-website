import test from 'node:test';
import assert from 'node:assert/strict';
import {lifelineEffect,validLifelineLimit,validLifelineLimits,lifelineStatus} from '../dist/quiz-lifelines.js';
import {configureQuizSockets} from '../dist/quiz.js';
const q={id:501,prompt:'Example',options:['A','B','C','D'],correctIndex:2,questionType:'single_choice',correctAnswers:[]};
test('50:50 always removes exactly two wrong answers and validates question types and limits',()=>{
 for(let i=0;i<100;i++){const e=lifelineEffect('fifty_fifty',q,new Map(),1);assert.equal(new Set(e.hiddenIndexes).size,2);assert.ok(!e.hiddenIndexes.includes(2));}
 for(const value of [-1,11,1.5,'invalid'])assert.throws(()=>validLifelineLimit(value));
 assert.equal(validLifelineLimit('3'),3);assert.equal(validLifelineLimit(),0);
 assert.throws(()=>lifelineEffect('fifty_fifty',{...q,options:['True','False'],questionType:'true_false'},new Map(),1));
 assert.deepEqual(lifelineEffect('free_pass',{...q,questionType:'typed',correctText:'GitHub'},new Map(),1),{answerText:'GitHub'});
 assert.deepEqual(lifelineEffect('free_pass',{...q,questionType:'multiple_selection',correctAnswers:[0,3]},new Map(),1),{answerIndexes:[0,3]});
});
test('Audience counts latest answers to this question, excludes the requester, and may select a wrong answer',()=>{
 const votes=new Map([['501:1',{studentId:1,answerIndex:2}],['501:2',{studentId:2,answerIndex:0}],['501:3',{studentId:3,answerIndex:0}],['502:4',{studentId:4,answerIndex:2}]]);
 assert.deepEqual(lifelineEffect('audience',q,votes,1),{answerIndex:0,votes:2,totalVotes:2});
 votes.set('501:3',{studentId:3,answerIndex:1});assert.throws(()=>lifelineEffect('audience',q,votes,1),/tied/);
 assert.throws(()=>lifelineEffect('audience',q,new Map(),1),/No audience/);
 assert.throws(()=>lifelineEffect('audience',{...q,questionType:'typed'},votes,1),/single-answer/);
});
test('usage is scoped to the attempt and restores the exact private effect',async()=>{
 const db={execute:async(_sql,p)=>{assert.deepEqual(p,[91]);return [[{questionId:501,type:'fifty_fifty',effect:{hiddenIndexes:[0,1]}}]];}};
 assert.deepEqual(await lifelineStatus(db,91,501,3),{limit:3,used:1,remaining:2,byType:{fifty_fifty:{limit:3,used:1,remaining:2},free_pass:{limit:3,used:0,remaining:2},audience:{limit:3,used:0,remaining:2}},questionId:501,current:{type:'fifty_fifty',effect:{hiddenIndexes:[0,1]}}});
});
test('live socket flow enforces limits, hides removed answers, saves automatic answers, and restores usage after rejoin',async()=>{
 const quizId=991,students=[1,2,3],sockets=[],uses=[],saved=[],attempts=new Map();let connectionHandler;const locks=new Map();
 const quiz={id:quizId,title:'Test',joinCode:'LIFETEST',status:'lobby',allowRetakes:true,questionTimeSeconds:300,navigationMode:'manual',lifelineLimit:2,lifelineLimits:{fifty_fifty:1,free_pass:1,audience:1},speedScoring:true};
 const execute=async(sql,p=[])=>{
  if(sql.startsWith('SELECT id,title,join_code'))return [[{...quiz}]];
  if(sql.startsWith('SELECT lifeline_limit'))return [[quiz]];
  if(sql.startsWith('SELECT id,prompt'))return [[q,{...q,id:502},{...q,id:503}]];
  if(sql.startsWith('SELECT id FROM quiz_attempts WHERE quiz_id'))return [[...(attempts.has(p[1])?[{id:attempts.get(p[1])}]:[])]];
  if(sql.startsWith('SELECT COALESCE(MAX(attempt_no)'))return [[{attemptNo:1}]];
  if(sql.startsWith('INSERT INTO quiz_attempts')){const id=100+p[1];attempts.set(p[1],id);return [{insertId:id}];}
  if(sql.startsWith('SELECT question_id AS questionId'))return [[...uses.filter(x=>x.attemptId===p[0])]];
  if(sql.startsWith('SELECT id FROM quiz_attempt_answers'))return [[...saved.filter(x=>x.attemptId===p[0]&&x.questionId===p[1])]];
  if(sql.startsWith('INSERT INTO quiz_lifeline_uses')){uses.push({attemptId:p[0],questionId:p[1],type:p[2],effect:JSON.parse(p[3])});return [{insertId:uses.length}];}
  if(sql.startsWith('INSERT INTO quiz_attempt_answers')){const i=saved.findIndex(x=>x.attemptId===p[0]&&x.questionId===p[1]);const row={id:saved.length+1,attemptId:p[0],questionId:p[1],answerIndex:p[2],correct:p[4]};if(i<0)saved.push(row);else saved[i]=row;return [{insertId:row.id}];}
  if(sql.startsWith('SELECT id, full_name'))return [students.map(id=>({id,fullName:`Learner ${id}`}))];
  if(sql.startsWith('UPDATE quizzes')){if(sql.includes("status='live'"))quiz.status='live';return [{affectedRows:1}];}
  if(sql.startsWith('SELECT id FROM quiz_attempts WHERE id='))return [[{id:p[0]}]];
  if(sql.startsWith('UPDATE quiz_attempts'))return [{affectedRows:1}];
  throw new Error(`Unhandled test query: ${sql}`);
 };
 const pool={execute,query:async(sql,p)=>sql.startsWith('SELECT id, full_name')?[students.map(id=>({id,fullName:`Learner ${id}`}))]:execute(sql,p),getConnection:async()=>{
  let unlock;
  return {beginTransaction:async()=>{},execute:async(sql,p)=>{
   if(sql.includes('FOR UPDATE')){const prev=locks.get(p[0])||Promise.resolve();let resolve;const next=new Promise(r=>resolve=r);locks.set(p[0],next);await prev;unlock=resolve;}
   return execute(sql,p);
  },commit:async()=>{unlock?.();unlock=null;},rollback:async()=>{unlock?.();unlock=null;},release:()=>{unlock?.();}};
 }};
 const io={use:()=>{},on:(name,fn)=>{if(name==='connection')connectionHandler=fn;},in:room=>({fetchSockets:async()=>sockets.filter(s=>s.room===room),socketsLeave:()=>{}}),to:room=>({emit:(name,data)=>{for(const s of sockets.filter(x=>x.room===room))s.emit(name,data);}})};
 configureQuizSockets(io,pool,()=>{});
 const connect=(id,role='student')=>{const handlers={};const s={id:`${id}-${sockets.length}`,user:{id,role,status:'approved',fullName:`Learner ${id}`},data:{},events:[],on:(name,fn)=>handlers[name]=fn,join:room=>s.room=room,leave:()=>s.room=null,emit:(name,data)=>s.events.push({name,data}),send:(name,data)=>new Promise(resolve=>handlers[name](data,resolve))};sockets.push(s);connectionHandler(s);return s;};
 const staff=connect(99,'admin'),a=connect(1),b=connect(2),c=connect(3);
 try{
  for(const s of sockets)assert.equal((await s.send('quiz:join',{joinCode:'LIFETEST'})).ok,true);
  assert.equal((await staff.send('quiz:start',{quizId})).ok,true);
  assert.ok(!a.events.find(e=>e.name==='quiz:question').data.correctIndex);
  assert.equal((await c.send('quiz:lifeline',{quizId,questionId:501,type:'free_pass'})).ok,true);
  const input={quizId,questionId:501,type:'fifty_fifty'};
  const results=await Promise.all([a.send('quiz:lifeline',input),a.send('quiz:lifeline',input)]);
  assert.ok(results.every(x=>x.ok));assert.equal(uses.filter(x=>x.attemptId===101).length,1);assert.deepEqual(results[0].lifelines,results[1].lifelines);
  const hidden=results[0].lifelines.current.effect.hiddenIndexes;
  assert.equal((await a.send('quiz:answer',{quizId,questionId:501,answerIndex:hidden[0]})).ok,false);
  assert.equal((await a.send('quiz:answer',{quizId,questionId:501,answerIndex:2})).ok,true);
  assert.equal((await b.send('quiz:lifeline',{quizId,questionId:501,type:'audience'})).lifelines.current.effect.answerIndex,2);
  assert.ok(saved.find(x=>x.attemptId===102&&x.questionId===501).correct);
  // Private effects are not broadcast to a different learner.
  assert.equal(c.events.filter(e=>e.name==='quiz:lifelines').at(-1).data.current.type,'free_pass');
  await staff.send('quiz:reveal-now',{quizId});await staff.send('quiz:next',{quizId});
  const capped=await c.send('quiz:lifeline',{quizId,questionId:502,type:'free_pass'});assert.equal(capped.ok,false);assert.match(capped.message,/maximum uses/);
  assert.equal((await a.send('quiz:lifeline',{quizId,questionId:502,type:'free_pass'})).ok,true);
  assert.equal((await a.send('quiz:answer',{quizId,questionId:502,answerIndex:0})).ok,false);
  const reconnect=connect(1);const restored=await reconnect.send('quiz:join',{joinCode:'LIFETEST'});
  assert.equal(restored.liveState.lifelines.remaining,0);assert.equal(restored.liveState.selectedAnswer,2);
  await staff.send('quiz:reveal-now',{quizId});await staff.send('quiz:next',{quizId});
  assert.equal((await a.send('quiz:lifeline',{quizId,questionId:503,type:'free_pass'})).ok,false);
  await staff.send('quiz:pause',{quizId});assert.equal((await c.send('quiz:lifeline',{quizId,questionId:503,type:'free_pass'})).ok,false);
  const outsider=connect(8);assert.equal((await outsider.send('quiz:lifeline',{quizId,questionId:503,type:'free_pass'})).ok,false);
  assert.equal(uses.filter(x=>x.attemptId===101).length,2);
 } finally{await staff.send('quiz:close',{quizId});}
});

test('retakes toggle both ways without untyped null SQL; total and per-type limits save and live edits are refused',async()=>{
 const {default:express}=await import('express');const {registerQuizRoutes}=await import('../dist/quiz.js');
 let live=false,writes=0,retakes=false,caps=null;const app=express();app.use(express.json());
 const pool={execute:async(sql,p)=>{if(sql.startsWith('SELECT status'))return [[{status:live?'live':'draft'}]];if(sql.startsWith('UPDATE quizzes SET allow_retakes')){writes++;assert.doesNotMatch(sql,/\? IS NULL/);assert.equal(p.length,6);if(p[0]!==null)retakes=p[0];if(p[4]!==null)caps=JSON.parse(p[4]);return [{affectedRows:1}];}throw new Error(sql);},getConnection:async()=>({})};
 registerQuizRoutes(app,pool,(_req,_res,next)=>next(),(_req,_res,next)=>next());
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try {
  const send=async body=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/admin/quizzes/1/settings`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
  assert.equal((await send({allowRetakes:true})).body.allowRetakes,true);assert.equal(retakes,true);
  assert.equal((await send({allowRetakes:false})).body.allowRetakes,false);assert.equal(retakes,false);
  assert.equal((await send({lifelineLimit:4})).status,200);
  const limits={fifty_fifty:2,free_pass:1,audience:0};assert.equal((await send({lifelineLimits:limits})).status,200);assert.deepEqual(caps,limits);
  assert.equal((await send({lifelineLimit:11})).status,400);assert.equal((await send({lifelineLimits:{...limits,free_pass:-1}})).status,400);
  assert.equal((await send({allowRetakes:'false'})).status,400);
  live=true;assert.equal((await send({lifelineLimits:limits})).status,400);assert.equal((await send({lifelineLimit:4})).status,400);
  assert.equal((await send({allowRetakes:true})).status,200);assert.equal(writes,5);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('individual maxima validate every type and legacy quizzes inherit their existing shared limit',()=>{
 assert.deepEqual(validLifelineLimits(null,3),{fifty_fifty:3,free_pass:3,audience:3});
 assert.deepEqual(validLifelineLimits({fifty_fifty:0,free_pass:1,audience:2},3),{fifty_fifty:0,free_pass:1,audience:2});
 for(const value of [{},{free_pass:1},[],{fifty_fifty:0,free_pass:1.5,audience:2},{fifty_fifty:0,free_pass:1,audience:11}])assert.throws(()=>validLifelineLimits(value,3));
});
