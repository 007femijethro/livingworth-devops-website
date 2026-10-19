import { useEffect,useState,type FormEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { biometricAvailability,enableBiometric,forgetBiometric,revokeAllBiometrics,savedBiometric,supportsBiometricPlugin } from './biometric-login';
import './biometric-login.css';
export default function BiometricSettings({currentEmail='',demo=false}:{currentEmail?:string;demo?:boolean}){
 const [availability,setAvailability]=useState({available:false,label:'biometrics'}),[saved,setSaved]=useState(savedBiometric),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{void biometricAvailability().then(setAvailability)},[]);
 if(!Capacitor.isNativePlatform()||demo)return null;
 const enabled=saved?.email.toLowerCase()===currentEmail.toLowerCase();
 async function enable(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;const password=String(new FormData(form).get('biometricPassword')||'');setBusy(true);setMessage('');try{setSaved(await enableBiometric(password));form.reset();setMessage('Biometric sign-in enabled. You can use it next time you open the app.')}catch{setSaved(savedBiometric());setMessage('Could not enable biometric sign-in. Check your password and phone biometrics, then try again.')}finally{form.reset();setBusy(false)}}
 async function disable(all=false){setBusy(true);setMessage('');try{if(all)await revokeAllBiometrics();else await forgetBiometric(true);setSaved(savedBiometric());setMessage(all?'Saved sign-ins revoked on all devices.':'Biometric sign-in removed from this device.')}catch{setSaved(savedBiometric());setMessage('Could not finish removing saved sign-in. Check your connection and try again.')}finally{setBusy(false)}}
 return <section className="security-center biometric-settings"><div><p className="eyebrow">Quick sign-in</p><h2>Biometric sign-in</h2><p>Your password is never saved for this feature. A sign-in key is protected by your phone’s biometric security and expires after 30 days. Logging out keeps it available until you remove it here.</p></div>
 {!supportsBiometricPlugin()?<p>Install the latest Android app to enable fingerprint sign-in.</p>:!availability.available?<p>Set up a supported fingerprint or face biometric in your phone settings. Password sign-in is always available.</p>:enabled?<div><p>Enabled for {saved?.email} until {new Date(saved!.expiresAt).toLocaleDateString()}.</p><button className="button light-border" disabled={busy} onClick={()=>disable()}>Remove from this device</button></div>:<form className="security-form" onSubmit={enable}><label>Confirm current password<input name="biometricPassword" type="password" autoComplete="current-password" required disabled={busy}/></label><small>One account can be saved for biometrics on this device. Enabling it replaces any previously saved account.</small><button className="button primary" disabled={busy}>{busy?'Setting up…':`Enable ${availability.label}`}</button></form>}
 {supportsBiometricPlugin()&&<button className="button light-border" disabled={busy} onClick={()=>disable(true)}>Revoke saved sign-ins on all devices</button>}
 {message&&<p role="status">{message}</p>}
 </section>;
}
