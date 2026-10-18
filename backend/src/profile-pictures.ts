// @ts-nocheck
import multer from 'multer';
import sharp from 'sharp';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';

export const PROFILE_PICTURE_LIMIT = 5 * 1024 * 1024;
export async function prepareProfilePicture(buffer) {
  const image = sharp(buffer, { limitInputPixels: 20_000_000, animated: false, failOn: 'warning' });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error('Choose a JPG, PNG or WebP photograph.');
  return image.rotate().resize(512, 512, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
}

export function registerProfilePictureRoutes(app, pool, requireAuth, directory = path.join(process.env.UPLOAD_DIR || '/app/uploads', 'profile-pictures')) {
  // These files are served only by the authenticated API, never by static uploads.
  app.use('/uploads/profile-pictures', (_req, res) => res.sendStatus(404));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: PROFILE_PICTURE_LIMIT, files: 1, fields: 0 } }).single('picture');
  app.post('/api/profile-picture', requireAuth, (req, res, next) => {
    upload(req, res, error => {
      if (error) return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Choose a picture smaller than 5 MB.' : 'Upload one picture using the picture field.' });
      next();
    });
  }, async (req, res, next) => {
    if (!req.file) return res.status(400).json({ message: 'Choose a picture to upload.' });
    let bytes;
    try { bytes = await prepareProfilePicture(req.file.buffer); }
    catch { return res.status(400).json({ message: 'Choose a valid JPG, PNG or WebP picture, up to 5 MB and 20 megapixels.' }); }
    const filename = `${randomUUID()}.webp`;
    try {
      const [users] = await pool.execute('SELECT profile_picture AS profilePicture FROM users WHERE id = ?', [req.user.id]);
      if (!users.length) return res.status(404).json({ message: 'Account not found.' });
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, filename), bytes, { flag: 'wx', mode: 0o600 });
      await pool.execute('UPDATE users SET profile_picture = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [filename, req.user.id]);
      const old = users[0].profilePicture;
      if (/^[a-f0-9-]{36}\.webp$/.test(old || '')) await unlink(path.join(directory, old)).catch(() => {});
      res.json({ profilePicture: filename, message: 'Your profile picture has been saved.' });
    } catch (error) { await unlink(path.join(directory, filename)).catch(() => {}); next(error); }
  });
  app.get('/api/profile-picture/:id', requireAuth, async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.sendStatus(400);
    if (Number(req.user.id) !== id && !['admin', 'mentor'].includes(req.user.role)) return res.sendStatus(403);
    try {
      const [users] = await pool.execute('SELECT profile_picture AS profilePicture FROM users WHERE id = ?', [id]);
      const filename = users[0]?.profilePicture;
      if (!/^[a-f0-9-]{36}\.webp$/.test(filename || '')) return res.sendStatus(404);
      res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      res.sendFile(path.resolve(directory, filename), error => { if (error && !res.headersSent) { if (error.statusCode === 404) res.sendStatus(404); else next(error); } });
    } catch (error) { next(error); }
  });
}
