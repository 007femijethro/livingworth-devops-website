// @ts-nocheck
import {buildOverallLeaderboard} from './analytics.js';
import {getAcademySettings,loadAcademySettings} from './academy-settings.js';
import {logger} from './logger.js';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const probationPolicy = settings => `${settings.probationThreshold}:${settings.probationWeeks}`;

export function probationDecision(student, score, settings, now) {
  const policy = probationPolicy(settings);
  if (!settings.probationEnabled || score === null || !Number.isFinite(score) || score >= settings.probationThreshold) return {action:'clear',start:null,due:null,policy:null};
  const prior = student.probationStartedAt && new Date(student.probationStartedAt);
  const continuing = student.probationPolicy === policy && prior && Number.isFinite(+prior);
  const start = continuing ? prior : new Date(now);
  const due = new Date(+start + settings.probationWeeks * WEEK_MS);
  return {action:continuing && +now >= +due ? 'expel' : 'probation',start:start.toISOString(),due:due.toISOString(),policy};
}

/** Persist a fresh grace period, and never infer probation time from old assessment dates. */
export async function evaluateProbation(pool, io, dependencies = {}) {
  const connection = await pool.getConnection();
  const readSettings = dependencies.readSettings || loadAcademySettings;
  const scoreboard = dependencies.scoreboard || buildOverallLeaderboard;
  const expelled = [];
  try {
    await connection.beginTransaction();
    // Same lock as Settings: switching off or changing policy cannot race an expulsion decision.
    await connection.execute('SELECT pg_advisory_xact_lock(4792101)');
    const {settings} = await readSettings(connection);
    if (!settings.probationEnabled) {
      await connection.execute("UPDATE users SET probation_started_at=NULL,probation_due_at=NULL,probation_policy=NULL WHERE role='student' AND status='approved' AND probation_started_at IS NOT NULL");
      await connection.commit();
      return {expelled:[]};
    }
    const [clock] = await connection.query('SELECT CURRENT_TIMESTAMP AS evaluatedAt');
    const now = new Date(clock[0].evaluatedAt);
    const [students] = await connection.query("SELECT id,full_name AS fullName,probation_started_at AS probationStartedAt,probation_policy AS probationPolicy FROM users WHERE role='student' AND status='approved' ORDER BY id FOR UPDATE");
    const scores = new Map((await scoreboard(connection)).leaderboard.map(student => [Number(student.id),student.overallScore]));
    for (const student of students) {
      const score = scores.get(Number(student.id)) ?? null;
      const decision = probationDecision(student, score, settings, now);
      if (decision.action === 'expel') {
        const reason = `Automatic probation: overall score ${score}/100 stayed below ${settings.probationThreshold}/100 for ${settings.probationWeeks} continuous weeks, from ${decision.start} to ${decision.due}. Admin reinstatement required.`;
        await connection.execute(`UPDATE users SET status='expelled',expelled_reason=?,expelled_at=?,is_class_rep=FALSE,rejection_reason=NULL,
          session_version=session_version+1,failed_login_attempts=0,locked_until=NULL,probation_score=?,probation_checked_at=?,updated_at=? WHERE id=? AND role='student' AND status='approved'`,[reason,now.toISOString(),score,now.toISOString(),now.toISOString(),student.id]);
        await connection.execute('UPDATE password_reset_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL',[student.id]);
        await connection.execute('UPDATE email_change_tokens SET used_at=CURRENT_TIMESTAMP WHERE user_id=? AND used_at IS NULL',[student.id]);
        expelled.push(Number(student.id));
      } else {
        await connection.execute(`UPDATE users SET probation_started_at=?,probation_due_at=?,probation_policy=?,probation_score=?,probation_checked_at=? WHERE id=? AND role='student' AND status='approved'`,[decision.start,decision.due,decision.policy,score,now.toISOString(),student.id]);
      }
    }
    await connection.commit();
  } catch (error) {await connection.rollback();throw error;}
  finally {connection.release();}
  // Only terminate sessions after the transaction has committed successfully.
  for (const socket of io?.sockets?.sockets?.values() || []) if(socket.user?.role==='student' && expelled.includes(Number(socket.user.id))) socket.disconnect(true);
  if(expelled.length)logger.info('probation_expulsions',{studentIds:expelled});
  return {expelled};
}

export function startProbationScheduler(pool,io) {
  let busy=false;
  const tick=async()=>{if(busy)return;busy=true;try{await evaluateProbation(pool,io)}catch(error){logger.error('probation_check_failed',{error:error.message})}finally{busy=false}};
  const timer=setInterval(()=>void tick(),60000);timer.unref?.();void tick();
  io?.httpServer?.once('close',()=>clearInterval(timer));
  return ()=>clearInterval(timer);
}
const fields='id,full_name AS fullName,status,probation_started_at AS probationStartedAt,probation_due_at AS probationDueAt,probation_policy AS probationPolicy,probation_score AS overallScore,probation_checked_at AS checkedAt,expelled_reason AS expelledReason,expelled_at AS expelledAt';
export function probationView(student,settings) {
  return {enabled:settings.probationEnabled,threshold:settings.probationThreshold,weeks:settings.probationWeeks,overallScore:student?.overallScore??null,checkedAt:student?.checkedAt??null,
    onProbation:!!(settings.probationEnabled && student?.status==='approved' && student.probationStartedAt && student.probationPolicy===probationPolicy(settings)),
    startedAt:student?.probationStartedAt??null,dueAt:student?.probationDueAt??null};
}
export function registerProbationRoutes(app,pool,requireAuth,requireAdmin) {
  app.get('/api/student/probation',requireAuth,async(req,res,next)=>{try{
    if(req.user.role!=='student')return res.status(403).json({message:'Student access required.'});
    const [rows]=await pool.execute(`SELECT ${fields} FROM users WHERE id=? AND role='student'`,[req.user.id]);
    res.set('Cache-Control','private, no-store').json(probationView(rows[0],getAcademySettings()));
  }catch(error){next(error)}});
  app.get('/api/admin/probation',requireAuth,requireAdmin,async(_req,res,next)=>{try{
    const settings=getAcademySettings();
    const [rows]=await pool.query(`SELECT ${fields} FROM users WHERE role='student' AND (probation_started_at IS NOT NULL OR (status='expelled' AND expelled_reason LIKE 'Automatic probation:%')) ORDER BY probation_due_at,full_name`);
    res.set('Cache-Control','private, no-store').json({enabled:settings.probationEnabled,threshold:settings.probationThreshold,weeks:settings.probationWeeks,students:rows.filter(student=>student.status==='expelled'||probationView(student,settings).onProbation)});
  }catch(error){next(error)}});
}
