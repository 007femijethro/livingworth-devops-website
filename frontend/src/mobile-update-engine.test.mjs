import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibleUpdate, stageMobileUpdate, applyStagedMobileUpdate } from './mobile-update-engine.ts';
const runtime={nativeVersionCode:2,nativeFingerprint:'a'.repeat(64)}, origin='https://bridgess.co.uk';
const checksum='b'.repeat(64),bundleId=`android-2-${checksum}`;
const manifest={...runtime,schemaVersion:1,platform:'android',bundleId,checksum,signature:'A'.repeat(512),size:2048,url:`${origin}/api/mobile-updates/bundles/${bundleId}.zip`};
function fixture(overrides={}) {
 const calls=[];
 const port={ready:async()=>{calls.push('ready')},getVersionCode:async()=>({versionCode:'2'}),getCurrentBundle:async()=>({bundleId:null}),getNextBundle:async()=>({bundleId:null}),getBlockedBundles:async()=>({bundleIds:[]}),downloadBundle:async options=>{calls.push(['download',options])},setNextBundle:async options=>{calls.push(['stage',options])},...overrides};
 return {port,calls};
}
test('confirms readiness before network work and stages a signed update without reloading',async()=>{
 const {port,calls}=fixture();
 assert.equal(await stageMobileUpdate(port,async()=>{calls.push('manifest');return manifest},runtime,origin),true);
 assert.equal(calls[0],'ready');assert.equal(calls[1],'manifest');
 assert.deepEqual(calls[2],['download',{bundleId,url:manifest.url,checksum,signature:manifest.signature,artifactType:'zip'}]);
 assert.deepEqual(calls[3],['stage',{bundleId}]);
});
test('rejects incompatible, unsigned, oversized and third-party manifests',()=>{
 for(const patch of [{nativeVersionCode:1},{nativeFingerprint:'c'.repeat(64)},{platform:'ios'},{schemaVersion:2},{checksum:'bad'},{bundleId:'other'},{signature:''},{size:60*1024*1024},{url:'http://bridgess.co.uk/file.zip'},{url:`https://other.example/api/mobile-updates/bundles/${bundleId}.zip`},{url:manifest.url+'?redirect=1'},{url:manifest.url.replace('https://','https://user@')}]) assert.equal(compatibleUpdate({...manifest,...patch},runtime,origin),false,JSON.stringify(patch));
});
test('does not redownload current, staged or rolled-back bundles',async()=>{
 for(const overrides of [{getCurrentBundle:async()=>({bundleId})},{getNextBundle:async()=>({bundleId})},{getBlockedBundles:async()=>({bundleIds:[bundleId]})}]){
  const {port,calls}=fixture(overrides);
  assert.equal(await stageMobileUpdate(port,async()=>manifest,runtime,origin),false);
  assert.deepEqual(calls,['ready']);
 }
});
test('native version mismatch skips the manifest request',async()=>{
 const {port}=fixture({getVersionCode:async()=>({versionCode:'1'})});
 assert.equal(await stageMobileUpdate(port,async()=>assert.fail('must not fetch'),runtime,origin),false);
});
test('failed downloads never become the next bundle',async()=>{
 const {port,calls}=fixture({downloadBundle:async()=>{throw new Error('signature invalid')}});
 await assert.rejects(stageMobileUpdate(port,async()=>manifest,runtime,origin),/signature invalid/);
 assert.deepEqual(calls,['ready']);
});

test('explicit apply reloads a staged update but refuses active quizzes and missing updates',async()=>{
 let reloaded=0;const port={getCurrentBundle:async()=>({bundleId:'old'}),getNextBundle:async()=>({bundleId:'new'}),reload:async()=>{reloaded++}};
 await assert.rejects(applyStagedMobileUpdate(port,true),/Leave the quiz/);assert.equal(reloaded,0);
 await assert.rejects(applyStagedMobileUpdate({...port,getNextBundle:async()=>({bundleId:null})},false),/No downloaded/);assert.equal(reloaded,0);
 await assert.rejects(applyStagedMobileUpdate({...port,getNextBundle:async()=>({bundleId:'old'})},false),/No downloaded/);assert.equal(reloaded,0);
 await applyStagedMobileUpdate(port,false);assert.equal(reloaded,1);
});
