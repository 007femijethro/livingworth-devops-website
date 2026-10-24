import {useState} from 'react';
import {academyOrigin} from './mobile-url';
import './reviewer-portal.css';
export default function ReviewerAccessCard(){
 const url=`${academyOrigin}/review`,[message,setMessage]=useState('');
 async function copy(){try{await navigator.clipboard.writeText(url);setMessage('Reviewer link copied.')}catch{setMessage('Select and copy the link from the field above.')}}
 return <section className="settings-card review-access-card"><header><h3>GTV & reviewer access</h3><p>Share a dedicated walkthrough with learner and admin perspectives. It uses fictional sample data and needs no account or password.</p></header><label htmlFor="reviewer-url">Shareable reviewer URL</label><input id="reviewer-url" value={url} readOnly onFocus={event=>event.target.select()}/><div className="review-access-actions"><button type="button" className="button primary" onClick={()=>void copy()}>Copy reviewer link</button><a className="button light-border" href={url} target="_blank" rel="noreferrer">Open reviewer portal ↗</a></div>{message&&<p role="status">{message}</p>}<p>Reviewers cannot see private learner records, use your administrator session or change the live academy.</p></section>;
}
