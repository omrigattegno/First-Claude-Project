/**
 * Double-tap guard for a bottom-pinned, phase-advancing button. `guarded` is true for `ms` after
 * mount and after each `arm()`; disable the button with it. A double tap then cannot advance twice
 * (Clues "Next" skipping a speaker), and its second tap, landing on the next screen's button at the
 * same position (Clues "Start discussion" -> Discussion "Vote now"), hits a disabled one.
 *
 * The button is disabled, not the click dropped, so Playwright's actionability wait still works.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const TAP_GUARD_MS = 400;

export function useTapGuard(ms = TAP_GUARD_MS): [guarded: boolean, arm: () => void] {
  const [guarded, setGuarded] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = useCallback(() => {
    setGuarded(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setGuarded(false);
    }, ms);
  }, [ms]);

  useEffect(() => {
    arm();
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [arm]);

  return [guarded, arm];
}
