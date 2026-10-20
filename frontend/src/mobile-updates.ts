import { LiveUpdate } from '@capawesome/capacitor-live-update';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { academyOrigin } from './mobile-url';
import { applyStagedMobileUpdate, compatibleUpdate, stageMobileUpdate, type NativeRuntime } from './mobile-update-engine';
declare const __LW_NATIVE_RUNTIME__: NativeRuntime;
export type MobileUpdateStatus = {phase:'idle'|'checking'|'ready'|'current'|'error';message:string};
let status:MobileUpdateStatus={phase:'idle',message:'Updates have not been checked yet.'};
let started=false,checking=false,lastCheck=0;
let checker:((force?:boolean)=>Promise<void>)|null=null;
export const mobileUpdateStatus=()=>status;
function report(next:MobileUpdateStatus){status=next;window.dispatchEvent(new CustomEvent('lw:mobile-update',{detail:next}));}
export async function checkMobileUpdates(){startMobileUpdates();await checker?.(true);}
export async function applyMobileUpdate(){
  await applyStagedMobileUpdate(LiveUpdate,Boolean(sessionStorage.getItem('lw_live_quiz_code')));
}
export function startMobileUpdates(){
 if(started||!Capacitor.isNativePlatform()||Capacitor.getPlatform()!=='android')return;
 started=true;
 checker=async(force=false)=>{
  if(checking||(!force&&Date.now()-lastCheck<60000))return;
  checking=true;report({phase:'checking',message:'Checking and downloading a compatible update…'});
  try{
   await LiveUpdate.ready();
   const native=await LiveUpdate.getVersionCode();
   if(Number(native.versionCode)!==__LW_NATIVE_RUNTIME__.nativeVersionCode)throw new Error('This app needs the current signed installer.');
   await stageMobileUpdate(LiveUpdate,async version=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{const response=await fetch(`${academyOrigin}/api/mobile-updates/android/${version}/manifest.json`,{cache:'no-store',signal:controller.signal});if(response.status===204)throw new Error('Update downloads are paused by the academy.');if(!response.ok)throw new Error('Could not reach the update server. Try again on a stable connection.');const manifest=await response.json();if(!compatibleUpdate(manifest,__LW_NATIVE_RUNTIME__,academyOrigin))throw new Error('The available update is incompatible. Install the current signed app.');if((await LiveUpdate.getBlockedBundles()).bundleIds.includes(manifest.bundleId))throw new Error('This update was rolled back on this phone. Use the current signed installer to recover.');return manifest;}finally{clearTimeout(timeout);}
   },__LW_NATIVE_RUNTIME__,academyOrigin);
   const [current,next]=await Promise.all([LiveUpdate.getCurrentBundle(),LiveUpdate.getNextBundle()]);
   lastCheck=Date.now();
   report(next.bundleId&&next.bundleId!==current.bundleId?{phase:'ready',message:'Update downloaded. Open About & Help → Apply update to load it now.'}:{phase:'current',message:'No newer compatible update is ready to install.'});
  }catch(error){report({phase:'error',message:error instanceof Error?error.message:'Update check failed. Try again on a stable connection.'});}
  finally{checking=false;}
 };
 void checker();
 void App.addListener('appStateChange',({isActive})=>{if(isActive)void checker?.();});
}
