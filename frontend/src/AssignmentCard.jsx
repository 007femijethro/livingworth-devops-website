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
  const [redoOpen, setRedoOpen] = useState(false);
  const slots = a.uploadSlots || [];
  const selected = slots.length ? slots.flatMap(s => files[s.id] || []) : Object.values(files).flat();
  const oversized = selected.some(f => f.size > 15 * 1024 * 1024);
  const labels = { rejected: 'Redo required', submitted: 'Awaiting final result', completed: 'Final result', needs_correction: 'Awaiting final result', unavailable: 'Unavailable' };
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    data.delete('file');
    selected.forEach(file => data.append('file', file));
    if (slots.length) data.set('fileSlots', JSON.stringify(slots.filter(s => files[s.id]?.length).map(s => s.id)));
    if (oversized || selected.length > 5) { setError(true); setMessage('Upload up to five files, each 15 MB or smaller.'); return; }
    setBusy(true); setMessage('Submitting your work…'); setError(false);
    try {
      const response = await fetch(`/api/student/assignments/${a.id}/submission`, { method: 'PUT', headers: { Authorization: `Bearer ${localStorage.getItem('lw_token')}` }, body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Submission failed. Please try again.');
      setMessage('Your work has been submitted for mentor review.'); setFiles({}); setRedoOpen(false); form.querySelectorAll('input[type=file]').forEach(input => { input.value = ''; }); window.dispatchEvent(new Event('lw-assignments-changed')); onSubmitted();
    } catch (e) { setError(true); setMessage(e.message); } finally { setBusy(false); }
  }
  return <section className="student-assignment assignment-card">
    <header className="assignment-title"><div><span>{a.assignmentType === 'manual' ? 'Submit to mentor via DM' : 'Practical assignment'}</span><h4>{a.title}</h4></div><b className={`work-status ${a.submissionStatus || (a.closedAt ? 'closed' : 'not-started')}`}>{labels[a.submissionStatus] || (a.closedAt ? 'Closed' : 'Not submitted')}</b></header>
    <div className="assignment-meta"><span>Due {new Date(a.dueAt).toLocaleString()}</span><span>{a.maxScore} points</span><span>{a.assignmentType === 'manual' ? 'DM submission' : 'Portal submission'}</span>{a.isLate && <b>Submitted late</b>}</div>
    <details open className="assignment-brief"><summary>Assignment instructions</summary><AssignmentMarkdown>{a.instructions}</AssignmentMarkdown></details>
    {a.feedback && <aside className={`mentor-feedback ${a.submissionStatus === 'rejected' ? 'redo-feedback' : ''}`}><b>{a.submissionStatus === 'rejected' ? 'Why this assignment needs to be redone' : a.submissionStatus === 'unavailable' ? 'Result' : 'Mentor feedback'}</b><p>{a.feedback}</p>{a.score != null && <strong>{a.score} / {a.maxScore} points</strong>}</aside>}
    {a.submittedAt && <p>Last submitted: {new Date(a.submittedAt).toLocaleString()}</p>}
    <SubmissionFiles submission={a} id={a.submissionId} />
    {a.assignmentType === 'manual' && !['completed', 'unavailable'].includes(a.submissionStatus) && <aside className="assignment-manual-notice"><strong>Send this work directly to your mentor.</strong><p>Your mentor will record your score here after reviewing it. You do not need to upload anything in the portal.</p></aside>}
    {a.assignmentType === 'portal' && a.closedAt && !['completed', 'rejected'].includes(a.submissionStatus) && <aside className="assignment-closed-notice"><strong>This assignment is closed.</strong><p>It is no longer accepting submissions. Contact your mentor if you need help.</p></aside>}
    {a.assignmentType === 'portal' && a.submissionStatus === 'rejected' && !redoOpen && <div className="assignment-redo-action"><div><strong>Correct your work and submit it again</strong><p>Your existing link, note and attachments will remain available until you replace them.</p></div><button type="button" className="button primary" onClick={() => setRedoOpen(true)}>Redo assignment</button></div>}
    {a.assignmentType === 'portal' && (!a.closedAt || a.submissionStatus === 'rejected') && !['completed', 'unavailable'].includes(a.submissionStatus) && (a.submissionStatus !== 'rejected' || redoOpen) && <form onSubmit={submit} className={`assignment-submit-form ${a.submissionStatus === 'rejected' ? 'redo-form' : ''}`}>
      <h4>{a.submissionStatus === 'rejected' ? 'Redo your assignment' : a.submissionId ? 'Update your submission' : 'Submit your work'}</h4>
      <p>{slots.length ? 'The requested file names show what your mentor expects. Upload any that are ready, or submit without attachments and add them later.' : 'You may add a link, attach up to five files, include both, or submit without attachments.'}{a.submissionId ? ' Resubmitting sends your work for a new review.' : ''}</p>
      <label>GitHub or project link<input name="submissionUrl" type="url" defaultValue={a.submissionUrl || ''} placeholder="https://github.com/your-project" /></label>
      {(slots.length ? slots : [{ id: 'optional', label: 'Attach your work' }]).map(slot => <label key={slot.id} className="assignment-upload">{slot.label}
        <input type="file" multiple={!slots.length} accept=".pdf,.doc,.docx,.txt,.zip,.png,.jpg,.jpeg,.sh,.yaml,.yml,.json" onChange={e => setFiles(current => ({ ...current, [slot.id]: Array.from(e.target.files) }))} />
        <small>Maximum 15 MB per file. PDF, Word, text, images, scripts, YAML, JSON or ZIP.</small>
        {(files[slot.id] || []).map((file, i) => <strong key={i}>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</strong>)}
        {a.submissionId && <small>{slots.length ? 'An existing file in this slot is kept unless replaced.' : 'Selecting files replaces your previous attachment set. Select all files you want to submit.'}</small>}
      </label>)}
      <label>Note to your mentor<textarea name="note" rows="3" defaultValue={a.submissionNote || ''} placeholder="Explain your approach or anything you need help with." /></label>
      <div className="assignment-submit-actions"><button className="button primary" disabled={busy || oversized}>{busy ? 'Submitting…' : a.submissionStatus === 'rejected' ? 'Submit redone assignment' : a.submissionId ? 'Resubmit for review' : 'Submit assignment'}</button>{a.submissionStatus === 'rejected' && <button type="button" className="button light-border" disabled={busy} onClick={() => { setRedoOpen(false); setFiles({}); setMessage(''); }}>Cancel</button>}</div>
      {oversized && <p role="alert">File is too large. Choose a file of 15 MB or less.</p>}
      <p role="status" className={`form-message ${error ? '' : 'success'}`}>{message}</p>
    </form>}
  </section>;
}
import AssignmentMarkdown, { AssignmentInstructions } from './AssignmentMarkdown.jsx';
