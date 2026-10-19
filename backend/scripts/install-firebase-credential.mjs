// Private credential input is stdin only, never a command-line argument or log.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateFirebaseCredential } from '../dist/firebase-credential.js';
const target=process.env.GOOGLE_APPLICATION_CREDENTIALS||'/app/mobile-private/firebase-service-account.json';
let temporary;
try {
 const chunks=[];let size=0;
 for await(const chunk of process.stdin){size+=chunk.length;if(size>90000)throw new Error('Credential input is too large.');chunks.push(chunk)}
 const text=Buffer.concat(chunks).toString('utf8').trim();
 if(process.argv.includes('--base64')&&!/^[A-Za-z0-9+/]+={0,2}$/.test(text))throw new Error('Credential encoding is invalid.');
 const raw=process.argv.includes('--base64')?Buffer.from(text,'base64').toString('utf8'):text;
 let parsed;try{parsed=JSON.parse(raw)}catch{throw new Error('Credential JSON is invalid.')}
 const credential=validateFirebaseCredential(parsed,process.env.FIREBASE_PROJECT_ID||'livingworth-academy');
 await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});await fs.chmod(path.dirname(target),0o700);
 temporary=`${target}.${crypto.randomUUID()}.tmp`;
 await fs.writeFile(temporary,JSON.stringify(credential),{flag:'wx',mode:0o600});await fs.rename(temporary,target);temporary=undefined;
 console.log(JSON.stringify({event:'firebase_credential_installed',projectId:credential.project_id}));
}catch(error){if(temporary)await fs.unlink(temporary).catch(()=>{});console.error(error instanceof Error&&/^(Credential |A valid Firebase |The Firebase )/.test(error.message)?error.message:'Firebase credential could not be installed.');process.exitCode=1}
