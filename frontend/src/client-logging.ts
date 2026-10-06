function report(payload: Record<string, unknown>) {
  const body = JSON.stringify({ ...payload, pathname: window.location.pathname });
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/client-logs', new Blob([body], { type: 'application/json' }));
    return;
  }
  fetch('/api/client-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
}

export function startClientLogging() {
  window.addEventListener('error', (event) => report({
    level: 'error', message: event.message || 'Browser error', source: event.filename,
    line: event.lineno, column: event.colno
  }));
  window.addEventListener('unhandledrejection', (event) => report({
    level: 'error', message: event.reason instanceof Error ? event.reason.message : String(event.reason || 'Unhandled promise rejection'),
    source: 'unhandledrejection'
  }));
}
