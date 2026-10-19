import fs from 'node:fs';
const report=fs.readFileSync(process.argv[2],'utf8');
const digest=report.match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]+)/i)?.[1]?.toLowerCase();
if(!digest||digest!==process.env.LW_ANDROID_RELEASE_CERTIFICATE)throw new Error('The APK was not signed by the permanent academy release key.');
console.log('Signed Android release verified. Certificate SHA-256: '+digest);
