import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {verifyHostKeys,restoreSigningMaterial} from './prepare-release-signing.mjs';
test('release signing refuses a changed SSH host and never accepts an unrelated scanned key',()=>{
 const bytes=crypto.randomBytes(32),key=bytes.toString('base64'),fingerprint='SHA256:'+crypto.createHash('sha256').update(bytes).digest('base64').replace(/=+$/,'');const line=`example.test ssh-ed25519 ${key}`;assert.equal(verifyHostKeys('# comment\n'+line,fingerprint),line+'\n');assert.throws(()=>verifyHostKeys(line,'SHA256:other'),/did not match/);assert.throws(()=>verifyHostKeys('example.test ssh-rsa '+key,fingerprint),/did not match/);
});
test('invalid private material never creates a keystore',()=>{
 assert.throws(()=>restoreSigningMaterial({},'/unused','expected'),/Invalid signing material/);
});

import {verifyReleaseCertificate} from './verify-release-certificate.mjs';
test('certificate verification accepts signer report prefixes and rejects missing or different signers',()=>{
 const digest='a'.repeat(64);
 for(const prefix of ['Signer #1','Signer (minSdkVersion=24, maxSdkVersion=2147483647)'])assert.equal(verifyReleaseCertificate(`${prefix} certificate SHA-256 digest: ${digest}`,digest),digest);
 assert.equal(verifyReleaseCertificate('Signer #1 certificate SHA-256 digest: '+digest.match(/../g).join(':'),digest),digest);
 assert.throws(()=>verifyReleaseCertificate('No certificate','a'.repeat(64)));
 assert.throws(()=>verifyReleaseCertificate('Signer #1 certificate SHA-256 digest: '+'b'.repeat(64),digest));
});
