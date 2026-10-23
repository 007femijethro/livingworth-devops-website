// @ts-nocheck
export function calendarRange(query, now = new Date()) {
  const from = query.from ? new Date(String(query.from)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = query.to ? new Date(String(query.to)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  if (!Number.isFinite(+from) || !Number.isFinite(+to) || to <= from || +to - +from > 93 * 86400000) throw new Error('Choose a valid calendar range of up to 93 days.');
  return [from.toISOString(), to.toISOString()];
}
export function registerCalendarRoutes(app,pool,requireAuth) {
 app.get('/api/calendar',requireAuth,async(req,res,next)=>{
  let range;try{range=calendarRange(req.query)}catch(error){return res.status(400).json({message:error.message})}
  const staff=['admin','mentor'].includes(req.user.role);
  try{
   const [[classes],[quizzes],[assignments]]=await Promise.all([
    pool.execute(`SELECT id,title,scheduled_at AS startsAt,duration_minutes AS durationMinutes,status FROM live_classes WHERE scheduled_at >= ? AND scheduled_at < ? ORDER BY scheduled_at`,range),
    pool.execute(`SELECT q.id,q.title,COALESCE(q.scheduled_start_at,q.scheduled_at) AS startsAt,q.scheduled_at AS roomOpensAt,q.status FROM quizzes q LEFT JOIN learning_materials lm ON lm.id=q.material_id LEFT JOIN learning_modules m ON m.id=lm.module_id WHERE COALESCE(q.scheduled_start_at,q.scheduled_at) >= ? AND COALESCE(q.scheduled_start_at,q.scheduled_at) < ? ${staff?'':"AND (q.material_id IS NULL OR (lm.visible=TRUE AND m.published=TRUE))"} ORDER BY q.scheduled_at`,range),
    pool.execute(`SELECT a.id,a.title,a.due_at AS startsAt,a.closed_at AS closedAt,m.week_number AS weekNumber,m.title AS moduleTitle ${staff?'':',s.status AS submissionStatus'} FROM assignments a JOIN learning_modules m ON m.id=a.module_id ${staff?'':'LEFT JOIN assignment_submissions s ON s.assignment_id=a.id AND s.student_id=?'} WHERE a.due_at >= ? AND a.due_at < ? ${staff?'':'AND m.published=TRUE'} ORDER BY a.due_at`,staff?range:[req.user.id,...range])
   ]);
   const events=[...classes.map(row=>({...row,type:'class',actionTarget:'Live class',endsAt:new Date(+new Date(row.startsAt)+row.durationMinutes*60000).toISOString()})),...quizzes.map(row=>({...row,type:'quiz',actionTarget:'Live quiz'})),...assignments.map(row=>({...row,type:'assignment',status:row.closedAt?'closed':row.submissionStatus||'due',actionTarget:'Assignments'}))].sort((a,b)=>+new Date(a.startsAt)-+new Date(b.startsAt));
   res.set('Cache-Control','private, no-store').json({events});
  }catch(error){next(error)}
 });
}
