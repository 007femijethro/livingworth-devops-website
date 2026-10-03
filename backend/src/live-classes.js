import crypto from 'node:crypto';

const classFields = `lc.id, lc.title, lc.scheduled_at AS "scheduledAt", lc.duration_minutes AS "durationMinutes",
  lc.room_name AS "roomName", lc.status, lc.started_at AS "startedAt", lc.ended_at AS "endedAt",
  lc.created_at AS "createdAt", creator.full_name AS "createdBy",
  (SELECT COUNT(*) FROM live_class_participants lcp WHERE lcp.class_id = lc.id) AS "participantCount"`;

function validId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function registerLiveClassRoutes(app, pool, requireAuth, requireStaff) {
  app.get('/api/live-classes', requireAuth, async (req, res, next) => {
    try {
      const staff = ['admin', 'mentor'].includes(req.user.role);
      const where = staff ? '' : "WHERE lc.status IN ('scheduled','live') AND lc.scheduled_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'";
      const [rows] = await pool.query(`SELECT ${classFields} FROM live_classes lc
        JOIN users creator ON creator.id = lc.created_by ${where}
        ORDER BY CASE lc.status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, lc.scheduled_at DESC LIMIT 40`);
      res.json(rows.map(row => ({ ...row, participantCount: Number(row.participantCount || 0) })));
    } catch (error) { next(error); }
  });

  app.post('/api/staff/live-classes', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const title = String(req.body.title || '').trim().slice(0, 180);
      const scheduledAt = new Date(req.body.scheduledAt);
      const durationMinutes = Number.parseInt(req.body.durationMinutes, 10) || 60;
      if (title.length < 3) return res.status(400).json({ message: 'Enter a class title.' });
      if (Number.isNaN(scheduledAt.getTime())) return res.status(400).json({ message: 'Choose a valid class date and time.' });
      if (durationMinutes < 15 || durationMinutes > 240) return res.status(400).json({ message: 'Class duration must be between 15 and 240 minutes.' });
      const roomName = `LivingworthAcademy-${crypto.randomBytes(18).toString('hex')}`;
      const [result] = await pool.execute('INSERT INTO live_classes (title,scheduled_at,duration_minutes,room_name,created_by) VALUES (?,?,?,?,?)',
        [title, scheduledAt.toISOString(), durationMinutes, roomName, req.user.id]);
      res.status(201).json({ id: result.insertId, roomName, message: 'Live class scheduled.' });
    } catch (error) { next(error); }
  });

  app.patch('/api/staff/live-classes/:id/start', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const id = validId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Choose a valid class.' });
      const [result] = await pool.execute("UPDATE live_classes SET status='live', started_at=COALESCE(started_at,CURRENT_TIMESTAMP), ended_at=NULL WHERE id=? AND status IN ('scheduled','live')", [id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Scheduled class not found.' });
      res.json({ message: 'Live class started.' });
    } catch (error) { next(error); }
  });

  app.patch('/api/staff/live-classes/:id/end', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const id = validId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Choose a valid class.' });
      const [result] = await pool.execute("UPDATE live_classes SET status='ended', ended_at=CURRENT_TIMESTAMP WHERE id=? AND status='live'", [id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Live class not found.' });
      await pool.execute('UPDATE live_class_participants SET left_at=COALESCE(left_at,CURRENT_TIMESTAMP), last_seen_at=CURRENT_TIMESTAMP WHERE class_id=?', [id]);
      res.json({ message: 'Live class ended and attendance retained.' });
    } catch (error) { next(error); }
  });

  app.delete('/api/staff/live-classes/:id', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const id = validId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Choose a valid class.' });
      const [result] = await pool.execute("DELETE FROM live_classes WHERE id=? AND status <> 'live'", [id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Class not found or still live. End it before deleting.' });
      res.json({ message: 'Live class deleted.' });
    } catch (error) { next(error); }
  });

  app.get('/api/staff/live-classes/:id/participants', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const id = validId(req.params.id);
      if (!id) return res.status(400).json({ message: 'Choose a valid class.' });
      const [rows] = await pool.execute(`SELECT u.id AS "studentId", u.full_name AS "fullName",
        lcp.joined_at AS "joinedAt", lcp.last_seen_at AS "lastSeenAt", lcp.left_at AS "leftAt",
        (lcp.left_at IS NULL AND lcp.last_seen_at >= CURRENT_TIMESTAMP - INTERVAL '75 seconds') AS connected
        FROM live_class_participants lcp JOIN users u ON u.id=lcp.student_id
        WHERE lcp.class_id=? ORDER BY lcp.joined_at`, [id]);
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.post('/api/live-classes/:id/join', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student' || req.user.status !== 'approved') return res.status(403).json({ message: 'Approved student access required.' });
      const id = validId(req.params.id);
      const [classes] = await pool.execute(`SELECT id,title,scheduled_at AS "scheduledAt",created_by AS "createdBy"
        FROM live_classes WHERE id=? AND status='live'`, [id]);
      if (!classes.length) return res.status(404).json({ message: 'This live class is not open.' });
      const liveClass = classes[0];
      const [existing] = await pool.execute('SELECT id FROM live_class_participants WHERE class_id=? AND student_id=?', [id, req.user.id]);
      await pool.execute(`INSERT INTO live_class_participants (class_id,student_id,joined_at,last_seen_at,left_at)
        VALUES (?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL)
        ON CONFLICT (class_id,student_id) DO UPDATE SET last_seen_at=CURRENT_TIMESTAMP,left_at=NULL`, [id, req.user.id]);
      if (!existing.length) {
        const minutesLate = Math.max(0, Math.floor((Date.now() - new Date(liveClass.scheduledAt).getTime()) / 60000));
        const attendanceStatus = minutesLate > 10 ? 'late' : 'present';
        const sessionDate = new Date(liveClass.scheduledAt).toISOString().slice(0, 10);
        await pool.execute(`INSERT INTO attendance (student_id,session_date,status,note,marked_by)
          VALUES (?,?,?,?,?) ON CONFLICT (student_id,session_date) DO UPDATE SET
          status=CASE WHEN attendance.status IN ('absent','late') THEN EXCLUDED.status ELSE attendance.status END,
          note=EXCLUDED.note,marked_by=EXCLUDED.marked_by,marked_at=CURRENT_TIMESTAMP`,
        [req.user.id, sessionDate, attendanceStatus, `Joined ${liveClass.title} through Livingworth Live Class`, liveClass.createdBy]);
      }
      res.json({ message: existing.length ? 'Reconnected to live class.' : 'Joined live class. Attendance recorded.' });
    } catch (error) { next(error); }
  });

  app.post('/api/live-classes/:id/heartbeat', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      await pool.execute('UPDATE live_class_participants SET last_seen_at=CURRENT_TIMESTAMP,left_at=NULL WHERE class_id=? AND student_id=?', [validId(req.params.id), req.user.id]);
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  app.post('/api/live-classes/:id/leave', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      await pool.execute('UPDATE live_class_participants SET last_seen_at=CURRENT_TIMESTAMP,left_at=CURRENT_TIMESTAMP WHERE class_id=? AND student_id=?', [validId(req.params.id), req.user.id]);
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
}
