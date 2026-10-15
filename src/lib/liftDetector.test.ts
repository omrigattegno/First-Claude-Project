import { describe, expect, it } from 'vitest';
import {
  LIFT_DOWN_DEBOUNCE_MS,
  LIFT_DOWN_DEGREES,
  LIFT_UP_DEBOUNCE_MS,
  LIFT_UP_DEGREES,
} from '../game/constants';
import { createLiftDetector } from './liftDetector';

const OPTS = { upDegrees: 45, downDegrees: 30, upDebounceMs: 300, downDebounceMs: 150 };

/** Feed `pitch` every `stepMs` from `from` to `to` (inclusive); returns the last result. */
function hold(
  d: ReturnType<typeof createLiftDetector>,
  pitch: number,
  from: number,
  to: number,
  stepMs = 16,
): boolean {
  let last = d.isLifted();
  for (let t = from; t <= to; t += stepMs) last = d.feed(pitch, t);
  return last;
}

describe('createLiftDetector', () => {
  describe('defaults', () => {
    it('uses the LIFT_* constants when no options are given', () => {
      const d = createLiftDetector();
      // Just above the up threshold, held for exactly the up debounce -> lifted.
      expect(d.feed(LIFT_UP_DEGREES + 1, 0)).toBe(false);
      expect(d.feed(LIFT_UP_DEGREES + 1, LIFT_UP_DEBOUNCE_MS - 1)).toBe(false);
      expect(d.feed(LIFT_UP_DEGREES + 1, LIFT_UP_DEBOUNCE_MS)).toBe(true);
      // Just below the down threshold, held for the down debounce -> lowered.
      const t0 = LIFT_UP_DEBOUNCE_MS + 100;
      expect(d.feed(LIFT_DOWN_DEGREES - 1, t0)).toBe(true);
      expect(d.feed(LIFT_DOWN_DEGREES - 1, t0 + LIFT_DOWN_DEBOUNCE_MS - 1)).toBe(true);
      expect(d.feed(LIFT_DOWN_DEGREES - 1, t0 + LIFT_DOWN_DEBOUNCE_MS)).toBe(false);
    });

    it('starts lowered', () => {
      expect(createLiftDetector().isLifted()).toBe(false);
    });
  });

  describe('lifting', () => {
    it('does not lift while the pitch is at or below the up threshold', () => {
      const d = createLiftDetector(OPTS);
      expect(hold(d, 0, 0, 2000)).toBe(false);
      expect(hold(d, 44, 2000, 4000)).toBe(false);
      expect(hold(d, 45, 4000, 6000)).toBe(false); // strictly greater is required
      expect(d.isLifted()).toBe(false);
    });

    it('lifts only after the pitch stayed above the threshold for the up debounce', () => {
      const d = createLiftDetector(OPTS);
      expect(d.feed(60, 1000)).toBe(false);
      expect(d.feed(60, 1100)).toBe(false);
      expect(d.feed(60, 1299)).toBe(false);
      expect(d.feed(60, 1300)).toBe(true);
      expect(d.isLifted()).toBe(true);
    });

    it('needs a second reading: a single reading never lifts by itself', () => {
      const d = createLiftDetector(OPTS);
      expect(d.feed(89, 500)).toBe(false);
      expect(d.isLifted()).toBe(false);
    });

    it('rejects a bounce: dipping below the up threshold restarts the debounce', () => {
      const d = createLiftDetector(OPTS);
      d.feed(60, 0);
      d.feed(60, 200);
      d.feed(40, 250); // dip (still above the down threshold, but below up)
      expect(d.feed(60, 300)).toBe(false); // would have lifted at 300 without the dip; re-crosses here
      expect(d.feed(60, 500)).toBe(false);
      expect(d.feed(60, 599)).toBe(false);
      expect(d.feed(60, 600)).toBe(true); // 300ms after the re-crossing reading at 300
    });

    it('never lifts for a phone tilted away (negative pitch) however long it is held', () => {
      const d = createLiftDetector(OPTS);
      expect(hold(d, -60, 0, 5000)).toBe(false);
      expect(hold(d, -179, 5000, 10000)).toBe(false);
    });

    it('lifts for steep pitches beyond vertical (phone leaning over the player)', () => {
      const d = createLiftDetector(OPTS);
      expect(hold(d, 120, 0, 400)).toBe(true);
    });
  });

  describe('lowering and hysteresis', () => {
    function lifted(): ReturnType<typeof createLiftDetector> {
      const d = createLiftDetector(OPTS);
      hold(d, 70, 0, 400);
      expect(d.isLifted()).toBe(true);
      return d;
    }

    it('keeps the lifted state while the pitch is inside the band (between down and up)', () => {
      const d = lifted();
      expect(hold(d, 40, 1000, 5000)).toBe(true);
      expect(hold(d, 30, 5000, 8000)).toBe(true); // strictly less than down is required
      expect(hold(d, 44, 8000, 9000)).toBe(true);
    });

    it('lowers only after the pitch stayed below the down threshold for the down debounce', () => {
      const d = lifted();
      expect(d.feed(10, 1000)).toBe(true);
      expect(d.feed(10, 1100)).toBe(true);
      expect(d.feed(10, 1149)).toBe(true);
      expect(d.feed(10, 1150)).toBe(false);
      expect(d.isLifted()).toBe(false);
    });

    it('rejects a bounce: a brief dip below the down threshold does not hide', () => {
      const d = lifted();
      d.feed(10, 1000);
      d.feed(10, 1100);
      d.feed(35, 1120); // back inside the band
      expect(d.feed(10, 1160)).toBe(true); // would have lowered at 1150 without the bounce
      expect(d.feed(10, 1300)).toBe(true);
      expect(d.feed(10, 1310)).toBe(false); // 150ms after re-crossing at 1160
    });

    it('keeps the lowered state while the pitch is inside the band after lowering', () => {
      const d = lifted();
      hold(d, 0, 1000, 1200);
      expect(d.isLifted()).toBe(false);
      expect(hold(d, 40, 1200, 4000)).toBe(false);
    });
  });

  describe('re-lift', () => {
    it('can lift again after lowering (a player may look twice)', () => {
      const d = createLiftDetector(OPTS);
      expect(hold(d, 70, 0, 400)).toBe(true);
      expect(hold(d, 0, 400, 700)).toBe(false);
      expect(hold(d, 70, 700, 1100)).toBe(true);
      expect(hold(d, 0, 1100, 1400)).toBe(false);
      expect(hold(d, 70, 1400, 1800)).toBe(true);
    });

    it('debounces the re-lift as strictly as the first lift', () => {
      const d = createLiftDetector(OPTS);
      hold(d, 70, 0, 400);
      hold(d, 0, 400, 700);
      expect(d.feed(70, 1000)).toBe(false);
      expect(d.feed(70, 1299)).toBe(false);
      expect(d.feed(70, 1300)).toBe(true);
    });
  });

  describe('invalid readings', () => {
    it('ignores null, undefined and NaN without touching the pending debounce', () => {
      const d = createLiftDetector(OPTS);
      expect(d.feed(60, 0)).toBe(false);
      expect(d.feed(null, 100)).toBe(false);
      expect(d.feed(undefined, 150)).toBe(false);
      expect(d.feed(Number.NaN, 200)).toBe(false);
      expect(d.feed(Number.POSITIVE_INFINITY, 250)).toBe(false);
      // The candidate started at 0, so 300 completes the debounce.
      expect(d.feed(60, 300)).toBe(true);
    });

    it('ignores invalid readings while lifted (does not drop the card)', () => {
      const d = createLiftDetector(OPTS);
      hold(d, 70, 0, 400);
      expect(d.feed(null, 500)).toBe(true);
      expect(d.feed(Number.NaN, 600)).toBe(true);
      expect(d.isLifted()).toBe(true);
    });

    it('ignores a non-finite timestamp', () => {
      const d = createLiftDetector(OPTS);
      d.feed(60, 0);
      expect(d.feed(60, Number.NaN)).toBe(false);
      expect(d.feed(60, 300)).toBe(true);
    });

    it('tolerates a clock that jumps backwards by restarting the debounce from the new time', () => {
      const d = createLiftDetector(OPTS);
      d.feed(60, 1000);
      expect(d.feed(60, 500)).toBe(false);
      expect(d.feed(60, 799)).toBe(false);
      expect(d.feed(60, 800)).toBe(true);
    });
  });

  describe('reset', () => {
    it('returns to lowered and forgets a pending lift', () => {
      const d = createLiftDetector(OPTS);
      d.feed(60, 0);
      d.feed(60, 200);
      d.reset();
      expect(d.isLifted()).toBe(false);
      expect(d.feed(60, 300)).toBe(false); // the 0..200 run no longer counts
      expect(d.feed(60, 599)).toBe(false);
      expect(d.feed(60, 600)).toBe(true);
    });

    it('returns to lowered from lifted and forgets a pending lower', () => {
      const d = createLiftDetector(OPTS);
      hold(d, 70, 0, 400);
      d.feed(0, 500);
      d.reset();
      expect(d.isLifted()).toBe(false);
      // Inside-band readings keep the (now lowered) state.
      expect(hold(d, 40, 600, 2000)).toBe(false);
    });
  });

  describe('options', () => {
    it('with zero debounce a single crossing reading transitions immediately', () => {
      const d = createLiftDetector({ ...OPTS, upDebounceMs: 0, downDebounceMs: 0 });
      expect(d.feed(50, 0)).toBe(true);
      expect(d.feed(40, 1)).toBe(true); // inside the band: keep
      expect(d.feed(20, 2)).toBe(false);
    });

    it('honours custom thresholds', () => {
      const d = createLiftDetector({ upDegrees: 60, downDegrees: 50, upDebounceMs: 100, downDebounceMs: 100 });
      expect(hold(d, 55, 0, 1000)).toBe(false);
      expect(hold(d, 61, 1000, 1200)).toBe(true);
      expect(hold(d, 55, 1200, 2000)).toBe(true);
      expect(hold(d, 49, 2000, 2200)).toBe(false);
    });

    it('treats a negative debounce as zero', () => {
      const d = createLiftDetector({ ...OPTS, upDebounceMs: -5 });
      expect(d.feed(50, 0)).toBe(true);
    });
  });
});
