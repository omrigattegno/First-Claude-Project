import { useEffect, useState } from 'react';

/**
 * Milliseconds left until `endAt` (epoch ms, Date.now() based). The value is derived from the end
 * timestamp on every tick, never decremented, so a throttled background tab or a slow frame cannot
 * drift the clock. Re-renders every `tickMs` until zero, then stops ticking.
 */
export function useCountdown(endAt: number, tickMs = 100): number {
  const [remaining, setRemaining] = useState(() => Math.max(0, endAt - Date.now()));

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const update = () => {
      const left = Math.max(0, endAt - Date.now());
      setRemaining(left);
      if (left <= 0 && id !== null) {
        clearInterval(id);
        id = null;
      }
    };
    update();
    if (endAt - Date.now() > 0) id = setInterval(update, tickMs);
    return () => {
      if (id !== null) clearInterval(id);
    };
  }, [endAt, tickMs]);

  return remaining;
}

/** "m:ss" for a number of whole seconds. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}
