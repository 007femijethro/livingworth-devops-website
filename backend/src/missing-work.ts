import type { Server } from 'node:http';
type Queryable = { query(sql: string): Promise<[any[], ...unknown[]]> };
import { logger } from './logger.js';

const candidates = `
SELECT u.id AS student_id, 'assignment' AS kind, a.id AS work_id, a.title, a.max_score AS max_points
FROM lw_users u CROSS JOIN lw_assignments a JOIN lw_learning_modules m ON m.id=a.module_id
WHERE u.role='student' AND u.status='approved' AND m.published=TRUE AND a.assignment_type='portal'
  AND a.due_at < CURRENT_TIMESTAMP AND u.created_at <= a.due_at
  AND NOT EXISTS (SELECT 1 FROM lw_assignment_submissions s WHERE s.assignment_id=a.id AND s.student_id=u.id)
UNION ALL
SELECT u.id, 'quiz', q.id, q.title, 100
FROM lw_users u CROSS JOIN lw_quizzes q
LEFT JOIN lw_learning_materials lm ON lm.id=q.material_id
LEFT JOIN lw_learning_modules m ON m.id=lm.module_id
WHERE u.role='student' AND u.status='approved' AND q.status='completed'
  AND (q.material_id IS NULL OR m.published=TRUE)
  AND u.created_at <= COALESCE(q.scheduled_started_at,
    (SELECT MAX(qa.completed_at) FROM lw_quiz_attempts qa WHERE qa.quiz_id=q.id AND qa.status='completed'), q.created_at)
  AND NOT EXISTS (SELECT 1 FROM lw_quiz_attempts qa WHERE qa.quiz_id=q.id AND qa.student_id=u.id AND qa.status='completed')
`;

export async function missingWork(pool: Queryable) {
  const [rows] = await pool.query(`SELECT student_id AS studentId, kind, work_id AS workId, title, max_points AS maxPoints FROM (${candidates}) missing`);
  return rows;
}

export async function sendMissingWorkAlerts(pool: Queryable) {
  // Reserve each alert and create its in-app notification atomically, including across server restarts.
  await pool.query(`WITH missing AS (${candidates}), sent AS (
    INSERT INTO lw_missing_work_alerts (student_id, kind, work_id)
    SELECT student_id, kind, work_id FROM missing
    ON CONFLICT DO NOTHING RETURNING student_id, kind, work_id
  )
  INSERT INTO lw_notifications (user_id, title, message, category, action_target)
  SELECT s.student_id, 'Temporary zero: missing ' || s.kind,
    LEFT(m.title,180) || ' currently counts as 0/' || m.max_points || ' toward your overall grade. ' ||
    CASE WHEN s.kind='quiz' THEN 'Complete the quiz to replace the zero with your result. Ask your mentor to reopen it if needed.'
    ELSE 'Submit the assignment to clear the temporary zero. Your actual mark will count after review. Ask your mentor if submissions are closed.' END,
    CASE WHEN s.kind='quiz' THEN 'review' ELSE 'assignment' END,
    CASE WHEN s.kind='quiz' THEN 'Live quiz' ELSE 'Assignments' END
  FROM sent s JOIN missing m USING (student_id, kind, work_id)`);
}

export function startMissingWorkAlerts(pool: Queryable, server: Server) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await sendMissingWorkAlerts(pool); }
    catch (error) { logger.error('missing_work_alerts_failed', { error: error instanceof Error ? error.message : String(error) }); }
    finally { busy = false; }
  };
  const timer = setInterval(() => void tick(), 5 * 60_000);
  timer.unref();
  server.once('close', () => clearInterval(timer));
  void tick();
}
