import {useEffect,useState} from 'react';
import {useAcademySettings} from './AcademySettingsContext';
import {scheduleInput,scheduleInstant} from './quiz-schedule-time';
import './quiz-schedule.css';
export function QuizScheduleFields({opening,starting,onOpening,onStarting}:{opening:string;starting:string;onOpening:(value:string)=>void;onStarting:(value:string)=>void}) {
 const zone=useAcademySettings().classTimezone;
 let minutes=0;try{minutes=opening&&starting?Math.round((+new Date(scheduleInstant(starting,zone)!)-+new Date(scheduleInstant(opening,zone)!))/60000):15}catch{}
 function duration(value:string){const amount=Number(value);if(opening&&Number.isInteger(amount)&&amount>0){try{onStarting(scheduleInput(new Date(+new Date(scheduleInstant(opening,zone)!)+amount*60000),zone))}catch{}}}
 return <fieldset className="quiz-schedule-fields"><legend>Waiting room &amp; automatic start</legend><p>Times are in <strong>{zone}</strong>. Leave both times empty to host manually.</p><label>Waiting room opens<input type="datetime-local" value={opening} onChange={e=>{const value=e.target.value;onOpening(value);if(value&&!starting){try{onStarting(scheduleInput(new Date(+new Date(scheduleInstant(value,zone)!)+15*60000),zone))}catch{}}if(!value)onStarting('')}}/></label><label>Quiz starts automatically<input type="datetime-local" value={starting} min={opening||undefined} onChange={e=>onStarting(e.target.value)}/></label><label>Waiting period (minutes)<input type="number" min="1" step="1" disabled={!opening} value={minutes>0?minutes:''} onChange={e=>duration(e.target.value)}/></label><small>{starting?'The server starts the quiz at this time, even when this page is closed. Choose Automatic navigation to run all questions without a mentor.':'An opening time on its own opens the waiting room; a mentor starts the quiz manually.'}</small></fieldset>;
}
export function QuizScheduleStatus({quiz}:{quiz:any}) {
 const zone=useAcademySettings().classTimezone;
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{if(!quiz.startsAt)return;const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id)},[quiz.startsAt]);
 const format=(value:string)=>new Date(value).toLocaleString('en-GB',{timeZone:zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
 if(!quiz.scheduledAt)return null;
 const remaining=quiz.startsAt?Math.max(0,Math.ceil((+new Date(quiz.startsAt)-now)/1000)):null;
 return <div className="quiz-schedule-status"><span>Room opens: {format(quiz.scheduledAt)} · {zone}</span>{quiz.startsAt&&<><span>Quiz starts: {format(quiz.startsAt)} · {Math.round((+new Date(quiz.startsAt)-+new Date(quiz.scheduledAt))/60000)} minute waiting period</span>{!quiz.scheduleStartedAt&&!['live','completed'].includes(quiz.status)&&<strong>{remaining!>0?`Starts in ${Math.floor(remaining!/3600)?`${Math.floor(remaining!/3600)}h `:''}${Math.floor((remaining!%3600)/60)}m ${remaining!%60}s`:'Starting…'}</strong>}</>}</div>;
}
export default function QuizScheduleEditor({quiz,onSaved}:{quiz:any;onSaved:(message:string)=>void}) {
 const zone=useAcademySettings().classTimezone;
 const [opening,setOpening]=useState(quiz.scheduledAt?scheduleInput(quiz.scheduledAt,zone):'');
 const [starting,setStarting]=useState(quiz.startsAt?scheduleInput(quiz.startsAt,zone):'');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(cancel=false){setBusy(true);setError('');try{const response=await fetch(`/api/admin/quizzes/${quiz.id}/schedule`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('lw_token')}`},body:JSON.stringify({scheduledAt:cancel?null:scheduleInstant(opening,zone),startsAt:cancel?null:scheduleInstant(starting,zone)})});const result=await response.json();if(!response.ok)throw new Error(result.message);onSaved(result.message)}catch(e){setError(e instanceof Error?e.message:'Could not save schedule.')}finally{setBusy(false)}}
 return <details className="quiz-schedule-editor"><summary>{quiz.scheduledAt?'Change schedule':'Schedule quiz'}</summary>{['live','completed'].includes(quiz.status)||quiz.scheduleStartedAt?<p>This quiz has already started. Its schedule cannot be changed.</p>:<><QuizScheduleFields opening={opening} starting={starting} onOpening={setOpening} onStarting={setStarting}/><div className="quiz-schedule-actions"><button type="button" className="button primary" disabled={busy||!opening} onClick={()=>void save()}>Save schedule</button>{quiz.scheduledAt&&<button type="button" className="button light-border" disabled={busy} onClick={()=>void save(true)}>Cancel schedule</button>}</div>{error&&<p className="form-message" role="alert">{error}</p>}</>}</details>;
}
