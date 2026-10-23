import {useAcademySettings} from './AcademySettingsContext';
import './student-record-details.css';
type RecordData = Record<string,any>;
const grade=(score:number|null|undefined)=>score==null?'Not assessed':`${score}/100`;
const date=(value:string|null|undefined,zone:string)=>value?new Date(value).toLocaleString('en-GB',{timeZone:zone,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Not recorded';
export function StudentAccountBadge({student}:{student:RecordData}) {
 const status=student.accountStatus||(student.status==='approved'?'active':student.status);
 return <b className={`status account-status-${status}`}>{status}</b>;
}
export function StudentDirectorySummary({student}:{student:RecordData}) {
 const zone=useAcademySettings().classTimezone;
 return <div className="student-directory-summary"><div><span>Overall score</span><strong>{grade(student.scores?.overallScore)}</strong><small>{student.scores?.categoriesCounted||0}/4 categories assessed</small></div><div><span>Last signed in</span><strong>{date(student.lastSignedInAt,zone)}</strong><small>{zone}</small></div>{student.probation?.onProbation&&<p>Probation deadline: <b>{date(student.probation.dueAt,zone)}</b> ({zone})</p>}</div>;
}
export function StudentAccountDetails({report}:{report:RecordData}) {
 const zone=useAcademySettings().classTimezone,student=report.student,p=report.probation;
 const entries=[['Account status',student.accountStatus],['Last signed in',`${date(student.lastSignedInAt,zone)}${student.lastSignedInAt?` (${zone})`:''}`],['Registered',`${date(student.createdAt,zone)} (${zone})`],['Profile last updated',date(student.updatedAt,zone)],['Class representative',student.isClassRep?'Yes':'No'],['Password change required',student.mustChangePassword?'Yes':'No'],['Terms accepted',student.termsAccepted?'Yes':'No']];
 if(p?.onProbation)entries.push(['Probation started',date(p.startedAt,zone)],['Probation deadline',`${date(p.dueAt,zone)} (${zone})`],['Required overall score',`${p.threshold}/100`]);
 if(student.expelledAt)entries.push(['Expelled on',date(student.expelledAt,zone)],['Expulsion reason',student.expelledReason]);
 if(student.rejectionReason)entries.push(['Rejection reason',student.rejectionReason]);
 return <section className="learner-report-section student-account-details"><div className="report-section-head"><h3>Account & sign-in details</h3><StudentAccountBadge student={student}/></div>{p?.onProbation&&<p className="student-profile-probation">This student is on probation. They must reach {p.threshold}/100 before the deadline to avoid automatic expulsion after {p.weeks} continuous weeks below the threshold.</p>}<div className="learner-detail-grid">{entries.map(([label,value])=><div key={label}><span>{label}</span><strong>{value||'—'}</strong></div>)}</div><p className="student-record-note">Last sign-in is recorded after a successful password or fingerprint/Face ID login. Older sign-ins are not backdated.</p></section>;
}
export function StudentScoreDetails({report}:{report:RecordData}) {
 const scores=report.scores||{};
 return <section className="learner-report-section"><h3>Overall score & breakdown</h3><div className="student-score-breakdown">{[['Overall',scores.overallScore],['Quizzes',scores.quizScore],['Class activities',scores.activityScore],['Assignments',scores.assignmentScore],['Attendance',scores.attendanceScore]].map(([label,value])=><article key={label}><span>{label}</span><strong>{grade(value as number|null)}</strong></article>)}</div><p className="student-record-note">Overall is the equal average of available categories, using the best attempt per quiz and published class activity. {scores.categoriesCounted||0}/4 categories assessed. Unassessed categories are excluded.</p></section>;
}
export function StudentClassActivityDetails({report}:{report:RecordData}) {
 const zone=useAcademySettings().classTimezone,attempts=report.classActivities?.attempts||[];
 return <section className="learner-report-section"><h3>Class activity results</h3>{attempts.length?<div className="compact-report-list">{attempts.map((attempt:RecordData)=><article key={attempt.id}><div><strong>Week {attempt.weekNumber} · {attempt.title}</strong><small>Attempt {attempt.attemptNo} · {date(attempt.completedAt,zone)} · {attempt.correctCount}/{attempt.totalQuestions} correct</small></div><b>{attempt.percentage}/100</b></article>)}</div>:<p className="progress-empty">No completed class activity attempts.</p>}</section>;
}
