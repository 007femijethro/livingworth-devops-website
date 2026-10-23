// @ts-nocheck
import { buildOverallLeaderboard } from './analytics.js';
import { studentRecord } from './student-records.js';
import { getAcademySettings } from './academy-settings.js';
function number(value) {
  return Number(value || 0);
}

function learnerStanding({ attendance, materials, quizzes, assignments }) {
  const needsAttention = [];
  if (attendance.counted > 0 && attendance.percentage < getAcademySettings().attendanceAlertScore) needsAttention.push(`Attendance is ${attendance.percentage}%`);
  if (quizzes.attempts > 0 && quizzes.average < 50) needsAttention.push(`Quiz average is ${quizzes.average}%`);
  if (assignments.overdue > 0) needsAttention.push(`${assignments.overdue} overdue assignment${assignments.overdue === 1 ? '' : 's'}`);
  if (needsAttention.length) return { label: 'Needs attention', tone: 'attention', reasons: needsAttention };

  const excellent = attendance.counted > 0 && attendance.percentage >= 90
    && materials.total > 0 && materials.percentage >= 80
    && quizzes.attempts > 0 && quizzes.average >= 80
    && assignments.overdue === 0;
  if (excellent) return { label: 'Excellent progress', tone: 'excellent', reasons: ['Strong attendance, learning progress and quiz performance'] };
  return { label: 'On track', tone: 'on_track', reasons: ['No urgent support flags'] };
}

