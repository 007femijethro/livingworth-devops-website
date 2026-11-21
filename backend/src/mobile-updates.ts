// @ts-nocheck
import path from 'node:path';
import fs from 'node:fs/promises';
import { getAcademySettings } from './academy-settings.js';

export function registerMobileUpdateRoutes(app, directories = {}) {
  const publicDir = directories.publicDir || path.resolve(process.env.UPLOAD_DIR || '/app/uploads', 'mobile-updates');
  const privateDir = directories.privateDir || path.resolve(process.env.MOBILE_UPDATE_PRIVATE_DIR || '/app/mobile-private');
  const send = (res, next, file, immutable = false) => {
    res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-store');
    res.sendFile(file, error => {
      if (!error) return;
      if (error.code === 'ENOENT') res.status(404).json({ message: 'No mobile update is published yet.' });
      else next(error);
    });
  };
  app.get('/api/mobile-updates/public-key.pem', (_req, res, next) => send(res, next, path.join(privateDir, 'update-public.pem')));
  app.get('/api/mobile-updates/android/:version/manifest.json', async (req, res, next) => {
    if (!/^[1-9][0-9]{0,5}$/.test(req.params.version)) return res.status(400).json({ message: 'Invalid Android version.' });
    if (!getAcademySettings().mobileUpdatesEnabled) return res.status(204).set('Cache-Control','no-store').end();
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(publicDir, 'android', req.params.version, 'manifest.json'), 'utf8'));
      // The ZIP signature is unchanged. Keep each generation of installed apps on its own HTTPS origin.
      const hostname = req.hostname;
      if (['academy.livingworth.co.uk', 'bridgess.co.uk'].includes(hostname)) manifest.url = `https://${hostname}/api/mobile-updates/bundles/${manifest.bundleId}.zip`;
      res.set('Cache-Control', 'no-store').json(manifest);
    } catch (error) {
      if (error.code === 'ENOENT') return res.status(404).json({message:'No mobile update is published yet.'});
      next(error);
    }
  });
  app.get('/api/mobile-updates/bundles/:bundle', (req, res, next) => {
    if (!/^android-[1-9][0-9]{0,5}-[a-f0-9]{64}\.zip$/.test(req.params.bundle)) return res.status(400).json({ message: 'Invalid update bundle.' });
    send(res, next, path.join(publicDir, 'bundles', req.params.bundle), true);
  });
}
