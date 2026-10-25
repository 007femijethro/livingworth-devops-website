import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {requireAuth} from '../dist/auth.js';
import {pool} from '../dist/db.js';
test('valid credentials with an unavailable database reach the server error handler, while invalid credentials remain rejected',async()=>{
 const previous=process.env.JWT_SECRET,execute=pool.execute;process.env.JWT_SECRET='test-only-session-reliability-key';
 const calls=[];const res={status(code){calls.push(['status',code]);return this},json(body){calls.push(['json',body]);return this}};
 try{const outage=new Error('Temporary database outage');outage.code='ECONNREFUSED';pool.execute=async()=>{throw outage};
  const token=jwt.sign({id:1,role:'admin',sessionVersion:0},process.env.JWT_SECRET);let forwarded;
  await requireAuth({headers:{authorization:`Bearer ${token}`}},res,e=>{forwarded=e});assert.equal(forwarded,outage);assert.deepEqual(calls,[]);
  await requireAuth({headers:{authorization:'Bearer forged'}},res,()=>assert.fail('Invalid JWT cannot reach protected routes'));assert.equal(calls[0][1],401);
  calls.length=0;const expired=jwt.sign({id:1,role:'student'},process.env.JWT_SECRET,{expiresIn:-1});await requireAuth({headers:{authorization:`Bearer ${expired}`}},res,()=>assert.fail());assert.equal(calls[0][1],401);
  calls.length=0;pool.execute=async()=>[[]];await requireAuth({headers:{authorization:`Bearer ${token}`}},res,()=>assert.fail());assert.equal(calls[0][1],401,'Deleted accounts are still rejected');
 }finally{pool.execute=execute;if(previous===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=previous}
});
