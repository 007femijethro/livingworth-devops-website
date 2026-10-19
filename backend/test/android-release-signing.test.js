import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {installSigningMaterial,validateSigningMaterial} from '../scripts/android-release-signing.mjs';
test('permanent signing identity is installed once, kept private, and never replaced by later builds',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lw-release-store-'));
 try {
  const password=crypto.randomBytes(32).toString('hex'),store=path.join(root,'candidate.p12'),env={...process.env,LW_TEST_STORE_PASS:password};
  execFileSync('keytool',['-genkeypair','-alias','academy-release','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Livingworth Academy','-storetype','PKCS12','-keystore',store,'-storepass:env','LW_TEST_STORE_PASS','-noprompt'],{env,stdio:'pipe'});
  const certificate=execFileSync('keytool',['-exportcert','-alias','academy-release','-keystore',store,'-storepass:env','LW_TEST_STORE_PASS'],{env,stdio:['ignore','pipe','pipe']});
  const value={schemaVersion:1,alias:'academy-release',storeType:'PKCS12',password,keystore:(await fs.readFile(store)).toString('base64'),certificate:certificate.toString('base64'),certificateSha256:crypto.createHash('sha256').update(certificate).digest('hex')};
  assert.equal(validateSigningMaterial(value),value);assert.throws(()=>validateSigningMaterial({...value,certificateSha256:'bad'}));assert.throws(()=>validateSigningMaterial({...value,password:'short'}));
  const directory=path.join(root,'private'),target=path.join(directory,'android-release-signing.json');const first=await installSigningMaterial(directory,value);assert.equal(first.created,true);
  const before=await fs.readFile(target,'utf8');const next=await installSigningMaterial(directory,{...value,password:crypto.randomBytes(32).toString('hex')});assert.equal(next.created,false);assert.equal(await fs.readFile(target,'utf8'),before);assert.equal((await fs.stat(target)).mode&0o777,0o600);assert.equal((await fs.stat(directory)).mode&0o777,0o700);
  await assert.rejects(installSigningMaterial(directory,{...value,certificate:'invalid'}));assert.equal(await fs.readFile(target,'utf8'),before);
  const result=spawnSync(process.execPath,['scripts/android-release-signing.mjs','install'],{cwd:new URL('..',import.meta.url),input:'invalid PRIVATE-SENTINEL',encoding:'utf8',env:{...process.env,ANDROID_SIGNING_PRIVATE_DIR:directory}});assert.notEqual(result.status,0);assert.ok(!result.stdout.includes(password));assert.ok(!result.stderr.includes('PRIVATE-SENTINEL'));assert.deepEqual(await fs.readdir(directory),['android-release-signing.json']);
 }finally{await fs.rm(root,{recursive:true,force:true})}
});
