import { sendStudentNotification } from './mailer.js';

export async function notifyStudents(pool, notification) {
  await pool.execute(`INSERT INTO notifications (user_id, title, message, category, action_target)
    SELECT id, ?, ?, ?, ? FROM users WHERE role = 'student' AND status = 'approved'`,
  [notification.title, notification.message, notification.category, notification.actionTarget || null]);
  const [students] = await pool.query("SELECT full_name AS fullName, email FROM users WHERE role = 'student' AND status = 'approved'");
  await Promise.allSettled(students.map(student => sendStudentNotification(student, notification)));
}

export async function notifyUser(pool, userId, notification) {
  await pool.execute(`INSERT INTO notifications (user_id, title, message, category, action_target)
    SELECT ?, ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM users WHERE id = ? AND role = 'student' AND status = 'approved'
    )`,
  [userId, notification.title, notification.message, notification.category, notification.actionTarget || null, userId]);
  const [students] = await pool.execute(
    "SELECT full_name AS fullName, email FROM users WHERE id = ? AND role = 'student' AND status = 'approved'",
    [userId]
  );
  if (students[0]) await sendStudentNotification(students[0], notification);
}

export function registerNotificationRoutes(app, pool, requireAuth) {
  app.get('/api/student/notifications', requireAuth, async (req, res, next) => {
    try {
      const [notifications] = await pool.execute(`SELECT id, title, message, category, action_target AS actionTarget,
        read_at AS readAt, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`, [req.user.id]);
      res.json(notifications);
    } catch (error) { next(error); }
  });

  app.patch('/api/student/notifications/:id/read', requireAuth, async (req, res, next) => {
    try {
      await pool.execute('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      res.json({ message: 'Notification read.' });
    } catch (error) { next(error); }
  });

  app.delete('/api/student/notifications/:id', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Only students can delete their notifications.' });
      const notificationId = Number.parseInt(req.params.id, 10);
      if (!notificationId) return res.status(400).json({ message: 'Choose a valid notification.' });
      const [result] = await pool.execute('DELETE FROM notifications WHERE id = ? AND user_id = ?', [notificationId, req.user.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Notification not found.' });
      res.json({ message: 'Notification deleted.' });
    } catch (error) { next(error); }
  });
}
