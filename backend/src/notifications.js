export async function ensureNotificationSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, title VARCHAR(180) NOT NULL,
    message VARCHAR(500) NOT NULL, category ENUM('learning','assignment','attendance','review') NOT NULL,
    action_target VARCHAR(40) NULL, read_at TIMESTAMP NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX notification_user (user_id, created_at), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
}

export async function notifyStudents(pool, notification) {
  await pool.execute(`INSERT INTO notifications (user_id, title, message, category, action_target)
    SELECT id, ?, ?, ?, ? FROM users WHERE role = 'student' AND status = 'approved'`,
    [notification.title, notification.message, notification.category, notification.actionTarget || null]);
  const [students] = await pool.query("SELECT full_name AS fullName, email FROM users WHERE role = 'student' AND status = 'approved'");
  await Promise.allSettled(students.map(student => sendStudentNotification(student, notification)));
}

export async function notifyUser(pool, userId, notification) {
  await pool.execute('INSERT INTO notifications (user_id, title, message, category, action_target) VALUES (?, ?, ?, ?, ?)',
    [userId, notification.title, notification.message, notification.category, notification.actionTarget || null]);
  const [students] = await pool.execute('SELECT full_name AS fullName, email FROM users WHERE id = ?', [userId]);
  if (students.length) await sendStudentNotification(students[0], notification);
}

export function registerNotificationRoutes(app, pool, requireAuth) {
  app.get('/api/notifications', requireAuth, async (req, res, next) => {
    try {
      const [notifications] = await pool.execute(`SELECT id, title, message, category, action_target AS actionTarget,
        read_at AS readAt, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`, [req.user.id]);
      res.json({ notifications, unreadCount: notifications.filter(item => !item.readAt).length });
    } catch (error) { next(error); }
  });
  app.post('/api/notifications/:id/read', requireAuth, async (req, res, next) => {
    try {
      await pool.execute('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      res.json({ message: 'Notification marked as read.' });
    } catch (error) { next(error); }
  });
}
import { sendStudentNotification } from './mailer.js';
