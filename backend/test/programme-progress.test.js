import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {programmeProgress} from '../dist/programme-progress.js';
import {registerLearningRoutes} from '../dist/learning.js';
const published=[{id:1,weekNumber:1,title:'Foundations'},{id:2,weekNumber:2,title:'Linux'},{id:3,weekNumber:3,title:'Cloud'}];
test('programme progress follows server unlocks and excludes lesson content and answers',()=>{
 const result=programmeProgress(published,[{...published[0],isComplete:true,materials:[{progressStatus:'done',lessonContent:'private note'}],assignments:[{assignmentType:'portal',submissionId:50}],activity:{submittedAt:'2026-10-18',answers:'private answer'}},{...published[1],materials:[{progressStatus:'done'},{progressStatus:'in_progress'}],assignments:[{assignmentType:'manual'},{assignmentType:'portal',closedAt:'2026-10-18'},{assignmentType:'portal'}],activity:{}}]);
 assert.equal(result.completedWeeks,1);assert.equal(result.totalWeeks,3);assert.equal(result.remainingWeeks,2);assert.equal(result.percentage,33);assert.equal(result.currentWeek.weekNumber,2);assert.deepEqual(result.weeks.map(w=>w.status),['complete','current','locked']);assert.equal(result.currentWeek.work.done,2);assert.equal(result.currentWeek.work.total,5);assert.equal(result.currentWeek.work.percentage,40);assert.equal(result.weeks[2].work,null);assert.ok(!JSON.stringify(result).includes('private'));
});
test('empty published week waits for materials and never counts as complete',()=>{
 const result=programmeProgress(published,[{...published[0],materials:[],assignments:[],activity:null,isComplete:false}]);assert.equal(result.completedWeeks,0);assert.equal(result.percentage,0);assert.equal(result.currentWeek.status,'upcoming');assert.equal(result.currentWeek.work.percentage,0);assert.equal(result.weeks[1].status,'locked');
});
test('empty and fully completed published programmes return finite, accurate totals',()=>{
 const empty=programmeProgress([],[]);assert.equal(empty.percentage,0);assert.equal(empty.currentWeek,null);
 const done=programmeProgress(published,published.map(week=>({...week,isComplete:true,materials:[{progressStatus:'done'}],assignments:[]})));assert.equal(done.percentage,100);assert.equal(done.remainingWeeks,0);assert.equal(done.currentWeek,null);
});
test('programme route enforces student authentication and returns only published roadmap metadata',async()=>{
 const calls=[];const pool={query:async sql=>{calls.push([sql]);return [published]},execute:async(sql,params)=>{calls.push([sql,params]);const moduleId=params.at(-1);if(sql.includes('FROM learning_materials'))return [[{id:20+moduleId,title:'Private lesson',lessonContent:'Do not expose',progressStatus:moduleId===1?'done':'not_started'}]];if(sql.includes('FROM assignments'))return [[]];if(sql.includes('FROM learning_activities'))return [[]];throw new Error(sql)}};
 const app=express();registerLearningRoutes(app,pool,(req,res,next)=>{const role=req.get('x-role');if(!role)return res.sendStatus(401);req.user={id:77,role};next()},(_req,_res,next)=>next());const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url=`http://127.0.0.1:${server.address().port}/api/student/programme-progress`;
 try{assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{'x-role':'admin'}})).status,403);assert.equal(calls.length,0);const response=await fetch(url,{headers:{'x-role':'student'}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');const result=await response.json();assert.equal(result.completedWeeks,1);assert.equal(result.weeks[1].status,'current');assert.equal(result.weeks[2].status,'locked');assert.ok(!JSON.stringify(result).includes('Do not expose'));assert.ok(calls.filter(([sql])=>sql.includes('FROM learning_modules')).every(([sql])=>sql.includes('WHERE published = TRUE')));assert.ok(calls.filter(([sql])=>sql.includes('FROM learning_materials')).every(([,params])=>params[0]===77));}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});
