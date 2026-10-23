import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {requireStaff,createToken,verifyToken} from '../dist/auth.js';
import {pool} from '../dist/db.js';
import {settingsDefaults} from '../dist/academy-settings.js';
import {studentRecord,registerStudentDirectoryRoutes} from '../dist/student-records.js';
import {registerLearnerProfileRoutes} from '../dist/learner-profile.js';
import {buildOverallLeaderboard} from '../dist/analytics.js';

const student={id:7,fullName:'Example Learner',email:'learner@example.test',status:'approved',isClassRep:true,probationStartedAt:'2030-01-01T00:00:00Z',probationDueAt:'2030-01-15T00:00:00Z',probationPolicy:'50:2',overallScore:35,lastSignedInAt:'2030-01-02T12:30:00Z',learningGoal:'Learn infrastructure',termsAccepted:true};
const score={id:7,overallScore:40,quizScore:20,activityScore:60,assignmentScore:null,attendanceScore:null,categoriesCounted:2,quizCount:1,activityCount:1,email:'not-a-score@example.test',password_hash:'never-forward-this'};
test('directory uses persisted probation and exact current grades; class reps retain probation labels',()=>{
 const row=studentRecord(student,score);assert.equal(row.accountStatus,'probation');assert.equal(row.isClassRep,true);assert.equal(row.scores.overallScore,40);assert.equal(row.probation.overallScore,35);assert.equal(row.lastSignedInAt,student.lastSignedInAt);assert.equal(row.scores.email,undefined);assert.equal(row.scores.password_hash,undefined);
 assert.equal(studentRecord(student,score,{...settingsDefaults(),probationEnabled:false}).accountStatus,'active');
 assert.equal(studentRecord({...student,probationPolicy:'45:2'},score).accountStatus,'active');
 assert.equal(studentRecord({...student,status:'expelled'},score).accountStatus,'expelled');
 const unassessed=studentRecord({...student,probationStartedAt:null,lastSignedInAt:null},null);assert.equal(unassessed.scores.overallScore,null);assert.equal(unassessed.lastSignedInAt,null);
});

async function fixture(run,{status='approved'}={}){
 const calls=[];
 const database={query:async(sql,args=[])=>{calls.push([sql,args]);return [[{...student,status}]]},execute:async(sql,args)=>{
   calls.push([sql,args]);
   if(sql.includes('FROM users WHERE id'))return [status!=='approved'&&sql.includes("AND status = 'approved'")?[]:[{...student,status}]];
   if(sql.includes('FROM activity_attempts aa'))return [[{id:2,title:'Orientation',weekNumber:1,attemptNo:1,correctCount:9,totalQuestions:15,completedAt:'2030-01-02T00:00:00Z'}]];
   return [[]];
 }};
 const scoreboard=async(db,options)=>{calls.push(['SCORES',options]);return {leaderboard:[score],scoring:{overall:'Equal average of available categories'}}};
 const app=express(),auth=(req,res,next)=>{if(!req.get('x-role'))return res.sendStatus(401);req.user={id:1,role:req.get('x-role')};next()};
 registerStudentDirectoryRoutes(app,database,auth,requireStaff,scoreboard);registerLearnerProfileRoutes(app,database,auth,requireStaff,scoreboard);
 app.use((error,req,res,next)=>res.status(500).json({message:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const request=(path='',role='admin')=>fetch(`http://127.0.0.1:${server.address().port}/api/staff/students${path}`,{headers:role?{'x-role':role}:{}});
 try{await run(request,calls)}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
test('directory and full profiles require staff access and return grades, probation, sign-ins and activities without answers',async()=>fixture(async(request,calls)=>{
 for(const path of ['','/7/profile']){assert.equal((await request(path,null)).status,401);assert.equal((await request(path,'student')).status,403)}
 const response=await request();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');const list=await response.json();assert.equal(list[0].accountStatus,'probation');assert.equal(list[0].scores.overallScore,40);
 const detail=await request('/7/profile');assert.equal(detail.status,200);assert.equal(detail.headers.get('cache-control'),'private, no-store');const report=await detail.json();assert.equal(report.student.lastSignedInAt,student.lastSignedInAt);assert.equal(report.student.learningGoal,student.learningGoal);assert.equal(report.probation.onProbation,true);assert.equal(report.standing.label,'Probation');assert.equal(report.scores.overallScore,40);assert.equal(report.classActivities.attempts[0].percentage,60);assert.equal(report.classActivities.attempts[0].attemptNo,1);
 for(const key of ['password_hash','correct_answers','token_hash'])assert.ok(!JSON.stringify(report).includes(key));
 assert.ok(calls.some(([sql,args])=>sql==='SCORES'&&args?.studentId===7&&args.includeInactive));
 const select=calls.find(([sql])=>sql.includes('FROM users WHERE id'))[0];assert.ok(!select.includes('password_hash'));assert.match(select,/last_signed_in_at AS lastSignedInAt/);
 for(const id of ['7bad','-1','1.5','0'])assert.equal((await request(`/${id}/profile`)).status,400);
 assert.ok(calls.every(([sql])=>!/^UPDATE|^DELETE|^INSERT/.test(sql)),'Profile reads must not mutate probation or sign-in time');
}));
test('admin can inspect expelled profiles while mentor access stays limited to approved learners',async()=>fixture(async(request)=>{
 const report=await (await request('/7/profile')).json();assert.equal(report.student.accountStatus,'expelled');assert.equal(report.scores.overallScore,40);assert.equal(report.probation.onProbation,false);
 assert.equal((await request('/7/profile','mentor')).status,404);
},{status:'expelled'}));
test('private single-student score calculation can include inactive accounts without widening normal leaderboards',async()=>{
 const calls=[];const database={query:async(sql,args)=>{calls.push([sql,args]);return [sql.includes('FROM users')?[{id:7,fullName:'Example Learner'}]:[]]}};
 await buildOverallLeaderboard(database);assert.match(calls[0][0],/status = 'approved'/);
 calls.length=0;await buildOverallLeaderboard(database,{studentId:7,includeInactive:true});assert.ok(!calls[0][0].includes("status = 'approved'"));assert.match(calls[0][0],/AND id = \?/);assert.deepEqual(calls[0][1],[7]);
});
test('issuing a new password or biometric session records sign-in; password and email token refreshes preserve it',async t=>{
 process.env.JWT_SECRET='test-sign-in-timestamp-only';const calls=[];
 t.mock.method(pool,'execute',async(sql,args)=>{calls.push([sql,args]);return [[]]});
 const user={id:7,role:'student',status:'approved'};
 const first=verifyToken(await createToken(user));assert.ok(first.jti);assert.equal(calls.filter(([sql])=>sql.startsWith('UPDATE users SET last_signed_in_at')).length,1);assert.deepEqual(calls.at(-1)[1],[7]);
 calls.length=0;const refreshed=verifyToken(await createToken(user,first));assert.equal(refreshed.jti,first.jti);assert.equal(calls.length,0);
 await createToken(user);assert.equal(calls.filter(([sql])=>sql.startsWith('UPDATE users SET last_signed_in_at')).length,1);
 calls.length=0;process.env.JWT_SECRET='';await assert.rejects(()=>createToken({id:9,role:'admin',status:'approved'}));assert.equal(calls.length,0);
});
