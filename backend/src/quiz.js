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
    return { prompt: r[0], options: r.slice(1, 5), correctIndex: correct, topic: r[6] || 'General' };
  });
}

export async function ensureQuizSchema(pool) {
  const [quizColumns] = await pool.query('SHOW COLUMNS FROM quizzes');
  if (!quizColumns.some(column => column.Field === 'allow_retakes')) await pool.query('ALTER TABLE quizzes ADD COLUMN allow_retakes BOOLEAN NOT NULL DEFAULT FALSE');
  const [questionColumns] = await pool.query('SHOW COLUMNS FROM quiz_questions');
  if (!questionColumns.some(column => column.Field === 'topic')) await pool.query("ALTER TABLE quiz_questions ADD COLUMN topic VARCHAR(120) NOT NULL DEFAULT 'General'");
  await pool.query(`CREATE TABLE IF NOT EXISTS quiz_attempts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, quiz_id INT NOT NULL, student_id INT NOT NULL, attempt_no INT NOT NULL DEFAULT 1,
    status ENUM('in_progress','completed') NOT NULL DEFAULT 'in_progress', score INT NOT NULL DEFAULT 0,
    correct_count INT NOT NULL DEFAULT 0, total_questions INT NOT NULL DEFAULT 0, average_response_ms INT NOT NULL DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMP NULL,
    UNIQUE KEY one_numbered_attempt (quiz_id, student_id, attempt_no),
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE, FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS quiz_attempt_answers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, attempt_id BIGINT NOT NULL, question_id INT NOT NULL,
    answer_index TINYINT NOT NULL, is_correct BOOLEAN NOT NULL, response_ms INT NOT NULL,
    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY one_attempt_answer (attempt_id, question_id),
    FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
  )`);
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
      await connection.execute('INSERT INTO quiz_questions (quiz_id, prompt, topic, options_json, correct_index, sequence_no) VALUES (?, ?, ?, ?, ?, ?)', [result.insertId, q.prompt.trim(), String(q.topic || 'General').trim(), JSON.stringify(q.options.map(String)), q.correctIndex, i + 1]);
    }
    await connection.commit();
    return { id: result.insertId, title: title.trim(), joinCode: code, status: 'draft', questionCount: questions.length };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export function registerQuizRoutes(app, pool, requireAuth, requireStaff) {
  app.get('/api/admin/quizzes', requireAuth, requireStaff, async (_req, res, next) => {
    try { const [rows] = await pool.query('SELECT q.id, q.title, q.join_code AS joinCode, q.status, q.allow_retakes AS allowRetakes, COUNT(qq.id) AS questionCount FROM quizzes q LEFT JOIN quiz_questions qq ON qq.quiz_id=q.id GROUP BY q.id ORDER BY q.created_at DESC'); res.json(rows); } catch (e) { next(e); }
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
  app.patch('/api/admin/quizzes/:id/settings', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const [result] = await pool.execute('UPDATE quizzes SET allow_retakes = ? WHERE id = ?', [Boolean(req.body.allowRetakes), req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Quiz not found.' });
      res.json({ message: req.body.allowRetakes ? 'Retakes enabled.' : 'Retakes disabled.' });
    } catch (error) { next(error); }
  });
  app.post('/api/admin/quizzes/:id/reopen', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const [result] = await pool.execute("UPDATE quizzes SET status = 'lobby' WHERE id = ? AND status = 'completed'", [req.params.id]);
      if (!result.affectedRows) return res.status(400).json({ message: 'Only a completed quiz can be reopened.' });
      res.json({ message: 'Quiz reopened. Students can join using the same code.' });
    } catch (error) { next(error); }
  });
  app.get('/api/student/quiz-results', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      const [attempts] = await pool.execute(`SELECT qa.id, qa.quiz_id AS quizId, q.title, qa.attempt_no AS attemptNo,
        qa.score, qa.correct_count AS correctCount, qa.total_questions AS totalQuestions,
        qa.average_response_ms AS averageResponseMs, qa.completed_at AS completedAt,
        ROUND(qa.correct_count * 100 / NULLIF(qa.total_questions, 0)) AS percentage
        FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
        WHERE qa.student_id = ? AND qa.status = 'completed' ORDER BY qa.completed_at DESC`, [req.user.id]);
      res.json(attempts);
    } catch (error) { next(error); }
  });
  app.get('/api/student/quiz-results/:attemptId', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      const [attempts] = await pool.execute(`SELECT qa.id, q.title, qa.attempt_no AS attemptNo, qa.correct_count AS correctCount,
        qa.total_questions AS totalQuestions, qa.score, qa.average_response_ms AS averageResponseMs,
        qa.completed_at AS completedAt FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
        WHERE qa.id = ? AND qa.student_id = ? AND qa.status = 'completed'`, [req.params.attemptId, req.user.id]);
      if (!attempts.length) return res.status(404).json({ message: 'Quiz result not found.' });
      const [answers] = await pool.execute(`SELECT qq.sequence_no AS sequenceNo, qq.prompt, qq.topic,
        qq.options_json AS options, qq.correct_index AS correctIndex, qaa.answer_index AS answerIndex,
        qaa.is_correct AS isCorrect, qaa.response_ms AS responseMs
        FROM quiz_attempt_answers qaa JOIN quiz_questions qq ON qq.id = qaa.question_id
        WHERE qaa.attempt_id = ? ORDER BY qq.sequence_no`, [req.params.attemptId]);
      res.json({ ...attempts[0], answers: answers.map(answer => ({ ...answer, options: typeof answer.options === 'string' ? JSON.parse(answer.options) : answer.options })) });
    } catch (error) { next(error); }
  });

  async function staffResults(query) {
    const quizId = Number.parseInt(query.quizId, 10) || 0;
    const student = String(query.student || '').trim().slice(0, 100);
    const where = ["qa.status = 'completed'"];
    const params = [];
    if (quizId) { where.push('qa.quiz_id = ?'); params.push(quizId); }
    if (student) { where.push('(u.full_name LIKE ? OR u.email LIKE ?)'); const term = `%${student}%`; params.push(term, term); }
    const [attempts] = await pool.execute(`SELECT qa.id, qa.quiz_id AS quizId, q.title, qa.student_id AS studentId,
      u.full_name AS studentName, u.email, qa.attempt_no AS attemptNo, qa.score,
      qa.correct_count AS correctCount, qa.total_questions AS totalQuestions,
      qa.average_response_ms AS averageResponseMs, qa.completed_at AS completedAt,
      ROUND(qa.correct_count * 100 / NULLIF(qa.total_questions, 0)) AS percentage
      FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id JOIN users u ON u.id = qa.student_id
      WHERE ${where.join(' AND ')} ORDER BY qa.completed_at DESC`, params);
    const percentages = attempts.map(row => Number(row.percentage || 0));
    const summary = { participants: attempts.length, average: percentages.length ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length) : 0, highest: percentages.length ? Math.max(...percentages) : 0, lowest: percentages.length ? Math.min(...percentages) : 0 };
    const topicWhere = ["qa.status = 'completed'"];
    const topicParams = [];
    if (quizId) { topicWhere.push('qa.quiz_id = ?'); topicParams.push(quizId); }
    if (student) { topicWhere.push('(u.full_name LIKE ? OR u.email LIKE ?)'); const term = `%${student}%`; topicParams.push(term, term); }
    const [topics] = await pool.execute(`SELECT qq.topic, COUNT(*) AS answers, SUM(qaa.is_correct) AS correct,
      ROUND(SUM(qaa.is_correct) * 100 / COUNT(*)) AS percentage
      FROM quiz_attempt_answers qaa JOIN quiz_attempts qa ON qa.id = qaa.attempt_id
      JOIN quiz_questions qq ON qq.id = qaa.question_id JOIN users u ON u.id = qa.student_id
      WHERE ${topicWhere.join(' AND ')} GROUP BY qq.topic ORDER BY percentage ASC`, topicParams);
    const leaderboard = [...attempts].sort((a, b) => Number(b.percentage) - Number(a.percentage) || b.score - a.score).slice(0, 10);
    return { attempts, summary, topics, leaderboard };
  }
  app.get('/api/staff/quiz-results', requireAuth, requireStaff, async (req, res, next) => {
    try { res.json(await staffResults(req.query)); } catch (error) { next(error); }
  });
  app.get('/api/staff/quiz-results/export', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const result = await staffResults(req.query);
      const columns = ['title','studentName','email','attemptNo','correctCount','totalQuestions','percentage','score','averageResponseMs','completedAt'];
      const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
      const csv = [columns.join(','), ...result.attempts.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="livingworth-quiz-results.csv"');
      res.send(csv);
    } catch (error) { next(error); }
  });
}

