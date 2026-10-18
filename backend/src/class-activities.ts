// @ts-nocheck
import { logger } from './logger.js';

const QUESTION_TYPES = new Set(['single_choice', 'multiple_selection', 'true_false', 'short_answer']);

function parseJson(value, fallback = []) {
  if (typeof value === 'string') { try { return JSON.parse(value); } catch { return fallback; } }
  return value ?? fallback;
}

function normalizeAnswer(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/g, '');
}

function validateQuiz(title, instructions, questions) {
  if (!String(title || '').trim() || String(title).trim().length > 180) throw new Error('Add a class activity title (up to 180 characters).');
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 50) throw new Error('Add between 1 and 50 questions.');
  return questions.map((question, index) => {
    const questionType = QUESTION_TYPES.has(question.questionType) ? question.questionType : '';
    const prompt = String(question.prompt || '').trim();
    const options = questionType === 'true_false' ? ['True', 'False'] : (Array.isArray(question.options) ? question.options.map(value => String(value || '').trim()) : []);
    const correctIndex = Number(question.correctIndex);
    const correctAnswers = [...new Set((Array.isArray(question.correctAnswers) ? question.correctAnswers : []).map(Number))].sort((a, b) => a - b);
    const correctText = String(question.correctText || '').trim().slice(0, 500);
    const badOptions = ['single_choice', 'multiple_selection'].includes(questionType) && (options.length < 2 || options.length > 6 || options.some(option => !option));
    const badSingle = questionType === 'single_choice' && (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length);
    const badMulti = questionType === 'multiple_selection' && (!correctAnswers.length || correctAnswers.some(answer => !Number.isInteger(answer) || answer < 0 || answer >= options.length));
    if (!questionType || !prompt || prompt.length > 1200 || badOptions || badSingle || badMulti || (questionType === 'short_answer' && !correctText)) throw new Error(`Question ${index + 1} is incomplete.`);
    return {
      prompt, questionType, options, correctIndex: questionType === 'single_choice' ? correctIndex : null,
      correctAnswers: questionType === 'multiple_selection' ? correctAnswers : [],
      correctText: questionType === 'short_answer' ? correctText : null,
      explanation: String(question.explanation || '').trim().slice(0, 1500)
    };
  });
}

async function materialsFor(pool, moduleId, studentId = null) {
  const [materials] = studentId
    ? await pool.execute(`SELECT lm.id, lm.title, lm.material_type AS materialType, lm.resource_url AS resourceUrl,
        lm.lesson_content AS lessonContent, lm.original_name AS originalName,
        COALESCE(mp.status, 'not_started') AS progressStatus
        FROM learning_materials lm LEFT JOIN material_progress mp ON mp.material_id = lm.id AND mp.student_id = ?
        WHERE lm.module_id = ? AND lm.visible = TRUE ORDER BY lm.display_order, lm.created_at, lm.id`, [studentId, moduleId])
    : await pool.execute(`SELECT id, title, material_type AS materialType, resource_url AS resourceUrl,
        lesson_content AS lessonContent, original_name AS originalName, visible
        FROM learning_materials WHERE module_id = ? ORDER BY display_order, created_at, id`, [moduleId]);
  return materials;
}

async function questionsFor(pool, activityId, includeAnswers = false) {
  const [questions] = await pool.execute(`SELECT id, prompt, question_type AS questionType,
    options_json AS options, correct_index AS correctIndex, correct_answers_json AS correctAnswers,
    correct_text AS correctText, explanation, sequence_no AS sequenceNo
    FROM activity_questions WHERE activity_id = ? ORDER BY sequence_no`, [activityId]);
  return questions.map(question => {
    const result = { ...question, options: parseJson(question.options), correctAnswers: parseJson(question.correctAnswers) };
    if (!includeAnswers) { delete result.correctIndex; delete result.correctAnswers; delete result.correctText; delete result.explanation; }
    return result;
  });
}

async function priorWeeksComplete(pool, studentId, currentModule) {
  const [modules] = await pool.execute(`SELECT id FROM learning_modules WHERE published = TRUE
    AND (display_order < ? OR (display_order = ? AND week_number < ?)) ORDER BY display_order, week_number`,
    [currentModule.displayOrder, currentModule.displayOrder, currentModule.weekNumber]);
  for (const module of modules) {
    const materials = await materialsFor(pool, module.id, studentId);
    if (!materials.every(item => item.progressStatus === 'done')) return false;
    const [assignments] = await pool.execute(`SELECT a.assignment_type AS assignmentType, a.closed_at AS closedAt,
      s.id AS submissionId FROM assignments a LEFT JOIN assignment_submissions s
      ON s.assignment_id = a.id AND s.student_id = ? WHERE a.module_id = ?`, [studentId, module.id]);
    if (!assignments.filter(item => item.assignmentType !== 'manual').every(item => Boolean(item.closedAt || item.submissionId))) return false;
    const [activities] = await pool.execute(`SELECT a.id FROM learning_activities a WHERE a.module_id = ?`, [module.id]);
    if (activities.length) {
      const [attempts] = await pool.execute(`SELECT id FROM activity_attempts WHERE activity_id = ? AND student_id = ? LIMIT 1`, [activities[0].id, studentId]);
      if (!attempts.length) return false;
    }
  }
  return true;
}

