import { randomInt } from 'node:crypto';
export function validLifelineLimit(value: unknown = 0): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0 || limit > 10) throw new Error('Lifeline limit must be a whole number from 0 to 10.');
  return limit;
}
export const lifelineTypes = ['fifty_fifty','free_pass','audience'] as const;
export function validLifelineLimits(value: any, total: number) {
  if (value === undefined || value === null) return Object.fromEntries(lifelineTypes.map(type=>[type,total]));
  let limits=value;
  if (typeof limits==='string') {try{limits=JSON.parse(limits);}catch{throw new Error('Lifeline maxima must be a valid settings object.');}}
  if(!limits || Array.isArray(limits) || typeof limits!=='object' || Object.keys(limits).length!==3 || Object.keys(limits).some(key=>!lifelineTypes.includes(key as any))) throw new Error('Lifeline settings must include a maximum for each of the three types.');
  for(const type of lifelineTypes) if(typeof limits[type]!=='number' || !Number.isInteger(limits[type]) || limits[type]<0 || limits[type]>10) throw new Error('Lifeline maxima must be whole numbers from 0 to 10.');
  return Object.fromEntries(lifelineTypes.map(type=>[type,limits[type]]));
}
export function lifelineEffect(type: string, question: any, answers: Map<string, any>, studentId: number) {
  const choice = !['typed','multiple_selection'].includes(question.questionType);
  if (type === 'fifty_fifty') {
    if (!choice || question.options.length !== 4) throw new Error('50:50 is available on four-option single-answer questions only.');
    const wrong = question.options.map((_: unknown,i: number)=>i).filter((i: number)=>i!==question.correctIndex);
    const keptWrong = wrong[randomInt(wrong.length)];
    return {hiddenIndexes:wrong.filter((i: number)=>i!==keptWrong)};
  }
  if (type === 'free_pass') {
    return question.questionType === 'typed' ? {answerText:question.correctText} : question.questionType === 'multiple_selection' ? {answerIndexes:question.correctAnswers} : {answerIndex:question.correctIndex};
  }
  if (type === 'audience') {
    if (!choice) throw new Error('Audience is available on single-answer and true/false questions only.');
    const counts = question.options.map(()=>0);
    for (const [key,answer] of answers) if (key.startsWith(`${question.id}:`) && Number(answer.studentId)!==Number(studentId) && Number.isInteger(answer.answerIndex) && answer.answerIndex>=0 && answer.answerIndex<counts.length) counts[answer.answerIndex]++;
    const maximum = Math.max(...counts);
    if (!maximum) throw new Error('No audience answers yet. Try again after other learners answer; no lifeline was used.');
    const leaders = counts.map((n: number,i: number)=>n===maximum?i:-1).filter((i: number)=>i>=0);
    if (leaders.length!==1) throw new Error('Audience answers are tied. Try again later; no lifeline was used.');
    return {answerIndex:leaders[0],votes:maximum,totalVotes:counts.reduce((a: number,b: number)=>a+b,0)};
  }
  throw new Error('Choose a valid lifeline.');
}
export async function lifelineStatus(db: any, attemptId: number, questionId: number, limit: number, limits?: any) {
  const [rows] = await db.execute('SELECT question_id AS questionId, lifeline_type AS type, effect_json AS effect FROM quiz_lifeline_uses WHERE attempt_id=?', [attemptId]);
  const current = rows.find((row: any)=>Number(row.questionId)===Number(questionId));
  const caps=validLifelineLimits(limits,limit), remaining=Math.max(0,limit-rows.length);
  const byType=Object.fromEntries(lifelineTypes.map(type=>{const used=rows.filter((row:any)=>row.type===type).length;return [type,{limit:caps[type],used,remaining:Math.min(remaining,Math.max(0,caps[type]-used))}];}));
  return {limit,used:rows.length,remaining,byType,questionId,current:current?{type:current.type,effect:typeof current.effect==='string'?JSON.parse(current.effect):current.effect}:null};
}