async function leaderboard(pool, quizId, answers) {
  const scores = {};
  for (const answer of answers.values()) scores[answer.studentId] = (scores[answer.studentId] || 0) + (answer.correct ? 1000 + Math.max(0, 300 - Math.floor(answer.responseMs / 100)) : 0);
  const ids = Object.keys(scores); if (!ids.length) return [];
  const [users] = await pool.query(`SELECT id, full_name AS fullName FROM users WHERE id IN (${ids.map(()=>'?').join(',')})`, ids);
  return users.map(u=>({studentId:u.id,fullName:u.fullName,score:scores[u.id]||0})).sort((a,b)=>b.score-a.score).slice(0,20);
}

async function ensureAttempt(pool, state, quizId, studentId) {
  if (state.attempts.has(studentId)) return state.attempts.get(studentId);
  const [open] = await pool.execute("SELECT id FROM quiz_attempts WHERE quiz_id = ? AND student_id = ? AND status = 'in_progress' ORDER BY attempt_no DESC LIMIT 1", [quizId, studentId]);
  if (open.length) { state.attempts.set(studentId, open[0].id); return open[0].id; }
  const [numbers] = await pool.execute('SELECT COALESCE(MAX(attempt_no), 0) + 1 AS attemptNo FROM quiz_attempts WHERE quiz_id = ? AND student_id = ?', [quizId, studentId]);
  const [result] = await pool.execute('INSERT INTO quiz_attempts (quiz_id, student_id, attempt_no) VALUES (?, ?, ?)', [quizId, studentId, numbers[0].attemptNo]);
  state.attempts.set(studentId, result.insertId);
  return result.insertId;
}

