// @ts-nocheck
export function rankQuizParticipants(participants) {
  const rows=participants.map(row=>({...row,score:Number(row.score||0),correctCount:Number(row.correctCount||0),totalQuestions:Number(row.totalQuestions||0)}))
    .sort((a,b)=>b.score-a.score||b.correctCount-a.correctCount||Number(a.studentId)-Number(b.studentId));
  let position=0;
  return rows.map((row,index)=>{
    if(!index||row.score!==rows[index-1].score||row.correctCount!==rows[index-1].correctCount)position=index+1;
    return {...row,position,percentage:row.totalQuestions?Math.round(row.correctCount*100/row.totalQuestions):0};
  });
}
const initials=name=>String(name||'Student').split(/\s+/).filter(Boolean).map(part=>part[0]).join('').slice(0,3).toUpperCase();
export function privateQuizCompletion(summary,userId,visibility='full') {
  const own=summary.self||summary.participants?.find(row=>Number(row.studentId)===Number(userId))||null;
  const previous=summary.rankingVisibility;
  const mode=previous==='private'||visibility==='private'?'private':previous==='initials'||visibility==='initials'?'initials':'full';
  const rows=summary.participants||summary.leaderboard||[];
  const visible=mode==='private'?rows.filter(row=>Number(row.studentId)===Number(userId)):rows.slice(0,20);
  if(own&&!visible.some(row=>Number(row.studentId)===Number(userId)))visible.push(own);
  const clean=row=>({studentId:Number(row.studentId),fullName:Number(row.studentId)===Number(userId)?'You':mode==='initials'&&previous!=='initials'?initials(row.fullName):row.fullName,
    position:row.position,score:row.score,correctCount:row.correctCount,totalQuestions:row.totalQuestions,percentage:row.percentage,isCurrentStudent:Number(row.studentId)===Number(userId)});
  return {quizId:summary.quizId,title:summary.title,completedAt:summary.completedAt,stopped:Boolean(summary.stopped),rankingScope:summary.rankingScope||'session',
    rankingVisibility:mode,participantCount:summary.participantCount,self:own?{attemptId:own.attemptId,studentId:Number(own.studentId),score:own.score,correctCount:own.correctCount,totalQuestions:own.totalQuestions,percentage:own.percentage,position:own.position,answeredCount:own.answeredCount,unansweredCount:own.unansweredCount}:null,
    leaderboard:visible.map(clean)};
}

/** Rank the attempts in this live run, including learners who answered nothing or disconnected. */
export async function saveQuizCompletion(pool,state,quizId,stopped=false) {
  const ids=[...state.attempts.keys()].map(Number);
  const [users]=ids.length?await pool.query(`SELECT id, full_name AS fullName FROM users WHERE id IN (${ids.map(()=>'?').join(',')})`,ids):[[]];
  const participants=rankQuizParticipants(ids.map(studentId=>{
    const answers=[...state.answers.values()].filter(answer=>Number(answer.studentId)===studentId);
    return {studentId,attemptId:state.attempts.get(studentId),fullName:users.find(user=>Number(user.id)===studentId)?.fullName||'Student',
      score:answers.reduce((sum,answer)=>sum+Number(answer.points||0),0),correctCount:answers.filter(answer=>answer.correct).length,
      totalQuestions:state.questions.length,answeredCount:answers.length,unansweredCount:Math.max(0,state.questions.length-answers.length),...state.finalizedResults?.get(studentId)};
  }));
  const summary={quizId,title:state.title||'Quiz',completedAt:new Date().toISOString(),stopped,rankingScope:'session',participantCount:participants.length,participants};
  const results=new Map();
  for(const row of participants){
    const result=privateQuizCompletion(summary,row.studentId,state.rankingVisibility);
    await pool.execute('UPDATE quiz_attempts SET completion_json=?::jsonb WHERE id=? AND student_id=? AND status=\'completed\'',[JSON.stringify(result),row.attemptId,row.studentId]);
    results.set(row.studentId,result);
  }
  return {summary,results};
}

export function registerQuizCompletionRoutes(app,pool,requireAuth) {
  app.get('/api/student/quiz-completion/:quizId',requireAuth,async(req,res,next)=>{
    try {
      if(req.user.role!=='student')return res.status(403).json({message:'Student access required.'});
      const quizId=Number(req.params.quizId),attemptId=req.query.attemptId==null?null:Number(req.query.attemptId);
      if(!Number.isSafeInteger(quizId)||quizId<=0||(attemptId!==null&&(!Number.isSafeInteger(attemptId)||attemptId<=0)))return res.status(400).json({message:'Choose a valid quiz result.'});
      const [rows]=await pool.execute(`SELECT qa.id AS attemptId,qa.student_id AS studentId,qa.quiz_id AS quizId,q.title,q.ranking_visibility AS rankingVisibility,
        qa.completion_json AS completionJson,qa.completed_at AS completedAt,qa.score,qa.correct_count AS correctCount,qa.total_questions AS totalQuestions
        FROM quiz_attempts qa JOIN quizzes q ON q.id=qa.quiz_id WHERE qa.student_id=? AND qa.quiz_id=? AND qa.status='completed'${attemptId===null?'':' AND qa.id=?'}
        ORDER BY qa.completed_at DESC,qa.id DESC LIMIT 1`,attemptId===null?[req.user.id,quizId]:[req.user.id,quizId,attemptId]);
      if(!rows.length)return res.status(404).json({message:'Your completed quiz result was not found.'});
      const row=rows[0];let summary=typeof row.completionJson==='string'?JSON.parse(row.completionJson):row.completionJson;
      if(!summary){
        // Older attempts have no session snapshot. Label the best-attempt quiz ranking explicitly.
        const [best]=await pool.execute(`SELECT ranked.student_id AS studentId,ranked.score,ranked.correct_count AS correctCount,ranked.total_questions AS totalQuestions,u.full_name AS fullName
          FROM (SELECT qa.*,ROW_NUMBER() OVER(PARTITION BY student_id ORDER BY score DESC,correct_count DESC,id ASC) AS best_rank
          FROM quiz_attempts qa WHERE quiz_id=? AND status='completed') ranked JOIN users u ON u.id=ranked.student_id WHERE ranked.best_rank=1`,[quizId]);
        const participants=rankQuizParticipants(best),own=participants.find(item=>Number(item.studentId)===Number(req.user.id));
        summary={quizId,title:row.title,completedAt:row.completedAt,rankingScope:'quiz_best_attempts',participantCount:participants.length,participants,
          self:{...own,attemptId:row.attemptId,studentId:req.user.id,score:Number(row.score),correctCount:Number(row.correctCount),totalQuestions:Number(row.totalQuestions),percentage:row.totalQuestions?Math.round(Number(row.correctCount)*100/Number(row.totalQuestions)):0}};
      }
      res.set('Cache-Control','private, no-store').json(privateQuizCompletion(summary,req.user.id,row.rankingVisibility));
    }catch(error){next(error)}
  });
}
