import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerAnalyticsRoutes} from '../dist/analytics.js';
test('staff cohort filter isolates ranking and summary, rejects invalid cohorts, and retains all-cohort view', async()=>{
 const people=[{id:1,fullName:'Existing B',email:'b@example.com',cohort:'B'},{id:2,fullName:'New C',email:'c@example.com',cohort:'C'}];
 const pool={query:async(sql,params=[])=>{
  if(sql.includes("FROM users WHERE role = 'student'"))return [people.filter(p=>!sql.includes('AND cohort = ?')||p.cohort===params.at(-1)).map(({cohort,...p})=>p)];
  return [[]];
 }};
 const app=express();registerAnalyticsRoutes(app,pool,(_req,_res,next)=>next(),(_req,_res,next)=>next());
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api/staff/overall-leaderboard`;
 try{
  for(const [cohort,name] of [['B','Existing B'],['C','New C']]){const res=await fetch(url+'?cohort='+cohort);assert.equal(res.status,200);const data=await res.json();assert.equal(data.summary.students,1);assert.equal(data.leaderboard[0].fullName,name);}
  assert.equal((await (await fetch(url)).json()).summary.students,2);
  assert.equal((await fetch(url+'?cohort=invalid')).status,400);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
