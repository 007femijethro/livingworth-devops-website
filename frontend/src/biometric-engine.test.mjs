import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverBiometricSession} from './biometric-engine.ts';
const saved={id:'device-id',userId:77,email:'student@example.test',portal:'student',expiresAt:'2026-11-01'};
const token='a'.repeat(43),session={token:'session-token',user:{id:77,email:saved.email,role:'student'}};
test('cancelled biometric prompt and invalid secret never call the server',async()=>{
 let calls=0;const exchange=async()=>{calls++;return session};
 await assert.rejects(recoverBiometricSession(async()=>{throw new Error('cancelled')},exchange,saved),/cancelled/);
 await assert.rejects(recoverBiometricSession(async()=>({value:'bad'}),exchange,saved),/Invalid saved/);assert.equal(calls,0);
});
test('secure read completes before exchange and server errors do not create a session',async()=>{
 const order=[];const result=await recoverBiometricSession(async()=>{order.push('biometric');return {value:token}},async(value,portal)=>{order.push('exchange');assert.equal(value,token);assert.equal(portal,'student');return session},saved);assert.deepEqual(order,['biometric','exchange']);assert.equal(result,session);
 await assert.rejects(recoverBiometricSession(async()=>({value:token}),async()=>{throw new Error('offline')},saved),/offline/);
});
test('account and portal mismatches cannot sign in using another saved identity',async()=>{
 for(const user of [{...session.user,id:78},{...session.user,role:'admin'}])await assert.rejects(recoverBiometricSession(async()=>({value:token}),async()=>({...session,user}),saved),/does not match/);
 const staff={...saved,portal:'staff'};await assert.rejects(recoverBiometricSession(async()=>({value:token}),async()=>session,staff),/does not match/);
});