async function finalizeAttempts(pool, state) {
  for (const [studentId, attemptId] of state.attempts.entries()) {
    const answers = [...state.answers.values()].filter(answer => answer.studentId === studentId);
    const correct = answers.filter(answer => answer.correct).length;
    const score = answers.reduce((total, answer) => total + (answer.correct ? 1000 + Math.max(0, 300 - Math.floor(answer.responseMs / 100)) : 0), 0);
    const averageResponseMs = answers.length ? Math.round(answers.reduce((total, answer) => total + answer.responseMs, 0) / answers.length) : 0;
    await pool.execute("UPDATE quiz_attempts SET status = 'completed', score = ?, correct_count = ?, total_questions = ?, average_response_ms = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?", [score, correct, state.questions.length, averageResponseMs, attemptId]);
  }
}

export function configureQuizSockets(io, pool, verifyToken) {
  io.use((socket, next) => { try { socket.user = verifyToken(socket.handshake.auth?.token); next(); } catch { next(new Error('Authentication required')); } });
  const sendQuestion = async (quizId) => {
    const state = rooms.get(quizId); if (!state) return;
    if (state.index >= state.questions.length) { await finalizeAttempts(pool, state); await pool.execute("UPDATE quizzes SET status='completed' WHERE id=?",[quizId]); io.to(`quiz:${quizId}`).emit('quiz:completed',{leaderboard:await leaderboard(pool,quizId,state.answers)}); rooms.delete(quizId); return; }
    const q=state.questions[state.index]; state.startedAt=Date.now(); state.questionAnswers=new Set();
    io.to(`quiz:${quizId}`).emit('quiz:question',{id:q.id,index:state.index,total:state.questions.length,prompt:q.prompt,options:q.options,endsAt:state.startedAt+QUESTION_MS});
    state.timer=setTimeout(async()=>{io.to(`quiz:${quizId}`).emit('quiz:reveal',{correctIndex:q.correctIndex,leaderboard:await leaderboard(pool,quizId,state.answers)});state.index+=1;state.timer=setTimeout(()=>sendQuestion(quizId),REVEAL_MS)},QUESTION_MS);
  };
  io.on('connection', socket => {
    socket.on('quiz:join', async ({joinCode}, ack=()=>{}) => { try { const [rows]=await pool.execute("SELECT id,title,status,allow_retakes AS allowRetakes FROM quizzes WHERE join_code=? AND status IN ('draft','lobby','live')",[String(joinCode||'').toUpperCase()]);if(!rows.length)throw new Error('Quiz room not found.');const quiz=rows[0];if(socket.user.role==='student'&&!quiz.allowRetakes){const [done]=await pool.execute("SELECT id FROM quiz_attempts WHERE quiz_id=? AND student_id=? AND status='completed' LIMIT 1",[quiz.id,socket.user.id]);if(done.length)throw new Error('You have already completed this quiz.');}socket.join(`quiz:${quiz.id}`);socket.data.quizId=quiz.id;if(quiz.status==='draft')await pool.execute("UPDATE quizzes SET status='lobby' WHERE id=?",[quiz.id]);ack({ok:true,quiz:{id:quiz.id,title:quiz.title,status:quiz.status==='draft'?'lobby':quiz.status}});io.to(`quiz:${quiz.id}`).emit('quiz:presence',{count:(await io.in(`quiz:${quiz.id}`).fetchSockets()).length});}catch(e){ack({ok:false,message:e.message})} });
    socket.on('quiz:start', async ({quizId}, ack=()=>{}) => { try { if(!['admin','mentor'].includes(socket.user.role))throw new Error('Staff access required.');const [rows]=await pool.execute('SELECT id,prompt,topic,options_json AS options,correct_index AS correctIndex FROM quiz_questions WHERE quiz_id=? ORDER BY sequence_no',[quizId]);const questions=rows.map(q=>({...q,options:typeof q.options==='string'?JSON.parse(q.options):q.options}));if(!questions.length)throw new Error('This quiz has no questions.');await pool.execute("UPDATE quizzes SET status='live' WHERE id=?",[quizId]);const state={questions,index:0,answers:new Map(),questionAnswers:new Set(),attempts:new Map(),startedAt:0,timer:null};rooms.set(Number(quizId),state);io.to(`quiz:${quizId}`).emit('quiz:started',{questionCount:questions.length});sendQuestion(Number(quizId));ack({ok:true});}catch(e){ack({ok:false,message:e.message})} });
    socket.on('quiz:answer', async ({quizId,questionId,answerIndex}, ack=()=>{}) => { try { if(socket.user.role!=='student'||socket.user.status!=='approved')throw new Error('Approved student access required.');const state=rooms.get(Number(quizId));const q=state?.questions[state.index];if(!state||!q||q.id!==questionId||Date.now()>state.startedAt+QUESTION_MS)throw new Error('This question is closed.');const key=`${questionId}:${socket.user.id}`;if(state.questionAnswers.has(key))throw new Error('Answer already submitted.');state.questionAnswers.add(key);const responseMs=Date.now()-state.startedAt,correct=Number(answerIndex)===q.correctIndex;state.answers.set(key,{studentId:socket.user.id,correct,responseMs});const attemptId=await ensureAttempt(pool,state,quizId,socket.user.id);await pool.execute('INSERT INTO quiz_attempt_answers (attempt_id,question_id,answer_index,is_correct,response_ms) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE answer_index=VALUES(answer_index),is_correct=VALUES(is_correct),response_ms=VALUES(response_ms)',[attemptId,questionId,answerIndex,correct,responseMs]);ack({ok:true});}catch(e){ack({ok:false,message:e.message})} });
  });
}
