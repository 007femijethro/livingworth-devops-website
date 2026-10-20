import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {nextSignInActivity,activitySessionStatus,activityGateExempt} from '../dist/activity-session.js';
import {createToken,verifyToken,requireAuth} from '../dist/auth.js';
import {pool} from '../dist/db.js';
import {modulesFor} from '../dist/learning.js';

function activityDb() {
 const completed=new Set();
 const activities=[{id:1,title:'Week one',weekNumber:1},{id:2,title:'Week two',weekNumber:2},{id:3,title:'Week three',weekNumber:3}];
 return {completed,activities,async execute(sql,params){
  if(sql.includes('FROM users WHERE id'))return [[{role:'student',status:'approved',sessionVersion:0}]];
  if(sql.includes('SELECT a.id FROM learning_activities'))return [[...activities].filter(a=>!completed.has(a.id)).slice(0,1)];
  if(sql.includes('SELECT a.id, a.title, m.week_number'))return [activities.filter(a=>a.id===params[0]&&!completed.has(a.id))];
  throw new Error(sql);
 }};
}

test('a signed-in session requires exactly one next activity; refresh and token rotation do not advance it',async()=>{
 process.env.JWT_SECRET='activity-session-test-secret';
 const db=activityDb(),original=pool.execute;pool.execute=db.execute.bind(db);
 const user={id:7,role:'student',status:'approved'};
 try{
  const firstToken=await createToken(user),first=verifyToken(firstToken);
  assert.equal(first.activityRequiredId,1);
  assert.equal((await activitySessionStatus(db,first)).activity.weekNumber,1);
  db.completed.add(1);
  assert.equal((await activitySessionStatus(db,first)).required,false);
  assert.equal((await activitySessionStatus(db,verifyToken(firstToken))).required,false);
  const rotated=verifyToken(await createToken(user,first));
  assert.equal(rotated.activityRequiredId,1);assert.equal(rotated.jti,first.jti);
  assert.equal((await activitySessionStatus(db,rotated)).required,false);
  const second=verifyToken(await createToken(user));
  assert.equal(second.activityRequiredId,2);assert.notEqual(second.jti,first.jti);
  db.completed.add(2);
  assert.equal((await activitySessionStatus(db,second)).required,false);
  assert.equal(await nextSignInActivity(db,7),3);
  db.completed.add(3);
  const allDone=verifyToken(await createToken(user));
  assert.equal(allDone.activityRequiredId,null);
  assert.equal((await activitySessionStatus(db,allDone)).required,false);
 }finally{pool.execute=original;}
});

test('HTTP learning access is enforced on the server and restored after the assigned activity is completed',async()=>{
 process.env.JWT_SECRET='activity-session-test-secret';
 const db=activityDb(),original=pool.execute;pool.execute=db.execute.bind(db);
 const app=express();app.get('/api/student/learning',requireAuth,(_req,res)=>res.json({open:true}));
 app.get('/api/student/activity-session',requireAuth,async(req,res)=>res.json(await activitySessionStatus(db,req.user)));
 app.get('/api/auth/me',requireAuth,(_req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const token=await createToken({id:7,role:'student',status:'approved'}),headers={Authorization:`Bearer ${token}`};
  const url=`http://127.0.0.1:${server.address().port}`;
  const denied=await fetch(url+'/api/student/learning',{headers});assert.equal(denied.status,403);assert.equal((await denied.json()).code,'CLASS_ACTIVITY_REQUIRED');
  assert.equal((await fetch(url+'/api/student/activity-session',{headers})).status,200);
  assert.equal((await fetch(url+'/api/auth/me',{headers})).status,200);
  db.completed.add(1);
  assert.equal((await fetch(url+'/api/student/learning',{headers})).status,200);
  const nextToken=await createToken({id:7,role:'student',status:'approved'});
  assert.equal((await fetch(url+'/api/student/learning',{headers:{Authorization:`Bearer ${nextToken}`}})).status,403);
 }finally{pool.execute=original;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('staff, existing sessions, removed activities and empty activity sets never trap learners',async()=>{
 const never={execute(){throw new Error('Database must not be queried');}};
 for(const user of [{role:'admin',activityRequiredId:1},{role:'mentor'},{role:'student'}, {role:'student',activityRequiredId:null}])assert.equal((await activitySessionStatus(never,user)).required,false);
 const db=activityDb();db.activities.splice(0);
 assert.equal(await nextSignInActivity(db,7),null);
 assert.equal((await activitySessionStatus(db,{id:7,role:'student',activityRequiredId:1})).required,false);
 for(const path of ['/api/auth/change-password','/api/profile-picture','/api/student/class-activities','/api/student/class-activities/1/submit','/api/student/activity-session'])assert.equal(activityGateExempt(path),true);
 for(const path of ['/api/student/learning','/api/student/programme-progress','/api/student/class-activities-other'])assert.equal(activityGateExempt(path),false);
});

test('unfinished work in week one no longer hides later published learning weeks',async()=>{
 const db={query:async()=>[[{id:1,weekNumber:1},{id:2,weekNumber:2},{id:13,weekNumber:13}]],execute:async(sql)=>{
  if(sql.includes('FROM learning_materials'))return [[{id:1,progressStatus:'not_started'}]];
  if(sql.includes('FROM assignments'))return [[{id:1,assignmentType:'portal',submissionId:null}]];
  if(sql.includes('FROM learning_activities'))return [[{id:1,submittedAt:null}]];
  throw new Error(sql);
 }};
 const weeks=await modulesFor(db,7);assert.deepEqual(weeks.map(w=>w.weekNumber),[1,2,13]);assert.ok(weeks.every(w=>!w.isComplete));
});

test('a student cannot satisfy a sign-in requirement by submitting a different week',async()=>{
 const {registerClassActivityRoutes}=await import('../dist/class-activities.js');
 const db=activityDb();let acquired=false;
 const connection={execute:async(sql,params)=>{
  if(sql.includes('a.module_id AS moduleId'))return [[{id:Number(params[0]),moduleId:2,title:'Another activity',allowRetakes:false}]];
  return db.execute(sql,params);
 },beginTransaction:async()=>{acquired=true},rollback:async()=>{},release(){}};
 const app=express();app.use(express.json());
 registerClassActivityRoutes(app,{getConnection:async()=>connection},(req,_res,next)=>{req.user={id:7,role:'student',activityRequiredId:1};next()},(_req,_res,next)=>next());
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/student/class-activities/2/submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers:{1:0}})});assert.equal(response.status,403);assert.equal(acquired,false);assert.match((await response.json()).message,/Week 1/);}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
