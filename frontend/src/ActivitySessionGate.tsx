import { BrandLogo } from './Theme';
import {useCallback,useEffect,useState,type ReactNode} from 'react';
import {useAcademySettings} from './AcademySettingsContext';
import AboutHelp from './AboutHelp';
import './activity-session.css';
type Gate={required:boolean;activity:{id:number;weekNumber:number;title:string}|null};
export default function ActivitySessionGate({children,logout,renderActivity,onUnlocked,bypass=false}:{bypass?:boolean;children:ReactNode;logout:()=>void;renderActivity:(id:number,done:()=>Promise<void>)=>ReactNode;onUnlocked:()=>void}) {
 const academy=useAcademySettings();
 const [gate,setGate]=useState<Gate|null>(null),[error,setError]=useState(''),[help,setHelp]=useState(false);
 const load=useCallback(async()=>{
  setError('');
  try{const response=await fetch('/api/student/activity-session',{cache:'no-store',headers:{Authorization:`Bearer ${localStorage.getItem('lw_token')}`}});const data=await response.json();if(response.status===401)window.dispatchEvent(new CustomEvent('lw-session-expired',{detail:data.message}));if(!response.ok)throw new Error(data.message||'Could not check your class activity.');setGate(data);return !data.required;}
  catch(reason){setError(reason instanceof Error?reason.message:'Could not check your class activity.');return false;}
 },[]);
 useEffect(()=>{
  if(bypass)return;
  void load();
  const refresh=()=>{if(document.visibilityState==='visible')void load();};
  const timer=window.setInterval(refresh,30000);
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[load,bypass]);
 if(bypass||(gate&&!gate.required))return <>{children}</>;
 return <main className="activity-session-page">
  <header className="activity-session-top"><BrandLogo alt={academy.academyName}/><div><button type="button" className="button light-border" onClick={()=>setHelp(!help)}>{help?'Back to activity':'Help & updates'}</button><button type="button" className="button light-border" onClick={logout}>Log out</button></div></header>
  {help?<AboutHelp role="student"/>:<>
   <section className="activity-session-intro" aria-labelledby="session-activity-heading"><span className="eyebrow">One activity per sign-in</span><h1 id="session-activity-heading">{gate?.activity?`Complete Week ${gate.activity.weekNumber} to continue`:'Preparing your learning session'}</h1><p>{gate?.activity?'Complete this one class activity to open all published learning materials for this session. You do not need to complete every week now.':'Checking your next unfinished class activity…'}</p>{gate?.activity&&<p className="activity-session-next">Your next activity: <strong>{gate.activity.title}</strong></p>}<small>Activities follow week order. Your completed activities count. A page refresh does not require another activity.</small></section>
   {error&&<section className="activity-session-error"><p role="alert">{error}</p><button type="button" className="button primary" onClick={()=>void load()}>Try again</button></section>}
   {gate?.required&&gate.activity&&renderActivity(gate.activity.id,async()=>{if(await load())onUnlocked();})}
  </>}
 </main>;
}
