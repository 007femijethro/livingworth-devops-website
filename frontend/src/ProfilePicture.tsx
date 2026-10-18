import { useEffect, useRef, useState, useId, type FormEvent } from 'react';
import './profile-picture.css';
import { createPortal } from 'react-dom';
type Person = {id:number|string;fullName?:string;profilePicture?:string|null;demo?:boolean};
export function ProfileAvatar({user,className='avatar'}:{user:Person;className?:string}) {
 const [source,setSource]=useState(''),[expanded,setExpanded]=useState(false);
 useEffect(()=>{
  setSource('');if(!user.profilePicture||user.demo)return;
  let live=true,url='';const controller=new AbortController();
  void fetch(`/api/profile-picture/${user.id}?v=${encodeURIComponent(user.profilePicture)}`,{headers:{Authorization:`Bearer ${localStorage.getItem('lw_token')}`},signal:controller.signal}).then(async response=>{if(!response.ok)return;const blob=await response.blob();if(live){url=URL.createObjectURL(blob);setSource(url)}}).catch(()=>{});
  return()=>{live=false;controller.abort();if(url)URL.revokeObjectURL(url)};
 },[user.id,user.profilePicture,user.demo]);
 if(!source)return <span className={`${className} profile-avatar`}>{user.fullName?.[0]||'?'}</span>;
 return <><button type="button" className={`${className} profile-avatar profile-avatar-button`} aria-label={`View ${user.fullName||'your'} full profile picture`} aria-haspopup="dialog" onClick={event=>{event.stopPropagation();setExpanded(true)}}><img src={source} alt={`${user.fullName||'Your'} profile picture`} onError={()=>setSource('')}/></button>{expanded&&createPortal(<ProfilePictureViewer source={source} name={user.fullName} onClose={()=>setExpanded(false)}/>,document.body)}</>;
}
function ProfilePictureViewer({source,name,onClose}:{source:string;name?:string;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),headingId=useId();
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>{element?.close()}},[]);
 return <dialog ref={dialog} className="profile-picture-dialog" aria-labelledby={headingId} onClose={onClose} onClick={event=>{event.stopPropagation();if(event.target===event.currentTarget)dialog.current?.close()}}><div className="profile-picture-viewer"><header><h2 id={headingId}>{name?`${name}’s profile picture`:'Profile picture'}</h2><button type="button" className="profile-picture-close" aria-label="Close full profile picture" autoFocus onClick={()=>dialog.current?.close()}>×</button></header><img src={source} alt={name?`${name}’s full profile picture`:'Full profile picture'}/></div></dialog>;
}
export function ProfilePictureEditor({user,onSaved}:{user:Person;onSaved?:(picture:string)=>void}) {
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(!file){setPreview('');return}const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url)},[file]);
 async function save(event:FormEvent){
  event.preventDefault();if(!file)return;setBusy(true);setError('');setMessage('');
  try{const body=new FormData();body.append('picture',file);const response=await fetch('/api/profile-picture',{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem('lw_token')}`},body});const data=await response.json();if(!response.ok)throw new Error(data.message||'Could not upload your picture. Try again.');window.dispatchEvent(new CustomEvent('lw-profile-picture-changed',{detail:{userId:user.id,profilePicture:data.profilePicture}}));setMessage(data.message);setFile(null);if(input.current)input.current.value='';onSaved?.(data.profilePicture)}catch(error){setError((error as Error).message)}finally{setBusy(false)}
 }
 return <section className="profile-picture-editor"><h2>Your profile picture</h2><p>Choose a clear picture of yourself so your mentors can recognise you. You can change it here at any time.</p><form onSubmit={save}><div className="profile-picture-preview">{preview?<img src={preview} alt="Preview of your new profile picture"/>:<ProfileAvatar user={user}/>}</div><div className="profile-picture-controls"><label>Choose a profile picture<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||user.demo} onChange={event=>{setMessage('');setError('');const next=event.target.files?.[0];if(next&&next.size>5*1024*1024){setFile(null);setError('Choose a picture smaller than 5 MB.');event.target.value='';return}setFile(next||null)}}/></label><small>JPG, PNG or WebP · up to 5 MB. Saved as a square photo. Visible to you and academy staff.</small><button className="button primary" disabled={!file||busy||user.demo}>{busy?'Uploading picture…':user.profilePicture?'Save new picture':'Save profile picture'}</button></div></form>{error&&<p className="profile-picture-error" role="alert">{error}</p>}{message&&<p className="form-message success" role="status">{message}</p>}</section>;
}
export function ProfilePictureWelcome({user,onContinue,logout}:{user:Person;onContinue:()=>void;logout:()=>void}) {
 return <main className="profile-picture-welcome"><div className="profile-picture-welcome-card"><img className="profile-picture-logo" src="/livingworth-logo.jpeg" alt="Livingworth Academy"/><p className="eyebrow">Welcome, {user.fullName?.split(' ')[0]}</p><h1>Add a face to your profile</h1><ProfilePictureEditor user={user} onSaved={onContinue}/><div className="profile-picture-welcome-actions"><button type="button" className="button light-border" onClick={onContinue}>Do this later</button><button type="button" className="profile-picture-logout" onClick={logout}>Log out</button></div><p className="profile-picture-later">You can upload or change your picture under Security → Your profile picture.</p></div></main>;
}