export function registerLearnerProfileRoutes(app, pool, requireAuth, requireStaff, scoreboard = buildOverallLeaderboard) {
  app.get('/api/staff/students/:id/profile', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const studentId = Number(req.params.id);
      if (!Number.isSafeInteger(studentId) || studentId <= 0) return res.status(400).json({ message: 'Choose a valid learner.' });

      const [students] = await pool.execute(`SELECT id, full_name AS fullName, profile_picture AS profilePicture, first_name AS firstName,
        last_name AS lastName, email, phone, gender, country, state_city AS stateCity,
        employment_status AS employmentStatus, educational_level AS educationalLevel,
        course_choice AS courseChoice, learning_mode AS learningMode, tech_experience AS techExperience,
        experience_level AS experienceLevel,learning_goal AS learningGoal,terms_accepted AS termsAccepted,role,status,
        is_class_rep AS isClassRep,must_change_password AS mustChangePassword,rejection_reason AS rejectionReason,
        expelled_reason AS expelledReason,expelled_at AS expelledAt,updated_at AS updatedAt,
        last_signed_in_at AS lastSignedInAt,probation_started_at AS probationStartedAt,probation_due_at AS probationDueAt,
        probation_policy AS probationPolicy,probation_score AS overallScore,probation_checked_at AS checkedAt,
        created_at AS createdAt FROM users WHERE id = ? AND role = 'student'${req.user.role === 'admin' ? '' : " AND status = 'approved'"}`, [studentId]);
      if (!students.length) return res.status(404).json({ message: 'Learner not found.' });

      const [[attendanceRows], [materialRows], [quizRows], [topicRows], [assignmentRows], [activityRows], [classActivityRows], scoreData] = await Promise.all([
        pool.execute(`SELECT held.session_date AS "sessionDate", COALESCE(a.status,'not_recorded') AS status,
          COALESCE(a.note,CASE WHEN a.id IS NULL THEN 'Attendance not recorded' ELSE '' END) AS note,
          a.marked_at AS "markedAt", (a.id IS NOT NULL) AS "attendanceRecorded"
          FROM (SELECT DISTINCT session_date FROM attendance WHERE status IN ('present','late')) held
          LEFT JOIN attendance a ON a.session_date=held.session_date AND a.student_id=?
          ORDER BY held.session_date DESC`, [studentId]),
        pool.execute(`SELECT lm.id AS materialId, lm.title, lm.material_type AS materialType,
          m.week_number AS weekNumber, m.title AS moduleTitle, COALESCE(mp.status, 'not_started') AS status,
          mp.updated_at AS updatedAt FROM learning_materials lm JOIN learning_modules m ON m.id = lm.module_id
          LEFT JOIN material_progress mp ON mp.material_id = lm.id AND mp.student_id = ?
          WHERE m.published = TRUE AND lm.visible = TRUE ORDER BY m.display_order, m.week_number, lm.display_order, lm.id`, [studentId]),
        pool.execute(`SELECT qa.id, q.title, qa.attempt_no AS attemptNo, qa.correct_count AS correctCount,
          qa.total_questions AS totalQuestions,
          ROUND(qa.correct_count * 100 / NULLIF(qa.total_questions, 0)) AS percentage,
          qa.completed_at AS completedAt FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
          WHERE qa.student_id = ? AND qa.status = 'completed' ORDER BY qa.completed_at DESC`, [studentId]),
        pool.execute(`SELECT COALESCE(lm.title, 'Unlinked material') AS topic, COUNT(*) AS answers, SUM(qaa.is_correct) AS correct,
          ROUND(SUM(qaa.is_correct) * 100 / COUNT(*)) AS percentage
          FROM quiz_attempt_answers qaa JOIN quiz_attempts qa ON qa.id = qaa.attempt_id
          JOIN quizzes q ON q.id = qa.quiz_id LEFT JOIN learning_materials lm ON lm.id = q.material_id
          WHERE qa.student_id = ? AND qa.status = 'completed'
          GROUP BY lm.id, lm.title ORDER BY percentage ASC, answers DESC LIMIT 5`, [studentId]),
        pool.execute(`SELECT a.id AS assignmentId, a.title, a.due_at AS dueAt, a.max_score AS maxScore,
          m.week_number AS weekNumber, m.title AS moduleTitle, s.status, s.score, s.feedback,
          s.submission_url AS submissionUrl, s.note, s.submitted_at AS submittedAt, s.reviewed_at AS reviewedAt,
          CASE WHEN s.id IS NOT NULL AND s.submitted_at > a.due_at THEN TRUE ELSE FALSE END AS isLate,
          CASE WHEN a.due_at < NOW() AND (s.id IS NULL OR s.status <> 'completed') THEN TRUE ELSE FALSE END AS overdue
          FROM assignments a JOIN learning_modules m ON m.id = a.module_id
          LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = ?
          WHERE m.published = TRUE ORDER BY m.display_order, a.display_order, a.due_at`, [studentId]),
        pool.execute(`SELECT id, title, message, category, action_target AS actionTarget,
          read_at AS readAt, created_at AS createdAt FROM notifications
          WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`, [studentId]),
        pool.execute(`SELECT aa.id,a.title,m.week_number AS weekNumber,aa.attempt_no AS attemptNo,
          aa.correct_count AS correctCount,aa.total_questions AS totalQuestions,aa.completed_at AS completedAt
          FROM activity_attempts aa JOIN learning_activities a ON a.id=aa.activity_id
          JOIN learning_modules m ON m.id=a.module_id WHERE aa.student_id=? AND aa.completed_at IS NOT NULL
          AND aa.total_questions > 0 AND m.published=TRUE ORDER BY aa.completed_at DESC`,[studentId]),
        scoreboard(pool,{includeInactive:req.user.role==='admin',studentId})
      ]);

      const attendance = {
        present: attendanceRows.filter(row => row.status === 'present').length,
        late: attendanceRows.filter(row => row.status === 'late').length,
        absent: attendanceRows.filter(row => row.status === 'absent').length,
        excused: attendanceRows.filter(row => row.status === 'excused').length,
        notRecorded: attendanceRows.filter(row => row.status === 'not_recorded').length
      };
      attendance.counted = attendance.present + attendance.late + attendance.absent;
      attendance.attended = attendance.present + attendance.late;
      attendance.percentage = attendance.counted ? Math.round(attendance.attended * 100 / attendance.counted) : 0;

      const materials = {
        total: materialRows.length,
        done: materialRows.filter(row => row.status === 'done').length,
        inProgress: materialRows.filter(row => row.status === 'in_progress').length,
        notStarted: materialRows.filter(row => row.status === 'not_started').length
      };
      materials.percentage = materials.total ? Math.round(materials.done * 100 / materials.total) : 0;

      const quizPercentages = quizRows.map(row => number(row.percentage));
      const quizzes = {
        attempts: quizRows.length,
        average: quizPercentages.length ? Math.round(quizPercentages.reduce((sum, value) => sum + value, 0) / quizPercentages.length) : 0,
        highest: quizPercentages.length ? Math.max(...quizPercentages) : 0
      };

      const assignments = {
        total: assignmentRows.length,
        completed: assignmentRows.filter(row => row.status === 'completed').length,
        submitted: assignmentRows.filter(row => row.status === 'submitted').length,
        needsCorrection: assignmentRows.filter(row => row.status === 'needs_correction').length,
        notStarted: assignmentRows.filter(row => !row.status).length,
        overdue: assignmentRows.filter(row => Boolean(row.overdue)).length
      };

      const student = studentRecord(students[0],scoreData.leaderboard.find(row=>Number(row.id)===studentId));
      res.set('Cache-Control','private, no-store').json({
        student,
        scores: student.scores,
        probation: student.probation,
        scoring: scoreData.scoring,
        classActivities: {attempts: classActivityRows.map(row=>({...row,percentage:Math.round(Number(row.correctCount)*100/Number(row.totalQuestions))}))},
        standing: student.accountStatus==='probation' ? {label:'Probation',tone:'attention',reasons:[`Overall score is ${student.scores.overallScore}/100; required score is ${student.probation.threshold}/100`, `Deadline: ${student.probation.dueAt}`]} : student.status==='expelled' ? {label:'Expelled',tone:'attention',reasons:[student.expelledReason||'Admin reinstatement required']} : learnerStanding({ attendance, materials, quizzes, assignments }),
        attendance: { summary: attendance, records: attendanceRows },
        materials: { summary: materials, items: materialRows },
        quizzes: { summary: quizzes, attempts: quizRows, weakestTopics: topicRows },
        assignments: { summary: assignments, items: assignmentRows },
        activity: activityRows
      });
    } catch (error) { next(error); }
  });
}
