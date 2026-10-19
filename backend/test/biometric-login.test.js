import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import {biometricAccountValid,biometricPasswordVersion,biometricTokenHash,registerBiometricLoginRoutes} from '../dist/biometric-login.js';
import {translateSql} from '../dist/db.js';
process.env.JWT_SECRET='test-biometric-secret-only';
const password='Example-test-password-123';
const user={id:77,full_name:'Test Student',email:'student@example.test',role:'student',status:'approved',password_hash:await bcrypt.hash(password,4),session_version:2,must_change_password:false,is_locked:false};
const valid=()=>({...user,enrolledRole:'student',enrolledSessionVersion:2,passwordVersion:biometricPasswordVersion(user.password_hash),expiresAt:new Date(Date.now()+60000).toISOString(),deviceId:'00000000-0000-4000-8000-000000000001'});
async function fixture(run,{row=valid(),count=0,failConnection=false}={}){
 const calls=[];const connection={execute:async(sql,args)=>{calls.push([sql,args]);if(sql.startsWith('SELECT *, '))return [[row]];if(sql.startsWith('SELECT COUNT'))return [[{count}]];return [{}]},beginTransaction:async()=>calls.push(['BEGIN']),commit:async()=>calls.push(['COMMIT']),rollback:async()=>calls.push(['ROLLBACK']),release:()=>calls.push(['RELEASE'])};
 const pool={getConnection:async()=>{if(failConnection)throw new Error('Unavailable');return connection},execute:async(sql,args)=>{calls.push([sql,args]);return sql.startsWith('SELECT u.')?[[row]]:[{}]}};
 const app=express();app.use(express.json());registerBiometricLoginRoutes(app,pool,(req,res,next)=>{if(req.get('x-auth')!=='yes')return res.sendStatus(401);req.user={id:77};next()},u=>`session-for-${u.id}`);app.use((error,req,res,next)=>res.status(500).json({message:'Request failed'}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const root=`http://127.0.0.1:${server.address().port}/api/auth/`;
 const request=(path,body,method='POST',auth=true)=>fetch(root+path,{method,headers:{'Content-Type':'application/json',...(auth?{'x-auth':'yes'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 try{await run(request,calls)}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
}
test('saved sign-in rejects password, role, session, status, lock and expiry changes',()=>{
 assert.equal(biometricAccountValid(valid()),true);
 for(const change of [{status:'expelled'},{status:'pending'},{must_change_password:true},{is_locked:true},{role:'admin'},{session_version:3},{password_hash:'changed-hash'},{expiresAt:new Date(0).toISOString()},{expiresAt:'invalid'}])assert.equal(Boolean(biometricAccountValid({...valid(),...change})),false,JSON.stringify(change));
 assert.equal(Boolean(biometricAccountValid(null)),false);
});
test('enrollment requires authentication and current password; stores only secret hashes',async()=>fixture(async(request,calls)=>{
 assert.equal((await request('biometric-devices',{password},'POST',false)).status,401);
 assert.equal((await request('biometric-devices',{})).status,400);
 assert.equal((await request('biometric-devices',{password:'wrong'})).status,401);
 assert.ok(calls.some(([sql])=>sql.includes('failed_login_attempts+1')));
 const response=await request('biometric-devices',{password});assert.equal(response.status,201);assert.equal(response.headers.get('cache-control'),'no-store');const result=await response.json();assert.match(result.token,/^[A-Za-z0-9_-]{43}$/);assert.equal(result.user.password_hash,undefined);
 const insert=calls.find(([sql])=>sql.startsWith('INSERT INTO biometric_devices'));assert.equal(insert[1][2],biometricTokenHash(result.token));assert.equal(insert[1][3],biometricPasswordVersion(user.password_hash));assert.ok(!insert[1].includes(result.token));assert.ok(!insert[1].includes(password));assert.equal(insert[1][1],77);assert.equal(insert[1][5],2);
 assert.ok(new Date(result.expiresAt)-Date.now()>29*86400000);
}));
test('locked, temporary-password and full device accounts cannot enroll',async()=>{
 for(const [row,count,status] of [[{...valid(),is_locked:true},0,429],[{...valid(),must_change_password:true},0,403],[valid(),10,409]])await fixture(async request=>assert.equal((await request('biometric-devices',{password})).status,status),{row,count});
});
test('exchange is portal-bound, hashes opaque tokens and never extends expiry',async()=>fixture(async(request,calls)=>{
 assert.equal((await request('biometric-login',{token:'invalid',portal:'student'})).status,401);assert.equal(calls.length,0);
 const token='a'.repeat(43);assert.equal((await request('biometric-login',{token,portal:'staff'})).status,401);
 const response=await request('biometric-login',{token,portal:'student'},'POST',false);assert.equal(response.status,200);const result=await response.json();assert.equal(result.token,'session-for-77');assert.equal(result.user.id,77);assert.equal(result.user.password_hash,undefined);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.ok(calls.filter(([sql])=>sql.startsWith('SELECT')).every(([,args])=>args[0]===biometricTokenHash(token)));assert.ok(calls.filter(([sql])=>sql.startsWith('UPDATE')).every(([sql])=>!sql.includes('expires_at')));
}));
test('expired and revoked saved keys cannot issue sessions',async()=>{
 for(const row of [null,{...valid(),expiresAt:new Date(0).toISOString()}])await fixture(async request=>assert.equal((await request('biometric-login',{token:'a'.repeat(43),portal:'student'})).status,401),{row});
});
test('single and all-device revocation require auth and only affect the current user',async()=>fixture(async(request,calls)=>{
 const id=valid().deviceId;assert.equal((await request('biometric-devices',undefined,'DELETE',false)).status,401);assert.equal((await request('biometric-devices/not-a-uuid',undefined,'DELETE')).status,400);
 assert.equal((await request(`biometric-devices/${id}`,undefined,'DELETE')).status,200);assert.deepEqual(calls.at(-1)[1],[id,77]);assert.match(calls.at(-1)[0],/user_id=\?/);
 assert.equal((await request('biometric-devices',undefined,'DELETE')).status,200);assert.deepEqual(calls.at(-1)[1],[77]);
}));
test('database acquisition failure reaches error handling',async()=>fixture(async request=>assert.equal((await request('biometric-devices',{password})).status,500),{failConnection:true}));
test('biometric SQL preserves UUID ids, camelCase fields and lock interval on PostgreSQL',()=>{
 assert.equal(translateSql('INSERT INTO biometric_devices (id,user_id) VALUES (?,?)'),'INSERT INTO lw_biometric_devices (id,user_id) VALUES ($1,$2)');
 assert.match(translateSql('SELECT d.expires_at AS expiresAt FROM biometric_devices d'),/AS "expiresAt" FROM lw_biometric_devices/);
 assert.match(translateSql('UPDATE users SET locked_until=DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id=?'),/INTERVAL '15 minutes'/);
});
