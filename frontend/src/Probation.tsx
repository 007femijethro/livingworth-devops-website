import {useEffect,useState} from 'react';
import {useAcademySettings} from './AcademySettingsContext';
import './probation.css';
async function request(path:string){
 const response=await fetch(`/api${path}`,{cache:'no-store',headers:{Authorization:`Bearer ${localStorage.getItem('lw_token')}`}});
 const data=await response.json();
 if(response.status===401)window.dispatchEvent(new CustomEvent('lw-session-expired',{detail:data.message}));
 if(!response.ok)throw new Error(data.message||'Could not check probation status.');
 return data;
}
function deadline(value:string,zone:string){return new Date(value).toLocaleString('en-GB',{timeZone:zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
export function StudentProbationNotice({enabled=true,onScores}:{enabled?:boolean;onScores?:()=>void}){
 const [status,setStatus]=useState<any>(null);const zone=useAcademySettings().classTimezone;
 useEffect(()=>{if(!enabled)return;let live=true;const load=async()=>{if(document.visibilityState==='hidden')return;try{const result=await request('/student/probation');if(live)setStatus(result)}catch{/* Keep the last known warning; the server enforces account status. */}};void load();const id=setInterval(()=>void load(),60000);window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);return()=>{live=false;clearInterval(id);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load)}},[enabled]);
 if(!enabled||!status?.onProbation)return null;
 return <aside className="probation-notice" aria-label="Your academic probation"><div><strong>You are on probation</strong><p>Your overall score is {status.overallScore}/100, below the required {status.threshold}/100. Reach at least {status.threshold}/100 before <b>{deadline(status.dueAt,zone)} ({zone})</b> to avoid automatic expulsion after {status.weeks} continuous weeks below the threshold.</p><small>You can keep learning during probation. Contact your mentor if you need help. Expelled accounts require admin reinstatement.</small></div>{onScores&&<button type="button" className="button light-border" onClick={onScores}>View my scores</button>}</aside>;
}
export function AdminProbationPanel({onStudents}:{onStudents:()=>void}){
 const [data,setData]=useState<any>(null),[error,setError]=useState('');const zone=useAcademySettings().classTimezone;
 useEffect(()=>{let live=true;const load=async()=>{try{const result=await request('/admin/probation');if(live){setData(result);setError('')}}catch(e){if(live)setError(e instanceof Error?e.message:'Could not load probation records.')}};void load();const id=setInterval(()=>void load(),60000);window.addEventListener('lw-settings-changed',load);return()=>{live=false;clearInterval(id);window.removeEventListener('lw-settings-changed',load)}},[]);
 return <section className="probation-admin" aria-label="Probation records"><header><div><h4>Probation register</h4><p>Checks run every minute. New and changed policies start a fresh grace period; past scores are not used to backdate probation.</p></div><button type="button" className="button light-border" onClick={onStudents}>Manage students →</button></header>{error&&<p role="alert">{error}</p>}{!data&&!error&&<p>Loading probation records…</p>}{data&&<><p>{data.enabled?`Active policy: below ${data.threshold}/100 for ${data.weeks} continuous weeks leads to expulsion.`:'Automatic probation is off. Existing expulsions remain in effect.'}</p>{data.students.length?<div className="probation-register">{data.students.map((student:any)=><article key={student.id}><div><strong>{student.fullName}</strong><span>{student.status==='expelled'?'Expelled — admin reinstatement required':'On probation'}</span></div><div><span>Overall score</span><strong>{student.overallScore??'—'}/100</strong></div><div><span>{student.status==='expelled'?'Expelled on':'Deadline'}</span><strong>{deadline(student.status==='expelled'?student.expelledAt:student.probationDueAt,zone)}</strong></div>{student.status==='expelled'&&<p>{student.expelledReason}</p>}</article>)}</div>:<p>No students currently on probation or expelled by this policy.</p>}</>}</section>;
}
