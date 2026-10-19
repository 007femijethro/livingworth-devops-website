import { Capacitor } from '@capacitor/core';
import { NativeBiometric, AccessControl, BiometryType } from '@capgo/capacitor-native-biometric';
import { recoverBiometricSession, type SavedBiometric } from './biometric-engine';
const key='livingworth.biometric-login.v1',metaKey='lw_biometric_login';
export const supportsBiometricPlugin=()=>Capacitor.isNativePlatform()&&Capacitor.isPluginAvailable('NativeBiometric');
export function savedBiometric():SavedBiometric|null {
 try{const item=JSON.parse(localStorage.getItem(metaKey)||'null');return item&&typeof item.id==='string'&&typeof item.email==='string'&&['student','staff'].includes(item.portal)&&item.userId?item:null}catch{return null}
}
export function rememberEmail(portal:string,email:string,enabled=true){const key=`lw_saved_email:${portal}`;if(enabled)localStorage.setItem(key,email.trim().toLowerCase());else localStorage.removeItem(key)}
export function rememberedEmail(portal:string){return localStorage.getItem(`lw_saved_email:${portal}`)||''}
export async function biometricAvailability(){
 if(!supportsBiometricPlugin())return {available:false,label:'Biometric sign-in'};
 try{const info=await NativeBiometric.isAvailable({useFallback:false});return {available:info.isAvailable&&info.strongBiometryIsAvailable,label:info.biometryType===BiometryType.FACE_ID?'Face ID':info.biometryType===BiometryType.TOUCH_ID?'Touch ID':info.biometryType===BiometryType.FINGERPRINT?'fingerprint':'device biometrics'}}catch{return {available:false,label:'Biometric sign-in'}}
}
async function request(path:string,body?:unknown,method='POST'){
 const response=await fetch(`/api/auth/${path}`,{method,headers:{'Content-Type':'application/json',...(localStorage.getItem('lw_token')?{Authorization:`Bearer ${localStorage.getItem('lw_token')}`}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok){const error=Object.assign(new Error(data.message||'Sign-in could not be completed.'),{status:response.status});throw error}return data;
}
export async function forgetBiometric(revoke=false){
 const saved=savedBiometric();
 // Revoke on the server first so a network failure leaves a retryable entry.
 if(revoke&&saved)await request(`biometric-devices/${saved.id}`,undefined,'DELETE');
 if(supportsBiometricPlugin())await NativeBiometric.deleteData({key});
 localStorage.removeItem(metaKey);
}
export async function enableBiometric(password:string){
 if(!(await biometricAvailability()).available)throw new Error('Set up supported biometrics in your phone settings first.');
 const data=await request('biometric-devices',{password});
 try {
  // Delete the previous account's local secret before writing a replacement.
  const previous=savedBiometric();
  await forgetBiometric(previous?.userId===data.user.id);
  await NativeBiometric.setData({key,value:data.token,accessControl:AccessControl.BIOMETRY_CURRENT_SET,authValidityDuration:0,title:'Enable academy biometric sign-in',negativeButtonText:'Cancel'});
  const saved:SavedBiometric={id:data.id,userId:data.user.id,email:data.user.email,portal:data.user.role==='student'?'student':'staff',expiresAt:data.expiresAt};
  localStorage.setItem(metaKey,JSON.stringify(saved));rememberEmail(saved.portal,saved.email);return saved;
 }catch(error){await request(`biometric-devices/${data.id}`,undefined,'DELETE').catch(()=>{});await forgetBiometric().catch(()=>{});throw error}
}
export async function loginWithBiometric(){
 const saved=savedBiometric();if(!saved||!supportsBiometricPlugin())throw new Error('Sign in with your password and enable biometrics under Security.');
 const session=await recoverBiometricSession(()=>NativeBiometric.getSecureData({key,title:'Sign in to Livingworth Academy',reason:'Confirm your identity to sign in.',negativeButtonText:'Use password',fallbackTitle:'',maxAttempts:3}),(token,portal)=>request('biometric-login',{token,portal}),saved);
 localStorage.setItem(metaKey,JSON.stringify({...saved,email:session.user.email}));rememberEmail(saved.portal,session.user.email);return session;
}
export async function revokeAllBiometrics(){await request('biometric-devices',undefined,'DELETE');await forgetBiometric()}
