// @ts-nocheck
import { buildOverallLeaderboard } from './analytics.js';
import { getAcademySettings } from './academy-settings.js';
import { probationView } from './probation.js';

export function studentRecord(student, score, settings = getAcademySettings()) {
  const probation = probationView(student, settings);
  const scores = Object.fromEntries(['overallScore','quizScore','activityScore','assignmentScore','attendanceScore'].map(key => [key,score?.[key] ?? null]));
  for (const key of ['categoriesCounted','quizCount','activityCount','assignmentCount','attendanceCount']) scores[key] = score?.[key] ?? 0;
  return {...student,overallScore:scores.overallScore,scores,probation,accountStatus:student.status === 'approved' ? (probation.onProbation ? 'probation' : 'active') : student.status};
}

export function registerStudentDirectoryRoutes(app,pool,requireAuth,requireStaff,scoreboard = buildOverallLeaderboard) {
  app.get('/api/staff/students',requireAuth,requireStaff,async(_req,res,next)=>{
    try {
      const [[rows],data] = await Promise.all([
        pool.query(`SELECT id,full_name AS fullName,email,phone,gender,country,state_city AS stateCity,
          employment_status AS employmentStatus,educational_level AS educationalLevel,course_choice AS courseChoice,
          learning_mode AS learningMode,tech_experience AS techExperience,experience_level AS experienceLevel,
          learning_goal AS learningGoal,status,is_class_rep AS isClassRep,profile_picture AS profilePicture,
          created_at AS createdAt,last_signed_in_at AS lastSignedInAt,probation_started_at AS probationStartedAt,
          probation_due_at AS probationDueAt,probation_policy AS probationPolicy,probation_score AS overallScore,
          probation_checked_at AS checkedAt FROM users WHERE role='student' AND status='approved' ORDER BY full_name`),
        scoreboard(pool)
      ]);
      const scores = new Map(data.leaderboard.map(row => [Number(row.id),row]));
      res.set('Cache-Control','private, no-store').json(rows.map(row => studentRecord(row,scores.get(Number(row.id)))));
    } catch(error) {next(error)}
  });
}
