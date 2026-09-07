const storyTypes = new Set(['testimony', 'success_story', 'learning_journey']);

function storyInput(body) {
  const storyType = String(body.storyType || '').trim();
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  if (!storyTypes.has(storyType)) throw new Error('Choose Testimony, Success Story or Learning Journey.');
  if (title.length < 3 || title.length > 180) throw new Error('The title must be between 3 and 180 characters.');
  if (content.length < 40 || content.length > 5000) throw new Error('Your story must be between 40 and 5,000 characters.');
  return { storyType, title, content };
}

const selectFields = `s.id, s.story_type AS storyType, s.title, s.content, s.status,
  s.rejection_reason AS rejectionReason, s.featured, s.published_at AS publishedAt,
  s.created_at AS createdAt, s.updated_at AS updatedAt, u.full_name AS studentName`;

export function registerStoryRoutes(app, pool, requireAuth, requireStaff) {
  app.get('/api/stories', async (_req, res, next) => {
    try {
      const [stories] = await pool.execute(`SELECT ${selectFields} FROM student_stories s
        JOIN users u ON u.id = s.student_id WHERE s.status = 'approved'
        ORDER BY s.featured DESC, s.published_at DESC, s.created_at DESC LIMIT 12`);
      res.json(stories);
    } catch (error) { next(error); }
  });

  app.get('/api/student/stories', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access only.' });
      const [stories] = await pool.execute(`SELECT ${selectFields} FROM student_stories s
        JOIN users u ON u.id = s.student_id WHERE s.student_id = ? ORDER BY s.created_at DESC`, [req.user.id]);
      res.json(stories);
    } catch (error) { next(error); }
  });

  app.post('/api/student/stories', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access only.' });
      let input;
      try { input = storyInput(req.body); } catch (error) { return res.status(400).json({ message: error.message }); }
      const [result] = await pool.execute(`INSERT INTO student_stories (student_id,story_type,title,content)
        VALUES (?,?,?,?)`, [req.user.id, input.storyType, input.title, input.content]);
      res.status(201).json({ id: result.insertId, message: 'Your story was submitted for mentor review.' });
    } catch (error) { next(error); }
  });

  app.patch('/api/student/stories/:id', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access only.' });
      let input;
      try { input = storyInput(req.body); } catch (error) { return res.status(400).json({ message: error.message }); }
      const [result] = await pool.execute(`UPDATE student_stories SET story_type = ?, title = ?, content = ?,
        status = 'pending', rejection_reason = NULL, featured = FALSE, reviewed_by = NULL, reviewed_at = NULL,
        published_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND student_id = ? AND status <> 'approved'`,
      [input.storyType, input.title, input.content, req.params.id, req.user.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Only pending or rejected stories can be edited.' });
      res.json({ message: 'Your changes were saved and sent for mentor review.' });
    } catch (error) { next(error); }
  });

  app.delete('/api/student/stories/:id', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access only.' });
      const [result] = await pool.execute('DELETE FROM student_stories WHERE id = ? AND student_id = ?', [req.params.id, req.user.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Story not found.' });
      res.json({ message: 'Your story was deleted.' });
    } catch (error) { next(error); }
  });

  app.get('/api/staff/stories', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : '';
      const [stories] = await pool.execute(`SELECT ${selectFields}, u.email AS studentEmail FROM student_stories s
        JOIN users u ON u.id = s.student_id ${status ? 'WHERE s.status = ?' : ''}
        ORDER BY CASE s.status WHEN 'pending' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, s.created_at DESC`, status ? [status] : []);
      res.json(stories);
    } catch (error) { next(error); }
  });

  app.patch('/api/staff/stories/:id/review', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const status = String(req.body.status || '');
      const rejectionReason = String(req.body.rejectionReason || '').trim().slice(0, 500);
      if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: 'Choose approve or reject.' });
      if (status === 'rejected' && !rejectionReason) return res.status(400).json({ message: 'Add a reason so the student knows what to improve.' });
      const [result] = await pool.execute(`UPDATE student_stories SET status = ?, rejection_reason = ?, featured = FALSE,
        reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, published_at = CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END,
        updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, status === 'rejected' ? rejectionReason : null, req.user.id, status, req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Story not found.' });
      res.json({ message: `Story ${status}.` });
    } catch (error) { next(error); }
  });

  app.patch('/api/staff/stories/:id/featured', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const featured = req.body.featured === true;
      const [result] = await pool.execute(`UPDATE student_stories SET featured = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'approved'`, [featured, req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Approve this story before featuring it.' });
      res.json({ message: featured ? 'Story featured on the homepage.' : 'Story removed from featured position.' });
    } catch (error) { next(error); }
  });

  app.delete('/api/staff/stories/:id', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const [result] = await pool.execute('DELETE FROM student_stories WHERE id = ?', [req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Story not found.' });
      res.json({ message: 'Story deleted.' });
    } catch (error) { next(error); }
  });
}
