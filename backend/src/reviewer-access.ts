// @ts-nocheck
import {createHash,randomBytes} from 'node:crypto';
import {buildOverallLeaderboard} from './analytics.js';
import {studentRecord} from './student-records.js';
export const reviewerHash = token => createHash('sha256').update(token).digest('hex');
export async function liveReviewerSnapshot(pool, scoreboard=buildOverallLeaderboard){
 const [scores,...results]=await Promise.all([
  scoreboard(pool,{includeInactive:true}),
  pool.query(`SELECT id,full_name AS fullName,status,created_at AS registeredAt,last_signed_in_at AS lastSignedInAt,probation_started_at AS probationStartedAt,probation_due_at AS probationDueAt,probation_policy AS probationPolicy FROM users WHERE role='student' ORDER BY full_name`),
  pool.query(`SELECT q.id,q.title,q.status,q.scheduled_start_at AS startsAt,COUNT(a.id) AS attempts,COUNT(a.id) FILTER (WHERE a.status='completed') AS completed FROM quizzes q LEFT JOIN quiz_attempts a ON a.quiz_id=q.id GROUP BY q.id ORDER BY q.id DESC LIMIT 500`),
  pool.query(`SELECT a.id,u.full_name AS learner,q.title,a.status,a.correct_count AS correctCount,a.total_questions AS totalQuestions,a.completed_at AS occurredAt FROM quiz_attempts a JOIN users u ON u.id=a.student_id JOIN quizzes q ON q.id=a.quiz_id ORDER BY a.id DESC LIMIT 500`),
  pool.query(`SELECT s.id,u.full_name AS learner,a.title,s.status,s.score,a.max_score AS maxScore,s.submitted_at AS occurredAt FROM assignment_submissions s JOIN users u ON u.id=s.student_id JOIN assignments a ON a.id=s.assignment_id ORDER BY s.submitted_at DESC,s.id DESC LIMIT 500`),
  pool.query(`SELECT a.id,u.full_name AS learner,l.title,a.correct_count AS correctCount,a.total_questions AS totalQuestions,a.completed_at AS occurredAt FROM activity_attempts a JOIN users u ON u.id=a.student_id JOIN learning_activities l ON l.id=a.activity_id ORDER BY a.id DESC LIMIT 500`),
  pool.query(`SELECT a.id,u.full_name AS learner,a.session_date AS sessionDate,a.status,a.marked_at AS occurredAt FROM attendance a JOIN users u ON u.id=a.student_id ORDER BY a.marked_at DESC,a.id DESC LIMIT 500`),
  pool.query(`SELECT m.id,m.week_number AS weekNumber,m.title,m.summary,m.published,COUNT(DISTINCT l.id) AS materials,COUNT(DISTINCT a.id) AS activities FROM learning_modules m LEFT JOIN learning_materials l ON l.module_id=m.id LEFT JOIN learning_activities a ON a.module_id=m.id GROUP BY m.id ORDER BY m.week_number`),
  pool.query(`SELECT id,title,status,scheduled_at AS startsAt,started_at AS startedAt,ended_at AS endedAt FROM live_classes ORDER BY id DESC LIMIT 100`),
  pool.query(`SELECT id,title,category,created_at AS occurredAt FROM announcements ORDER BY created_at DESC LIMIT 100`)
 ]);
 const [students,quizzes,quizAttempts,assignments,activities,attendance,programme,classes,announcements]=results.map(result=>result[0]);
 const byId=new Map(scores.leaderboard.map(row=>[Number(row.id),row]));
 return {updatedAt:new Date().toISOString(),refreshSeconds:15,recordLimit:500,scoring:scores.scoring,students:students.map(row=>studentRecord(row,byId.get(Number(row.id)))),quizzes,quizAttempts,assignments,activities,attendance,programme,classes,announcements};
}
export function registerReviewerAccessRoutes(app,pool,requireAuth,requireAdmin,snapshot=liveReviewerSnapshot){
 const noStore=(_req,res,next)=>{res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});next()};
 app.get('/api/admin/reviewer-access',requireAuth,requireAdmin,noStore,async(_req,res,next)=>{try{const [rows]=await pool.query(`SELECT id,label,created_at AS createdAt,expires_at AS expiresAt,revoked_at AS revokedAt FROM lw_reviewer_access ORDER BY id DESC LIMIT 50`);res.json(rows)}catch(e){next(e)}});
 app.post('/api/admin/reviewer-access',requireAuth,requireAdmin,noStore,async(req,res,next)=>{try{
  const label=String(req.body?.label||'GTV review').trim(),days=req.body?.days??7;
  if(!label||label.length>100||!Number.isInteger(days)||days<1||days>30)return res.status(400).json({message:'Choose a label and an expiry between 1 and 30 days.'});
  const token=randomBytes(32).toString('base64url');
  const [result]=await pool.execute(`INSERT INTO lw_reviewer_access (label,token_hash,created_by,expires_at) VALUES (?,?,?,NOW() + (? * INTERVAL '1 day')) RETURNING id,expires_at AS expiresAt`,[label,reviewerHash(token),req.user.id,days]);
  res.status(201).json({id:result.rows[0].id,expiresAt:result.rows[0].expiresAt,token});
 }catch(e){next(e)}});
 app.delete('/api/admin/reviewer-access/:id',requireAuth,requireAdmin,noStore,async(req,res,next)=>{try{
  if(!/^[1-9]\d*$/.test(req.params.id))return res.sendStatus(400);
  await pool.execute('UPDATE lw_reviewer_access SET revoked_at=NOW() WHERE id=? AND revoked_at IS NULL',[req.params.id]);res.json({message:'Live reviewer access revoked.'});
 }catch(e){next(e)}});
 app.get('/api/reviewer/live',noStore,async(req,res,next)=>{try{
  const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('authorization')||'')?.[1];
  if(!token)return res.status(401).json({message:'Open the complete live reviewer link provided by the administrator.'});
  const [rows]=await pool.query(`SELECT r.id,r.label,r.expires_at AS expiresAt FROM lw_reviewer_access r JOIN users u ON u.id=r.created_by WHERE r.token_hash=? AND r.revoked_at IS NULL AND r.expires_at>NOW() AND u.role='admin' AND u.status='approved'`,[reviewerHash(token)]);
  if(!rows.length)return res.status(401).json({message:'This reviewer link has expired or been revoked. Ask the administrator for a new link.'});
  const data=await snapshot(pool);
  // Recheck after the snapshot so revocation during a slow read cannot release records.
  const [valid]=await pool.query('SELECT id FROM lw_reviewer_access WHERE id=? AND revoked_at IS NULL AND expires_at>NOW()',[rows[0].id]);
  if(!valid.length)return res.status(401).json({message:'This reviewer link is no longer active.'});
  res.json({...data,access:{label:rows[0].label,expiresAt:rows[0].expiresAt}});
 }catch(e){next(e)}});
}
