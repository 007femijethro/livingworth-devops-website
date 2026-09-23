import crypto from 'node:crypto';

function certificateNumber() {
  return `LWA-${new Date().getUTCFullYear()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

const certificateFields = `c.id, c.certificate_number AS certificateNumber, c.course_title AS courseTitle,
  c.completion_date AS completionDate, c.status, c.issued_at AS issuedAt, c.revoked_at AS revokedAt,
  c.revoke_reason AS revokeReason, u.id AS studentId, u.full_name AS studentName,
  u.email AS studentEmail, issuer.full_name AS issuedBy`;

export function registerCertificateRoutes(app, pool, requireAuth, requireStaff) {
  app.get('/api/certificates/verify/:certificateNumber', async (req, res, next) => {
    try {
      const number = String(req.params.certificateNumber || '').trim().toUpperCase().slice(0, 80);
      const [certificates] = await pool.execute(`SELECT ${certificateFields} FROM certificates c
        JOIN users u ON u.id = c.student_id JOIN users issuer ON issuer.id = c.issued_by
        WHERE c.certificate_number = ?`, [number]);
      if (!certificates.length) return res.status(404).json({ message: 'Certificate not found. Check the certificate ID and try again.' });
      res.json(certificates[0]);
    } catch (error) { next(error); }
  });

  app.get('/api/student/certificates', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      const [certificates] = await pool.execute(`SELECT ${certificateFields} FROM certificates c
        JOIN users u ON u.id = c.student_id JOIN users issuer ON issuer.id = c.issued_by
        WHERE c.student_id = ? ORDER BY c.issued_at DESC`, [req.user.id]);
      res.json(certificates);
    } catch (error) { next(error); }
  });

  app.get('/api/staff/certificates', requireAuth, requireStaff, async (_req, res, next) => {
    try {
      const [certificates] = await pool.query(`SELECT ${certificateFields} FROM certificates c
        JOIN users u ON u.id = c.student_id JOIN users issuer ON issuer.id = c.issued_by
        ORDER BY c.issued_at DESC`);
      res.json(certificates);
    } catch (error) { next(error); }
  });

  app.post('/api/staff/certificates', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const studentId = Number.parseInt(req.body.studentId, 10);
      const courseTitle = String(req.body.courseTitle || '').trim().slice(0, 180);
      const completionDate = String(req.body.completionDate || '').trim();
      if (!studentId || courseTitle.length < 3) return res.status(400).json({ message: 'Choose a student and enter the completed course.' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(completionDate) || Number.isNaN(Date.parse(`${completionDate}T00:00:00Z`))) {
        return res.status(400).json({ message: 'Choose a valid completion date.' });
      }
      if (new Date(`${completionDate}T00:00:00Z`) > new Date()) return res.status(400).json({ message: 'The completion date cannot be in the future.' });
      const [students] = await pool.execute("SELECT id FROM users WHERE id = ? AND role = 'student' AND status = 'approved'", [studentId]);
      if (!students.length) return res.status(404).json({ message: 'Choose an approved student.' });
      const [existing] = await pool.execute("SELECT id FROM certificates WHERE student_id = ? AND LOWER(course_title) = LOWER(?) AND status = 'valid'", [studentId, courseTitle]);
      if (existing.length) return res.status(409).json({ message: 'This student already has a valid certificate for that course.' });

      let created = null;
      for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
        try {
          const number = certificateNumber();
          const [result] = await pool.execute(`INSERT INTO certificates
            (certificate_number, student_id, course_title, completion_date, issued_by)
            VALUES (?, ?, ?, ?, ?)`, [number, studentId, courseTitle, completionDate, req.user.id]);
          created = { id: result.insertId, certificateNumber: number };
        } catch (error) {
          if (error.code !== 'ER_DUP_ENTRY' || attempt === 2) throw error;
        }
      }
      res.status(201).json({ ...created, message: 'Certificate issued successfully.' });
    } catch (error) { next(error); }
  });

  app.patch('/api/staff/certificates/:id/revoke', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const reason = String(req.body.reason || '').trim().slice(0, 500);
      if (!reason) return res.status(400).json({ message: 'Enter a reason for revoking this certificate.' });
      const [result] = await pool.execute(`UPDATE certificates SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP,
        revoke_reason = ? WHERE id = ? AND status = 'valid'`, [reason, req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Valid certificate not found.' });
      res.json({ message: 'Certificate revoked. Public verification will now show it as revoked.' });
    } catch (error) { next(error); }
  });
}
