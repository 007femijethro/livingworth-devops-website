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
    material_type ENUM('file','link','video','note') NOT NULL, resource_url VARCHAR(1000) NOT NULL,
    lesson_content LONGTEXT NULL,
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
  for (const table of ['learning_modules', 'learning_materials', 'assignments']) {
    const [columns] = await pool.query(`SHOW COLUMNS FROM ${table}`);
    if (!columns.some(column => column.Field === 'display_order')) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN display_order INT NOT NULL DEFAULT 0`);
    }
  }
  const [materialColumns] = await pool.query('SHOW COLUMNS FROM learning_materials');
  if (!materialColumns.some(column => column.Field === 'lesson_content')) await pool.query('ALTER TABLE learning_materials ADD COLUMN lesson_content LONGTEXT NULL');
  await pool.query("ALTER TABLE learning_materials MODIFY material_type ENUM('file','link','video','note') NOT NULL");
  await pool.query('UPDATE learning_modules SET display_order = week_number WHERE display_order = 0');
}

async function modulesFor(pool, studentId = null, staff = false) {
  const [modules] = await pool.query(`SELECT id, week_number AS weekNumber, title, summary, published FROM learning_modules ${staff ? '' : 'WHERE published = TRUE'} ORDER BY display_order, week_number`);
  for (const module of modules) {
    const [materials] = await pool.execute('SELECT id, title, material_type AS materialType, resource_url AS resourceUrl, lesson_content AS lessonContent, original_name AS originalName FROM learning_materials WHERE module_id = ? ORDER BY display_order, created_at, id', [module.id]);
    const [assignments] = studentId
      ? await pool.execute(
          `SELECT a.id, a.title, a.instructions, a.due_at AS dueAt, a.max_score AS maxScore,
            s.id AS submissionId, s.submission_url AS submissionUrl, s.note AS submissionNote,
            s.status AS submissionStatus, s.score, s.feedback, s.submitted_at AS submittedAt,
            CASE WHEN s.id IS NOT NULL AND s.submitted_at > a.due_at THEN TRUE ELSE FALSE END AS isLate
           FROM assignments a LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = ?
           WHERE a.module_id = ? ORDER BY a.display_order, a.due_at, a.id`, [studentId, module.id]
        )
      : await pool.execute(
          'SELECT id, title, instructions, due_at AS dueAt, max_score AS maxScore FROM assignments WHERE module_id = ? ORDER BY display_order, due_at, id',
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
      await pool.execute('INSERT INTO learning_modules (week_number, title, summary, published, created_by, display_order) SELECT ?, ?, ?, ?, ?, COALESCE(MAX(display_order), 0) + 1 FROM learning_modules', [weekNumber, title, String(req.body.summary || '').trim(), Boolean(req.body.published), req.user.id]);
      res.status(201).json({ message: `Week ${weekNumber} module created.` });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A module already exists for that week.' });
      next(error);
    }
  });

  app.patch('/api/staff/learning/modules/:id', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const [rows] = await pool.execute('SELECT * FROM learning_modules WHERE id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ message: 'Module not found.' });
      const current = rows[0];
      const weekNumber = req.body.weekNumber == null ? current.week_number : Number.parseInt(req.body.weekNumber, 10);
      const title = req.body.title == null ? current.title : String(req.body.title).trim();
      const summary = req.body.summary == null ? current.summary : String(req.body.summary).trim();
      const published = req.body.published == null ? current.published : Boolean(req.body.published);
      if (!weekNumber || weekNumber < 1 || weekNumber > 52 || !title) return res.status(400).json({ message: 'Add a valid week number and module title.' });
      const [result] = await pool.execute('UPDATE learning_modules SET week_number = ?, title = ?, summary = ?, published = ? WHERE id = ?', [weekNumber, title, summary, published, req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Module not found.' });
      res.json({ message: req.body.title == null ? (published ? 'Module published.' : 'Module returned to draft.') : 'Module updated.' });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'A module already exists for that week.' });
      next(error);
    }
  });

  app.patch('/api/staff/learning/materials/:id', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const title = String(req.body.title || '').trim();
      const materialType = ['link', 'video', 'file', 'note'].includes(req.body.materialType) ? req.body.materialType : '';
      const resourceUrl = String(req.body.resourceUrl || '').trim();
      const lessonContent = String(req.body.lessonContent || '').trim();
      if (!title || !materialType || (materialType === 'note' ? !lessonContent : !resourceUrl)) return res.status(400).json({ message: 'Complete the learning material before saving.' });
      const [result] = await pool.execute('UPDATE learning_materials SET title = ?, material_type = ?, resource_url = ?, lesson_content = ? WHERE id = ?', [title, materialType, materialType === 'note' ? '' : resourceUrl, materialType === 'note' ? lessonContent : null, req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Learning material not found.' });
      res.json({ message: 'Learning material updated.' });
    } catch (error) { next(error); }
  });

  app.delete('/api/staff/learning/materials/:id', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const [materials] = await pool.execute('SELECT resource_url AS resourceUrl, material_type AS materialType FROM learning_materials WHERE id = ?', [req.params.id]);
      if (!materials.length) return res.status(404).json({ message: 'Learning material not found.' });
      await pool.execute('DELETE FROM learning_materials WHERE id = ?', [req.params.id]);
      const material = materials[0];
      if (material.materialType === 'file' && material.resourceUrl.startsWith('/uploads/')) {
        const filename = path.basename(material.resourceUrl);
        await fs.promises.unlink(path.join(uploadDirectory, filename)).catch(() => {});
      }
      res.json({ message: 'Learning material deleted.' });
    } catch (error) { next(error); }
  });

  app.patch('/api/staff/learning/assignments/:id', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const title = String(req.body.title || '').trim();
      const instructions = String(req.body.instructions || '').trim();
      const dueAt = String(req.body.dueAt || '');
      const maxScore = Number.parseInt(req.body.maxScore, 10);
      if (!title || !instructions || !dueAt || !maxScore || maxScore < 1 || maxScore > 1000) return res.status(400).json({ message: 'Add a valid title, instructions, deadline and score.' });
      const [result] = await pool.execute('UPDATE assignments SET title = ?, instructions = ?, due_at = ?, max_score = ? WHERE id = ?', [title, instructions, dueAt, maxScore, req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Assignment not found.' });
      res.json({ message: 'Assignment updated.' });
    } catch (error) { next(error); }
  });

  app.patch('/api/staff/learning/order', requireAuth, requireStaff, async (req, res, next) => {
    const tables = { modules: 'learning_modules', materials: 'learning_materials', assignments: 'assignments' };
    const table = tables[req.body.entity];
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : [];
    if (!table || !ids.length || ids.some(id => !Number.isInteger(id) || id < 1) || new Set(ids).size !== ids.length) return res.status(400).json({ message: 'Choose valid content to rearrange.' });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await connection.execute(`SELECT id${table === 'learning_modules' ? '' : ', module_id AS moduleId'} FROM ${table} WHERE id IN (${placeholders})`, ids);
      if (rows.length !== ids.length || (table !== 'learning_modules' && new Set(rows.map(row => row.moduleId)).size !== 1)) throw new Error('Content order does not match one module.');
      for (let index = 0; index < ids.length; index += 1) await connection.execute(`UPDATE ${table} SET display_order = ? WHERE id = ?`, [index + 1, ids[index]]);
      await connection.commit();
      res.json({ message: 'Content order updated.' });
    } catch (error) {
      await connection.rollback();
      if (error.message.includes('Content order')) return res.status(400).json({ message: error.message });
      next(error);
    } finally { connection.release(); }
  });

  app.post('/api/staff/learning/modules/:id/materials', requireAuth, requireStaff, upload.single('file'), async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      const noteTitle = String(req.body.noteTitle || '').trim();
      const lessonContent = String(req.body.lessonContent || '').trim();
      const videoTitle = String(req.body.videoTitle || '').trim();
      const videoUrl = String(req.body.videoUrl || '').trim();
      const resourceTitle = String(req.body.resourceTitle || '').trim();
      const resourceUrl = String(req.body.resourceUrl || '').trim();
      const items = [];
      if (noteTitle || lessonContent) {
        if (!noteTitle || !lessonContent) return res.status(400).json({ message: 'Add both a lesson-note title and its content.' });
        items.push({ title: noteTitle, type: 'note', url: '', content: lessonContent, originalName: null });
      }
      if (videoTitle || videoUrl) {
        if (!videoTitle || !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(videoUrl)) return res.status(400).json({ message: 'Add a video title and a complete YouTube URL.' });
        items.push({ title: videoTitle, type: 'video', url: videoUrl, content: null, originalName: null });
      }
      if (resourceTitle || resourceUrl) {
        if (!resourceTitle || !/^https?:\/\//i.test(resourceUrl)) return res.status(400).json({ message: 'Add a resource title and complete URL.' });
        items.push({ title: resourceTitle, type: 'link', url: resourceUrl, content: null, originalName: null });
      }
      if (req.file) items.push({ title: String(req.body.fileTitle || req.file.originalname).trim(), type: 'file', url: `/uploads/${req.file.filename}`, content: null, originalName: req.file.originalname });
      if (!items.length) return res.status(400).json({ message: 'Add a lesson note, YouTube video, resource link or file.' });
      await connection.beginTransaction();
      const [[order]] = await connection.execute('SELECT COALESCE(MAX(display_order), 0) AS lastOrder FROM learning_materials WHERE module_id = ?', [req.params.id]);
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        await connection.execute('INSERT INTO learning_materials (module_id, title, material_type, resource_url, lesson_content, original_name, uploaded_by, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [req.params.id, item.title, item.type, item.url, item.content, item.originalName, req.user.id, Number(order.lastOrder) + index + 1]);
      }
      await connection.commit();
      res.status(201).json({ message: `${items.length} learning item${items.length === 1 ? '' : 's'} added to this week.` });
    } catch (error) { await connection.rollback(); next(error); }
    finally { connection.release(); }
  });

  app.post('/api/staff/learning/modules/:id/assignments', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const title = String(req.body.title || '').trim();
      const instructions = String(req.body.instructions || '').trim();
      const dueAt = String(req.body.dueAt || '');
      const maxScore = Math.min(1000, Math.max(1, Number.parseInt(req.body.maxScore, 10) || 100));
      if (!title || !instructions || !dueAt) return res.status(400).json({ message: 'Add a title, instructions and deadline.' });
      await pool.execute('INSERT INTO assignments (module_id, title, instructions, due_at, max_score, created_by, display_order) SELECT ?, ?, ?, ?, ?, ?, COALESCE(MAX(display_order), 0) + 1 FROM assignments WHERE module_id = ?', [req.params.id, title, instructions, dueAt, maxScore, req.user.id, req.params.id]);
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
