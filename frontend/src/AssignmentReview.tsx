// @ts-nocheck
import { useState } from 'react';

export function RubricField({ rubric = [] }) {
  return <label>Grading rubric (optional)
    <textarea name="rubricText" rows={4} maxLength={4000} defaultValue={rubric.map(item => `${item.label} | ${item.max}`).join('\n')} placeholder={'Working deployment | 60\nDocumentation | 40'} />
    <small>One criterion per line: Name | points. Points must add up to the assignment maximum.</small>
  </label>;
}

export default function AssignmentReview({ submission, assignment, request, reload, disabled }) {
  const criteria = submission.gradeBreakdown?.length ? submission.gradeBreakdown : assignment?.rubric || [];
  const previous = submission.reviewDraft;
  const [scores, setScores] = useState(() => criteria.map(row => {
    const saved = previous?.breakdown?.find(item => item.label === row.label && item.max === row.max);
    return saved ? saved.points ?? '' : row.points ?? '';
  }));
  const [score, setScore] = useState(previous?.score ?? submission.score ?? '');
  const [feedback, setFeedback] = useState(previous?.feedback ?? submission.feedback ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const complete = scores.every(value => value !== '');
  const max = criteria.length ? criteria.reduce((sum,row) => sum + row.max, 0) : assignment?.maxScore ?? 1000;
  async function save(draft) {
    setBusy(true); setMessage('');
    try {
      const result = await request(`/staff/submissions/${submission.id}/review`, { method:'PATCH', body:JSON.stringify({ draft, score, feedback, scores:scores.map(value => value === '' ? null : Number(value)) }) });
      setMessage(result.message);
      await reload();
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <form className="assignment-submit-form" onSubmit={event => { event.preventDefault(); void save(false); }}>
    {criteria.length ? <fieldset><legend>Rubric marks</legend>
      {criteria.map((row,i) => <label key={i}>{row.label} (out of {row.max})<input type="number" min={0} max={row.max} step={1} required value={scores[i] ?? ''} onChange={event => { const value = event.target.value; setScores(current => current.map((v,j) => j === i ? value : v)); }} /></label>)}
      <p><strong>{complete ? 'Total' : 'Total entered so far'}:</strong> {scores.reduce((sum,value) => sum + Number(value),0)} / {max}</p>
    </fieldset> : <label>Final score<input type="number" min={0} max={max} required value={score} onChange={event=>setScore(event.target.value)} /></label>}
    <label>Final feedback<textarea rows={3} required value={feedback} onChange={event=>setFeedback(event.target.value)} /></label>
    <div className="assignment-submit-actions">
      <button type="button" className="button light-border" disabled={busy || disabled} onClick={()=>void save(true)}>Save private draft</button>
      <button className="button primary" disabled={busy || disabled}>Publish final result</button>
    </div>
    <p role="status">{message}</p>
  </form>;
}
