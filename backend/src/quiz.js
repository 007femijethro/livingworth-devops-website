const rooms = new Map();
const MIN_QUESTION_SECONDS = 5;
const MAX_QUESTION_SECONDS = 300;

function validQuestionTime(value, fallback = 30) {
  if (value === undefined || value === null || value === '') return fallback;
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < MIN_QUESTION_SECONDS || seconds > MAX_QUESTION_SECONDS) {
    throw new Error(`Question time must be between ${MIN_QUESTION_SECONDS} and ${MAX_QUESTION_SECONDS} seconds.`);
  }
  return seconds;
}

function joinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function validateQuestions(title, questions) {
  if (!title?.trim() || !Array.isArray(questions) || !questions.length) throw new Error('A title and at least one question are required.');
  return questions.map((question, index) => {
    const options = Array.isArray(question.options) ? question.options.map(option => String(option || '').trim()) : [];
    const correctIndex = Number(question.correctIndex);
    if (!question.prompt?.trim() || options.length !== 4 || options.some(option => !option) || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      throw new Error(`Question ${index + 1} is incomplete.`);
    }
    return { prompt: question.prompt.trim(), topic: String(question.topic || 'General').trim() || 'General', options, correctIndex };
  });
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

async function createQuiz(pool, adminId, title, questions, requestedQuestionTime) {
  const validQuestions = validateQuestions(title, questions);
  const questionTimeSeconds = validQuestionTime(requestedQuestionTime);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const code = joinCode();
    const [result] = await connection.execute('INSERT INTO quizzes (title, join_code, question_time_seconds, created_by) VALUES (?, ?, ?, ?)', [title.trim(), code, questionTimeSeconds, adminId]);
    for (let i = 0; i < validQuestions.length; i += 1) {
      const q = validQuestions[i];
      await connection.execute('INSERT INTO quiz_questions (quiz_id, prompt, topic, options_json, correct_index, sequence_no) VALUES (?, ?, ?, ?, ?, ?)', [result.insertId, q.prompt, q.topic, JSON.stringify(q.options), q.correctIndex, i + 1]);
    }
    await connection.commit();
    return { id: result.insertId, title: title.trim(), joinCode: code, status: 'draft', questionCount: validQuestions.length, questionTimeSeconds };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export function registerQuizRoutes(app, pool, requireAuth, requireStaff) {
  app.get('/api/admin/quizzes', requireAuth, requireStaff, async (_req, res, next) => {
    try { const [rows] = await pool.query('SELECT q.id, q.title, q.join_code AS joinCode, q.status, q.allow_retakes AS allowRetakes, q.question_time_seconds AS questionTimeSeconds, COUNT(qq.id) AS questionCount FROM quizzes q LEFT JOIN quiz_questions qq ON qq.quiz_id=q.id GROUP BY q.id ORDER BY q.created_at DESC'); res.json(rows); } catch (e) { next(e); }
  });
  app.get('/api/admin/quizzes/:id', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const [quizzes] = await pool.execute('SELECT id, title, status, question_time_seconds AS questionTimeSeconds FROM quizzes WHERE id = ?', [req.params.id]);
      if (!quizzes.length) return res.status(404).json({ message: 'Quiz not found.' });
      const [questions] = await pool.execute('SELECT id, prompt, topic, options_json AS options, correct_index AS correctIndex, sequence_no AS sequenceNo FROM quiz_questions WHERE quiz_id = ? ORDER BY sequence_no', [req.params.id]);
      res.json({ ...quizzes[0], questions: questions.map(question => ({ ...question, options: typeof question.options === 'string' ? JSON.parse(question.options) : question.options })) });
    } catch (error) { next(error); }
  });
  app.post('/api/admin/quizzes', requireAuth, requireStaff, async (req, res, next) => {
    try { res.status(201).json(await createQuiz(pool, req.user.id, req.body.title, req.body.questions, req.body.questionTimeSeconds)); } catch (e) { if (e.message.includes('required') || e.message.includes('incomplete') || e.message.includes('Question time')) return res.status(400).json({message:e.message}); next(e); }
  });
  app.post('/api/admin/quizzes/import', requireAuth, requireStaff, async (req, res, next) => {
    try { res.status(201).json(await createQuiz(pool, req.user.id, req.query.title || 'Imported DevOps Quiz', parseCsv(req.body), req.query.questionTimeSeconds)); } catch (e) { return res.status(400).json({message:e.message}); }
  });
  app.put('/api/admin/quizzes/:id', requireAuth, requireStaff, async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      const questions = validateQuestions(req.body.title, req.body.questions);
      const questionTimeSeconds = validQuestionTime(req.body.questionTimeSeconds);
      await connection.beginTransaction();
      const [quizzes] = await connection.execute(`SELECT q.status, COUNT(qa.id) AS attempts FROM quizzes q
        LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id WHERE q.id = ? GROUP BY q.id`, [req.params.id]);
      if (!quizzes.length) { await connection.rollback(); return res.status(404).json({ message: 'Quiz not found.' }); }
      if (quizzes[0].status === 'live' || Number(quizzes[0].attempts) > 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'A live or previously attempted quiz cannot be edited because that would change saved results.' });
      }
      await connection.execute('UPDATE quizzes SET title = ?, question_time_seconds = ? WHERE id = ?', [req.body.title.trim(), questionTimeSeconds, req.params.id]);
      await connection.execute('DELETE FROM quiz_questions WHERE quiz_id = ?', [req.params.id]);
      for (let index = 0; index < questions.length; index += 1) {
        const question = questions[index];
        await connection.execute('INSERT INTO quiz_questions (quiz_id, prompt, topic, options_json, correct_index, sequence_no) VALUES (?, ?, ?, ?, ?, ?)', [req.params.id, question.prompt, question.topic, JSON.stringify(question.options), question.correctIndex, index + 1]);
      }
      await connection.commit();
      res.json({ message: 'Quiz and questions updated.' });
    } catch (error) {
      await connection.rollback();
      if (error.message.includes('required') || error.message.includes('incomplete') || error.message.includes('Question time')) return res.status(400).json({ message: error.message });
      next(error);
    } finally { connection.release(); }
  });
  app.delete('/api/admin/quizzes/:id', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const state = rooms.get(Number(req.params.id));
      if (state) return res.status(400).json({ message: 'End the live quiz before deleting it.' });
      const [result] = await pool.execute("DELETE FROM quizzes WHERE id = ? AND status <> 'live'", [req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Quiz not found or currently live.' });
      res.json({ message: 'Quiz, questions and saved results deleted.' });
    } catch (error) { next(error); }
  });
  app.get('/api/quizzes/active', requireAuth, async (_req, res, next) => {
    try { const [rows] = await pool.query("SELECT id, title, join_code AS joinCode, status, question_time_seconds AS questionTimeSeconds FROM quizzes WHERE status IN ('lobby','live') ORDER BY id DESC"); res.json(rows); } catch (e) { next(e); }
  });
  app.patch('/api/admin/quizzes/:id/settings', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const allowRetakes = req.body.allowRetakes === undefined ? null : Boolean(req.body.allowRetakes);
      const questionTimeSeconds = req.body.questionTimeSeconds === undefined ? null : validQuestionTime(req.body.questionTimeSeconds);
      if (allowRetakes === null && questionTimeSeconds === null) return res.status(400).json({ message: 'Choose a quiz setting to update.' });
      if (questionTimeSeconds !== null) {
        const [quizzes] = await pool.execute('SELECT status FROM quizzes WHERE id = ?', [req.params.id]);
        if (!quizzes.length) return res.status(404).json({ message: 'Quiz not found.' });
        if (quizzes[0].status === 'live') return res.status(400).json({ message: 'Quiz time cannot be changed while the quiz is live.' });
      }
      const [result] = await pool.execute('UPDATE quizzes SET allow_retakes = COALESCE(?, allow_retakes), question_time_seconds = COALESCE(?, question_time_seconds) WHERE id = ?', [allowRetakes, questionTimeSeconds, req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Quiz not found.' });
      res.json({ message: questionTimeSeconds !== null ? `Quiz time changed to ${questionTimeSeconds} seconds per question.` : allowRetakes ? 'Retakes enabled.' : 'Retakes disabled.' });
    } catch (error) {
      if (error.message.includes('Question time')) return res.status(400).json({ message: error.message });
      next(error);
    }
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
      (SELECT COUNT(*) FROM quiz_attempt_answers saved_answer WHERE saved_answer.attempt_id = qa.id) AS answeredCount,
      ROUND(qa.correct_count * 100 / NULLIF(qa.total_questions, 0)) AS percentage
      FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id JOIN users u ON u.id = qa.student_id
      WHERE ${where.join(' AND ')} ORDER BY qa.completed_at DESC`, params);
    for (const attempt of attempts) {
      attempt.answeredCount = Number(attempt.answeredCount || 0);
      attempt.unansweredCount = Math.max(0, Number(attempt.totalQuestions || 0) - attempt.answeredCount);
      attempt.passed = Number(attempt.percentage || 0) >= 50;
    }
    const percentages = attempts.map(row => Number(row.percentage || 0));
    const topicWhere = ["qa.status = 'completed'"];
    const topicParams = [];
    if (quizId) { topicWhere.push('qa.quiz_id = ?'); topicParams.push(quizId); }
    if (student) { topicWhere.push('(u.full_name LIKE ? OR u.email LIKE ?)'); const term = `%${student}%`; topicParams.push(term, term); }
    const [topics] = await pool.execute(`SELECT qq.topic, COUNT(*) AS answers, SUM(qaa.is_correct) AS correct,
      ROUND(SUM(qaa.is_correct) * 100 / COUNT(*)) AS percentage
      FROM quiz_attempt_answers qaa JOIN quiz_attempts qa ON qa.id = qaa.attempt_id
      JOIN quiz_questions qq ON qq.id = qaa.question_id JOIN users u ON u.id = qa.student_id
      WHERE ${topicWhere.join(' AND ')} GROUP BY qq.topic ORDER BY percentage ASC`, topicParams);
    const [questionStats] = await pool.execute(`SELECT qq.id, qq.sequence_no AS sequenceNo, qq.prompt, qq.topic,
      COUNT(DISTINCT qa.id) AS attempts, COUNT(qaa.id) AS answered,
      SUM(CASE WHEN qaa.is_correct THEN 1 ELSE 0 END) AS correct
      FROM quiz_attempts qa JOIN users u ON u.id = qa.student_id
      JOIN quiz_questions qq ON qq.quiz_id = qa.quiz_id
      LEFT JOIN quiz_attempt_answers qaa ON qaa.attempt_id = qa.id AND qaa.question_id = qq.id
      WHERE ${topicWhere.join(' AND ')}
      GROUP BY qq.id ORDER BY qq.sequence_no`, topicParams);
    const hardestQuestions = questionStats.map(question => {
      const total = Number(question.attempts || 0), answered = Number(question.answered || 0), correct = Number(question.correct || 0);
      return { ...question, attempts: total, answered, correct, unanswered: Math.max(0, total - answered), percentage: total ? Math.round(correct * 100 / total) : 0 };
    }).sort((left, right) => left.percentage - right.percentage || right.unanswered - left.unanswered).slice(0, 5);
    const answered = questionStats.reduce((sum, question) => sum + Number(question.answered || 0), 0);
    const possibleAnswers = attempts.reduce((sum, attempt) => sum + Number(attempt.totalQuestions || 0), 0);
    const passed = percentages.filter(percentage => percentage >= 50).length;
    const summary = {
      attempts: attempts.length,
      participants: new Set(attempts.map(attempt => attempt.studentId)).size,
      average: percentages.length ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length) : 0,
      highest: percentages.length ? Math.max(...percentages) : 0,
      lowest: percentages.length ? Math.min(...percentages) : 0,
      passed,
      passRate: percentages.length ? Math.round(passed * 100 / percentages.length) : 0,
      answered,
      unanswered: Math.max(0, possibleAnswers - answered)
    };
    const leaderboard = [...attempts].sort((a, b) => Number(b.percentage) - Number(a.percentage) || b.score - a.score).slice(0, 10);
    return { attempts, summary, topics, hardestQuestions, leaderboard };
  }
  app.get('/api/staff/quiz-results', requireAuth, requireStaff, async (req, res, next) => {
    try { res.json(await staffResults(req.query)); } catch (error) { next(error); }
  });
  app.get('/api/staff/quiz-results/export', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const result = await staffResults(req.query);
      const columns = ['title','studentName','email','attemptNo','correctCount','answeredCount','unansweredCount','totalQuestions','percentage','passed','score','averageResponseMs','completedAt'];
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

  const questionPayload = state => {
    const question = state.questions[state.index];
    if (!question) return null;
    const endsAt = state.phase === 'paused' ? Date.now() + state.remainingMs : state.startedAt + state.questionMs;
    return { id: question.id, index: state.index, total: state.questions.length, prompt: question.prompt, options: question.options, endsAt };
  };

  const liveStateFor = (state, userId) => {
    if (!state) return null;
    const question = state.questions[state.index];
    if (!question) return null;
    const answer = state.answers.get(`${question.id}:${userId}`);
    return {
      question: questionPayload(state),
      selectedAnswer: answer?.answerIndex ?? null,
      correctIndex: state.phase === 'reveal' ? question.correctIndex : null,
      phase: state.phase,
      remainingMs: state.phase === 'paused' ? state.remainingMs : Math.max(0, state.startedAt + state.questionMs - Date.now())
    };
  };

  const revealQuestion = async quizId => {
    const state = rooms.get(Number(quizId));
    const question = state?.questions[state.index];
    if (!state || !question || state.phase === 'reveal') return;
    clearTimeout(state.timer);
    state.timer = null;
    state.phase = 'reveal';
    state.remainingMs = 0;
    io.to(`quiz:${quizId}`).emit('quiz:reveal', { correctIndex: question.correctIndex, leaderboard: await leaderboard(pool, quizId, state.answers) });
  };

  const sendQuestion = async (quizId) => {
    const state = rooms.get(quizId);
    if (!state) return;
    if (state.index >= state.questions.length) {
      await finalizeAttempts(pool, state);
      await pool.execute("UPDATE quizzes SET status='completed' WHERE id=?", [quizId]);
      io.to(`quiz:${quizId}`).emit('quiz:completed', { leaderboard: await leaderboard(pool, quizId, state.answers) });
      rooms.delete(quizId);
      return;
    }
    const question = state.questions[state.index];
    state.startedAt = Date.now();
    state.phase = 'answering';
    state.remainingMs = state.questionMs;
    state.questionAnswers = new Set();
    io.to(`quiz:${quizId}`).emit('quiz:question', questionPayload(state));
    state.timer = setTimeout(() => revealQuestion(quizId), state.questionMs);
  };

  io.on('connection', socket => {
    socket.on('quiz:join', async ({ joinCode: requestedCode }, ack = () => {}) => {
      try {
        const code = String(requestedCode || '').trim().toUpperCase();
        const [rows] = await pool.execute("SELECT id,title,join_code AS joinCode,status,allow_retakes AS allowRetakes,question_time_seconds AS questionTimeSeconds FROM quizzes WHERE join_code=? AND status IN ('draft','lobby','live')", [code]);
        if (!rows.length) throw new Error('Quiz room not found.');
        const quiz = rows[0];
        if (socket.user.role === 'student' && !quiz.allowRetakes) {
          const [done] = await pool.execute("SELECT id FROM quiz_attempts WHERE quiz_id=? AND student_id=? AND status='completed' LIMIT 1", [quiz.id, socket.user.id]);
          if (done.length) throw new Error('You have already completed this quiz.');
        }
        let state = rooms.get(Number(quiz.id));
        if (quiz.status === 'live' && !state) {
          await pool.execute("UPDATE quizzes SET status='lobby' WHERE id=?", [quiz.id]);
          quiz.status = 'lobby';
        }
        socket.join(`quiz:${quiz.id}`);
        socket.data.quizId = quiz.id;
        if (quiz.status === 'draft') await pool.execute("UPDATE quizzes SET status='lobby' WHERE id=?", [quiz.id]);
        state = rooms.get(Number(quiz.id));
        const liveState = liveStateFor(state, socket.user.id);
        if (liveState && liveState.selectedAnswer !== null) state.questionAnswers.add(`${liveState.question.id}:${socket.user.id}`);
        ack({ ok: true, quiz: { id: quiz.id, title: quiz.title, joinCode: quiz.joinCode, questionTimeSeconds: quiz.questionTimeSeconds, status: quiz.status === 'draft' ? 'lobby' : quiz.status }, liveState });
        io.to(`quiz:${quiz.id}`).emit('quiz:presence', { count: (await io.in(`quiz:${quiz.id}`).fetchSockets()).length });
      } catch (error) { ack({ ok: false, message: error.message }); }
    });

    socket.on('quiz:start', async ({ quizId }, ack = () => {}) => {
      try {
        if (!['admin', 'mentor'].includes(socket.user.role)) throw new Error('Staff access required.');
        if (rooms.has(Number(quizId))) throw new Error('This quiz is already running.');
        const [quizRows] = await pool.execute('SELECT question_time_seconds AS questionTimeSeconds FROM quizzes WHERE id=?', [quizId]);
        if (!quizRows.length) throw new Error('Quiz not found.');
        const [rows] = await pool.execute('SELECT id,prompt,topic,options_json AS options,correct_index AS correctIndex FROM quiz_questions WHERE quiz_id=? ORDER BY sequence_no', [quizId]);
        const questions = rows.map(question => ({ ...question, options: typeof question.options === 'string' ? JSON.parse(question.options) : question.options }));
        if (!questions.length) throw new Error('This quiz has no questions.');
        await pool.execute("UPDATE quizzes SET status='live' WHERE id=?", [quizId]);
        const state = { questions, index: 0, answers: new Map(), questionAnswers: new Set(), attempts: new Map(), startedAt: 0, timer: null, phase: 'answering', remainingMs: 0, questionMs: validQuestionTime(quizRows[0].questionTimeSeconds) * 1000 };
        rooms.set(Number(quizId), state);
        io.to(`quiz:${quizId}`).emit('quiz:started', { questionCount: questions.length, questionTimeSeconds: state.questionMs / 1000 });
        sendQuestion(Number(quizId));
        ack({ ok: true });
      } catch (error) { ack({ ok: false, message: error.message }); }
    });

    socket.on('quiz:answer', async ({ quizId, questionId, answerIndex }, ack = () => {}) => {
      try {
        if (socket.user.role !== 'student' || socket.user.status !== 'approved') throw new Error('Approved student access required.');
        const state = rooms.get(Number(quizId));
        const question = state?.questions[state.index];
        if (!state || !question || state.phase !== 'answering' || question.id !== questionId || Date.now() > state.startedAt + state.questionMs) throw new Error('This question is closed.');
        const selectedIndex = Number(answerIndex);
        if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= question.options.length) throw new Error('Choose a valid answer.');
        const key = `${questionId}:${socket.user.id}`;
        if (state.questionAnswers.has(key)) throw new Error('Answer already submitted.');
        state.questionAnswers.add(key);
        const responseMs = Date.now() - state.startedAt, correct = selectedIndex === question.correctIndex;
        state.answers.set(key, { studentId: socket.user.id, answerIndex: selectedIndex, correct, responseMs });
        const attemptId = await ensureAttempt(pool, state, quizId, socket.user.id);
        await pool.execute('INSERT INTO quiz_attempt_answers (attempt_id,question_id,answer_index,is_correct,response_ms) VALUES (?,?,?,?,?) ON CONFLICT (attempt_id, question_id) DO UPDATE SET answer_index=EXCLUDED.answer_index,is_correct=EXCLUDED.is_correct,response_ms=EXCLUDED.response_ms', [attemptId, questionId, selectedIndex, correct, responseMs]);
        ack({ ok: true });
      } catch (error) { ack({ ok: false, message: error.message }); }
    });

    socket.on('quiz:pause', async ({ quizId }, ack = () => {}) => {
      try {
        if (!['admin', 'mentor'].includes(socket.user.role)) throw new Error('Staff access required.');
        const state = rooms.get(Number(quizId));
        if (!state) throw new Error('Live quiz not found.');
        if (state.phase === 'answering') {
          state.remainingMs = Math.max(0, state.startedAt + state.questionMs - Date.now());
          clearTimeout(state.timer);
          state.timer = null;
          if (state.remainingMs <= 0) {
            await revealQuestion(quizId);
            return ack({ ok: true, phase: 'reveal' });
          }
          state.phase = 'paused';
          io.to(`quiz:${quizId}`).emit('quiz:paused', { remainingMs: state.remainingMs });
          return ack({ ok: true, phase: 'paused' });
        }
        if (state.phase === 'paused') {
          state.startedAt = Date.now() - (state.questionMs - state.remainingMs);
          state.phase = 'answering';
          state.timer = setTimeout(() => revealQuestion(quizId), state.remainingMs);
          const endsAt = state.startedAt + state.questionMs;
          io.to(`quiz:${quizId}`).emit('quiz:resumed', { endsAt });
          return ack({ ok: true, phase: 'answering' });
        }
        throw new Error('Move to the next question before using the timer.');
      } catch (error) { ack({ ok: false, message: error.message }); }
    });

    socket.on('quiz:reveal-now', async ({ quizId }, ack = () => {}) => {
      try {
        if (!['admin', 'mentor'].includes(socket.user.role)) throw new Error('Staff access required.');
        const state = rooms.get(Number(quizId));
        if (!state) throw new Error('Live quiz not found.');
        if (state.phase === 'reveal') throw new Error('The answer is already revealed.');
        await revealQuestion(quizId);
        ack({ ok: true });
      } catch (error) { ack({ ok: false, message: error.message }); }
    });

    socket.on('quiz:next', async ({ quizId }, ack = () => {}) => {
      try {
        if (!['admin', 'mentor'].includes(socket.user.role)) throw new Error('Staff access required.');
        const state = rooms.get(Number(quizId));
        if (!state) throw new Error('Live quiz not found.');
        if (state.phase !== 'reveal') throw new Error('Reveal the correct answer before moving on.');
        state.index += 1;
        await sendQuestion(Number(quizId));
        ack({ ok: true, completed: !rooms.has(Number(quizId)) });
      } catch (error) { ack({ ok: false, message: error.message }); }
    });

    socket.on('quiz:restart', async ({ quizId }, ack = () => {}) => {
      try {
        if (!['admin', 'mentor'].includes(socket.user.role)) throw new Error('Staff access required.');
        const state = rooms.get(Number(quizId));
        if (!state) throw new Error('Live quiz not found.');
        clearTimeout(state.timer);
        await pool.execute("DELETE FROM quiz_attempts WHERE quiz_id = ? AND status = 'in_progress'", [quizId]);
        state.index = 0;
        state.answers = new Map();
        state.questionAnswers = new Set();
        state.attempts = new Map();
        state.remainingMs = state.questionMs;
        io.to(`quiz:${quizId}`).emit('quiz:restarted');
        await sendQuestion(Number(quizId));
        ack({ ok: true });
      } catch (error) { ack({ ok: false, message: error.message }); }
    });
  });
}
