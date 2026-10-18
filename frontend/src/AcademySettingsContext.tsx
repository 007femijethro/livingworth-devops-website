import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
export const defaultAcademySettings = { academyName:'Livingworth Academy',supportEmail:'',supportPhone:'',registrationOpen:true,classTime:'20:00',classTimezone:'Africa/Lagos',classDays:[1,3,5],classDurationMinutes:60,meetingUrl:'https://meet.google.com/paj-rthm-woe',certificateRequiredScore:75,classRepLimit:2 };
const AcademyContext=createContext(defaultAcademySettings);
export const useAcademySettings=()=>useContext(AcademyContext);
export function AcademySettingsProvider({children}:{children:ReactNode}) {
 const [settings,setSettings]=useState(defaultAcademySettings);
 useEffect(()=>{
  let live=true;
  const refresh=()=>fetch('/api/academy-settings',{cache:'no-store'}).then(async response=>{if(response.ok&&live)setSettings({...defaultAcademySettings,...await response.json()})}).catch(()=>{});
  void refresh();window.addEventListener('lw-settings-changed',refresh);
  return()=>{live=false;window.removeEventListener('lw-settings-changed',refresh)};
 },[]);
 return <AcademyContext.Provider value={settings}>{children}</AcademyContext.Provider>;
}
