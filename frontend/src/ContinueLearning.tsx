import { useEffect, useState } from 'react';
import { continueLearning, type LearningWeek } from './continue-learning';
import './continue-learning.css';

type LearningData = { modules: LearningWeek[]; lockedWeeks?: number };
export default function ContinueLearning() {
  const [data, setData] = useState<LearningData | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    fetch('/api/student/learning', { signal: controller.signal, headers: { Authorization: `Bearer ${localStorage.getItem('lw_token')}` } })
      .then(async response => { if (!response.ok) throw new Error('Could not load your next step. Please try again.'); return response.json(); })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [attempt]);
  if (error) return <section className="continue-learning continue-learning-state" aria-label="Continue learning"><p role="status">{error}</p><button className="button light-border" onClick={() => setAttempt(value => value + 1)}>Try again</button></section>;
  if (!data) return <section className="continue-learning continue-learning-state" aria-label="Continue learning" aria-busy="true"><p role="status">Finding your next learning step…</p></section>;
  const next = continueLearning(data.modules, data.lockedWeeks);
  return <section className={`continue-learning continue-learning-${next.kind}`} aria-labelledby="continue-learning-heading">
    <div className="continue-learning-copy"><p className="continue-learning-kicker">Continue learning{next.week ? ` · Week ${next.week.weekNumber}` : ''}</p>
      {next.week && <p className="continue-learning-week">{next.week.title}</p>}
      <h2 id="continue-learning-heading">{next.title}</h2><p>{next.description}</p>
      <a className="button primary" href={next.href}>{next.label} <span aria-hidden="true">→</span></a>
    </div>
    <div className="continue-learning-progress">
      {next.week && <><strong>{next.percentage}%</strong><span>of this week’s required work</span><div role="progressbar" aria-label={`Week ${next.week.weekNumber} progress`} aria-valuenow={next.percentage} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${next.percentage}%`}} /></div><small>{next.completed} of {next.total} steps complete</small></>}
      <p>{next.completedWeeks} of {next.totalWeeks} published weeks complete</p>
      {data.lockedWeeks ? <small>Your mentor will publish more weeks as they become available.</small> : null}
    </div>
  </section>;
}
