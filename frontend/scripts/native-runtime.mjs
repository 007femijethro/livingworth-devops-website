import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function nativeRuntime(root = fileURLToPath(new URL('..', import.meta.url))) {
  const files = ['capacitor.config.ts', 'android/app/build.gradle', 'android/build.gradle', 'android/variables.gradle', 'android/capacitor.settings.gradle', 'android/app/capacitor.build.gradle', 'android/app/src/main/AndroidManifest.xml'];
  const collect = directory => {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) collect(relative);
      else if (entry.isFile()) files.push(relative);
    }
  };
  collect('android/app/src/main/java');
  collect('android/app/src/main/res');
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(file + '\0').update(fs.readFileSync(path.join(root, file))).update('\0');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  for (const [name, pkg] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (/^node_modules\/@(capacitor|capawesome)\//.test(name)) hash.update(name + ':' + pkg.version + '\0');
  }
  const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
  const nativeVersionCode = Number(gradle.match(/\bversionCode\s+(\d+)/)?.[1]);
  if (!nativeVersionCode) throw new Error('Android versionCode is required for live update compatibility');
  return { nativeVersionCode, nativeFingerprint: hash.digest('hex') };
}
