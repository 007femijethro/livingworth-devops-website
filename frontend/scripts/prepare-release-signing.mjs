// Trusted main-branch CI only. Private signing material travels over pinned SSH
// into temporary runner storage and is never printed or uploaded as an artifact.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
export function verifyHostKeys(scan,expected) {
 const lines=scan.split('\n').filter(line=>line&&!line.startsWith('#'));
 for(const line of lines){const parts=line.trim().split(/\s+/);if(parts[1]!=='ssh-ed25519')continue;const fingerprint='SHA256:'+crypto.createHash('sha256').update(Buffer.from(parts[2],'base64')).digest('base64').replace(/=+$/,'');if(fingerprint===expected)return line+'\n'}
 throw new Error('The deployment SSH host identity did not match the pinned fingerprint.');
}
export function restoreSigningMaterial(value,directory,expected) {
 if(value?.schemaVersion!==1||value.alias!=='academy-release'||value.storeType!=='PKCS12'||!/^[a-f0-9]{64}$/.test(value.password||'')||typeof value.keystore!=='string')throw new Error('Invalid signing material.');
 const cert=new crypto.X509Certificate(Buffer.from(value.certificate,'base64')),fingerprint=crypto.createHash('sha256').update(cert.raw).digest('hex');
 if(fingerprint!==value.certificateSha256||(expected!=='BOOTSTRAP_REQUIRED'&&fingerprint!==expected))throw new Error('The permanent release certificate did not match. Restore the original signing backup.');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});const file=path.join(directory,'academy-release.p12');fs.writeFileSync(file,Buffer.from(value.keystore,'base64'),{flag:'wx',mode:0o600});return {file,fingerprint};
}
function main(){
 if(process.env.GITHUB_REF!=='refs/heads/main'||!['push','workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME||''))throw new Error('Release signing is restricted to trusted main-branch builds.');
 const host=process.env.EC2_HOST||'',user=process.env.EC2_USER||'',privateKey=process.env.EC2_SSH_KEY||'';
 if(!/^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/.test(host)||!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(user)||!privateKey||!process.env.RUNNER_TEMP||!process.env.GITHUB_ENV)throw new Error('Deployment credentials are missing.');
 const directory=path.join(process.env.RUNNER_TEMP,'livingworth-release-signing');fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const sshKey=path.join(directory,'deployment-key'),known=path.join(directory,'known_hosts');fs.writeFileSync(sshKey,privateKey.trim()+'\n',{flag:'wx',mode:0o600});
 const expectedHost=fs.readFileSync(path.join(root,'frontend/scripts/release-host-fingerprint.txt'),'utf8').trim();
 const scan=execFileSync('ssh-keyscan',['-T','10','-t','ed25519',host],{encoding:'utf8',stdio:['ignore','pipe','pipe']});fs.writeFileSync(known,verifyHostKeys(scan,expectedHost),{mode:0o600});
 const sshArgs=['-i',sshKey,'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o',`UserKnownHostsFile=${known}`,'-o','ConnectTimeout=15',`${user}@${host}`];
 const remote=mode=>`cd /home/ubuntu/livingworth-devops-website && sudo docker compose exec -T --user root backend node scripts/android-release-signing.mjs ${mode}`;
 const run=(mode,input)=>execFileSync('ssh',[...sshArgs,remote(mode)],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:60000});
 const expected=fs.readFileSync(path.join(root,'ANDROID-RELEASE-CERTIFICATE.sha256'),'utf8').trim();
 const status=JSON.parse(run('status'));
 if(status.storageVersion!==2)throw new Error('Deploy the current private release storage before building.');
 if(!status.configured){
  if(expected!=='BOOTSTRAP_REQUIRED')throw new Error('The permanent signing key is missing. Restore its private backup before building.');
  const password=crypto.randomBytes(32).toString('hex'),store=path.join(directory,'candidate.p12'),env={...process.env,LW_ANDROID_CANDIDATE_PASSWORD:password};
  execFileSync('keytool',['-genkeypair','-alias','academy-release','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Livingworth Academy, O=Livingworth Academy','-storetype','PKCS12','-keystore',store,'-storepass:env','LW_ANDROID_CANDIDATE_PASSWORD','-noprompt'],{env,stdio:'pipe'});
  const certificate=execFileSync('keytool',['-exportcert','-alias','academy-release','-keystore',store,'-storepass:env','LW_ANDROID_CANDIDATE_PASSWORD'],{env,stdio:['ignore','pipe','pipe']});
  const candidate={schemaVersion:1,alias:'academy-release',storeType:'PKCS12',password,keystore:fs.readFileSync(store).toString('base64'),certificate:certificate.toString('base64'),certificateSha256:crypto.createHash('sha256').update(certificate).digest('hex')};run('install',JSON.stringify(candidate));fs.unlinkSync(store);
 }
 const saved=JSON.parse(run('export'));const restored=restoreSigningMaterial(saved,directory,expected);
 console.log(`::add-mask::${saved.password}`);console.log(`::add-mask::${saved.keystore}`);
 fs.appendFileSync(process.env.GITHUB_ENV,`LW_ANDROID_KEYSTORE_FILE=${restored.file}\nLW_ANDROID_KEYSTORE_PASSWORD=${saved.password}\nLW_ANDROID_KEY_ALIAS=academy-release\nLW_ANDROID_RELEASE_CERTIFICATE=${restored.fingerprint}\n`);
 console.log('Permanent Android release certificate SHA-256: '+restored.fingerprint);
 fs.unlinkSync(sshKey);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{main()}catch{console.error('Release signing preparation failed. Check the pinned host, private signing backup, deployment readiness and EC2 secrets. No signing material was logged.');process.exitCode=1}}
