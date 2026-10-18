import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';

export async function publishMobileUpdate({ webDir, privateDir, publicDir, origin = 'https://bridgess.co.uk' }) {
  const runtime = JSON.parse(await fs.readFile(path.join(webDir, 'mobile-runtime.json'), 'utf8'));
  if (!Number.isSafeInteger(runtime.nativeVersionCode) || runtime.nativeVersionCode < 1 || !/^[a-f0-9]{64}$/.test(runtime.nativeFingerprint)) throw new Error('Missing or invalid native runtime metadata');
  await fs.access(path.join(webDir, 'index.html'));
  await fs.mkdir(privateDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(publicDir, { recursive: true });
  const baselinePath = path.join(privateDir, `runtime-${runtime.nativeVersionCode}.json`);
  let baseline;
  try { baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (baseline && baseline.nativeFingerprint !== runtime.nativeFingerprint) throw new Error('Native files/plugins changed: increment Android versionCode before publishing a compatible app update. Previous update remains available.');

  const privatePath = path.join(privateDir, 'update-private.pem');
  let privateKey;
  try { privateKey = await fs.readFile(privatePath, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const keys = generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    await fs.writeFile(privatePath, keys.privateKey, { flag: 'wx', mode: 0o600 });
    privateKey = keys.privateKey;
  }
  const { createPublicKey } = await import('node:crypto');
  const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
  await fs.writeFile(path.join(privateDir, 'update-public.pem'), publicKey, { mode: 0o644 });
  const files = {};
  let totalBytes = 0;
  async function collect(directory, prefix = '') {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.')) continue;
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await collect(path.join(directory, entry.name), relative + '/');
      else if (entry.isFile()) {
        const bytes = await fs.readFile(path.join(directory, entry.name));
        totalBytes += bytes.length;
        if (totalBytes > 50 * 1024 * 1024) throw new Error('Mobile web bundle exceeds 50 MiB');
        files[relative] = [bytes, { mtime: new Date('1980-01-01T00:00:00Z') }];
      } else throw new Error('Only regular web assets are allowed');
    }
  }
  await collect(webDir);
  const bundle = Buffer.from(zipSync(files, { level: 6 }));
  const checksum = createHash('sha256').update(bundle).digest('hex');
  const signature = sign('RSA-SHA256', bundle, privateKey).toString('base64');
  if (!verify('RSA-SHA256', bundle, publicKey, Buffer.from(signature, 'base64'))) throw new Error('Bundle signature verification failed');
  const bundleId = `android-${runtime.nativeVersionCode}-${checksum}`;
  const bundlesDir = path.join(publicDir, 'bundles');
  const channelDir = path.join(publicDir, 'android', String(runtime.nativeVersionCode));
  await fs.mkdir(bundlesDir, { recursive: true });
  await fs.mkdir(channelDir, { recursive: true });
  await fs.writeFile(path.join(bundlesDir, `${bundleId}.zip`), bundle);
  const manifest = { schemaVersion: 1, platform: 'android', ...runtime, bundleId, checksum, signature, size: bundle.length, url: `${origin}/api/mobile-updates/bundles/${bundleId}.zip`, publishedAt: new Date().toISOString() };
  await fs.writeFile(baselinePath, JSON.stringify(runtime), { mode: 0o600 });
  const manifestPath = path.join(channelDir, 'manifest.json');
  await fs.writeFile(manifestPath + '.tmp', JSON.stringify(manifest));
  await fs.rename(manifestPath + '.tmp', manifestPath);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = await publishMobileUpdate({ webDir: process.argv[2] || '/tmp/livingworth-mobile-web', privateDir: process.env.MOBILE_UPDATE_PRIVATE_DIR || '/app/mobile-private', publicDir: path.join(process.env.UPLOAD_DIR || '/app/uploads', 'mobile-updates') });
  console.log(JSON.stringify({ event: 'mobile_update_published', bundleId: manifest.bundleId, bytes: manifest.size, nativeVersionCode: manifest.nativeVersionCode }));
}
