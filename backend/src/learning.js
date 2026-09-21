import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { notifyStudents, notifyUser } from './notifications.js';

const uploadDirectory = process.env.UPLOAD_DIR || path.resolve('uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });
const assignmentDirectory = path.join(uploadDirectory, '.assignments');
fs.mkdirSync(assignmentDirectory, { recursive: true });
const assignmentUpload = multer({
  storage: multer.diskStorage({ destination: assignmentDirectory, filename: (_req, _file, done) => done(null, crypto.randomUUID()) }),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, done) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt', '.zip', '.png', '.jpg', '.jpeg', '.sh', '.yaml', '.yml', '.json'].includes(path.extname(file.originalname).toLowerCase());
    done(allowed ? null : new Error('Unsupported assignment file type.'), allowed);
  }
}).array('file', 5);

function attachments(row) {
  return row?.files?.length ? row.files : row?.filePath ? [{ path: row.filePath, name: row.fileName }] : [];
}
function parseSlots(value) {
  const slots = typeof value === 'string' ? JSON.parse(value) : (value || []);
  if (!Array.isArray(slots) || slots.length > 5 || slots.some(s => !s || typeof s.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(s.id) || typeof s.label !== 'string' || !s.label.trim() || s.label.length > 120) || new Set(slots.map(s => s.id)).size !== slots.length) throw new Error('Configure up to five files with unique IDs and names.');
  return slots.map(s => ({ id: s.id, label: s.label.trim() }));
}
function readSlots(req, res) {
  try { return parseSlots(req.body.uploadSlots); }
  catch { res.status(400).json({ message: 'Give each requested file a name (maximum five, 120 characters each).' }); return null; }
}

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
  const visibleModules = [];
  for (const module of modules) {
    const [materials] = studentId
      ? await pool.execute(`SELECT lm.id, lm.title, lm.material_type AS materialType, lm.resource_url AS resourceUrl,
          lm.lesson_content AS lessonContent, lm.original_name AS originalName, COALESCE(mp.status, 'not_started') AS progressStatus
          FROM learning_materials lm LEFT JOIN material_progress mp ON mp.material_id = lm.id AND mp.student_id = ?
          WHERE lm.module_id = ? AND lm.visible = TRUE ORDER BY lm.display_order, lm.created_at, lm.id`, [studentId, module.id])
      : await pool.execute('SELECT id, title, material_type AS materialType, resource_url AS resourceUrl, lesson_content AS lessonContent, original_name AS originalName, visible FROM learning_materials WHERE module_id = ? ORDER BY display_order, created_at, id', [module.id]);
    const [assignments] = studentId
      ? await pool.execute(
          `SELECT a.id, a.title, a.instructions, a.due_at AS dueAt, a.max_score AS maxScore, a.upload_slots AS uploadSlots,
            a.assignment_type AS assignmentType, a.closed_at AS closedAt,
            s.id AS submissionId, s.submission_url AS submissionUrl, s.note AS submissionNote, s.file_name AS fileName, s.files,
            s.status AS submissionStatus, s.score, s.feedback, s.submitted_at AS submittedAt,
            CASE WHEN s.id IS NOT NULL AND s.submitted_at > a.due_at THEN TRUE ELSE FALSE END AS isLate
           FROM assignments a LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = ?
           WHERE a.module_id = ? ORDER BY a.display_order, a.due_at, a.id`, [studentId, module.id]
        )
      : await pool.execute(
          'SELECT id, title, instructions, due_at AS dueAt, max_score AS maxScore, upload_slots AS uploadSlots, assignment_type AS assignmentType, closed_at AS closedAt FROM assignments WHERE module_id = ? ORDER BY display_order, due_at, id',
          [module.id]
        );
    module.materials = materials;
    module.assignments = assignments;
    if (studentId) {
      const hasLearningWork = materials.length > 0 || assignments.length > 0;
      module.isComplete = hasLearningWork
        && materials.every(material => material.progressStatus === 'done')
        && assignments.filter(assignment => assignment.assignmentType !== 'manual').every(assignment => Boolean(assignment.closedAt || assignment.submissionId));
      visibleModules.push(module);
      if (!module.isComplete) break;
    }
  }
  return studentId ? visibleModules : modules;
}

