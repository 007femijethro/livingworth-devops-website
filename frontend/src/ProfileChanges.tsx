import { useEffect, useState, type FormEvent } from 'react';

async function request(path:string, options:RequestInit={}) {
  const response=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${localStorage.getItem('lw_token')}`,...options.headers}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.message||'Something went wrong.');
  return data;
}

const labels:Record<string,string>={firstName:'First name',lastName:'Last name',phone:'Phone',gender:'Gender',country:'Country',stateCity:'State / city',employmentStatus:'Employment / study',educationalLevel:'Education',learningMode:'Learning mode',techExperience:'Technology experience',learningGoal:'Learning goal'};

export function StudentProfileEditor(){
  const [data,setData]=useState<any>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const load=()=>request('/profile-change-requests/mine').then(setData).catch(error=>setMessage(error.message));
  useEffect(()=>{ void load(); },[]);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setMessage('');try{const values=Object.fromEntries(new FormData(event.currentTarget));const result=await request('/profile-change-requests',{method:'POST',body:JSON.stringify(values)});setMessage(result.message);await load()}catch(error:any){setMessage(error.message)}finally{setBusy(false)}}
  if(!data)return <div className="empty">{message||'Loading your profile…'}</div>;
  const pending=data.request?.status==='pending';
  return <section className="profile-change-center">
    <header><div><span>Personal details</span><h2>Your profile</h2><p>Submit corrected details for review. Your current profile stays active until an administrator approves the request.</p></div><div className={`profile-request-status ${data.request?.status||'none'}`}><small>Latest request</small><strong>{data.request?.status||'No request'}</strong></div></header>
    {pending&&<aside className="profile-pending"><b>Waiting for administrator approval</b><p>Submitted {new Date(data.request.createdAt).toLocaleString()}. You cannot submit another request until this one is reviewed.</p></aside>}
    {data.request?.status==='rejected'&&<aside className="profile-rejected"><b>Previous request was not approved</b><p>{data.request.rejectionReason}</p></aside>}
    <form onSubmit={submit} className="profile-edit-form">
      <label>First name<input name="firstName" defaultValue={data.profile.firstName||''} disabled={pending} required/></label>
      <label>Last name<input name="lastName" defaultValue={data.profile.lastName||''} disabled={pending} required/></label>
      <label>Email address<input value={data.profile.email||''} disabled/><small>Change email securely from the Security page.</small></label>
      <label>Phone<input name="phone" type="tel" defaultValue={data.profile.phone||''} disabled={pending}/></label>
      <label>Gender<select name="gender" defaultValue={data.profile.gender||''} disabled={pending}><option value="">Select</option><option>Female</option><option>Male</option><option>Prefer not to say</option></select></label>
      <label>Country<input name="country" defaultValue={data.profile.country||''} disabled={pending}/></label>
      <label>State / city<input name="stateCity" defaultValue={data.profile.stateCity||''} disabled={pending}/></label>
      <label>Employment / study<input name="employmentStatus" defaultValue={data.profile.employmentStatus||''} disabled={pending}/></label>
      <label>Educational level<input name="educationalLevel" defaultValue={data.profile.educationalLevel||''} disabled={pending}/></label>
      <label>Learning mode<select name="learningMode" defaultValue={data.profile.learningMode||''} disabled={pending}><option value="">Select</option><option>Online</option><option>Hybrid</option><option>In-person</option></select></label>
      <label className="wide">Technology experience<input name="techExperience" defaultValue={data.profile.techExperience||''} disabled={pending}/></label>
      <label className="wide">Learning goal<textarea name="learningGoal" rows={4} defaultValue={data.profile.learningGoal||''} disabled={pending}/></label>
      <button className="button primary" disabled={busy||pending}>{busy?'Submitting…':'Submit changes for approval'}</button><p className="form-message success">{message}</p>
    </form>
  </section>;
}

export function AdminProfileRequests(){
  const [status,setStatus]=useState('pending'),[items,setItems]=useState<any[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState<number|null>(null),[reasons,setReasons]=useState<Record<number,string>>({});
  const load=()=>request(`/admin/profile-change-requests?status=${status}`).then(setItems).catch(error=>setMessage(error.message));
  useEffect(()=>{ void load(); },[status]);
  async function decide(id:number,decision:string){setBusy(id);setMessage('');try{const result=await request(`/admin/profile-change-requests/${id}`,{method:'PATCH',body:JSON.stringify({decision,reason:reasons[id]||''})});setMessage(result.message);await load()}catch(error:any){setMessage(error.message)}finally{setBusy(null)}}
  return <section className="profile-review-center"><header><div><span>Approval queue</span><h2>Profile changes</h2><p>Review what students want to change before those details replace their current profile.</p></div><div className="profile-review-tabs">{['pending','approved','rejected'].map(value=><button className={status===value?'active':''} onClick={()=>setStatus(value)} key={value}>{value}</button>)}</div></header><p className="form-message success">{message}</p>
    <div className="profile-request-list">{items.length?items.map(item=><article key={item.id}><header><div className="student-avatar">{item.studentName[0]}</div><div><h3>{item.studentName}</h3><p>{item.email} · requested {new Date(item.createdAt).toLocaleString()}</p></div><b className={`status ${item.status}`}>{item.status}</b></header><div className="profile-change-diff">{Object.entries(item.proposedData||{}).map(([field,value])=><div key={field}><small>{labels[field]||field}</small><strong>{String(value)||'Not provided'}</strong></div>)}</div>{item.status==='pending'&&<footer><label>Reason if rejecting<textarea rows={2} value={reasons[item.id]||''} onChange={event=>setReasons({...reasons,[item.id]:event.target.value})} placeholder="Explain what needs correcting"/></label><div><button className="button profile-reject" disabled={busy===item.id} onClick={()=>decide(item.id,'rejected')}>Reject</button><button className="button primary" disabled={busy===item.id} onClick={()=>decide(item.id,'approved')}>Approve changes</button></div></footer>}{item.status!=='pending'&&<footer className="reviewed-request"><span>Reviewed {item.reviewedAt&&new Date(item.reviewedAt).toLocaleString()} by {item.reviewedBy||'administrator'}</span>{item.rejectionReason&&<p>{item.rejectionReason}</p>}</footer>}</article>):<div className="empty">No {status} profile requests.</div>}</div>
  </section>;
}
