/**
 * Keep the screen awake while `active` (the phone is passed around for minutes without taps).
 * Uses the Screen Wake Lock API when available; errors (low battery, unsupported, page hidden) are ignored.
 * The lock is released by the browser whenever the page is hidden, so it is re-requested on return.
 */
import { useEffect } from 'react';

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinel>;
}

function getWakeLock(): WakeLockLike | null {
  if (typeof navigator === 'undefined') return null;
  try {
    const wl = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    return wl && typeof wl.request === 'function' ? wl : null;
  } catch {
    return null;
  }
}

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wakeLock = getWakeLock();
    if (!wakeLock) return;

    let sentinel: WakeLockSentinel | null = null;
    let pending = false;
    let cancelled = false;

    const release = () => {
      const s = sentinel;
      sentinel = null;
      if (s) {
        try {
          void s.release().catch(() => {});
        } catch {
          /* ignore */
        }
      }
    };

    const request = async () => {
      if (cancelled || pending || sentinel) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      pending = true;
      try {
        const s = await wakeLock.request('screen');
        if (cancelled) {
          try {
            void s.release().catch(() => {});
          } catch {
            /* ignore */
          }
          return;
        }
        sentinel = s;
        try {
          s.addEventListener('release', () => {
            if (sentinel === s) sentinel = null;
          });
        } catch {
          /* ignore */
        }
      } catch {
        // Denied (battery saver), unsupported in this context, or the page went hidden mid-request.
      } finally {
        pending = false;
      }
    };

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') void request();
    };

    document.addEventListener('visibilitychange', onVisibility);
    void request();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      release();
    };
  }, [active]);
}
