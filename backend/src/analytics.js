export function registerAnalyticsRoutes(app, pool, requireAuth, requireStaff) {
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
        pool.query(`SELECT qq.topic, COUNT(*) AS answers, ROUND(SUM(qaa.is_correct) * 100 / COUNT(*)) AS percentage
          FROM quiz_attempt_answers qaa JOIN quiz_attempts qa ON qa.id = qaa.attempt_id
          JOIN quiz_questions qq ON qq.id = qaa.question_id WHERE qa.status = 'completed'
          GROUP BY qq.topic ORDER BY percentage ASC, answers DESC LIMIT 3`),
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
