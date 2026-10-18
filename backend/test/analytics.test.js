import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {buildOverallLeaderboard,registerAnalyticsRoutes} from '../dist/analytics.js';
function fixture() {
 const data={students:[{id:1,fullName:'Learner A'},{id:2,fullName:'Learner B'},{id:3,fullName:'Learner C'},{id:4,fullName:'Learner D'}],quizzes:[{studentId:1,quizId:1,correctCount:8,totalQuestions:10},{studentId:2,quizId:1,correctCount:10,totalQuestions:10}],assignments:[{studentId:1,score:90,maxScore:100}],attendance:[{studentId:1,status:'present'},{studentId:1,status:'excused'}],activities:[{studentId:1,activityId:1,correctCount:3,totalQuestions:15},{studentId:1,activityId:1,correctCount:12,totalQuestions:15},{studentId:1,activityId:2,correctCount:6,totalQuestions:10},{studentId:3,activityId:1,correctCount:0,totalQuestions:15}]};
 const calls=[];
 const pool={query:async sql=>{calls.push(sql);return [sql.includes('FROM users')?data.students:sql.includes('FROM quiz_attempts')?data.quizzes:sql.includes('FROM assignment_submissions')?data.assignments:sql.includes('FROM activity_attempts')?data.activities:data.attendance]}};
 return {data,pool,calls};
}
test('class activity uses the best attempt per activity and equally weights four categories',async()=>{
 const {pool,calls}=fixture();const result=await buildOverallLeaderboard(pool);const a=result.leaderboard.find(s=>s.id===1);
 assert.equal(a.activityScore,70);assert.equal(a.activityCount,2);assert.equal(a.categoriesCounted,4);assert.equal(a.overallScore,85);assert.equal(result.leaderboard[0].id,1);
 const query=calls.find(sql=>sql.includes('FROM activity_attempts'));assert.match(query,/m.published = TRUE/);assert.match(query,/aa.completed_at IS NOT NULL/);assert.match(query,/aa.total_questions > 0/);assert.ok(!query.includes('correct_answers'));assert.ok(!query.includes('activity_attempt_answers'));
});
test('missing activity remains unscored, while a completed zero score counts',async()=>{
 const {pool}=fixture();const {leaderboard}=await buildOverallLeaderboard(pool);const b=leaderboard.find(s=>s.id===2),c=leaderboard.find(s=>s.id===3),d=leaderboard.find(s=>s.id===4);
 assert.equal(b.activityScore,null);assert.equal(b.activityCount,0);assert.equal(b.categoriesCounted,1);assert.equal(b.overallScore,100);
 assert.equal(c.activityScore,0);assert.equal(c.activityCount,1);assert.equal(c.categoriesCounted,1);assert.equal(c.overallScore,0);assert.equal(d.overallScore,null);
});
test('deleting an attempt recalculates the current activity grade and overall score',async()=>{
 const {pool,data}=fixture();data.activities=data.activities.filter(a=>a.correctCount!==12);
 const a=(await buildOverallLeaderboard(pool)).leaderboard.find(s=>s.id===1);assert.equal(a.activityScore,40);assert.equal(a.activityCount,2);assert.equal(a.overallScore,78);
 data.activities=data.activities.filter(a=>a.studentId!==1);const after=(await buildOverallLeaderboard(pool)).leaderboard.find(s=>s.id===1);assert.equal(after.activityScore,null);assert.equal(after.categoriesCounted,3);assert.equal(after.overallScore,90);
});
test('student leaderboard exposes aggregate activity grades without answer reviews',async()=>{
 const {pool}=fixture();const app=express();registerAnalyticsRoutes(app,pool,(req,res,next)=>{if(!req.get('x-role'))return res.sendStatus(401);req.user={id:2,role:req.get('x-role')};next()},(req,res,next)=>next());const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/student/overall-leaderboard`;
 try{assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{'x-role':'mentor'}})).status,403);const response=await fetch(url,{headers:{'x-role':'student'}});const body=await response.json();assert.equal(response.status,200);assert.equal(body.currentStudent.id,2);assert.equal(body.topTen[0].activityScore,70);assert.equal(body.topTen[0].activityCount,2);assert.equal(body.topTen[0].categoriesCounted,4);assert.ok(!JSON.stringify(body).includes('correctAnswers'));assert.ok(!JSON.stringify(body).includes('review'));}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
