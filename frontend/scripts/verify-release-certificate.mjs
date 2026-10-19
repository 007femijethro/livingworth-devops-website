import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
export function verifyReleaseCertificate(report,expected) {
 const matches=[...report.matchAll(/certificate SHA-256 digest:\s*([a-f0-9:]+)/ig)].map(match=>match[1].replaceAll(':','').toLowerCase());
 if(!expected||!matches.length||matches.some(digest=>digest.length!==64)||matches.some(digest=>digest!==expected.toLowerCase()))throw new Error('The APK certificate does not match the permanent academy release key.');
 return matches[0];
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=fs.readFileSync(process.argv[2],'utf8');
 try{console.log('Signed Android release verified. Certificate SHA-256: '+verifyReleaseCertificate(report,process.env.LW_ANDROID_RELEASE_CERTIFICATE))}
 catch(error){console.error('Expected public certificate: '+(process.env.LW_ANDROID_RELEASE_CERTIFICATE||'missing'));console.error(report);throw error}
}
