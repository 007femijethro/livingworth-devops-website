import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { notifyStudents, notifyUser } from './notifications.js';

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

async function modulesFor(pool, studentId = null, staff = false) {
  const [modules] = await pool.query(`SELECT id, week_number AS weekNumber, title, summary, published FROM learning_modules ${staff ? '' : 'WHERE published = TRUE'} ORDER BY display_order, week_number`);
  for (const module of modules) {
    const [materials] = studentId
      ? await pool.execute(`SELECT lm.id, lm.title, lm.material_type AS materialType, lm.resource_url AS resourceUrl,
          lm.lesson_content AS lessonContent, lm.original_name AS originalName, COALESCE(mp.status, 'not_started') AS progressStatus
          FROM learning_materials lm LEFT JOIN material_progress mp ON mp.material_id = lm.id AND mp.student_id = ?
          WHERE lm.module_id = ? ORDER BY lm.display_order, lm.created_at, lm.id`, [studentId, module.id])
      : await pool.execute('SELECT id, title, material_type AS materialType, resource_url AS resourceUrl, lesson_content AS lessonContent, original_name AS originalName FROM learning_materials WHERE module_id = ? ORDER BY display_order, created_at, id', [module.id]);
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
        ORDER BY CASE s.status WHEN 'submitted' THEN 1 WHEN 'needs_correction' THEN 2 ELSE 3 END, s.submitted_at DESC`);
      const [materialProgress] = await pool.query(`SELECT u.id AS studentId, u.full_name AS studentName, u.email,
        lm.id AS materialId, lm.title AS materialTitle, lm.material_type AS materialType,
        m.id AS moduleId, m.week_number AS weekNumber, m.title AS moduleTitle,
        COALESCE(mp.status, 'not_started') AS status, mp.updated_at AS updatedAt
        FROM users u CROSS JOIN learning_materials lm JOIN learning_modules m ON m.id = lm.module_id
        LEFT JOIN material_progress mp ON mp.student_id = u.id AND mp.material_id = lm.id
        WHERE u.role = 'student' AND u.status = 'approved'
        ORDER BY u.full_name, m.display_order, lm.display_order`);
      res.json({ modules, submissions, materialProgress });
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
      if (published && !current.published) await notifyStudents(pool, { title: `New learning content: ${title}`, message: `Week ${weekNumber} is now available in your learning workspace.`, category: 'learning', actionTarget: 'Learning' });
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
      const title = String(req.body.title || '').trim();
      const lessonContent = String(req.body.lessonContent || '').trim();
      const videoUrl = String(req.body.videoUrl || '').trim();
      const resourceUrl = String(req.body.resourceUrl || '').trim();
      const items = [];
      if (!title) return res.status(400).json({ message: 'Add the topic or title for this learning content.' });
      if (lessonContent) items.push({ title, type: 'note', url: '', content: lessonContent, originalName: null });
      if (videoUrl) {
        if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(videoUrl)) return res.status(400).json({ message: 'Add a complete YouTube URL.' });
        items.push({ title, type: 'video', url: videoUrl, content: null, originalName: null });
      }
      if (resourceUrl) {
        if (!/^https?:\/\//i.test(resourceUrl)) return res.status(400).json({ message: 'Add a complete resource URL.' });
        items.push({ title, type: 'link', url: resourceUrl, content: null, originalName: null });
      }
      if (req.file) items.push({ title, type: 'file', url: `/uploads/${req.file.filename}`, content: null, originalName: req.file.originalname });
      if (!items.length) return res.status(400).json({ message: 'Add a lesson note, YouTube video, resource link or file.' });
      await connection.beginTransaction();
      const [[order]] = await connection.execute('SELECT COALESCE(MAX(display_order), 0) AS lastOrder FROM learning_materials WHERE module_id = ?', [req.params.id]);
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        await connection.execute('INSERT INTO learning_materials (module_id, title, material_type, resource_url, lesson_content, original_name, uploaded_by, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [req.params.id, item.title, item.type, item.url, item.content, item.originalName, req.user.id, Number(order.lastOrder) + index + 1]);
      }
      await connection.commit();
      const [modules] = await pool.execute('SELECT week_number AS weekNumber, title, published FROM learning_modules WHERE id = ?', [req.params.id]);
      if (modules[0]?.published) await notifyStudents(pool, {
        title: `New learning material: ${title}`,
        message: `${items.length} new learning item${items.length === 1 ? '' : 's'} added to Week ${modules[0].weekNumber}: ${modules[0].title}.`,
        category: 'learning', actionTarget: 'Learning'
      });
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
      await notifyStudents(pool, { title: `New assignment: ${title}`, message: `A new assignment is due ${new Date(dueAt).toLocaleString('en-GB')}.`, category: 'assignment', actionTarget: 'Learning' });
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
        VALUES (?, ?, ?, ?) ON CONFLICT (assignment_id, student_id) DO UPDATE SET submission_url = EXCLUDED.submission_url, note = EXCLUDED.note,
        status = 'submitted', score = NULL, feedback = NULL, submitted_at = CURRENT_TIMESTAMP`,
        [req.params.id, req.user.id, submissionUrl, String(req.body.note || '').trim()]);
      res.json({ message: 'Assignment submitted successfully.' });
    } catch (error) { next(error); }
  });

  app.put('/api/student/learning/materials/:id/progress', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      const status = ['not_started', 'in_progress', 'done'].includes(req.body.status) ? req.body.status : '';
      if (!status) return res.status(400).json({ message: 'Choose a valid progress status.' });
      const [materials] = await pool.execute(`SELECT lm.id FROM learning_materials lm JOIN learning_modules m ON m.id = lm.module_id
        WHERE lm.id = ? AND m.published = TRUE`, [req.params.id]);
      if (!materials.length) return res.status(404).json({ message: 'Learning material not found.' });
      await pool.execute(`INSERT INTO material_progress (material_id, student_id, status) VALUES (?, ?, ?)
        ON CONFLICT (material_id, student_id) DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP`, [req.params.id, req.user.id, status]);
      res.json({ message: 'Learning progress updated.' });
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
      const [submissions] = await pool.execute('SELECT student_id AS studentId FROM assignment_submissions WHERE id = ?', [req.params.id]);
      if (submissions.length) await notifyUser(pool, submissions[0].studentId, { title: 'Assignment reviewed', message: feedback, category: 'review', actionTarget: 'Learning' });
      res.json({ message: status === 'completed' ? 'Submission marked complete.' : 'Correction requested.' });
    } catch (error) { next(error); }
  });
}
