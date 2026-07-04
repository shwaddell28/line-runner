import { useEffect } from 'react';

/**
 * iOS-style swipe-back for our state-based routing: a touch starting at the
 * left screen edge and dragged right triggers the current page's back action.
 */
const backHandler: { current: (() => void) | null } = { current: null };

const EDGE_PX = 28;
const TRIGGER_DX = 70;
const MAX_DY = 50;

/** Pages register what "back" means for them (null = swipe does nothing). */
export function useBackHandler(handler: (() => void) | null): void {
  useEffect(() => {
    backHandler.current = handler;
    return () => {
      backHandler.current = null;
    };
  }, [handler]);
}

/** Installed once at the app root. */
export function useEdgeSwipeBack(): void {
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let armed = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      // Never steal a touch from the hold-to-mark button mid-recording.
      if ((e.target as Element | null)?.closest?.('.hold-btn')) return;
      if (t.clientX <= EDGE_PX) {
        tracking = true;
        armed = false;
        startX = t.clientX;
        startY = t.clientY;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dy > MAX_DY) {
        tracking = false;
        armed = false;
        return;
      }
      if (dx > TRIGGER_DX) armed = true;
    };
    const onEnd = () => {
      if (armed) {
        // Fire outside the touch gesture: Chrome/Safari suppress confirm()
        // dialogs invoked while a touch is still in progress.
        setTimeout(() => backHandler.current?.(), 0);
      }
      tracking = false;
      armed = false;
    };
    const onCancel = () => {
      tracking = false;
      armed = false;
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onCancel);
    };
  }, []);
}
