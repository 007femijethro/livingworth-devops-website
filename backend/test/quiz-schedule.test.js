import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {quizSchedule,scheduledQuizWorker} from '../dist/quiz-schedule.js';
import {registerQuizRoutes,configureQuizSockets} from '../dist/quiz.js';

test('schedule keeps opening and start distinct, validates order, and preserves manual legacy rooms',()=>{
 const now=Date.parse('2030-01-01T10:00Z');
 assert.deepEqual(quizSchedule('2030-01-01T20:00+01:00','2030-01-01T20:15+01:00',now),{scheduledAt:'2030-01-01T19:00:00.000Z',startsAt:'2030-01-01T19:15:00.000Z'});
 assert.deepEqual(quizSchedule(null,null,now),{scheduledAt:null,startsAt:null});
 assert.equal(quizSchedule('2020-01-01',null,now).startsAt,null);
 for(const [open,start] of [[null,'2030-01-01T20:00Z'],['bad',null],['2030-01-01T20:00Z','2030-01-01T19:00Z'],['2030-01-01T20:00Z','2030-01-01T20:00Z'],['2020-01-01','2020-01-02']])assert.throws(()=>quizSchedule(open,start,now));
});
test('worker skips overlapping polls and continues to later due quizzes after a failure',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);let queries=0;const started=[],errors=[];
 const worker=scheduledQuizWorker({query:async sql=>{queries++;if(sql.startsWith('UPDATE')){await gate;return [{}]}return [[{id:1},{id:2}]]}},async id=>{started.push(id);if(id===1)throw Error('bad quiz')},e=>errors.push(e.message),1e8);
 try{await worker.tick();assert.equal(queries,1);release();await new Promise(setImmediate);assert.deepEqual(started,[1,2]);assert.deepEqual(errors,['bad quiz']);}finally{worker.stop()}
});
test('schedule endpoint persists both times, supports cancellation and rejects a started quiz without changing results',async()=>{
 let changes=[],allowed=true;const events=[];const app=express();app.use(express.json());
 const pool={query:async()=>[{}],execute:async(sql,p)=>{assert.match(sql,/scheduled_started_at IS NULL/);assert.doesNotMatch(sql,/quiz_attempts|quiz_questions/);changes.push(p);return [{affectedRows:allowed?1:0}]}};
 registerQuizRoutes(app,pool,(req,_res,next)=>{req.user={id:1,role:'admin'};next()},(_req,_res,next)=>next(),{to:room=>({emit:(name,data)=>events.push({room,name,data})})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/admin/quizzes/4/schedule`;
 const save=body=>fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await save({scheduledAt:'2035-01-01T19:00Z',startsAt:'2035-01-01T19:20Z'})).status,200);assert.deepEqual(changes[0],['2035-01-01T19:00:00.000Z','2035-01-01T19:20:00.000Z','4']);
  assert.equal((await save({scheduledAt:null,startsAt:null})).status,200);assert.deepEqual(changes[1],[null,null,'4']);assert.deepEqual(events[1],{room:'quiz:4',name:'quiz:schedule',data:{quizId:4,scheduledAt:null,startsAt:null,scheduleStartedAt:null}});
  assert.equal((await save({scheduledAt:'bad'})).status,400);assert.equal(changes.length,2);
  allowed=false;assert.equal((await save({scheduledAt:null,startsAt:null})).status,409);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
test('a due quiz starts through the real socket engine once, without an admin connected',async()=>{
 const events=[];let live=false,consumed=false,handler;
 const quiz={lifelineLimit:0,questionTimeSeconds:300,navigationMode:'manual',speedScoring:true};
 const pool={query:async sql=>sql.startsWith('UPDATE')?[{}]:[[...(!live&&!consumed?[{id:8801}]:[])]],execute:async sql=>{
  if(sql.startsWith('SELECT lifeline_limits'))return [[quiz]];
  if(sql.startsWith('SELECT id,prompt'))return [[{id:99,prompt:'Example',options:['A','B'],correctIndex:0,questionType:'single_choice'}]];
  if(sql.startsWith("UPDATE quizzes SET status='live'")){assert.match(sql,/scheduled_start_at <= CURRENT_TIMESTAMP/);if(consumed)return [{affectedRows:0}];live=true;consumed=true;return [{affectedRows:1}]}
  if(sql.startsWith('SELECT id, full_name'))return [[]];
  if(sql.startsWith('SELECT id, title, status'))return [[{id:8801,status:'live',title:'Example'}]];
  if(sql.startsWith('UPDATE quizzes'))return [{affectedRows:1}];
  throw Error(sql);
 }};
 const io={use(){},on(_event,fn){handler=fn},in:()=>({fetchSockets:async()=>[],socketsLeave(){}}),to:()=>({emit:(name,data)=>events.push({name,data})})};
 const worker=configureQuizSockets(io,pool,()=>{});
 try{await new Promise(setImmediate);await worker.tick();assert.equal(events.filter(e=>e.name==='quiz:started').length,1);assert.equal(events.filter(e=>e.name==='quiz:question').length,1);assert.equal(events.find(e=>e.name==='quiz:question').data.correctIndex,undefined);
  // A restart may lose the in-memory room; the durable consumed marker still excludes it.
  live=false;await worker.tick();assert.equal(events.filter(e=>e.name==='quiz:started').length,1);
 }finally{worker.stop();const handlers={};handler({id:'staff',user:{id:1,role:'admin'},data:{},on:(name,fn)=>handlers[name]=fn});await new Promise(resolve=>handlers['quiz:close']({quizId:8801},resolve))}
});
test('students cannot enter before opening even if a staff preview has set the room to lobby',async()=>{
 let handler;const pool={query:async sql=>sql.startsWith('UPDATE')?[{}]:[[]],execute:async sql=>{assert.match(sql,/WHERE join_code=/);return [[{id:8802,status:'lobby',scheduledAt:'2035-01-01T19:00:00Z'}]]}};
 const io={use(){},on(_event,fn){handler=fn}};const worker=configureQuizSockets(io,pool,()=>{});
 try{const handlers={};handler({id:'early',user:{id:12,role:'student'},data:{},on:(event,fn)=>handlers[event]=fn});const reply=await new Promise(resolve=>handlers['quiz:join']({joinCode:'EARLY'},resolve));assert.equal(reply.ok,false);assert.match(reply.message,/opens/)}finally{worker.stop()}
});
test('scheduling waits until the HTTP server is listening before processing due work',async()=>{
 const {EventEmitter}=await import('node:events');const httpServer=new EventEmitter();httpServer.listening=false;let queries=0;
 const io={httpServer,use(){},on(){}};const pool={query:async sql=>{queries++;return sql.startsWith('UPDATE')?[{}]:[[]]}};
 const worker=configureQuizSockets(io,pool,()=>{});
 try{await new Promise(setImmediate);assert.equal(queries,0);httpServer.listening=true;httpServer.emit('listening');await new Promise(setImmediate);assert.equal(queries,2)}finally{httpServer.emit('close');worker.stop()}
});
