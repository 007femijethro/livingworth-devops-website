export type NativeRuntime = { nativeVersionCode: number; nativeFingerprint: string };
type Manifest = NativeRuntime & { schemaVersion: number; platform: string; bundleId: string; checksum: string; signature: string; size: number; url: string };
type UpdatePort = {
  ready(): Promise<unknown>;
  getVersionCode(): Promise<{ versionCode: string }>;
  getCurrentBundle(): Promise<{ bundleId: string | null }>;
  getNextBundle(): Promise<{ bundleId: string | null }>;
  getBlockedBundles(): Promise<{ bundleIds: string[] }>;
  downloadBundle(options: { bundleId: string; url: string; checksum: string; signature: string; artifactType: 'zip' }): Promise<void>;
  setNextBundle(options: { bundleId: string }): Promise<void>;
};

export function compatibleUpdate(value: unknown, runtime: NativeRuntime, origin: string): value is Manifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Manifest;
  if (m.schemaVersion !== 1 || m.platform !== 'android' || m.nativeVersionCode !== runtime.nativeVersionCode || m.nativeFingerprint !== runtime.nativeFingerprint) return false;
  if (!/^[a-f0-9]{64}$/.test(m.checksum) || m.bundleId !== `android-${runtime.nativeVersionCode}-${m.checksum}`) return false;
  if (typeof m.signature !== 'string' || !/^[A-Za-z0-9+/]{300,}={0,2}$/.test(m.signature)) return false;
  if (!Number.isSafeInteger(m.size) || m.size < 1 || m.size > 50 * 1024 * 1024) return false;
  try {
    const url = new URL(m.url);
    return url.origin === origin && url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === `/api/mobile-updates/bundles/${m.bundleId}.zip`;
  } catch { return false; }
}

/** Stage only: never reload the WebView or replace an active quiz/form. */
export async function stageMobileUpdate(port: UpdatePort, loadManifest: (version: number) => Promise<unknown>, runtime: NativeRuntime, origin: string): Promise<boolean> {
  await port.ready(); // Stop rollback timer before any network requests.
  if (Number((await port.getVersionCode()).versionCode) !== runtime.nativeVersionCode) return false;
  const manifest = await loadManifest(runtime.nativeVersionCode);
  if (!compatibleUpdate(manifest, runtime, origin)) return false;
  const [current, next, blocked] = await Promise.all([port.getCurrentBundle(), port.getNextBundle(), port.getBlockedBundles()]);
  if (current.bundleId === manifest.bundleId || next.bundleId === manifest.bundleId || blocked.bundleIds.includes(manifest.bundleId)) return false;
  await port.downloadBundle({ bundleId: manifest.bundleId, url: manifest.url, checksum: manifest.checksum, signature: manifest.signature, artifactType: 'zip' });
  await port.setNextBundle({ bundleId: manifest.bundleId });
  return true;
}

/** Explicit user action only. Preserve active quiz rooms and require a staged bundle. */
export async function applyStagedMobileUpdate(port: Pick<UpdatePort,'getCurrentBundle'|'getNextBundle'> & {reload():Promise<void>}, quizOpen: boolean): Promise<void> {
  if(quizOpen)throw new Error('Leave the quiz room before applying an update.');
  const [current,next]=await Promise.all([port.getCurrentBundle(),port.getNextBundle()]);
  if(!next.bundleId||next.bundleId===current.bundleId)throw new Error('No downloaded update is ready. Check for updates first.');
  await port.reload();
}
