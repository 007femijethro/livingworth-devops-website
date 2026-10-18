import { useEffect } from 'react';
export default function useLearningFocus(kind: 'material' | 'assignment', id: string | number) {
  const requested = new URLSearchParams(window.location.search).get(kind);
  const target = requested === String(id);
  const elementId = `learning-${kind}-${id}`;
  useEffect(() => {
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(elementId);
      element?.scrollIntoView({ block: 'center' });
      element?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [target, elementId]);
  return { id: elementId, tabIndex: -1, 'data-learning-target': target };
}
