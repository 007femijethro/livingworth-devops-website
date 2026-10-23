// @ts-nocheck
import {getAcademySettings} from './academy-settings.js';
/** Select once at sign-in. The signed token pins this activity for the session. */
export async function nextSignInActivity(db, studentId) {
  if (!getAcademySettings().signInActivityRequired) return null;
  const [rows] = await db.execute(`SELECT a.id FROM learning_activities a
    JOIN learning_modules m ON m.id = a.module_id
    WHERE m.published = TRUE
      AND EXISTS (SELECT 1 FROM activity_questions q WHERE q.activity_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM activity_attempts t WHERE t.activity_id = a.id AND t.student_id = ?)
    ORDER BY m.week_number, m.display_order, a.id LIMIT 1`, [studentId]);
  return rows.length ? Number(rows[0].id) : null;
}

export async function activitySessionStatus(db, user) {
  // Existing sessions are grandfathered until the next actual sign-in.
  if (!getAcademySettings().signInActivityRequired || user.role !== 'student' || !user.activityRequiredId) return { required: false, activity: null };
  const [rows] = await db.execute(`SELECT a.id, a.title, m.week_number AS weekNumber
    FROM learning_activities a JOIN learning_modules m ON m.id = a.module_id
    WHERE a.id = ? AND m.published = TRUE
      AND EXISTS (SELECT 1 FROM activity_questions q WHERE q.activity_id = a.id)
      AND NOT EXISTS (SELECT 1 FROM activity_attempts t WHERE t.activity_id = a.id AND t.student_id = ?)`,
    [user.activityRequiredId, user.id]);
  return { required: rows.length > 0, activity: rows[0] || null };
}

export function activityGateExempt(path) {
  return /^\/api\/(auth(?:\/|$)|profile-picture(?:\/|$)|profile-change-requests(?:\/|$)|push(?:\/|$))/.test(path)
    || path === '/api/student/activity-session' || path === '/api/student/probation'
    || /^\/api\/student\/class-activities(?:\/|$)/.test(path);
}
