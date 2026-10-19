// CLI only: access requires the deployment SSH account and backend-container access.
// export writes private material to stdout for an encrypted SSH pipe; never run it
// interactively or include it in workflow logs/artifacts.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function validateSigningMaterial(value) {
 if(!value||value.schemaVersion!==1||value.alias!=='academy-release'||value.storeType!=='PKCS12'
  ||typeof value.password!=='string'||!/^[a-f0-9]{64}$/.test(value.password)
  ||typeof value.keystore!=='string'||value.keystore.length<1000||value.keystore.length>64000||!/^[A-Za-z0-9+/]+={0,2}$/.test(value.keystore)
  ||typeof value.certificate!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(value.certificate))throw new Error('Release signing material is invalid.');
 try {
  const cert=new crypto.X509Certificate(Buffer.from(value.certificate,'base64'));
  const sha=crypto.createHash('sha256').update(cert.raw).digest('hex');
  if(sha!==value.certificateSha256||cert.publicKey.asymmetricKeyType!=='rsa'||(cert.publicKey.asymmetricKeyDetails?.modulusLength||0)<3072||!cert.verify(cert.publicKey))throw new Error();
 }catch{throw new Error('Release signing certificate is invalid.')}
 return value;
}
export async function installSigningMaterial(directory,candidate) {
 validateSigningMaterial(candidate);await fs.mkdir(directory,{recursive:true,mode:0o700});await fs.chmod(directory,0o700);
 const target=path.join(directory,'android-release-signing.json'),temporary=path.join(directory,`.release-${crypto.randomUUID()}.tmp`);
 const file=await fs.open(temporary,'wx',0o600);
 try{await file.writeFile(JSON.stringify(candidate));await file.sync()}finally{await file.close()}
 let created=false;
 try{await fs.link(temporary,target);created=true}catch(error){if(error.code!=='EEXIST')throw error}finally{await fs.unlink(temporary)}
 const saved=validateSigningMaterial(JSON.parse(await fs.readFile(target,'utf8')));await fs.chmod(target,0o600);
 const dir=await fs.open(directory,'r');try{await dir.sync()}finally{await dir.close()}
 return {created,certificateSha256:saved.certificateSha256};
}
async function main() {
 const directory=process.env.ANDROID_SIGNING_PRIVATE_DIR||'/app/android-signing-private',target=path.join(directory,'android-release-signing.json'),mode=process.argv[2];
 if(mode==='install'){
  const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>90000)throw new Error();chunks.push(chunk)}
  const result=await installSigningMaterial(directory,JSON.parse(Buffer.concat(chunks).toString('utf8')));
  console.log(JSON.stringify({event:'android_release_signing_ready',...result}));
 }else if(mode==='export'){
  const value=validateSigningMaterial(JSON.parse(await fs.readFile(target,'utf8')));process.stdout.write(JSON.stringify(value));
 }else if(mode==='status'){
  try{const value=validateSigningMaterial(JSON.parse(await fs.readFile(target,'utf8')));console.log(JSON.stringify({storageVersion:2,configured:true,certificateSha256:value.certificateSha256}))}
  catch(error){if(error.code!=='ENOENT')throw error;console.log(JSON.stringify({storageVersion:2,configured:false}))}
 }else throw new Error();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Android release signing operation failed. No signing material was logged or replaced.');process.exitCode=1});