export function registerLearningRoutes(app, pool, requireAuth, requireStaff) {
  app.get('/api/assignments/pending-count', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role === 'student') {
        const modules = await modulesFor(pool, req.user.id);
        const count = modules.flatMap(module => module.assignments)
          .filter(assignment => assignment.assignmentType !== 'manual'
            && (!assignment.closedAt || assignment.submissionStatus === 'rejected')
            && (!assignment.submissionId || assignment.submissionStatus === 'rejected')).length;
        return res.json({ count });
      }
      if (!['admin', 'mentor'].includes(req.user.role)) return res.status(403).json({ message: 'Access denied.' });
      const [rows] = await pool.query("SELECT COUNT(*) AS count FROM assignment_submissions WHERE status IN ('submitted', 'needs_correction')");
      res.json({ count: Number(rows[0].count) });
    } catch (error) { next(error); }
  });
  app.get('/api/student/learning', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      const modules = await modulesFor(pool, req.user.id, false);
      const [publishedResult, scoreResult, progressResult] = await Promise.all([
        pool.query('SELECT COUNT(*) AS total FROM learning_modules WHERE published = TRUE'),
        pool.execute(`SELECT COUNT(*) AS gradedCount,
          COALESCE(SUM(s.score), 0) AS earnedPoints,
          COALESCE(SUM(a.max_score), 0) AS possiblePoints
          FROM assignment_submissions s
          JOIN assignments a ON a.id = s.assignment_id
          JOIN learning_modules m ON m.id = a.module_id
          WHERE s.student_id = ? AND s.status = 'completed' AND s.score IS NOT NULL AND m.published = TRUE`, [req.user.id]),
        pool.execute(`SELECT COUNT(a.id) AS total,
          COALESCE(SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
          COALESCE(SUM(CASE WHEN s.status = 'unavailable' THEN 1 ELSE 0 END), 0) AS unavailable
          FROM assignments a JOIN learning_modules m ON m.id = a.module_id
          LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = ?
          WHERE m.published = TRUE`, [req.user.id])
      ]);
      const published = publishedResult[0][0];
      const scoreRow = scoreResult[0][0];
      const progressRow = progressResult[0][0];
      const total = Number(progressRow.total || 0);
      const completed = Number(progressRow.completed || 0);
      const earnedPoints = Number(scoreRow.earnedPoints || 0);
      const possiblePoints = Number(scoreRow.possiblePoints || 0);
      res.json({
        modules,
        lockedWeeks: Math.max(0, Number(published.total) - modules.length),
        progress: { completed, total, unavailable: Number(progressRow.unavailable || 0), percentage: total ? Math.round(completed / total * 100) : 0 },
        scoreSummary: {
          gradedCount: Number(scoreRow.gradedCount || 0),
          earnedPoints,
          possiblePoints,
          percentage: possiblePoints ? Math.round((earnedPoints / possiblePoints) * 100) : null
        }
      });
    } catch (error) { next(error); }
  });

  app.get('/api/staff/learning', requireAuth, requireStaff, async (_req, res, next) => {
    try {
      const modules = await modulesFor(pool, null, true);
      const [submissions] = await pool.query(`SELECT s.id, s.assignment_id AS assignmentId, s.student_id AS studentId,
        u.full_name AS studentName, u.email, s.submission_url AS submissionUrl, s.note, s.status, s.score, s.file_name AS fileName, s.files,
        s.feedback, s.submitted_at AS submittedAt, a.title AS assignmentTitle, a.due_at AS dueAt, a.assignment_type AS assignmentType,
        CASE WHEN s.submitted_at > a.due_at THEN TRUE ELSE FALSE END AS isLate
        FROM assignment_submissions s JOIN users u ON u.id = s.student_id JOIN assignments a ON a.id = s.assignment_id
        ORDER BY CASE WHEN s.status IN ('submitted', 'needs_correction') THEN 1 ELSE 2 END, s.submitted_at DESC`);
      const [materialProgress] = await pool.query(`SELECT u.id AS studentId, u.full_name AS studentName, u.email,
        lm.id AS materialId, lm.title AS materialTitle, lm.material_type AS materialType, lm.visible,
        m.id AS moduleId, m.week_number AS weekNumber, m.title AS moduleTitle,
        COALESCE(mp.status, 'not_started') AS status, mp.updated_at AS updatedAt
        FROM users u CROSS JOIN learning_materials lm JOIN learning_modules m ON m.id = lm.module_id
        LEFT JOIN material_progress mp ON mp.student_id = u.id AND mp.material_id = lm.id
        WHERE u.role = 'student' AND u.status = 'approved'
        ORDER BY u.full_name, m.display_order, lm.display_order`);
      const [students] = await pool.query("SELECT id, full_name AS fullName, email FROM users WHERE role = 'student' AND status = 'approved' ORDER BY full_name, id");
      res.json({ modules, submissions, materialProgress, students });
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

  app.patch('/api/staff/learning/materials/:id/visibility', requireAuth, requireStaff, async (req, res, next) => {
    try {
      if (typeof req.body.visible !== 'boolean') return res.status(400).json({ message: 'Choose whether this material should be visible.' });
      const [result] = await pool.execute('UPDATE learning_materials SET visible = ? WHERE id = ?', [req.body.visible, req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Learning material not found.' });
      res.json({ message: req.body.visible ? 'Learning material is now visible to students.' : 'Learning material hidden from students.' });
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
      const slots = readSlots(req, res); if (!slots) return;
      const [result] = await pool.execute('UPDATE assignments SET title = ?, instructions = ?, due_at = ?, max_score = ?, upload_slots = COALESCE(?::jsonb, upload_slots) WHERE id = ?', [title, instructions, dueAt, maxScore, req.body.uploadSlots == null ? null : JSON.stringify(slots), req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Assignment not found.' });
      res.json({ message: 'Assignment updated.' });
    } catch (error) { next(error); }
  });

  app.patch('/api/staff/learning/assignments/:id/status', requireAuth, requireStaff, async (req, res, next) => {
    try {
      if (typeof req.body.closed !== 'boolean') return res.status(400).json({ message: 'Choose whether the assignment is open or closed.' });
      const [result] = await pool.execute('UPDATE assignments SET closed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?', [req.body.closed, req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Assignment not found.' });
      res.json({ message: req.body.closed ? 'Assignment closed. Students can no longer submit it.' : 'Assignment reopened for students.' });
    } catch (error) { next(error); }
  });

  app.put('/api/staff/learning/assignments/:id/manual-results', requireAuth, requireStaff, async (req, res, next) => {
    const connection = await pool.getConnection();
    try {
      const [assignments] = await connection.execute('SELECT title, max_score AS maxScore, assignment_type AS assignmentType FROM assignments WHERE id = ?', [req.params.id]);
      const assignment = assignments[0];
      if (!assignment) return res.status(404).json({ message: 'Assignment not found.' });
      if (assignment.assignmentType !== 'manual') return res.status(409).json({ message: 'Manual results are only available for DM assignments.' });
      const results = Array.isArray(req.body.results) ? req.body.results : [];
      if (!results.length) return res.status(400).json({ message: 'Add at least one student result.' });
      const ids = results.map(result => Number(result.studentId));
      if (ids.some(id => !Number.isInteger(id) || id < 1) || new Set(ids).size !== ids.length) return res.status(400).json({ message: 'Choose valid students.' });
      const placeholders = ids.map(() => '?').join(',');
      const [students] = await connection.execute(`SELECT id FROM users WHERE role = 'student' AND status = 'approved' AND id IN (${placeholders})`, ids);
      if (students.length !== ids.length) return res.status(400).json({ message: 'One or more students are not approved students.' });
      const normalized = results.map(result => {
        const outcome = result.outcome === 'unavailable' ? 'unavailable' : result.outcome === 'scored' ? 'completed' : '';
        const score = outcome === 'completed' ? Number.parseInt(result.score, 10) : null;
        if (!outcome || (outcome === 'completed' && (!Number.isInteger(score) || score < 0 || score > Number(assignment.maxScore)))) throw new Error(`Scores must be between 0 and ${assignment.maxScore}, or marked unavailable.`);
        const feedback = String(result.feedback || '').trim().slice(0, 1000) || (outcome === 'completed' ? 'Result recorded by your mentor for work submitted via DM.' : 'No work was received for this assignment.');
        return { studentId: Number(result.studentId), status: outcome, score, feedback };
      });
      await connection.beginTransaction();
      for (const result of normalized) {
        await connection.execute(`INSERT INTO assignment_submissions
          (assignment_id, student_id, submission_url, note, status, score, feedback, reviewed_at, reviewed_by)
          VALUES (?, ?, '', 'Submitted directly to mentor', ?, ?, ?, CURRENT_TIMESTAMP, ?)
          ON CONFLICT (assignment_id, student_id) DO UPDATE SET status = EXCLUDED.status, score = EXCLUDED.score,
          feedback = EXCLUDED.feedback, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = EXCLUDED.reviewed_by`,
          [req.params.id, result.studentId, result.status, result.score, result.feedback, req.user.id]);
      }
      await connection.commit();
      res.json({ message: `${normalized.length} manual result${normalized.length === 1 ? '' : 's'} saved.` });
    } catch (error) {
      await connection.rollback();
      if (error.message.startsWith('Scores must')) return res.status(400).json({ message: error.message });
      next(error);
    } finally { connection.release(); }
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
      const assignmentType = req.body.assignmentType === 'manual' ? 'manual' : 'portal';
      const instructions = String(req.body.instructions || '').trim() || (assignmentType === 'manual' ? 'Submit this assignment directly to your mentor through DM.' : '');
      const dueAt = String(req.body.dueAt || '');
      const maxScore = Math.min(1000, Math.max(1, Number.parseInt(req.body.maxScore, 10) || 100));
      if (!title || !instructions || !dueAt) return res.status(400).json({ message: 'Add a title, instructions and deadline.' });
      const slots = assignmentType === 'portal' ? readSlots(req, res) : [];
      if (!slots) return;
      await pool.execute('INSERT INTO assignments (module_id, title, instructions, due_at, max_score, created_by, upload_slots, assignment_type, display_order) SELECT ?, ?, ?, ?, ?, ?, ?::jsonb, ?, COALESCE(MAX(display_order), 0) + 1 FROM assignments WHERE module_id = ?', [req.params.id, title, instructions, dueAt, maxScore, req.user.id, JSON.stringify(slots), assignmentType, req.params.id]);
      await notifyStudents(pool, { title: `New assignment: ${title}`, message: `A new assignment is due ${new Date(dueAt).toLocaleString('en-GB')}.`, category: 'assignment', actionTarget: 'Learning' });
      res.status(201).json({ message: 'Assignment created.' });
    } catch (error) { next(error); }
  });

  app.get('/api/submissions/:id/file', requireAuth, async (req, res, next) => {
    try {
      const [rows] = await pool.execute('SELECT student_id AS studentId, file_path AS filePath, file_name AS fileName, files FROM assignment_submissions WHERE id = ?', [req.params.id]);
      const item = rows[0];
      const index = Number(req.query.index || 0);
      const file = Number.isInteger(index) && index >= 0 ? attachments(item)[index] : null;
      if (!file) return res.status(404).json({ message: 'Attachment not found.' });
      if (req.user.role === 'student' && Number(item.studentId) !== Number(req.user.id)) return res.status(403).json({ message: 'Access denied.' });
      res.download(path.join(assignmentDirectory, path.basename(file.path)), file.name);
    } catch (error) { next(error); }
  });

  app.put('/api/student/assignments/:id/submission', requireAuth, (req, res, next) => {
    if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
    assignmentUpload(req, res, error => error ? res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Each attachment must be 15 MB or smaller.' : 'Upload up to five supported files, each up to 15 MB.' }) : next());
  }, async (req, res, next) => {
    let saved = false;
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      const submissionUrl = String(req.body.submissionUrl || '').trim();
      if (submissionUrl && !/^https?:\/\//i.test(submissionUrl)) return res.status(400).json({ message: 'Enter a complete GitHub or project URL.' });
      const modules = await modulesFor(pool, req.user.id);
      if (!modules.some(module => module.assignments.some(a => Number(a.id) === Number(req.params.id)))) return res.status(404).json({ message: 'Assignment is not available yet.' });
      const [previous] = await pool.execute('SELECT file_path AS filePath, file_name AS fileName, files, status FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?', [req.params.id, req.user.id]);
      if (previous[0]?.status === 'completed') return res.status(409).json({ message: 'This assignment already has a final result and can no longer be changed.' });
      const assignment = modules.flatMap(m => m.assignments).find(a => Number(a.id) === Number(req.params.id));
      if (assignment.assignmentType === 'manual') return res.status(409).json({ message: 'This assignment must be submitted directly to your mentor.' });
      if (assignment.closedAt && previous[0]?.status !== 'rejected') return res.status(409).json({ message: 'This assignment is closed and no longer accepts submissions.' });
      const slots = assignment.uploadSlots || [];
      let files;
      if (slots.length) {
        let ids;
        try { ids = JSON.parse(req.body.fileSlots || '[]'); } catch { return res.status(400).json({ message: 'Invalid file slots.' }); }
        if (!Array.isArray(ids) || ids.length !== (req.files || []).length || new Set(ids).size !== ids.length || ids.some(id => !slots.some(s => s.id === id))) return res.status(400).json({ message: 'Match each upload to a requested file.' });
        const incoming = (req.files || []).map((f, i) => ({ path: f.filename, name: f.originalname, slotId: ids[i] }));
        files = slots.map(slot => {
          const file = incoming.find(f => f.slotId === slot.id) || attachments(previous[0]).find(f => f.slotId === slot.id);
          return file ? { ...file, label: slot.label } : null;
        }).filter(Boolean);
      } else {
        files = req.files?.length ? req.files.map(file => ({ path: file.filename, name: file.originalname })) : attachments(previous[0]);
      }
      const filePath = files[0]?.path || null;
      const fileName = files[0]?.name || null;
      await pool.execute(`INSERT INTO assignment_submissions (assignment_id, student_id, submission_url, note, file_path, file_name, files)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (assignment_id, student_id) DO UPDATE SET submission_url = EXCLUDED.submission_url, note = EXCLUDED.note, file_path = EXCLUDED.file_path, file_name = EXCLUDED.file_name, files = EXCLUDED.files,
        status = 'submitted', score = NULL, feedback = NULL, reviewed_at = NULL, reviewed_by = NULL, submitted_at = CURRENT_TIMESTAMP`,
        [req.params.id, req.user.id, submissionUrl, String(req.body.note || '').trim(), filePath, fileName, JSON.stringify(files)]);
      saved = true;
      await Promise.all(attachments(previous[0]).filter(old => !files.some(f => f.path === old.path)).map(file => fs.promises.unlink(path.join(assignmentDirectory, path.basename(file.path))).catch(() => {})));
      res.json({ message: 'Assignment submitted successfully.' });
    } catch (error) { next(error); }
    finally { if (!saved) await Promise.all((req.files || []).map(file => fs.promises.unlink(file.path).catch(() => {}))); }
  });

  app.put('/api/student/learning/materials/:id/progress', requireAuth, async (req, res, next) => {
    try {
      if (req.user.role !== 'student') return res.status(403).json({ message: 'Student access required.' });
      const status = ['not_started', 'in_progress', 'done'].includes(req.body.status) ? req.body.status : '';
      if (!status) return res.status(400).json({ message: 'Choose a valid progress status.' });
      const [materials] = await pool.execute(`SELECT lm.id FROM learning_materials lm JOIN learning_modules m ON m.id = lm.module_id
        WHERE lm.id = ? AND m.published = TRUE AND lm.visible = TRUE`, [req.params.id]);
      if (!materials.length) return res.status(404).json({ message: 'Learning material not found.' });
      await pool.execute(`INSERT INTO material_progress (material_id, student_id, status) VALUES (?, ?, ?)
        ON CONFLICT (material_id, student_id) DO UPDATE SET status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP`, [req.params.id, req.user.id, status]);
      res.json({ message: 'Learning progress updated.' });
    } catch (error) { next(error); }
  });

  app.patch('/api/staff/submissions/:id/reject', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const reason = String(req.body.reason || '').trim();
      if (!reason || reason.length > 500) return res.status(400).json({ message: 'Enter a rejection reason (1–500 characters).' });
      const [rows] = await pool.execute('SELECT s.student_id AS studentId, s.status, a.title FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id WHERE s.id = ?', [req.params.id]);
      if (!rows.length) return res.status(404).json({ message: 'Submission not found.' });
      const [result] = await pool.execute("UPDATE assignment_submissions SET status = 'rejected', score = NULL, feedback = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ? AND status <> 'rejected'", [reason, req.user.id, req.params.id]);
      if (!result.affectedRows) return res.status(409).json({ message: 'This submission has already been rejected.' });
      await notifyUser(pool, rows[0].studentId, { title: 'Assignment needs to be redone', message: `${reason} Open Assignments to redo and resubmit your work.`, emailMessage: `Your submission for “${rows[0].title}” needs to be redone. Reason: ${reason}. Sign in to your student portal, open Assignments, and submit the corrected work for another review.`, category: 'review', actionTarget: 'Assignments' });
      res.json({ message: 'Assignment rejected for correction. The student can now redo and resubmit it; email delivery follows your email settings.' });
    } catch (error) { next(error); }
  });

  app.patch('/api/staff/submissions/:id/review', requireAuth, requireStaff, async (req, res, next) => {
    try {
      const feedback = String(req.body.feedback || '').trim();
      const score = req.body.score === '' || req.body.score == null ? null : Number.parseInt(req.body.score, 10);
      if (!feedback) return res.status(400).json({ message: 'Add final feedback.' });
      if (score === null || score < 0 || score > 1000) return res.status(400).json({ message: 'Enter the final score.' });
      const [result] = await pool.execute("UPDATE assignment_submissions SET status = 'completed', score = ?, feedback = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?", [score, feedback, req.user.id, req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Submission not found.' });
      const [submissions] = await pool.execute('SELECT student_id AS studentId FROM assignment_submissions WHERE id = ?', [req.params.id]);
      if (submissions.length) await notifyUser(pool, submissions[0].studentId, { title: 'Final assignment result', message: feedback.slice(0, 500), category: 'review', actionTarget: 'Learning' });
      res.json({ message: 'Final result published.' });
    } catch (error) { next(error); }
  });
}
