import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerReviewerAccessRoutes,reviewerHash,liveReviewerSnapshot} from '../dist/reviewer-access.js';
import {requireAdmin} from '../dist/auth.js';
async function fixture(run){
 const grants=[],calls=[];let snapshots=0;
 const db={query:async(sql,args=[])=>{calls.push([sql,args]);if(sql.includes('JOIN users'))return [grants.filter(g=>g.hash===args[0]&&!g.revoked&&g.expiresAt>Date.now()).map(g=>({id:g.id,label:g.label,expiresAt:g.expiresAt}))];if(sql.includes('WHERE id='))return [grants.filter(g=>g.id===args[0]&&!g.revoked&&g.expiresAt>Date.now())];return [grants.map(({hash,...rest})=>rest)]},execute:async(sql,args)=>{calls.push([sql,args]);if(sql.startsWith('INSERT')){const row={id:grants.length+1,label:args[0],hash:args[1],expiresAt:Date.now()+args[3]*86400000};grants.push(row);return [{rows:[row]}]}grants.find(g=>g.id===Number(args[0])).revoked=true;return [{}]}};
 const app=express();app.use(express.json());const auth=(req,res,next)=>{if(!req.get('x-role'))return res.sendStatus(401);req.user={id:1,role:req.get('x-role')};next()};
 registerReviewerAccessRoutes(app,db,auth,requireAdmin,async()=>{snapshots++;return {students:[{fullName:'Live Learner'}],updatedAt:'2030-01-01'}});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const request=(path,options={})=>fetch(`http://127.0.0.1:${server.address().port}${path}`,options);
 try{await run({request,grants,calls,snapshots:()=>snapshots})}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
test('live grants are admin-only, hashed, bounded, read-only, expiring and revocable',async()=>fixture(async({request,grants,snapshots})=>{
 for(const method of ['GET','POST','DELETE'])for(const role of [null,'student','mentor']){const r=await request(`/api/admin/reviewer-access${method==='DELETE'?'/1':''}`,{method,headers:role?{'x-role':role}:{}});assert.equal(r.status,role?403:401)}
 const admin={'x-role':'admin','Content-Type':'application/json'};
 for(const days of [0,31,'7',1.5])assert.equal((await request('/api/admin/reviewer-access',{method:'POST',headers:admin,body:JSON.stringify({days})})).status,400);
 const created=await request('/api/admin/reviewer-access',{method:'POST',headers:admin,body:JSON.stringify({days:7})});assert.equal(created.status,201);const grant=await created.json();assert.match(grant.token,/^[A-Za-z0-9_-]{43}$/);assert.equal(grants[0].hash,reviewerHash(grant.token));assert.ok(!JSON.stringify(grants).includes(grant.token));
 for(const token of ['', 'wrong','A'.repeat(43)])assert.equal((await request('/api/reviewer/live',{headers:{Authorization:`Bearer ${token}`}})).status,401);
 assert.equal(snapshots(),0);
 const headers={Authorization:`Bearer ${grant.token}`};const live=await request('/api/reviewer/live',{headers});assert.equal(live.status,200);assert.equal(live.headers.get('cache-control'),'private, no-store');assert.equal((await live.json()).students[0].fullName,'Live Learner');
 assert.equal((await request('/api/reviewer/live',{method:'POST',headers})).status,404);
 assert.equal((await request('/api/admin/reviewer-access',{headers})).status,401);
 const listed=JSON.stringify(await (await request('/api/admin/reviewer-access',{headers:admin})).json());assert.ok(!listed.includes(grant.token));assert.ok(!listed.includes(grants[0].hash));
 grants[0].expiresAt=0;assert.equal((await request('/api/reviewer/live',{headers})).status,401);grants[0].expiresAt=Date.now()+86400000;
 await request('/api/admin/reviewer-access/1',{method:'DELETE',headers:admin});assert.equal((await request('/api/reviewer/live',{headers})).status,401);assert.equal(snapshots(),1);
}));
test('snapshot selects explicit read-only records and excludes contacts and answer keys',async()=>{
 const calls=[];const db={query:async sql=>{calls.push(sql);return [sql.includes("WHERE role='student'")?[{id:7,fullName:'Live learner',status:'approved'}]:[]]}};
 const result=await liveReviewerSnapshot(db,async()=>({leaderboard:[{id:7,email:'private@example.test',overallScore:85,quizScore:90} ],scoring:{overall:'Equal average'}}));
 assert.equal(result.students[0].scores.overallScore,85);assert.equal(result.students[0].scores.quizScore,90);assert.equal(result.recordLimit,500);assert.equal(result.refreshSeconds,15);
 assert.ok(!JSON.stringify(result).includes('private@example.test'));
 for(const sql of calls){assert.match(sql,/^SELECT /);assert.doesNotMatch(sql,/password|email|phone|correct_index|correct_text|submission_url|SELECT \*/)}
});
