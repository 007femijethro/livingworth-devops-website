import { LiveUpdate } from '@capawesome/capacitor-live-update';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { academyOrigin } from './mobile-url';
import { stageMobileUpdate, type NativeRuntime } from './mobile-update-engine';

declare const __LW_NATIVE_RUNTIME__: NativeRuntime;
let started = false;
let checking = false;
let lastCheck = 0;

export function startMobileUpdates() {
  if (started || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  started = true;
  const check = async () => {
    if (checking || Date.now() - lastCheck < 15 * 60 * 1000) return;
    checking = true;
    lastCheck = Date.now();
    try {
      const staged = await stageMobileUpdate(LiveUpdate, async version => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const response = await fetch(`${academyOrigin}/api/mobile-updates/android/${version}/manifest.json`, { cache: 'no-store', signal: controller.signal });
          if (!response.ok) return null;
          return await response.json();
        } finally { clearTimeout(timeout); }
      }, __LW_NATIVE_RUNTIME__, academyOrigin);
      if (staged) {
        const status = document.createElement('div');
        status.className = 'native-update-status';
        status.setAttribute('role', 'status');
        status.textContent = 'App update ready. It will apply the next time you fully close and reopen the app.';
        document.body.appendChild(status);
        setTimeout(() => status.remove(), 12000);
      }
    } catch {
      // Offline or rejected update: keep the working app and retry on a later launch/resume.
    } finally { checking = false; }
  };
  void check();
  void App.addListener('appStateChange', ({ isActive }) => { if (isActive) void check(); });
}
