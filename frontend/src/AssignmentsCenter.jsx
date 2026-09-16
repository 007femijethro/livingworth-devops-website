import { UploadSlots } from './AssignmentFiles.jsx';
import { useEffect, useState } from 'react';
import AssignmentCard, { SubmissionFiles } from './AssignmentCard.jsx';
import AssignmentMarkdown, { AssignmentInstructions } from './AssignmentMarkdown.jsx';

function AssignmentLeaderboard({ assignments, submissions }) {
  const [assignmentId, setAssignmentId] = useState('general');
  const assignmentById = new Map(assignments.map(assignment => [Number(assignment.id), assignment]));
  const graded = submissions.filter(submission => submission.status === 'completed' && submission.score != null);
  let rows;
  if (assignmentId === 'general') {
    const totals = new Map();
    graded.forEach(submission => {
      const assignment = assignmentById.get(Number(submission.assignmentId));
      if (!assignment) return;
      const current = totals.get(submission.studentId) || { studentId: submission.studentId, studentName: submission.studentName, email: submission.email, earned: 0, possible: 0, gradedCount: 0 };
      current.earned += Number(submission.score);
      current.possible += Number(assignment.maxScore);
      current.gradedCount += 1;
      totals.set(submission.studentId, current);
    });
    rows = [...totals.values()].map(row => ({ ...row, percentage: row.possible ? Math.round(row.earned / row.possible * 100) : 0 }));
  } else {
    const selected = assignmentById.get(Number(assignmentId));
    rows = graded.filter(submission => Number(submission.assignmentId) === Number(assignmentId)).map(submission => ({
      studentId: submission.studentId, studentName: submission.studentName, email: submission.email,
      earned: Number(submission.score), possible: Number(selected?.maxScore || 0), gradedCount: 1,
      percentage: selected?.maxScore ? Math.round(Number(submission.score) / Number(selected.maxScore) * 100) : 0
    }));
  }
  rows.sort((a, b) => b.percentage - a.percentage || b.earned - a.earned || a.studentName.localeCompare(b.studentName));
  return <section className="assignment-leaderboard">
    <div className="leaderboard-heading"><div><p className="eyebrow">Performance ranking</p><h3>{assignmentId === 'general' ? 'General assignment leaderboard' : 'Assignment leaderboard'}</h3><p>Rankings use published final results only.</p></div>
      <label>Leaderboard<select value={assignmentId} onChange={event => setAssignmentId(event.target.value)}><option value="general">General — all assignments</option>{assignments.map(assignment => <option key={assignment.id} value={assignment.id}>Week {assignment.weekNumber} · {assignment.title}</option>)}</select></label>
    </div>
    {!rows.length ? <p className="empty">No published results are available for this leaderboard yet.</p> : <div className="assignment-leaderboard-table">
      <div className="leaderboard-table-head"><span>Rank</span><span>Student</span><span>Score</span><span>Graded</span><span>Percentage</span></div>
      {rows.map((row, index) => <article key={row.studentId}><strong className={`leaderboard-rank rank-${index + 1}`}>#{index + 1}</strong><div><b>{row.studentName}</b><small>{row.email}</small></div><span>{row.earned} / {row.possible}</span><span>{row.gradedCount}</span><b>{row.percentage}%</b></article>)}
    </div>}
  </section>;
}

export default function AssignmentsCenter({ staff = false, demo = false }) {
  const [modules, setModules] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [week, setWeek] = useState('');
  const [view, setView] = useState('assignments');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null);
  const [scoreSummary, setScoreSummary] = useState(null);
  async function request(path, options = {}) {
    const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('lw_token')}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to complete this request.');
    if (options.method) window.dispatchEvent(new Event('lw-assignments-changed'));
    return data;
  }
  async function load() {
    if (demo) { setLoading(false); return; }
    try { const data = await request(staff ? '/staff/learning' : '/student/learning'); setModules(data.modules); setSubmissions(data.submissions || []); setScoreSummary(data.scoreSummary || null); }
    catch (error) { setMessage(error.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [staff, demo]);
  const assignments = modules.flatMap(m => m.assignments.map(a => ({ ...a, moduleId: m.id, weekNumber: m.weekNumber, published: m.published })));
  const visible = assignments.filter(a => !week || String(a.moduleId) === week);
  const filteredSubmissions = submissions.filter(s => !status || (status === 'awaiting' ? s.status !== 'completed' : s.status === 'completed'));
  async function save(event, path, method) {
    event.preventDefault(); const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (values.dueAt) values.dueAt = new Date(values.dueAt).toISOString();
    setBusy(true); setMessage('');
    try { const data = await request(path || `/staff/learning/modules/${values.moduleId}/assignments`, { method, body: JSON.stringify(values) }); setMessage(data.message); setEditing(null); if (!path) form.reset(); await load(); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  function localDate(value) { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  return <section className="learning-center assignments-center">
    <div className="learning-head"><div><p className="eyebrow">Assignment workspace</p><h2>{staff ? 'Manage assignments' : 'My assignments'}</h2><p>{staff ? 'Create weekly tasks, update instructions and review student submissions.' : 'Find your tasks, submit your work and see mentor feedback. More assignments unlock as you complete each week.'}</p></div></div>
    {demo && <p>Assignment management is unavailable in offline preview.</p>}
    {message && <p role="status">{message}</p>}
    {staff && <div className="learning-tabs"><button onClick={() => setView('assignments')} className={view === 'assignments' ? 'active' : ''}>Assignments ({assignments.length})</button><button onClick={() => setView('reviews')} className={view === 'reviews' ? 'active' : ''}>Submissions ({submissions.filter(s => s.status !== 'completed').length} awaiting final result)</button><button onClick={() => setView('leaderboard')} className={view === 'leaderboard' ? 'active' : ''}>Leaderboard</button></div>}
    {!staff && !loading && scoreSummary && <section className="assignment-score-summary" aria-labelledby="assignment-score-heading">
      <div className="assignment-score-heading"><div><p className="eyebrow">My performance</p><h3 id="assignment-score-heading">Overall assignment score</h3></div><strong>{scoreSummary.percentage == null ? '—' : `${scoreSummary.percentage}%`}</strong></div>
      <div className="assignment-score-track" aria-label={scoreSummary.percentage == null ? 'No assignments graded yet' : `${scoreSummary.percentage}% overall assignment score`}><span style={{ width: `${scoreSummary.percentage || 0}%` }} /></div>
      <div className="assignment-score-metrics">
        <div><span>Points earned</span><b>{scoreSummary.earnedPoints} / {scoreSummary.possiblePoints}</b></div>
        <div><span>Assignments graded</span><b>{scoreSummary.gradedCount}</b></div>
        <div><span>Calculation</span><b>{scoreSummary.gradedCount ? 'Final results only' : 'Awaiting results'}</b></div>
      </div>
      {!scoreSummary.gradedCount && <p>Your overall score will appear after your mentor publishes your first final result.</p>}
    </section>}
    {loading ? <p role="status">Loading assignments…</p> : view === 'assignments' ? <>
      {staff && <details className="assignment-card"><summary>Create assignment</summary><form className="assignment-submit-form" onSubmit={e => save(e, null, 'POST')}><label>Week<select name="moduleId" required><option value="">Choose a week</option>{modules.map(m => <option key={m.id} value={m.id}>Week {m.weekNumber} · {m.title}{m.published ? '' : ' (draft)'}</option>)}</select></label><label>Title<input name="title" required maxLength="180" /></label><AssignmentInstructions /><UploadSlots /><label>Deadline (your local time)<input name="dueAt" type="datetime-local" required /></label><label>Maximum points<input name="maxScore" type="number" min="1" max="1000" defaultValue="100" required /></label><button className="button primary" disabled={busy || demo || !modules.length}>{busy ? 'Saving…' : 'Create assignment'}</button>{!modules.length && <p>Create a week in Learning first.</p>}</form></details>}
      <label className="assignment-filter">Filter by week<select value={week} onChange={e => setWeek(e.target.value)}><option value="">All available weeks</option>{modules.map(m => <option key={m.id} value={m.id}>Week {m.weekNumber} · {m.title}</option>)}</select></label>
      {!visible.length && <p className="empty">No assignments available for this selection.</p>}
      {visible.map(a => <div key={a.id}><p className="eyebrow">Week {a.weekNumber}{staff && !a.published ? ' · Draft week' : ''}</p>{staff ? <article className="assignment-card"><h3>{a.title}</h3><p>Due {new Date(a.dueAt).toLocaleString()} · {a.maxScore} points</p>{editing === a.id ? <form className="assignment-submit-form" onSubmit={e => save(e, `/staff/learning/assignments/${a.id}`, 'PATCH')}><label>Title<input name="title" defaultValue={a.title} required /></label><AssignmentInstructions defaultValue={a.instructions} /><UploadSlots defaultValue={a.uploadSlots || []} /><label>Deadline (your local time)<input name="dueAt" type="datetime-local" defaultValue={localDate(a.dueAt)} required /></label><label>Maximum points<input name="maxScore" type="number" min="1" max="1000" defaultValue={a.maxScore} required /></label><button className="button primary" disabled={busy || demo}>Save changes</button><button type="button" className="button light-border" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></form> : <><details className="assignment-brief"><summary>Read instructions</summary><AssignmentMarkdown>{a.instructions}</AssignmentMarkdown></details><button className="button primary" disabled={demo} onClick={() => setEditing(a.id)}>Edit assignment</button></>}</article> : <AssignmentCard assignment={a} onSubmitted={load} />}</div>)}
    </> : view === 'reviews' ? <>
      <label className="assignment-filter">Result status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All submissions</option><option value="awaiting">Awaiting final result</option><option value="completed">Final result published</option></select></label>
      {!filteredSubmissions.length && <p className="empty">No submissions match this status.</p>}
      {filteredSubmissions.map(s => <article className="assignment-card" key={s.id}><h3>{s.assignmentTitle}</h3><p><strong>{s.studentName}</strong> · {s.email}</p><p>Submitted {new Date(s.submittedAt).toLocaleString()}{s.isLate ? ' · Late' : ''} · {s.status === 'completed' ? 'final result published' : 'awaiting final result'}</p>{s.submissionUrl && <a href={s.submissionUrl} target="_blank" rel="noreferrer">Open project ↗</a>}<SubmissionFiles submission={s} />{s.note && <p style={{ whiteSpace: 'pre-wrap' }}>{s.note}</p>}<form className="assignment-submit-form" onSubmit={e => save(e, `/staff/submissions/${s.id}/review`, 'PATCH')}><label>Final score<input name="score" type="number" min="0" max={assignments.find(a => a.id === s.assignmentId)?.maxScore || 1000} defaultValue={s.score ?? ''} required /></label><label>Final feedback<textarea name="feedback" rows="3" defaultValue={s.feedback || ''} required /></label><button className="button primary" disabled={busy || demo}>{busy ? 'Publishing…' : 'Publish final result'}</button></form></article>)}
    </> : <AssignmentLeaderboard assignments={assignments} submissions={submissions} />}
  </section>;
}
