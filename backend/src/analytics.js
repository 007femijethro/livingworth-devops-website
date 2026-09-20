export function registerAnalyticsRoutes(app, pool, requireAuth, requireStaff) {
  app.get('/api/staff/overall-leaderboard', requireAuth, requireStaff, async (_req, res, next) => {
    try {
      const [[students], [quizAttempts], [assignmentResults], [attendanceRows]] = await Promise.all([
        pool.query("SELECT id, full_name AS fullName, email FROM users WHERE role = 'student' AND status = 'approved' ORDER BY full_name, id"),
        pool.query(`SELECT student_id AS studentId, quiz_id AS quizId, correct_count AS correctCount, total_questions AS totalQuestions
          FROM quiz_attempts WHERE status = 'completed' AND total_questions > 0`),
        pool.query(`SELECT s.student_id AS studentId, s.score, a.max_score AS maxScore
          FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
          WHERE s.status = 'completed' AND s.score IS NOT NULL AND a.max_score > 0`),
        pool.query("SELECT student_id AS studentId, status FROM attendance")
      ]);

      const quizByStudent = new Map();
      for (const attempt of quizAttempts) {
        const studentId = Number(attempt.studentId);
        const quizzes = quizByStudent.get(studentId) || new Map();
        const score = Math.round(Number(attempt.correctCount) * 100 / Number(attempt.totalQuestions));
        quizzes.set(Number(attempt.quizId), Math.max(score, quizzes.get(Number(attempt.quizId)) ?? 0));
        quizByStudent.set(studentId, quizzes);
      }
      const assignmentsByStudent = new Map();
      for (const result of assignmentResults) {
        const studentId = Number(result.studentId);
        const totals = assignmentsByStudent.get(studentId) || { earned: 0, possible: 0, count: 0 };
        totals.earned += Number(result.score || 0); totals.possible += Number(result.maxScore || 0); totals.count += 1;
        assignmentsByStudent.set(studentId, totals);
      }
      const attendanceByStudent = new Map();
      for (const record of attendanceRows) {
        const studentId = Number(record.studentId);
        const totals = attendanceByStudent.get(studentId) || { attended: 0, counted: 0 };
        if (record.status !== 'excused') {
          totals.counted += 1;
          if (['present', 'late'].includes(record.status)) totals.attended += 1;
        }
        attendanceByStudent.set(studentId, totals);
      }

      const leaderboard = students.map(student => {
        const quizzes = quizByStudent.get(Number(student.id));
        const assignment = assignmentsByStudent.get(Number(student.id));
        const attendance = attendanceByStudent.get(Number(student.id));
        const quizScore = quizzes?.size ? Math.round([...quizzes.values()].reduce((sum, score) => sum + score, 0) / quizzes.size) : null;
        const assignmentScore = assignment?.possible ? Math.round(assignment.earned * 100 / assignment.possible) : null;
        const attendanceScore = attendance?.counted ? Math.round(attendance.attended * 100 / attendance.counted) : null;
        const available = [quizScore, assignmentScore, attendanceScore].filter(score => score !== null);
        return {
          id: Number(student.id), fullName: student.fullName, email: student.email,
          quizScore, quizCount: quizzes?.size || 0,
          assignmentScore, assignmentCount: assignment?.count || 0,
          attendanceScore, attendanceCount: attendance?.counted || 0,
          categoriesCounted: available.length,
          overallScore: available.length ? Math.round(available.reduce((sum, score) => sum + score, 0) / available.length) : null
        };
      }).sort((left, right) => right.categoriesCounted - left.categoriesCounted
        || (right.overallScore ?? -1) - (left.overallScore ?? -1) || left.fullName.localeCompare(right.fullName));
      const ranked = leaderboard.filter(student => student.overallScore !== null);
      res.json({
        scoring: { quiz: 'Best attempt per quiz, averaged', assignment: 'Points earned divided by points possible', attendance: 'Present or late divided by counted sessions', overall: 'Equal average of available categories' },
        summary: {
          students: students.length, ranked: ranked.length,
          classAverage: ranked.length ? Math.round(ranked.reduce((sum, student) => sum + student.overallScore, 0) / ranked.length) : null
        },
        leaderboard
      });
    } catch (error) { next(error); }
  });

  app.get('/api/staff/dashboard', requireAuth, requireStaff, async (_req, res, next) => {
    try {
      const [[studentCount], [attendance], [today], [quiz], [topics], [assignmentCounts], [learners], [announcements]] = await Promise.all([
        pool.query("SELECT COUNT(*) AS total FROM users WHERE role = 'student' AND status = 'approved'"),
        pool.query(`SELECT COUNT(*) AS total, SUM(status IN ('present','late')) AS attended
          FROM attendance WHERE status <> 'excused' AND session_date >= CURDATE() - INTERVAL 30 DAY`),
        pool.query(`SELECT COUNT(*) AS marked, SUM(status IN ('present','late')) AS attended
          FROM attendance WHERE session_date = CURDATE()`),
        pool.query(`SELECT COUNT(*) AS attempts, ROUND(AVG(correct_count * 100 / NULLIF(total_questions, 0))) AS average
          FROM quiz_attempts WHERE status = 'completed'`),
        pool.query(`SELECT COALESCE(lm.title, 'Unlinked material') AS topic, COUNT(*) AS answers, ROUND(SUM(qaa.is_correct) * 100 / COUNT(*)) AS percentage
          FROM quiz_attempt_answers qaa JOIN quiz_attempts qa ON qa.id = qaa.attempt_id
          JOIN quizzes q ON q.id = qa.quiz_id LEFT JOIN learning_materials lm ON lm.id = q.material_id
          WHERE qa.status = 'completed' GROUP BY lm.id, lm.title ORDER BY percentage ASC, answers DESC LIMIT 3`),
        pool.query(`SELECT
          SUM(CASE WHEN a.due_at < NOW() AND (s.id IS NULL OR s.status <> 'completed') THEN 1 ELSE 0 END) AS overdue,
          SUM(CASE WHEN s.id IS NULL OR s.status <> 'completed' THEN 1 ELSE 0 END) AS outstanding
          FROM users u CROSS JOIN assignments a LEFT JOIN assignment_submissions s
          ON s.student_id = u.id AND s.assignment_id = a.id
          WHERE u.role = 'student' AND u.status = 'approved'`),
        pool.query(`SELECT u.id, u.full_name AS fullName, u.email,
          COUNT(DISTINCT CASE WHEN at.status <> 'excused' THEN at.id END) AS sessions,
          ROUND(SUM(at.status IN ('present','late')) * 100 / NULLIF(COUNT(DISTINCT CASE WHEN at.status <> 'excused' THEN at.id END), 0)) AS attendance,
          ROUND(AVG(CASE WHEN qa.status = 'completed' THEN qa.correct_count * 100 / NULLIF(qa.total_questions, 0) END)) AS quizAverage,
          COUNT(DISTINCT CASE WHEN a.due_at < NOW() AND (sub.id IS NULL OR sub.status <> 'completed') THEN a.id END) AS overdue
          FROM users u
          LEFT JOIN attendance at ON at.student_id = u.id AND at.session_date >= CURDATE() - INTERVAL 30 DAY
          LEFT JOIN quiz_attempts qa ON qa.student_id = u.id
          LEFT JOIN assignments a ON TRUE
          LEFT JOIN assignment_submissions sub ON sub.student_id = u.id AND sub.assignment_id = a.id
          WHERE u.role = 'student' AND u.status = 'approved' GROUP BY u.id`),
        pool.query(`SELECT id, title, category, created_at AS createdAt FROM announcements
          ORDER BY created_at DESC LIMIT 4`)
      ]);
      const attention = learners.map(learner => {
        const reasons = [];
        if (Number(learner.sessions) > 0 && Number(learner.attendance) < 75) reasons.push(`Attendance ${learner.attendance}%`);
        if (learner.quizAverage != null && Number(learner.quizAverage) < 50) reasons.push(`Quiz average ${learner.quizAverage}%`);
        if (Number(learner.overdue) > 0) reasons.push(`${learner.overdue} overdue assignment${Number(learner.overdue) === 1 ? '' : 's'}`);
        return { ...learner, reasons };
      }).filter(learner => learner.reasons.length).sort((a, b) => b.reasons.length - a.reasons.length);
      const attendanceTotal = Number(attendance[0].total || 0);
      res.json({
        metrics: {
          students: Number(studentCount[0].total || 0),
          attendanceRate: attendanceTotal ? Math.round(Number(attendance[0].attended || 0) * 100 / attendanceTotal) : 0,
          todayMarked: Number(today[0].marked || 0), todayAttended: Number(today[0].attended || 0),
          quizAverage: Number(quiz[0].average || 0), quizAttempts: Number(quiz[0].attempts || 0),
          overdue: Number(assignmentCounts[0].overdue || 0), outstanding: Number(assignmentCounts[0].outstanding || 0)
        },
        attention, weakestTopics: topics, announcements
      });
    } catch (error) { next(error); }
  });
}
