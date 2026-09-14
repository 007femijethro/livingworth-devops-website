import { UploadSlots } from './AssignmentFiles.jsx';
import { useEffect, useState } from 'react';
import AssignmentCard, { SubmissionFiles } from './AssignmentCard.jsx';

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
  async function request(path, options = {}) {
    const response = await fetch(`/api${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('lw_token')}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to complete this request.');
    if (options.method) window.dispatchEvent(new Event('lw-assignments-changed'));
    return data;
  }
  async function load() {
    if (demo) { setLoading(false); return; }
    try { const data = await request(staff ? '/staff/learning' : '/student/learning'); setModules(data.modules); setSubmissions(data.submissions || []); }
    catch (error) { setMessage(error.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [staff, demo]);
  const assignments = modules.flatMap(m => m.assignments.map(a => ({ ...a, moduleId: m.id, weekNumber: m.weekNumber, published: m.published })));
  const visible = assignments.filter(a => !week || String(a.moduleId) === week);
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
    {staff && <div className="learning-tabs"><button onClick={() => setView('assignments')} className={view === 'assignments' ? 'active' : ''}>Assignments ({assignments.length})</button><button onClick={() => setView('reviews')} className={view === 'reviews' ? 'active' : ''}>Submissions ({submissions.filter(s => s.status === 'submitted').length} awaiting review)</button></div>}
    {loading ? <p role="status">Loading assignments…</p> : view === 'assignments' ? <>
      {staff && <details className="assignment-card"><summary>Create assignment</summary><form className="assignment-submit-form" onSubmit={e => save(e, null, 'POST')}><label>Week<select name="moduleId" required><option value="">Choose a week</option>{modules.map(m => <option key={m.id} value={m.id}>Week {m.weekNumber} · {m.title}{m.published ? '' : ' (draft)'}</option>)}</select></label><label>Title<input name="title" required maxLength="180" /></label><AssignmentInstructions /><UploadSlots /><label>Deadline (your local time)<input name="dueAt" type="datetime-local" required /></label><label>Maximum points<input name="maxScore" type="number" min="1" max="1000" defaultValue="100" required /></label><button className="button primary" disabled={busy || demo || !modules.length}>{busy ? 'Saving…' : 'Create assignment'}</button>{!modules.length && <p>Create a week in Learning first.</p>}</form></details>}
      <label className="assignment-filter">Filter by week<select value={week} onChange={e => setWeek(e.target.value)}><option value="">All available weeks</option>{modules.map(m => <option key={m.id} value={m.id}>Week {m.weekNumber} · {m.title}</option>)}</select></label>
      {!visible.length && <p className="empty">No assignments available for this selection.</p>}
      {visible.map(a => <div key={a.id}><p className="eyebrow">Week {a.weekNumber}{staff && !a.published ? ' · Draft week' : ''}</p>{staff ? <article className="assignment-card"><h3>{a.title}</h3><p>Due {new Date(a.dueAt).toLocaleString()} · {a.maxScore} points</p>{editing === a.id ? <form className="assignment-submit-form" onSubmit={e => save(e, `/staff/learning/assignments/${a.id}`, 'PATCH')}><label>Title<input name="title" defaultValue={a.title} required /></label><AssignmentInstructions defaultValue={a.instructions} /><UploadSlots defaultValue={a.uploadSlots || []} /><label>Deadline (your local time)<input name="dueAt" type="datetime-local" defaultValue={localDate(a.dueAt)} required /></label><label>Maximum points<input name="maxScore" type="number" min="1" max="1000" defaultValue={a.maxScore} required /></label><button className="button primary" disabled={busy || demo}>Save changes</button><button type="button" className="button light-border" disabled={busy} onClick={() => setEditing(null)}>Cancel</button></form> : <><details className="assignment-brief"><summary>Read instructions</summary><AssignmentMarkdown>{a.instructions}</AssignmentMarkdown></details><button className="button primary" disabled={demo} onClick={() => setEditing(a.id)}>Edit assignment</button></>}</article> : <AssignmentCard assignment={a} onSubmitted={load} />}</div>)}
    </> : <>
      <label className="assignment-filter">Review status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All submissions</option><option value="submitted">Awaiting review</option><option value="needs_correction">Changes requested</option><option value="completed">Completed</option></select></label>
      {!submissions.filter(s => !status || s.status === status).length && <p className="empty">No submissions match this status.</p>}
      {submissions.filter(s => !status || s.status === status).map(s => <article className="assignment-card" key={s.id}><h3>{s.assignmentTitle}</h3><p><strong>{s.studentName}</strong> · {s.email}</p><p>Submitted {new Date(s.submittedAt).toLocaleString()}{s.isLate ? ' · Late' : ''} · {s.status.replaceAll('_', ' ')}</p>{s.submissionUrl && <a href={s.submissionUrl} target="_blank" rel="noreferrer">Open project ↗</a>}<SubmissionFiles submission={s} />{s.note && <p style={{ whiteSpace: 'pre-wrap' }}>{s.note}</p>}<form className="assignment-submit-form" onSubmit={e => save(e, `/staff/submissions/${s.id}/review`, 'PATCH')}><label>Review result<select name="status" defaultValue={s.status === 'completed' ? 'completed' : 'needs_correction'}><option value="needs_correction">Request changes</option><option value="completed">Mark complete</option></select></label><label>Score<input name="score" type="number" min="0" max={assignments.find(a => a.id === s.assignmentId)?.maxScore || 1000} defaultValue={s.score ?? ''} /></label><label>Feedback<textarea name="feedback" rows="3" defaultValue={s.feedback || ''} required /></label><button className="button primary" disabled={busy || demo}>{busy ? 'Saving…' : 'Save review'}</button></form></article>)}
    </>}
  </section>;
}
import AssignmentMarkdown, { AssignmentInstructions } from './AssignmentMarkdown.jsx';
