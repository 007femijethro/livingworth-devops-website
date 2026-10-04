// @ts-nocheck
import { notifyUser } from './notifications.js';

const editableFields = {
  firstName: 'first_name', lastName: 'last_name', phone: 'phone', gender: 'gender', country: 'country',
  stateCity: 'state_city', employmentStatus: 'employment_status', educationalLevel: 'educational_level',
  learningMode: 'learning_mode', techExperience: 'tech_experience', learningGoal: 'learning_goal'
};
const selectProfile = `id, full_name AS "fullName", first_name AS "firstName", last_name AS "lastName", email,
  phone, gender, country, state_city AS "stateCity", employment_status AS "employmentStatus",
  educational_level AS "educationalLevel", learning_mode AS "learningMode",
  tech_experience AS "techExperience", learning_goal AS "learningGoal"`;

function cleanChanges(body) {
  const changes = {};
  for (const field of Object.keys(editableFields)) {
    if (body[field] === undefined) continue;
    changes[field] = String(body[field] ?? '').trim().slice(0, field === 'learningGoal' ? 1000 : 150);
  }
  return changes;
}

export function registerProfileChangeRoutes(app, pool, requireAuth, requireAdmin) {
  app.get('/api/profile-change-requests/mine', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      const [profiles] = await pool.execute(`SELECT ${selectProfile} FROM users WHERE id=? AND role='student'`, [req.user.id]);
      const [requests] = await pool.execute(`SELECT id, proposed_data AS "proposedData", status, rejection_reason AS "rejectionReason",
        created_at AS "createdAt", reviewed_at AS "reviewedAt" FROM profile_change_requests
        WHERE student_id=? ORDER BY created_at DESC LIMIT 1`, [req.user.id]);
      res.json({ profile: profiles[0], request: requests[0] || null });
    } catch (error) { next(error); }
  });

  app.post('/api/profile-change-requests', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student' || req.user.status !== 'approved') return res.status(403).json({ message: 'Approved student access required.' });
      const changes = cleanChanges(req.body);
      if (!Object.keys(changes).length) return res.status(400).json({ message: 'Change at least one profile field before submitting.' });
      const [pending] = await pool.execute("SELECT id FROM profile_change_requests WHERE student_id=? AND status='pending'", [req.user.id]);
      if (pending.length) return res.status(409).json({ message: 'You already have a profile update awaiting approval.' });
      const [profiles] = await pool.execute(`SELECT ${selectProfile} FROM users WHERE id=?`, [req.user.id]);
      const different = Object.fromEntries(Object.entries(changes).filter(([field, value]) => String(profiles[0]?.[field] ?? '') !== value));
      if (!Object.keys(different).length) return res.status(400).json({ message: 'The profile details have not changed.' });
      await pool.execute('INSERT INTO profile_change_requests (student_id,proposed_data) VALUES (?,?)', [req.user.id, JSON.stringify(different)]);
      res.status(201).json({ message: 'Profile changes submitted for administrator approval.' });
    } catch (error) { next(error); }
  });

  app.get('/api/admin/profile-change-requests', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const status = ['pending','approved','rejected'].includes(req.query.status) ? req.query.status : 'pending';
      const [rows] = await pool.execute(`SELECT p.id, p.student_id AS "studentId", u.full_name AS "studentName", u.email,
        p.proposed_data AS "proposedData", p.status, p.rejection_reason AS "rejectionReason",
        p.created_at AS "createdAt", p.reviewed_at AS "reviewedAt", reviewer.full_name AS "reviewedBy"
        FROM profile_change_requests p JOIN users u ON u.id=p.student_id
        LEFT JOIN users reviewer ON reviewer.id=p.reviewed_by WHERE p.status=? ORDER BY p.created_at DESC`, [status]);
      res.json(rows);
    } catch (error) { next(error); }
  });

  app.patch('/api/admin/profile-change-requests/:id', requireAuth, requireAdmin, async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      const decision = String(req.body.decision || '');
      const reason = String(req.body.reason || '').trim().slice(0, 500);
      if (!['approved','rejected'].includes(decision)) return res.status(400).json({ message: 'Choose approve or reject.' });
      if (decision === 'rejected' && !reason) return res.status(400).json({ message: 'Add a reason for rejecting this request.' });
      await connection.beginTransaction();
      const [requests] = await connection.execute("SELECT student_id AS \"studentId\", proposed_data AS \"proposedData\" FROM profile_change_requests WHERE id=? AND status='pending' FOR UPDATE", [req.params.id]);
      if (!requests.length) { await connection.rollback(); return res.status(404).json({ message: 'Pending profile request not found.' }); }
      const request = requests[0];
      if (decision === 'approved') {
        const changes = cleanChanges(request.proposedData || {});
        const fields = Object.keys(changes);
        if (!fields.length) { await connection.rollback(); return res.status(400).json({ message: 'This request contains no valid profile fields.' }); }
        const assignments = fields.map(field => `${editableFields[field]}=?`);
        const values = fields.map(field => changes[field]);
        if (fields.includes('firstName') || fields.includes('lastName')) {
          const [profiles] = await connection.execute('SELECT first_name AS "firstName", last_name AS "lastName" FROM users WHERE id=?', [request.studentId]);
          const fullName = `${changes.firstName ?? profiles[0].firstName ?? ''} ${changes.lastName ?? profiles[0].lastName ?? ''}`.trim();
          if (fullName) { assignments.push('full_name=?'); values.push(fullName); }
        }
        values.push(request.studentId);
        await connection.execute(`UPDATE users SET ${assignments.join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=? AND role='student'`, values);
      }
      await connection.execute(`UPDATE profile_change_requests SET status=?,rejection_reason=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`, [decision, decision === 'rejected' ? reason : null, req.user.id, req.params.id]);
      await connection.commit();
      await notifyUser(pool, request.studentId, { title: `Profile update ${decision}`, message: decision === 'approved' ? 'Your requested profile changes have been approved and are now visible.' : `Your profile update was not approved: ${reason}`, category: 'review', actionTarget: 'Profile' });
      res.json({ message: `Profile update ${decision}.` });
    } catch (error) { await connection.rollback(); next(error); }
    finally { connection.release(); }
  });
}
