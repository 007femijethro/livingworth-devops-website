import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateFirebaseCredential} from '../dist/firebase-credential.js';
const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const value={type:'service_account',project_id:'livingworth-academy',client_email:'push@livingworth-academy.iam.gserviceaccount.com',private_key:pair.privateKey};
test('Firebase credentials must be a valid RSA service account in the configured project',()=>{
 assert.equal(validateFirebaseCredential(value,'livingworth-academy'),value);
 for(const invalid of [{...value,type:undefined},{project_info:{project_id:'livingworth-academy'}},{...value,private_key:'not-a-private-key'},{...value,client_email:'unrelated@example.test'}])assert.throws(()=>validateFirebaseCredential(invalid,'livingworth-academy'));
 assert.throws(()=>validateFirebaseCredential(value,'different-project'),/must match/);
});
test('private credential installer validates before replacing and never prints credentials',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lw-firebase-'));const target=path.join(root,'private','firebase-service-account.json');
 const run=(input,encoded=false)=>spawnSync(process.execPath,['scripts/install-firebase-credential.mjs',...(encoded?['--base64']:[])],{cwd:new URL('..',import.meta.url),input,encoding:'utf8',env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:target,FIREBASE_PROJECT_ID:'livingworth-academy'}});
 try{
  const success=run(Buffer.from(JSON.stringify(value)).toString('base64'),true);assert.equal(success.status,0,success.stderr);assert.equal(JSON.parse(success.stdout).event,'firebase_credential_installed');assert.ok(!success.stdout.includes('PRIVATE KEY'));assert.equal((await fs.stat(target)).mode&0o777,0o600);assert.equal((await fs.stat(path.dirname(target))).mode&0o777,0o700);assert.deepEqual(JSON.parse(await fs.readFile(target,'utf8')),value);
  const before=await fs.readFile(target,'utf8');
  for(const input of ['not JSON PRIVATE-SENTINEL',JSON.stringify({...value,project_id:'different-project'}),'a'.repeat(90001)]){const failed=run(input);assert.notEqual(failed.status,0);assert.ok(!failed.stderr.includes('PRIVATE-SENTINEL'));assert.ok(!failed.stderr.includes(pair.privateKey));assert.equal(await fs.readFile(target,'utf8'),before)}
  assert.deepEqual(await fs.readdir(path.dirname(target)),['firebase-service-account.json']);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
