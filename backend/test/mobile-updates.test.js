import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verify, createHash } from 'node:crypto';
import express from 'express';
import { unzipSync } from 'fflate';
import { publishMobileUpdate } from '../scripts/publish-mobile-update.mjs';
import { registerMobileUpdateRoutes } from '../dist/mobile-updates.js';

async function fixture(action) {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lw-mobile-'));
 const options = { webDir: path.join(root, 'web'), privateDir: path.join(root, 'private'), publicDir: path.join(root, 'public') };
 await fs.mkdir(options.webDir);
 await fs.writeFile(path.join(options.webDir, 'index.html'), '<html><body>Academy</body></html>');
 await fs.writeFile(path.join(options.webDir, 'mobile-runtime.json'), JSON.stringify({nativeVersionCode:2,nativeFingerprint:'a'.repeat(64)}));
 try { await action(options); } finally { await fs.rm(root, {recursive:true,force:true}); }
}

test('publishes a verifiable deterministic ZIP, retains a private signing key and rejects tampered bytes', async () => fixture(async options => {
 const first = await publishMobileUpdate(options);
 const zip = await fs.readFile(path.join(options.publicDir, 'bundles', `${first.bundleId}.zip`));
 const publicKey = await fs.readFile(path.join(options.privateDir, 'update-public.pem'), 'utf8');
 assert.equal(createHash('sha256').update(zip).digest('hex'), first.checksum);
 assert.equal(verify('RSA-SHA256', zip, publicKey, Buffer.from(first.signature,'base64')), true);
 assert.equal(verify('RSA-SHA256', Buffer.concat([zip,Buffer.from('tampered')]), publicKey, Buffer.from(first.signature,'base64')), false);
 assert.equal(new TextDecoder().decode(unzipSync(zip)['index.html']), '<html><body>Academy</body></html>');
 assert.equal(Object.keys(unzipSync(zip)).some(name => /private|\.pem/.test(name)), false);
 assert.equal((await fs.stat(path.join(options.privateDir,'update-private.pem'))).mode & 0o777, 0o600);
 const second = await publishMobileUpdate(options);
 assert.equal(second.bundleId,first.bundleId);
 assert.equal(await fs.readFile(path.join(options.privateDir,'update-public.pem'),'utf8'), publicKey);
}));

test('native changes cannot replace an existing version channel without a version code increment', async () => fixture(async options => {
 const first = await publishMobileUpdate(options);
 const manifestPath = path.join(options.publicDir,'android','2','manifest.json');
 const before = await fs.readFile(manifestPath,'utf8');
 await fs.writeFile(path.join(options.webDir,'mobile-runtime.json'),JSON.stringify({nativeVersionCode:2,nativeFingerprint:'b'.repeat(64)}));
 await assert.rejects(publishMobileUpdate(options), /increment Android versionCode/);
 assert.equal(await fs.readFile(manifestPath,'utf8'),before);
 await fs.writeFile(path.join(options.webDir,'mobile-runtime.json'),JSON.stringify({nativeVersionCode:3,nativeFingerprint:'b'.repeat(64)}));
 const next = await publishMobileUpdate(options);
 assert.equal(next.nativeVersionCode,3);
 assert.notEqual(next.bundleId,first.bundleId);
}));

test('public routes expose only manifests, bundles and public key with appropriate cache headers', async () => fixture(async options => {
 const manifest = await publishMobileUpdate(options);
 const app=express(); registerMobileUpdateRoutes(app,options);
 const server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try {
  let response=await fetch(`${base}/api/mobile-updates/android/2/manifest.json`);
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).bundleId,manifest.bundleId);
  response=await fetch(`${base}/api/mobile-updates/public-key.pem`);
  assert.match(await response.text(),/BEGIN PUBLIC KEY/);
  response=await fetch(`${base}/api/mobile-updates/bundles/${manifest.bundleId}.zip`);
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/immutable/);
  for(const suffix of ['android/0/manifest.json','bundles/update-private.pem','android/3/manifest.json']) {
   response=await fetch(`${base}/api/mobile-updates/${suffix}`);
   assert.ok([400,404].includes(response.status));assert.doesNotMatch(await response.text(),/BEGIN PRIVATE KEY/);
  }
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}));


test('ZIP timestamps remain valid and deterministic in western and eastern time zones', async () => fixture(async options => {
 const previous=process.env.TZ;
 try {let checksum;for(const zone of ['UTC','America/Los_Angeles','Africa/Lagos']){process.env.TZ=zone;const result=await publishMobileUpdate(options);if(checksum)assert.equal(result.checksum,checksum);checksum=result.checksum}}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous}
}));
