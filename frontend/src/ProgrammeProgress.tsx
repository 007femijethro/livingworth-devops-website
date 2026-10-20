import { useEffect, useState } from 'react';
import ContinueLearning from './ContinueLearning';
import './programme-progress.css';
type Count = {done:number;total:number};
type Week = {id:number;weekNumber:number;title:string;status:'locked'|'complete'|'current'|'upcoming';work:null|{done:number;total:number;percentage:number;materials:Count;assignments:Count;activity:Count}};
type Progress = {weeks:Week[];totalWeeks:number;completedWeeks:number;remainingWeeks:number;percentage:number;currentWeek:Week|null};
export default function ProgrammeProgress() {
  const [data,setData]=useState<Progress|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setError('');
    fetch('/api/student/programme-progress',{signal:controller.signal,headers:{Authorization:`Bearer ${localStorage.getItem('lw_token')}`}})
      .then(async response=>{if(!response.ok)throw new Error('Could not load your progress. Please try again.');return response.json()})
      .then(result=>{if(!controller.signal.aborted)setData(result)})
      .catch(reason=>{if(!controller.signal.aborted)setError(reason.message)});
    return()=>controller.abort();
  },[retry]);
  return <section className="programme-progress" aria-labelledby="programme-progress-heading">
    <header className="programme-progress-heading"><p className="eyebrow">Your learning journey</p><h1 id="programme-progress-heading">Your progress</h1><p>See how far you’ve come, what remains and where to go next.</p></header>
    {error?<div className="programme-progress-state"><p role="status">{error}</p><button className="button light-border" onClick={()=>setRetry(value=>value+1)}>Try again</button></div>:!data?<p className="programme-progress-state" role="status" aria-busy="true">Loading your learning journey…</p>:<>
      <section className="programme-completion" aria-label="Programme completion">
        <div><span>Published weeks completed</span><strong>{data.percentage}%</strong><p>{data.completedWeeks} of {data.totalWeeks} weeks complete</p></div>
        <div className="programme-completion-detail"><div role="progressbar" aria-label="Published weeks completed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.percentage}><span style={{width:`${data.percentage}%`}}/></div><p>{!data.totalWeeks?'Your mentor has not published any weeks yet.':data.remainingWeeks?`${data.remainingWeeks} week${data.remainingWeeks===1?'':'s'} remaining${data.currentWeek?` · Current: Week ${data.currentWeek.weekNumber}`:''}`:'You have completed every currently published week. Well done!'}</p><small>The roadmap grows as your mentor publishes more weeks.</small></div>
      </section>
      <ContinueLearning/>
      <section className="programme-roadmap" aria-labelledby="programme-roadmap-heading"><header><h2 id="programme-roadmap-heading">Your weekly roadmap</h2><p>All published learning weeks are available after your sign-in activity. Complete the work at your own pace.</p></header>
        {!data.weeks.length?<p className="programme-progress-state">Your published weeks will appear here.</p>:<ol>{data.weeks.map(week=><li className={`programme-week programme-week-${week.status}`} key={week.id}>
          <span className="programme-week-number" aria-hidden="true">{week.status==='complete'?'✓':week.weekNumber}</span>
          <div className="programme-week-content"><span className="programme-week-status">Week {week.weekNumber} · {week.status==='complete'?'Complete':week.status==='locked'?'Locked':week.status==='upcoming'?'Materials coming soon':'In progress'}</span><h3>{week.title}</h3>
            {week.work&&week.work.total>0?<><div className="programme-week-work">{([['Materials',week.work.materials],['Assignments',week.work.assignments],['Class activity',week.work.activity]] as [string,Count][]).filter(([,count])=>count.total>0).map(([label,count])=><span key={label}>{label}: {count.done}/{count.total}</span>)}</div><p>{week.work.done} of {week.work.total} required steps complete</p></>:<p>{week.status==='locked'?'This week is not currently available.':'Your mentor will add this week’s learning work.'}</p>}
          </div>
          {week.status!=='locked'&&<a className="button light-border" href={`/portal/student/learning?week=${week.weekNumber}`}>{week.status==='complete'?'Review week':'View week'} <span aria-hidden="true">→</span></a>}
        </li>)}</ol>}
      </section>
      <p className="programme-progress-note">Learning progress tracks required materials, submitted or closed assignments and completed class activities. Certificate eligibility depends on your overall score.</p>
    </>}
  </section>;
}
