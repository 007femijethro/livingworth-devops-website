const categories = new Set(['general', 'class', 'quiz', 'assignment']);

export async function ensureAnnouncementSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS announcements (
    id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(180) NOT NULL, message TEXT NOT NULL,
    category ENUM('general','class','quiz','assignment') NOT NULL DEFAULT 'general',
    meeting_link VARCHAR(1000), expires_at DATETIME NULL, created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS announcement_reads (
    announcement_id INT NOT NULL, user_id INT NOT NULL, read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (announcement_id, user_id),
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
}

export function registerAnnouncementRoutes(app, pool, requireAuth, requireStaff) {
  app.get('/api/announcements', requireAuth, async (req, res, next) => {
    try {
      const staff = ['admin', 'mentor'].includes(req.user.role);
      const [rows] = await pool.execute(`SELECT a.id, a.title, a.message, a.category,
        a.meeting_link AS meetingLink, a.expires_at AS expiresAt, a.created_at AS createdAt,
        u.full_name AS authorName, ar.read_at AS readAt,
        CASE WHEN a.expires_at IS NOT NULL AND a.expires_at <= NOW() THEN TRUE ELSE FALSE END AS expired
        FROM announcements a JOIN users u ON u.id = a.created_by
        LEFT JOIN announcement_reads ar ON ar.announcement_id = a.id AND ar.user_id = ?
        ${staff ? '' : 'WHERE a.expires_at IS NULL OR a.expires_at > NOW()'}
        ORDER BY a.created_at DESC`, [req.user.id]);
      res.json({ announcements: rows, unreadCount: rows.filter(row => !row.readAt && !row.expired).length });
    } catch (error) { next(error); }
  });

  app.post('/api/staff/announcements', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const title = String(req.body.title || '').trim();
      const message = String(req.body.message || '').trim();
      const category = categories.has(req.body.category) ? req.body.category : 'general';
      const meetingLink = String(req.body.meetingLink || '').trim();
      const expiresAt = req.body.expiresAt ? String(req.body.expiresAt).replace('T', ' ') : null;
      if (!title || !message) return res.status(400).json({ message: 'Add an announcement title and message.' });
      if (meetingLink && !/^https?:\/\//i.test(meetingLink)) return res.status(400).json({ message: 'Enter a complete meeting link.' });
      if (expiresAt && Number.isNaN(new Date(expiresAt).getTime())) return res.status(400).json({ message: 'Choose a valid expiry date.' });
      const [result] = await pool.execute('INSERT INTO announcements (title, message, category, meeting_link, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?)', [title, message, category, meetingLink || null, expiresAt, req.user.id]);
      res.status(201).json({ id: result.insertId, message: 'Announcement published.' });
    } catch (error) { next(error); }
  });

  app.post('/api/announcements/:id/read', requireAuth, async (req, res, next) => {
    try {
      const [announcements] = await pool.execute('SELECT id FROM announcements WHERE id = ? AND (expires_at IS NULL OR expires_at > NOW())', [req.params.id]);
      if (!announcements.length) return res.status(404).json({ message: 'Announcement not found.' });
      await pool.execute('INSERT IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)', [req.params.id, req.user.id]);
      res.json({ message: 'Marked as read.' });
    } catch (error) { next(error); }
  });

  app.delete('/api/staff/announcements/:id', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const [result] = await pool.execute('DELETE FROM announcements WHERE id = ?', [req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Announcement not found.' });
      res.json({ message: 'Announcement deleted.' });
    } catch (error) { next(error); }
  });
}
