import { useState } from 'react';

export function AttachmentDownload({ id, name, index = 0 }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/submissions/${id}/file?index=${index}`, { headers: { Authorization: `Bearer ${localStorage.getItem('lw_token')}` } });
      if (!response.ok) throw new Error('Could not download the attachment. Please try again.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div><button type="button" className="button light-border" disabled={busy} onClick={download}>{busy ? 'Downloading…' : `Download ${name}`}</button>{error && <p role="alert">{error}</p>}</div>;
}

export function SubmissionFiles({ submission, id = submission.id }) {
  const files = submission.files?.length ? submission.files : submission.fileName ? [{ name: submission.fileName }] : [];
  return files.map((file, index) => <div key={index}>{file.label && <strong>{file.label}</strong>}<AttachmentDownload id={id} name={file.name} index={index} /></div>);
}

export default function AssignmentCard({ assignment: a, onSubmitted }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [files, setFiles] = useState({});
  const slots = a.uploadSlots || [];
  const selected = slots.length ? slots.flatMap(s => files[s.id] || []) : Object.values(files).flat();
  const oversized = selected.some(f => f.size > 15 * 1024 * 1024);
  const labels = { submitted: 'Awaiting review', completed: 'Completed', needs_correction: 'Changes requested' };
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.delete('file');
    selected.forEach(file => data.append('file', file));
    if (slots.length) data.set('fileSlots', JSON.stringify(slots.filter(s => files[s.id]?.length).map(s => s.id)));
    if (oversized || selected.length > 5) { setError(true); setMessage('Upload up to five files, each 15 MB or smaller.'); return; }
    if (!data.get('submissionUrl')?.trim() && !selected.length && !a.fileName && !a.files?.length) { setError(true); setMessage('Add a project link or attach a file.'); return; }
    setBusy(true); setMessage('Submitting your work…'); setError(false);
    try {
      const response = await fetch(`/api/student/assignments/${a.id}/submission`, { method: 'PUT', headers: { Authorization: `Bearer ${localStorage.getItem('lw_token')}` }, body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Submission failed. Please try again.');
      setMessage('Your work has been submitted for mentor review.'); setFiles({}); form.querySelectorAll('input[type=file]').forEach(input => { input.value = ''; }); window.dispatchEvent(new Event('lw-assignments-changed')); onSubmitted();
    } catch (e) { setError(true); setMessage(e.message); } finally { setBusy(false); }
  }
  return <section className="student-assignment assignment-card">
    <header className="assignment-title"><div><span>Practical assignment</span><h4>{a.title}</h4></div><b className={`work-status ${a.submissionStatus || 'not-started'}`}>{labels[a.submissionStatus] || 'Not submitted'}</b></header>
    <div className="assignment-meta"><span>Due {new Date(a.dueAt).toLocaleString()}</span><span>{a.maxScore} points</span>{a.isLate && <b>Submitted late</b>}</div>
    <details open className="assignment-brief"><summary>Assignment instructions</summary><AssignmentMarkdown>{a.instructions}</AssignmentMarkdown></details>
    {a.feedback && <aside className="mentor-feedback"><b>Mentor feedback</b><p>{a.feedback}</p>{a.score != null && <strong>{a.score} / {a.maxScore} points</strong>}</aside>}
    {a.submittedAt && <p>Last submitted: {new Date(a.submittedAt).toLocaleString()}</p>}
    <SubmissionFiles submission={a} id={a.submissionId} />
    <form onSubmit={submit} className="assignment-submit-form">
      <h4>{a.submissionId ? 'Update your submission' : 'Submit your work'}</h4>
      <p>{slots.length ? 'Upload each requested file below. You can also add a project link.' : 'Add a link, attach up to five files, or include both.'}{a.submissionId ? ' Resubmitting sends your work for a new review.' : ''}</p>
      <label>GitHub or project link<input name="submissionUrl" type="url" defaultValue={a.submissionUrl || ''} placeholder="https://github.com/your-project" /></label>
      {(slots.length ? slots : [{ id: 'optional', label: 'Attach your work' }]).map(slot => <label key={slot.id} className="assignment-upload">{slot.label}
        <input type="file" multiple={!slots.length} required={!!slots.length && !a.files?.some(f => f.slotId === slot.id)} accept=".pdf,.doc,.docx,.txt,.zip,.png,.jpg,.jpeg,.sh,.yaml,.yml,.json" onChange={e => setFiles(current => ({ ...current, [slot.id]: Array.from(e.target.files) }))} />
        <small>Maximum 15 MB per file. PDF, Word, text, images, scripts, YAML, JSON or ZIP.</small>
        {(files[slot.id] || []).map((file, i) => <strong key={i}>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</strong>)}
        {a.submissionId && <small>{slots.length ? 'An existing file in this slot is kept unless replaced.' : 'Selecting files replaces your previous attachment set. Select all files you want to submit.'}</small>}
      </label>)}
      <label>Note to your mentor<textarea name="note" rows="3" defaultValue={a.submissionNote || ''} placeholder="Explain your approach or anything you need help with." /></label>
      <button className="button primary" disabled={busy || oversized}>{busy ? 'Submitting…' : a.submissionId ? 'Resubmit for review' : 'Submit assignment'}</button>
      {oversized && <p role="alert">File is too large. Choose a file of 15 MB or less.</p>}
      <p role="status" className={`form-message ${error ? '' : 'success'}`}>{message}</p>
    </form>
  </section>;
}
import AssignmentMarkdown, { AssignmentInstructions } from './AssignmentMarkdown.jsx';
