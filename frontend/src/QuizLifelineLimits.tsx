import {useEffect,useState} from 'react';
type Limits = Record<string,number|''>;
type Quiz = {id:number;status:string;lifelineLimit?:number;lifelineLimits?:Record<string,number>|null};
export const lifelineLabels = {fifty_fifty:'50:50',free_pass:'✓ Free Pass',audience:'👥 Audience'};
export function quizLifelineLimits(value:Record<string,number>|null|undefined,total=0):Record<string,number> {
  return Object.fromEntries(Object.keys(lifelineLabels).map(type=>[type,Number(value?.[type] ?? total)]));
}
export function LifelineLimitsFields({value,onChange,disabled=false}:{value:Limits;onChange:(value:Limits)=>void;disabled?:boolean}) {
  return <div className="quiz-lifeline-limit-fields">{Object.entries(lifelineLabels).map(([type,label])=><label key={type}>{label} maximum<input type="number" min="0" max="10" step="1" required disabled={disabled} value={value[type]} onChange={event=>onChange({...value,[type]:event.target.value===''?'':Number(event.target.value)})}/></label>)}</div>;
}
export default function QuizLifelineLimits({quiz,onSave}:{quiz:Quiz;onSave:(quiz:Quiz,limits:Limits)=>Promise<void>}) {
  const [value,setValue]=useState<Limits>(quizLifelineLimits(quiz.lifelineLimits,quiz.lifelineLimit)),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{setValue(quizLifelineLimits(quiz.lifelineLimits,quiz.lifelineLimit));},[quiz.lifelineLimit,quiz.lifelineLimits?.fifty_fifty,quiz.lifelineLimits?.free_pass,quiz.lifelineLimits?.audience]);
  async function save(){
    if(Object.values(value).some(n=>typeof n!=='number'||!Number.isInteger(n)||n<0||n>10)){setNotice('Enter whole numbers from 0 to 10.');return;}
    setBusy(true);setNotice('');
    try{await onSave(quiz,value);setNotice('Lifeline maxima saved.');}catch(error){setNotice(error instanceof Error ? error.message : 'Could not save lifeline maxima.');}finally{setBusy(false);}
  }
  return <fieldset className="quiz-lifeline-limit-editor" disabled={busy||quiz.status==='live'}><legend>Maximum uses per lifeline</legend><LifelineLimitsFields value={value} onChange={setValue}/><small>Each maximum and the total limit ({quiz.lifelineLimit || 0}) both apply per learner per attempt. 0 disables a type.</small><button type="button" onClick={save}>{busy?'Saving…':'Save lifeline maxima'}</button>{notice&&<p role="status">{notice}</p>}</fieldset>;
}