export function registerClassActivityRoutes(app, pool, requireAuth, requireStaff) {
  app.get('/api/staff/class-activities', requireAuth, requireStaff, async (_req, res, next) => {
    try {
      const [modules] = await pool.query(`SELECT id, week_number AS weekNumber, title, summary, published
        FROM learning_modules ORDER BY display_order, week_number`);
      const result = [];
      for (const module of modules) {
        const [activities] = await pool.execute(`SELECT id, title, instructions, allow_retakes AS allowRetakes
          FROM learning_activities WHERE module_id = ?`, [module.id]);
        const activity = activities[0] || null;
        const materials = await materialsFor(pool, module.id);
        const [stats] = activity ? await pool.execute(`SELECT COUNT(*) AS attempts,
          COUNT(DISTINCT student_id) AS students, COALESCE(ROUND(AVG(score)), 0) AS averageScore
          FROM activity_attempts WHERE activity_id = ?`, [activity.id]) : [[{ attempts: 0, students: 0, averageScore: 0 }]];
        result.push({ ...module, materials, activity: activity ? { ...activity, questions: await questionsFor(pool, activity.id, true), stats: stats[0] } : null });
      }
      res.json(result);
    } catch (error) { next(error); }
  });

  app.put('/api/staff/class-activities/:moduleId', requireAuth, requireStaff, async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      const [modules] = await connection.execute('SELECT id, week_number AS weekNumber FROM learning_modules WHERE id = ?', [req.params.moduleId]);
      if (!modules.length) { await connection.rollback(); return res.status(404).json({ message: 'Learning week not found.' }); }
      const questions = validateQuiz(req.body.title, req.body.instructions, req.body.questions);
      await connection.beginTransaction();
      const [activities] = await connection.execute('SELECT id FROM learning_activities WHERE module_id = ? FOR UPDATE', [req.params.moduleId]);
      let activityId = activities[0]?.id;
      if (activityId) {
        const [attempts] = await connection.execute('SELECT COUNT(*) AS count FROM activity_attempts WHERE activity_id = ?', [activityId]);
        if (Number(attempts[0].count) > 0) { await connection.rollback(); return res.status(409).json({ message: 'This activity already has learner attempts, so its questions are locked to protect saved results.' }); }
        await connection.execute('UPDATE learning_activities SET title = ?, instructions = ?, allow_retakes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [String(req.body.title).trim(), String(req.body.instructions || '').trim(), Boolean(req.body.allowRetakes), activityId]);
        await connection.execute('DELETE FROM activity_questions WHERE activity_id = ?', [activityId]);
      } else {
        const [inserted] = await connection.execute('INSERT INTO learning_activities (module_id, title, instructions, created_by, allow_retakes) VALUES (?, ?, ?, ?, ?)', [req.params.moduleId, String(req.body.title).trim(), String(req.body.instructions || '').trim(), req.user.id, Boolean(req.body.allowRetakes)]);
        activityId = inserted.insertId;
      }
      for (let index = 0; index < questions.length; index += 1) {
        const question = questions[index];
        await connection.execute(`INSERT INTO activity_questions
          (activity_id, prompt, question_type, options_json, correct_index, correct_answers_json, correct_text, explanation, sequence_no)
          VALUES (?, ?, ?, ?::jsonb, ?, ?::jsonb, ?, ?, ?)`, [activityId, question.prompt, question.questionType, JSON.stringify(question.options), question.correctIndex, JSON.stringify(question.correctAnswers), question.correctText, question.explanation, index + 1]);
      }
      await connection.commit();
      res.json({ message: `Week ${modules[0].weekNumber} class activity saved with ${questions.length} questions.` });
    } catch (error) {
      await connection.rollback();
      if (error.message.startsWith('Add ') || error.message.startsWith('Question ')) return res.status(400).json({ message: error.message });
      next(error);
    } finally { connection.release(); }
  });

  app.delete('/api/staff/class-activities/:moduleId', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const [result] = await pool.execute('DELETE FROM learning_activities WHERE module_id = ?', [req.params.moduleId]);
      if (!result.affectedRows) return res.status(404).json({ message: 'This week has no class activity.' });
      res.json({ message: 'Class activity removed from this week.' });
    } catch (error) { next(error); }
  });

  app.get('/api/staff/class-activities/:moduleId/results', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const [rows] = await pool.execute(`SELECT aa.id, aa.student_id AS studentId, u.full_name AS studentName,
        u.email, aa.attempt_no AS attemptNo, aa.score, aa.correct_count AS correctCount,
        aa.total_questions AS totalQuestions, aa.completed_at AS completedAt
        FROM learning_activities a JOIN activity_attempts aa ON aa.activity_id = a.id
        JOIN users u ON u.id = aa.student_id WHERE a.module_id = ? ORDER BY aa.completed_at DESC`, [req.params.moduleId]);
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.get('/api/staff/class-activities/attempts/:attemptId', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const [rows] = await pool.execute(`SELECT id, student_id AS studentId, attempt_no AS attemptNo,
        score, correct_count AS correctCount, total_questions AS totalQuestions, completed_at AS completedAt
        FROM activity_attempts WHERE id = ?`, [req.params.attemptId]);
      if (!rows.length) return res.status(404).json({ message: 'Class activity attempt not found.' });
      const answers = await reviewFor(pool, req.params.attemptId);
      res.json({ ...rows[0], answers });
    } catch (error) { next(error); }
  });

  app.get('/api/student/class-activities', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      const [modules] = await pool.query(`SELECT id, week_number AS weekNumber, title, summary
        FROM learning_modules WHERE published = TRUE ORDER BY display_order, week_number`);
      const result = [];
      let previousComplete = true;
      for (const module of modules) {
        const materials = await materialsFor(pool, module.id, req.user.id);
        const materialsDone = materials.every(item => item.progressStatus === 'done');
        const [assignments] = await pool.execute(`SELECT a.assignment_type AS assignmentType, a.closed_at AS closedAt,
          s.id AS submissionId FROM assignments a LEFT JOIN assignment_submissions s
          ON s.assignment_id = a.id AND s.student_id = ? WHERE a.module_id = ?`, [req.user.id, module.id]);
        const assignmentWorkDone = assignments.filter(item => item.assignmentType !== 'manual')
          .every(item => Boolean(item.closedAt || item.submissionId));
        const [activityRows] = await pool.execute(`SELECT a.id, a.title, a.instructions, a.allow_retakes AS allowRetakes,
          (SELECT COUNT(*) FROM activity_attempts aa WHERE aa.activity_id = a.id AND aa.student_id = ?) AS attemptCount,
          (SELECT aa.id FROM activity_attempts aa WHERE aa.activity_id = a.id AND aa.student_id = ? ORDER BY aa.attempt_no DESC LIMIT 1) AS lastAttemptId
          FROM learning_activities a WHERE a.module_id = ?`, [req.user.id, req.user.id, module.id]);
        const activity = activityRows[0] || null;
        let lastAttempt = null;
        if (activity?.lastAttemptId) {
          const [attempts] = await pool.execute(`SELECT id, attempt_no AS attemptNo, score, correct_count AS correctCount,
            total_questions AS totalQuestions, completed_at AS completedAt FROM activity_attempts WHERE id = ?`, [activity.lastAttemptId]);
          lastAttempt = attempts[0] || null;
        }
        const weekComplete = materialsDone && assignmentWorkDone && (!activity || Boolean(lastAttempt));
        if (activity) {
          activity.canStart = previousComplete && materialsDone && (!lastAttempt || Boolean(activity.allowRetakes));
          activity.attemptCount = Number(activity.attemptCount || 0);
          activity.lastAttempt = lastAttempt;
          activity.questions = activity.canStart ? await questionsFor(pool, activity.id, false) : [];
          activity.review = lastAttempt ? await reviewFor(pool, lastAttempt.id) : [];
          result.push({ ...module, materialsDone, activity });
        }
        previousComplete = previousComplete && weekComplete;
        if (!previousComplete) break;
      }
      res.json(result);
    } catch (error) { next(error); }
  });

  app.post('/api/student/class-activities/:activityId/submit', requireAuth, async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      const [activities] = await connection.execute(`SELECT a.id, a.module_id AS moduleId, a.title, a.allow_retakes AS allowRetakes,
        m.week_number AS weekNumber, m.display_order AS displayOrder FROM learning_activities a JOIN learning_modules m ON m.id = a.module_id
        WHERE a.id = ? AND m.published = TRUE`, [req.params.activityId]);
      if (!activities.length) return res.status(404).json({ message: 'Class activity is not available.' });
      const activity = activities[0];
      if (!await priorWeeksComplete(connection, req.user.id, activity)) return res.status(409).json({ message: 'Finish the earlier published weeks before taking this class activity.' });
      const [materials] = await connection.execute(`SELECT lm.id, COALESCE(mp.status, 'not_started') AS progressStatus
        FROM learning_materials lm LEFT JOIN material_progress mp ON mp.material_id = lm.id AND mp.student_id = ?
        WHERE lm.module_id = ? AND lm.visible = TRUE`, [req.user.id, activity.moduleId]);
      if (!materials.every(item => item.progressStatus === 'done')) return res.status(409).json({ message: 'Complete all visible materials for this week before starting the class activity.' });
      const [questions] = await connection.execute(`SELECT id, prompt, question_type AS questionType,
        options_json AS options, correct_index AS correctIndex, correct_answers_json AS correctAnswers,
        correct_text AS correctText, explanation, sequence_no AS sequenceNo
        FROM activity_questions WHERE activity_id = ? ORDER BY sequence_no`, [activity.id]);
      if (!questions.length) return res.status(409).json({ message: 'The mentor has not finished setting up this class activity yet.' });
      const [priorAttempts] = await connection.execute('SELECT COUNT(*) AS count, COALESCE(MAX(attempt_no), 0) AS latest FROM activity_attempts WHERE activity_id = ? AND student_id = ?', [activity.id, req.user.id]);
      if (Number(priorAttempts[0].count) && !activity.allowRetakes) return res.status(409).json({ message: 'You have already completed this class activity.' });
      const submittedAnswers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
      const grades = questions.map(question => {
        const raw = submittedAnswers[String(question.id)];
        const answer = question.questionType === 'multiple_selection'
          ? [...new Set((Array.isArray(raw) ? raw : []).map(Number))].sort((a, b) => a - b)
          : question.questionType === 'single_choice' || question.questionType === 'true_false' ? Number.isInteger(Number(raw)) ? Number(raw) : null
            : String(raw ?? '').trim().slice(0, 1000);
        const correctAnswers = parseJson(question.correctAnswers);
        const isCorrect = question.questionType === 'single_choice' || question.questionType === 'true_false'
          ? answer === Number(question.correctIndex)
          : question.questionType === 'multiple_selection'
            ? JSON.stringify(answer) === JSON.stringify([...correctAnswers].map(Number).sort((a, b) => a - b))
            : normalizeAnswer(answer) !== '' && String(question.correctText || '').split('|').some(expected => normalizeAnswer(expected) === normalizeAnswer(answer));
        return { question, answer, isCorrect, options: parseJson(question.options), correctAnswers };
      });
      await connection.beginTransaction();
      const attemptNo = Number(priorAttempts[0].latest || 0) + 1;
      const correctCount = grades.filter(item => item.isCorrect).length;
      const score = Math.round(correctCount * 100 / grades.length);
      const [created] = await connection.execute(`INSERT INTO activity_attempts
        (activity_id, student_id, attempt_no, score, correct_count, total_questions) VALUES (?, ?, ?, ?, ?, ?)`,
        [activity.id, req.user.id, attemptNo, score, correctCount, grades.length]);
      for (const item of grades) await connection.execute(`INSERT INTO activity_attempt_answers
        (attempt_id, question_id, answer_json, is_correct) VALUES (?, ?, ?::jsonb, ?)`, [created.insertId, item.question.id, JSON.stringify(item.answer), item.isCorrect]);
      await connection.commit();
      res.json({ message: `Class activity completed: ${correctCount}/${grades.length} correct.`, score, correctCount, totalQuestions: grades.length, review: grades.map(item => ({
        prompt: item.question.prompt, questionType: item.question.questionType, options: item.options, answer: item.answer,
        correctIndex: item.question.correctIndex, correctAnswers: item.correctAnswers, correctText: item.question.correctText,
        isCorrect: item.isCorrect, explanation: item.question.explanation
      })) });
    } catch (error) {
      await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'This attempt was already recorded. Reload the class activity page.' });
      next(error);
    } finally { connection.release(); }
  });
}

async function reviewFor(pool, attemptId) {
  const [rows] = await pool.execute(`SELECT q.prompt, q.question_type AS questionType, q.options_json AS options,
    q.correct_index AS correctIndex, q.correct_answers_json AS correctAnswers, q.correct_text AS correctText,
    q.explanation, aa.answer_json AS answer, aa.is_correct AS isCorrect
    FROM activity_attempt_answers aa JOIN activity_questions q ON q.id = aa.question_id
    WHERE aa.attempt_id = ? ORDER BY q.sequence_no`, [attemptId]);
  return rows.map(row => ({ ...row, options: parseJson(row.options), correctAnswers: parseJson(row.correctAnswers), answer: parseJson(row.answer) }));
}
