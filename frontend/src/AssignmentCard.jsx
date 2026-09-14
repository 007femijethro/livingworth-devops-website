import { useState } from 'react';

export function AttachmentDownload({ id, name }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/submissions/${id}/file`, { headers: { Authorization: `Bearer ${localStorage.getItem('lw_token')}` } });
      if (!response.ok) throw new Error('Could not download the attachment. Please try again.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div><button type="button" className="button light-border" disabled={busy} onClick={download}>{busy ? 'Downloading…' : `Download ${name}`}</button>{error && <p role="alert">{error}</p>}</div>;
}

export default function AssignmentCard({ assignment: a, onSubmitted }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [file, setFile] = useState(null);
  const labels = { submitted: 'Awaiting review', completed: 'Completed', needs_correction: 'Changes requested' };
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!file) data.delete('file');
    if (file?.size > 15 * 1024 * 1024) { setError(true); setMessage('Your file exceeds 15 MB. Choose a smaller file.'); return; }
    if (!data.get('submissionUrl')?.trim() && !file && !a.fileName) { setError(true); setMessage('Add a project link or attach a file.'); return; }
    setBusy(true); setMessage('Submitting your work…'); setError(false);
    try {
      const response = await fetch(`/api/student/assignments/${a.id}/submission`, { method: 'PUT', headers: { Authorization: `Bearer ${localStorage.getItem('lw_token')}` }, body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Submission failed. Please try again.');
      setMessage('Your work has been submitted for mentor review.'); setFile(null); form.elements.file.value = ''; onSubmitted();
    } catch (e) { setError(true); setMessage(e.message); } finally { setBusy(false); }
  }
  return <section className="student-assignment assignment-card">
    <header className="assignment-title"><div><span>Practical assignment</span><h4>{a.title}</h4></div><b className={`work-status ${a.submissionStatus || 'not-started'}`}>{labels[a.submissionStatus] || 'Not submitted'}</b></header>
    <div className="assignment-meta"><span>Due {new Date(a.dueAt).toLocaleString()}</span><span>{a.maxScore} points</span>{a.isLate && <b>Submitted late</b>}</div>
    <details open className="assignment-brief"><summary>Assignment instructions</summary><p>{a.instructions}</p></details>
    {a.feedback && <aside className="mentor-feedback"><b>Mentor feedback</b><p>{a.feedback}</p>{a.score != null && <strong>{a.score} / {a.maxScore} points</strong>}</aside>}
    {a.submittedAt && <p>Last submitted: {new Date(a.submittedAt).toLocaleString()}</p>}
    {a.fileName && <AttachmentDownload id={a.submissionId} name={a.fileName} />}
    <form onSubmit={submit} className="assignment-submit-form">
      <h4>{a.submissionId ? 'Update your submission' : 'Submit your work'}</h4>
      <p>Add a link, attach a file, or include both.{a.submissionId ? ' Resubmitting sends your work for a new review.' : ''}</p>
      <label>GitHub or project link<input name="submissionUrl" type="url" defaultValue={a.submissionUrl || ''} placeholder="https://github.com/your-project" /></label>
      <label className="assignment-upload">Attach your work<input name="file" type="file" accept=".pdf,.doc,.docx,.txt,.zip,.png,.jpg,.jpeg,.sh,.yaml,.yml,.json" onChange={e => setFile(e.target.files[0] || null)} /><small>One file, maximum 15 MB. PDF, Word, text, images, scripts, YAML, JSON or ZIP.</small>{file && <strong>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</strong>}{a.fileName && <small>Your current attachment is kept unless you select a replacement.</small>}</label>
      <label>Note to your mentor<textarea name="note" rows="3" defaultValue={a.submissionNote || ''} placeholder="Explain your approach or anything you need help with." /></label>
      <button className="button primary" disabled={busy || file?.size > 15 * 1024 * 1024}>{busy ? 'Submitting…' : a.submissionId ? 'Resubmit for review' : 'Submit assignment'}</button>
      {file?.size > 15 * 1024 * 1024 && <p role="alert">File is too large. Choose a file of 15 MB or less.</p>}
      <p role="status" className={`form-message ${error ? '' : 'success'}`}>{message}</p>
    </form>
  </section>;
}
