const rooms = new Map();
const QUESTION_MS = 30_000;
const REVEAL_MS = 3_000;

function joinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i += 1; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows[0]?.[0]?.toLowerCase().includes('question')) rows.shift();
  return rows.map((r, index) => {
    if (r.length < 6) throw new Error(`CSV row ${index + 2} must contain question, four options and correct answer.`);
    const correct = Number(r[5]) - 1;
    if (correct < 0 || correct > 3) throw new Error(`CSV row ${index + 2} correct answer must be 1, 2, 3 or 4.`);
    return { prompt: r[0], options: r.slice(1, 5), correctIndex: correct };
  });
}

async function createQuiz(pool, adminId, title, questions) {
  if (!title?.trim() || !Array.isArray(questions) || !questions.length) throw new Error('A title and at least one question are required.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const code = joinCode();
    const [result] = await connection.execute('INSERT INTO quizzes (title, join_code, created_by) VALUES (?, ?, ?)', [title.trim(), code, adminId]);
    for (let i = 0; i < questions.length; i += 1) {
      const q = questions[i];
      if (!q.prompt?.trim() || !Array.isArray(q.options) || q.options.length !== 4 || q.correctIndex < 0 || q.correctIndex > 3) throw new Error(`Question ${i + 1} is incomplete.`);
      await connection.execute('INSERT INTO quiz_questions (quiz_id, prompt, options_json, correct_index, sequence_no) VALUES (?, ?, ?, ?, ?)', [result.insertId, q.prompt.trim(), JSON.stringify(q.options.map(String)), q.correctIndex, i + 1]);
    }
    await connection.commit();
    return { id: result.insertId, title: title.trim(), joinCode: code, status: 'draft', questionCount: questions.length };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export function registerQuizRoutes(app, pool, requireAuth, requireStaff) {
  app.get('/api/admin/quizzes', requireAuth, requireStaff, async (_req, res, next) => {
    try { const [rows] = await pool.query('SELECT q.id, q.title, q.join_code AS joinCode, q.status, COUNT(qq.id) AS questionCount FROM quizzes q LEFT JOIN quiz_questions qq ON qq.quiz_id=q.id GROUP BY q.id ORDER BY q.created_at DESC'); res.json(rows); } catch (e) { next(e); }
  });
  app.post('/api/admin/quizzes', requireAuth, requireStaff, async (req, res, next) => {
    try { res.status(201).json(await createQuiz(pool, req.user.id, req.body.title, req.body.questions)); } catch (e) { if (e.message.includes('required') || e.message.includes('incomplete')) return res.status(400).json({message:e.message}); next(e); }
  });
  app.post('/api/admin/quizzes/import', requireAuth, requireStaff, async (req, res, next) => {
    try { res.status(201).json(await createQuiz(pool, req.user.id, req.query.title || 'Imported DevOps Quiz', parseCsv(req.body))); } catch (e) { return res.status(400).json({message:e.message}); }
  });
  app.get('/api/quizzes/active', requireAuth, async (_req, res, next) => {
    try { const [rows] = await pool.query("SELECT id, title, join_code AS joinCode, status FROM quizzes WHERE status IN ('lobby','live') ORDER BY id DESC"); res.json(rows); } catch (e) { next(e); }
  });
}

async function leaderboard(pool, quizId, answers) {
  const scores = {};
  for (const answer of answers.values()) scores[answer.studentId] = (scores[answer.studentId] || 0) + (answer.correct ? 1000 + Math.max(0, 300 - Math.floor(answer.responseMs / 100)) : 0);
  const ids = Object.keys(scores); if (!ids.length) return [];
  const [users] = await pool.query(`SELECT id, full_name AS fullName FROM users WHERE id IN (${ids.map(()=>'?').join(',')})`, ids);
  return users.map(u=>({studentId:u.id,fullName:u.fullName,score:scores[u.id]||0})).sort((a,b)=>b.score-a.score).slice(0,20);
}

export function configureQuizSockets(io, pool, verifyToken) {
  io.use((socket, next) => { try { socket.user = verifyToken(socket.handshake.auth?.token); next(); } catch { next(new Error('Authentication required')); } });
  const sendQuestion = async (quizId) => {
    const state = rooms.get(quizId); if (!state) return;
    if (state.index >= state.questions.length) { await pool.execute("UPDATE quizzes SET status='completed' WHERE id=?",[quizId]); io.to(`quiz:${quizId}`).emit('quiz:completed',{leaderboard:await leaderboard(pool,quizId,state.answers)}); rooms.delete(quizId); return; }
    const q=state.questions[state.index]; state.startedAt=Date.now(); state.questionAnswers=new Set();
    io.to(`quiz:${quizId}`).emit('quiz:question',{id:q.id,index:state.index,total:state.questions.length,prompt:q.prompt,options:q.options,endsAt:state.startedAt+QUESTION_MS});
    state.timer=setTimeout(async()=>{io.to(`quiz:${quizId}`).emit('quiz:reveal',{correctIndex:q.correctIndex,leaderboard:await leaderboard(pool,quizId,state.answers)});state.index+=1;state.timer=setTimeout(()=>sendQuestion(quizId),REVEAL_MS)},QUESTION_MS);
  };
  io.on('connection', socket => {
    socket.on('quiz:join', async ({joinCode}, ack=()=>{}) => { try { const [rows]=await pool.execute("SELECT id,title,status FROM quizzes WHERE join_code=? AND status IN ('draft','lobby','live')",[String(joinCode||'').toUpperCase()]);if(!rows.length)throw new Error('Quiz room not found.');const quiz=rows[0];socket.join(`quiz:${quiz.id}`);socket.data.quizId=quiz.id;if(quiz.status==='draft')await pool.execute("UPDATE quizzes SET status='lobby' WHERE id=?",[quiz.id]);ack({ok:true,quiz:{id:quiz.id,title:quiz.title,status:quiz.status==='draft'?'lobby':quiz.status}});io.to(`quiz:${quiz.id}`).emit('quiz:presence',{count:(await io.in(`quiz:${quiz.id}`).fetchSockets()).length});}catch(e){ack({ok:false,message:e.message})} });
    socket.on('quiz:start', async ({quizId}, ack=()=>{}) => { try { if(!['admin','mentor'].includes(socket.user.role))throw new Error('Staff access required.');const [rows]=await pool.execute('SELECT id,prompt,options_json AS options,correct_index AS correctIndex FROM quiz_questions WHERE quiz_id=? ORDER BY sequence_no',[quizId]);const questions=rows.map(q=>({...q,options:typeof q.options==='string'?JSON.parse(q.options):q.options}));if(!questions.length)throw new Error('This quiz has no questions.');await pool.execute("UPDATE quizzes SET status='live' WHERE id=?",[quizId]);const state={questions,index:0,answers:new Map(),questionAnswers:new Set(),startedAt:0,timer:null};rooms.set(Number(quizId),state);io.to(`quiz:${quizId}`).emit('quiz:started',{questionCount:questions.length});sendQuestion(Number(quizId));ack({ok:true});}catch(e){ack({ok:false,message:e.message})} });
    socket.on('quiz:answer', async ({quizId,questionId,answerIndex}, ack=()=>{}) => { try { if(socket.user.role!=='student'||socket.user.status!=='approved')throw new Error('Approved student access required.');const state=rooms.get(Number(quizId));const q=state?.questions[state.index];if(!state||!q||q.id!==questionId||Date.now()>state.startedAt+QUESTION_MS)throw new Error('This question is closed.');const key=`${questionId}:${socket.user.id}`;if(state.questionAnswers.has(key))throw new Error('Answer already submitted.');state.questionAnswers.add(key);const responseMs=Date.now()-state.startedAt,correct=Number(answerIndex)===q.correctIndex;state.answers.set(key,{studentId:socket.user.id,correct,responseMs});await pool.execute('INSERT INTO quiz_answers (quiz_id,question_id,student_id,answer_index,is_correct,response_ms) VALUES (?,?,?,?,?,?)',[quizId,questionId,socket.user.id,answerIndex,correct,responseMs]);ack({ok:true});}catch(e){ack({ok:false,message:e.message})} });
  });
}
