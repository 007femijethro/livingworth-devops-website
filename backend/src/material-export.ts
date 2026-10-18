// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || '/app/uploads');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const file of files) {
    const name = Buffer.from(file.name.replace(/\\/g, '/'), 'utf8');
    const body = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
    const compressed = zlib.deflateRawSync(body);
    const checksum = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(checksum, 16); central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(body.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function safeName(value, fallback) {
  const cleaned = String(value || fallback).normalize('NFKD').replace(/[^a-zA-Z0-9._ -]/g, '').trim().replace(/[ .]+/g, '-');
  return cleaned.slice(0, 90) || fallback;
}

export function registerMaterialExportRoutes(app, pool, requireAuth, requireStaff) {
  app.get('/api/staff/learning/materials/export.zip', requireAuth, requireStaff, async (_req, res, next) => {
    try {
      const [rows] = await pool.query(`SELECT m.week_number AS weekNumber, m.title AS moduleTitle,
        lm.id, lm.title, lm.material_type AS materialType, lm.resource_url AS resourceUrl,
        lm.lesson_content AS lessonContent, lm.original_name AS originalName
        FROM learning_modules m LEFT JOIN learning_materials lm ON lm.module_id = m.id
        ORDER BY m.display_order, m.week_number, lm.display_order, lm.created_at, lm.id`);
      const files = [];
      const manifest = ['Livingworth Academy — course materials', '', 'Uploaded files and lesson notes are included in this archive.', 'Links and video URLs are listed below; open them while online.', ''];
      const usedNames = new Set();
      for (const row of rows) {
        const week = `Week ${String(row.weekNumber).padStart(2, '0')} - ${safeName(row.moduleTitle, 'Course materials')}`;
        if (!row.id) { manifest.push(`${week}: no materials`); continue; }
        const title = String(row.title || 'Untitled material');
        if (row.materialType === 'note') {
          files.push({ name: `${week}/${safeName(title, 'lesson-note')}.md`, data: `# ${title}\n\n${row.lessonContent || ''}\n` });
          manifest.push(`${week} — ${title}: lesson note included`);
        } else if (row.materialType === 'file') {
          const url = String(row.resourceUrl || '');
          const filename = path.basename(url);
          const filePath = path.resolve(uploadDirectory, filename);
          if (url.startsWith('/uploads/') && filePath.startsWith(`${uploadDirectory}${path.sep}`) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const original = safeName(row.originalName || path.extname(filename), 'material');
            let archiveName = `${week}/${original}`;
            let counter = 2;
            while (usedNames.has(archiveName)) {
              const ext = path.extname(original); archiveName = `${week}/${path.basename(original, ext)}-${counter++}${ext}`;
            }
            usedNames.add(archiveName);
            files.push({ name: archiveName, data: fs.readFileSync(filePath) });
            manifest.push(`${week} — ${title}: ${archiveName}`);
          } else manifest.push(`${week} — ${title}: uploaded file unavailable (${row.originalName || 'file'})`);
        } else {
          manifest.push(`${week} — ${title} (${row.materialType || 'resource'}): ${row.resourceUrl || 'URL missing'}`);
        }
      }
      files.unshift({ name: 'README.txt', data: manifest.join('\n') });
      const archive = buildZip(files);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="livingworth-course-materials.zip"');
      res.setHeader('Content-Length', archive.length);
      res.send(archive);
    } catch (error) { next(error); }
  });
}
