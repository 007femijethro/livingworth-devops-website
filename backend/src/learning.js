import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

const uploadDirectory = process.env.UPLOAD_DIR || path.resolve('uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });
const allowedExtensions = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.txt', '.zip']);
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, done) => done(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, done) => {
    const extension = path.extname(file.originalname).toLowerCase();
    done(allowedExtensions.has(extension) ? null : new Error('Upload a PDF, document, presentation, text or ZIP file.'), allowedExtensions.has(extension));
  }
});

export async function ensureLearningSchema(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS learning_modules (
    id INT AUTO_INCREMENT PRIMARY KEY, week_number INT NOT NULL UNIQUE, title VARCHAR(180) NOT NULL,
    summary TEXT, published BOOLEAN NOT NULL DEFAULT FALSE, created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS learning_materials (
    id INT AUTO_INCREMENT PRIMARY KEY, module_id INT NOT NULL, title VARCHAR(180) NOT NULL,
    material_type ENUM('file','link','video') NOT NULL, resource_url VARCHAR(1000) NOT NULL,
    original_name VARCHAR(255), uploaded_by INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (module_id) REFERENCES learning_modules(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS assignments (
    id INT AUTO_INCREMENT PRIMARY KEY, module_id INT NOT NULL, title VARCHAR(180) NOT NULL,
    instructions TEXT NOT NULL, due_at DATETIME NOT NULL, max_score INT NOT NULL DEFAULT 100,
    created_by INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (module_id) REFERENCES learning_modules(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS assignment_submissions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY, assignment_id INT NOT NULL, student_id INT NOT NULL,
    submission_url VARCHAR(1000) NOT NULL, note TEXT,
    status ENUM('submitted','needs_correction','completed') NOT NULL DEFAULT 'submitted',
    score INT, feedback TEXT, submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL, reviewed_by INT NULL,
    UNIQUE KEY one_submission_per_assignment (assignment_id, student_id),
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id)
  )`);
}

async function modulesFor(pool, studentId = null, staff = false) {
  const [modules] = await pool.query(`SELECT id, week_number AS weekNumber, title, summary, published FROM learning_modules ${staff ? '' : 'WHERE published = TRUE'} ORDER BY week_number`);
  for (const module of modules) {
    const [materials] = await pool.execute('SELECT id, title, material_type AS materialType, resource_url AS resourceUrl, original_name AS originalName FROM learning_materials WHERE module_id = ? ORDER BY created_at', [module.id]);
    const [assignments] = studentId
      ? await pool.execute(
          `SELECT a.id, a.title, a.instructions, a.due_at AS dueAt, a.max_score AS maxScore,
            s.id AS submissionId, s.submission_url AS submissionUrl, s.note AS submissionNote,
            s.status AS submissionStatus, s.score, s.feedback, s.submitted_at AS submittedAt,
            CASE WHEN s.id IS NOT NULL AND s.submitted_at > a.due_at THEN TRUE ELSE FALSE END AS isLate
           FROM assignments a LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = ?
           WHERE a.module_id = ? ORDER BY a.due_at`, [studentId, module.id]
        )
      : await pool.execute(
          'SELECT id, title, instructions, due_at AS dueAt, max_score AS maxScore FROM assignments WHERE module_id = ? ORDER BY due_at',
          [module.id]
        );
    module.materials = materials;
    module.assignments = assignments;
  }
  return modules;
}

export function registerLearningRoutes(app, pool, requireAuth, requireStaff) {
  app.get('/api/student/learning', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      const modules = await modulesFor(pool, req.user.id, false);
      const assignments = modules.flatMap(module => module.assignments);
      const completed = assignments.filter(assignment => assignment.submissionStatus === 'completed').length;
      res.json({ modules, progress: { completed, total: assignments.length, percentage: assignments.length ? Math.round(completed / assignments.length * 100) : 0 } });
    } catch (error) { next(error); }
  });

  app.get('/api/staff/learning', requireAuth, requireStaff, async (_req, res, next) => {
    try {
      const modules = await modulesFor(pool, null, true);
      const [submissions] = await pool.query(`SELECT s.id, s.assignment_id AS assignmentId, s.student_id AS studentId,
        u.full_name AS studentName, u.email, s.submission_url AS submissionUrl, s.note, s.status, s.score,
        s.feedback, s.submitted_at AS submittedAt, a.title AS assignmentTitle, a.due_at AS dueAt,
        CASE WHEN s.submitted_at > a.due_at THEN TRUE ELSE FALSE END AS isLate
        FROM assignment_submissions s JOIN users u ON u.id = s.student_id JOIN assignments a ON a.id = s.assignment_id
        ORDER BY FIELD(s.status, 'submitted', 'needs_correction', 'completed'), s.submitted_at DESC`);
      res.json({ modules, submissions });
    } catch (error) { next(error); }
  });

  app.post('/api/staff/learning/modules', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const weekNumber = Number.parseInt(req.body.weekNumber, 10);
      const title = String(req.body.title || '').trim();
      if (!weekNumber || weekNumber < 1 || weekNumber > 52 || !title) return res.status(400).json({ message: 'Add a valid week number and module title.' });
      await pool.execute('INSERT INTO learning_modules (week_number, title, summary, published, created_by) VALUES (?, ?, ?, ?, ?)', [weekNumber, title, String(req.body.summary || '').trim(), Boolean(req.body.published), req.user.id]);
      res.status(201).json({ message: `Week ${weekNumber} module created.` });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A module already exists for that week.' });
      next(error);
    }
  });

  app.patch('/api/staff/learning/modules/:id', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const [result] = await pool.execute('UPDATE learning_modules SET published = ? WHERE id = ?', [Boolean(req.body.published), req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Module not found.' });
      res.json({ message: req.body.published ? 'Module published.' : 'Module returned to draft.' });
    } catch (error) { next(error); }
  });

  app.post('/api/staff/learning/modules/:id/materials', requireAuth, requireStaff, upload.single('file'), async (req, res, next) => {
    try {
      const title = String(req.body.title || '').trim();
      const resourceUrl = req.file ? `/uploads/${req.file.filename}` : String(req.body.resourceUrl || '').trim();
      const materialType = req.file ? 'file' : (req.body.materialType === 'video' ? 'video' : 'link');
      if (!title || !resourceUrl) return res.status(400).json({ message: 'Add a title and either a file or resource link.' });
      await pool.execute('INSERT INTO learning_materials (module_id, title, material_type, resource_url, original_name, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)', [req.params.id, title, materialType, resourceUrl, req.file?.originalname || null, req.user.id]);
      res.status(201).json({ message: 'Learning material added.' });
    } catch (error) { next(error); }
  });

  app.post('/api/staff/learning/modules/:id/assignments', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const title = String(req.body.title || '').trim();
      const instructions = String(req.body.instructions || '').trim();
      const dueAt = String(req.body.dueAt || '');
      const maxScore = Math.min(1000, Math.max(1, Number.parseInt(req.body.maxScore, 10) || 100));
      if (!title || !instructions || !dueAt) return res.status(400).json({ message: 'Add a title, instructions and deadline.' });
      await pool.execute('INSERT INTO assignments (module_id, title, instructions, due_at, max_score, created_by) VALUES (?, ?, ?, ?, ?, ?)', [req.params.id, title, instructions, dueAt, maxScore, req.user.id]);
      res.status(201).json({ message: 'Assignment created.' });
    } catch (error) { next(error); }
  });

  app.put('/api/student/assignments/:id/submission', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      const submissionUrl = String(req.body.submissionUrl || '').trim();
      if (!/^https?:\/\//i.test(submissionUrl)) return res.status(400).json({ message: 'Enter a complete GitHub or project URL.' });
      const [assignments] = await pool.execute('SELECT id FROM assignments WHERE id = ?', [req.params.id]);
      if (!assignments.length) return res.status(404).json({ message: 'Assignment not found.' });
      await pool.execute(`INSERT INTO assignment_submissions (assignment_id, student_id, submission_url, note)
        VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE submission_url = VALUES(submission_url), note = VALUES(note),
        status = 'submitted', score = NULL, feedback = NULL, submitted_at = CURRENT_TIMESTAMP`,
        [req.params.id, req.user.id, submissionUrl, String(req.body.note || '').trim()]);
      res.json({ message: 'Assignment submitted successfully.' });
    } catch (error) { next(error); }
  });

  app.patch('/api/staff/submissions/:id/review', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const status = ['needs_correction', 'completed'].includes(req.body.status) ? req.body.status : '';
      const feedback = String(req.body.feedback || '').trim();
      const score = req.body.score === '' || req.body.score == null ? null : Number.parseInt(req.body.score, 10);
      if (!status || !feedback) return res.status(400).json({ message: 'Choose a review result and add feedback.' });
      if (score !== null && (score < 0 || score > 1000)) return res.status(400).json({ message: 'Enter a valid score.' });
      const [result] = await pool.execute('UPDATE assignment_submissions SET status = ?, score = ?, feedback = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?', [status, score, feedback, req.user.id, req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Submission not found.' });
      res.json({ message: status === 'completed' ? 'Submission marked complete.' : 'Correction requested.' });
    } catch (error) { next(error); }
  });
}
