import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Network } from '@capacitor/network';

export const isNative = Capacitor.isNativePlatform();
import { academyOrigin, resolveAcademyUrl } from './mobile-url';
export const socketOrigin = isNative ? academyOrigin : window.location.origin;

export function academyUrl(value: string, localOrigin = window.location.origin): string {
  return resolveAcademyUrl(value, localOrigin);
}

export function startMobile() {
  if (!isNative) return;
  document.documentElement.classList.add('native-app');
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, options) => {
    const target = academyUrl(input instanceof Request ? input.url : String(input));
    return originalFetch(input instanceof Request ? new Request(target, input) : target, options);
  };

  // Keep references to generated reports until their download click has been handled.
  const blobs = new Map<string, Blob>();
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = create(blob);
    if (blob instanceof Blob) blobs.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = (url) => { blobs.delete(url); revoke(url); };

  const notice = document.createElement('div');
  notice.className = 'native-notice';
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  document.body.appendChild(notice);
  let timer: ReturnType<typeof setTimeout>;
  const message = (text: string) => {
    clearTimeout(timer); notice.textContent = text; notice.hidden = false;
    timer = setTimeout(() => { notice.hidden = true; }, 6000);
  };
  const save = async (blob: Blob, filename: string) => {
    // Share sheet lets the user save the file or open it in another Android app.
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const name = filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'download';
    const result = await Filesystem.writeFile({
      path: `downloads/${Date.now()}-${name}`, data: base64, directory: Directory.Cache, recursive: true,
    });
    await Share.share({ title: name, url: result.uri });
  };
  const handleLink = (anchor: HTMLAnchorElement) => {
    const blob = blobs.get(anchor.href);
    const url = new URL(academyUrl(anchor.href));
    if (blob && anchor.download) {
      void save(blob, anchor.download).catch(() => message('Could not share this download. Please try again.'));
      return true;
    }
    if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) return false;
    const academyFile = url.origin === academyOrigin && /^\/(uploads|api)\//.test(url.pathname);
    if (academyFile) {
      const token = localStorage.getItem('lw_token');
      void originalFetch(url.href, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        .then(async response => {
          if (!response.ok) throw new Error('Download failed');
          const filename = anchor.download || decodeURIComponent(url.pathname.split('/').pop() || 'download');
          await save(await response.blob(), filename);
        }).catch(() => message('Could not download this file. Check your connection and try again.'));
      return true;
    }
    if (url.origin !== window.location.origin) {
      void Browser.open({ url: url.href }).catch(() => message('Could not open this link.'));
      return true;
    }
    return false;
  };
  const open = window.open.bind(window);
  window.open = (url, target, features) => {
    if (url && /^https?:/.test(String(url))) {
      void Browser.open({ url: String(url) }).catch(() => message('Could not open this link.'));
      return null;
    }
    return open(url, target, features);
  };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!handleLink(this)) click.call(this);
  };
  document.addEventListener('click', event => {
    const anchor = (event.target as Element)?.closest?.('a');
    if (anchor instanceof HTMLAnchorElement && handleLink(anchor)) event.preventDefault();
  }, true);

  // Uploaded images/media are served by the academy, while UI assets stay bundled.
  const updateMedia = (root: ParentNode) => {
    root.querySelectorAll<HTMLImageElement | HTMLMediaElement>('img[src],video[src],audio[src],source[src]').forEach(element => {
      const src = element.getAttribute('src');
      if (src && src.startsWith('/uploads/')) {
        element.setAttribute('crossorigin', 'anonymous');
        element.setAttribute('src', academyUrl(src));
      }
    });
  };
  new MutationObserver(() => updateMedia(document)).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['src'],
  });
  const offline = document.createElement('div');
  offline.className = 'native-offline';
  offline.setAttribute('role', 'status');
  offline.textContent = 'You are offline. Reconnect to load classes and save your work.';
  offline.hidden = true;
  document.body.appendChild(offline);
  void Network.getStatus().then(status => { offline.hidden = status.connected; });
  void Network.addListener('networkStatusChange', status => { offline.hidden = status.connected; });
  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.minimizeApp();
  });
}
