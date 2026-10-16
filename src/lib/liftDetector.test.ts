import { describe, expect, it } from 'vitest';
import {
  LIFT_DOWN_DEBOUNCE_MS,
  LIFT_DOWN_DEGREES,
  LIFT_MAX_DEGREES,
  LIFT_UP_DEBOUNCE_MS,
  LIFT_UP_DEGREES,
} from '../game/constants';
import { createLiftDetector, type LiftDetector } from './liftDetector';

const OPTS = { upDegrees: 45, downDegrees: 30, maxDegrees: 135, upDebounceMs: 300, downDebounceMs: 150 };

/** Feed `pitch` every `stepMs` from `from` to `to` (inclusive); returns the last result. */
function hold(d: LiftDetector, pitch: number, from: number, to: number, stepMs = 16): boolean {
  let last = d.isLifted();
  for (let t = from; t <= to; t += stepMs) last = d.feed(pitch, t);
  return last;
}

/** A detector that has already seen the phone lowered once (the normal state right after arming). */
function fresh(options = OPTS): LiftDetector {
  const d = createLiftDetector(options);
  d.feed(0, -100);
  expect(d.isPrimed()).toBe(true);
  return d;
}

describe('createLiftDetector', () => {
  describe('defaults', () => {
    it('uses the LIFT_* constants when no options are given', () => {
      const d = createLiftDetector();
      d.feed(LIFT_DOWN_DEGREES - 1, -100); // prime
      // Just above the up threshold, held for exactly the up debounce -> lifted.
      expect(d.feed(LIFT_UP_DEGREES + 1, 0)).toBe(false);
      expect(d.feed(LIFT_UP_DEGREES + 1, LIFT_UP_DEBOUNCE_MS - 1)).toBe(false);
      expect(d.feed(LIFT_UP_DEGREES + 1, LIFT_UP_DEBOUNCE_MS)).toBe(true);
      // Just below the down threshold, held for the down debounce -> lowered.
      const t0 = LIFT_UP_DEBOUNCE_MS + 100;
      expect(d.feed(LIFT_DOWN_DEGREES - 1, t0)).toBe(true);
      expect(d.feed(LIFT_DOWN_DEGREES - 1, t0 + LIFT_DOWN_DEBOUNCE_MS - 1)).toBe(true);
      expect(d.feed(LIFT_DOWN_DEGREES - 1, t0 + LIFT_DOWN_DEBOUNCE_MS)).toBe(false);
      // Face-down (beta ~180) never lifts.
      expect(hold(d, 180, 2000, 3000)).toBe(false);
      expect(hold(d, LIFT_MAX_DEGREES, 3000, 4000)).toBe(false);
      expect(hold(createLiftDetector(), 180, 0, 1000)).toBe(false);
    });

    it('starts lowered and unprimed', () => {
      const d = createLiftDetector();
      expect(d.isLifted()).toBe(false);
      expect(d.isPrimed()).toBe(false);
      expect(d.pendingMs(0)).toBeNull();
    });
  });

  describe('priming (the phone must be seen lowered before the first lift)', () => {
    it('does not lift from a fresh detector however long the phone is held up', () => {
      const d = createLiftDetector(OPTS);
      expect(hold(d, 70, 0, 1000)).toBe(false);
      expect(d.isPrimed()).toBe(false);
      expect(d.pendingMs(1000)).toBeNull(); // nothing is pending while unprimed
      // Lowering once primes it; the next lift then counts after the usual debounce.
      hold(d, 10, 1000, 1050);
      expect(d.isPrimed()).toBe(true);
      expect(hold(d, 70, 1100, 1500)).toBe(true);
    });

    it('readings between the down threshold and the max bound never prime', () => {
      const d = createLiftDetector(OPTS);
      for (const pitch of [30, 40, 45, 60, 90, 134]) d.feed(pitch, 0);
      expect(d.isPrimed()).toBe(false);
      d.feed(29, 20);
      expect(d.isPrimed()).toBe(true);
    });

    it('primes from any lowered reading: flat, tilted away or face-down', () => {
      for (const pitch of [0, 10, -60, -179, 135, 179, 180]) {
        const d = createLiftDetector(OPTS);
        d.feed(pitch, 0);
        expect(d.isPrimed(), `pitch ${pitch}`).toBe(true);
        expect(d.isLifted()).toBe(false);
      }
    });

    it('a lowered reading that primes never counts toward a lift', () => {
      // Face-down primes (the screen faces nobody) but the following lift still needs its full debounce.
      const d = createLiftDetector(OPTS);
      hold(d, 179, 0, 500);
      expect(d.feed(70, 1000)).toBe(false);
      expect(d.feed(70, 1299)).toBe(false);
      expect(d.feed(70, 1300)).toBe(true);
    });

    it('invalid readings do not prime', () => {
      const d = createLiftDetector(OPTS);
      d.feed(null, 0);
      d.feed(Number.NaN, 1);
      d.feed(0, Number.NaN);
      expect(d.isPrimed()).toBe(false);
    });

    it('reset() unprimes, also from the lifted state', () => {
      const d = fresh();
      hold(d, 70, 0, 400);
      expect(d.isLifted()).toBe(true);
      d.reset();
      expect(d.isPrimed()).toBe(false);
      expect(hold(d, 70, 500, 1500)).toBe(false);
      hold(d, 10, 1500, 1550);
      expect(hold(d, 70, 1600, 2000)).toBe(true);
    });
  });

  describe('lifting', () => {
    it('does not lift while the pitch is at or below the up threshold', () => {
      const d = fresh();
      expect(hold(d, 0, 0, 2000)).toBe(false);
      expect(hold(d, 44, 2000, 4000)).toBe(false);
      expect(hold(d, 45, 4000, 6000)).toBe(false); // strictly greater is required
      expect(d.isLifted()).toBe(false);
    });

    it('lifts only after the pitch stayed above the threshold for the up debounce', () => {
      const d = fresh();
      expect(d.feed(60, 1000)).toBe(false);
      expect(d.feed(60, 1100)).toBe(false);
      expect(d.feed(60, 1299)).toBe(false);
      expect(d.feed(60, 1300)).toBe(true);
      expect(d.isLifted()).toBe(true);
    });

    it('needs a second reading: a single reading never lifts by itself', () => {
      const d = fresh();
      expect(d.feed(89, 500)).toBe(false);
      expect(d.isLifted()).toBe(false);
    });

    it('rejects a bounce: dipping below the up threshold restarts the debounce', () => {
      const d = fresh();
      d.feed(60, 0);
      d.feed(60, 200);
      d.feed(40, 250); // dip (still above the down threshold, but below up)
      expect(d.feed(60, 300)).toBe(false); // would have lifted at 300 without the dip; re-crosses here
      expect(d.feed(60, 500)).toBe(false);
      expect(d.feed(60, 599)).toBe(false);
      expect(d.feed(60, 600)).toBe(true); // 300ms after the re-crossing reading at 300
    });

    it('never lifts for a phone tilted away (negative pitch) however long it is held', () => {
      const d = fresh();
      expect(hold(d, -60, 0, 5000)).toBe(false);
      expect(hold(d, -179, 5000, 10000)).toBe(false);
    });

    it('lifts for steep pitches beyond vertical (phone leaning over the player)', () => {
      const d = fresh();
      expect(hold(d, 120, 0, 400)).toBe(true);
    });

    it('never lifts for a phone lying face-down (pitch ~180)', () => {
      const d = fresh();
      expect(hold(d, 180, 0, 2000)).toBe(false);
      expect(hold(d, 178, 2000, 4000)).toBe(false);
      expect(hold(d, 135, 4000, 5000)).toBe(false); // at the bound counts as turned away
      // A level table: beta flips between +179 and -179 from reading to reading.
      for (let t = 5000; t <= 7000; t += 16) expect(d.feed(t % 32 === 0 ? 179 : -179, t)).toBe(false);
      expect(d.isLifted()).toBe(false);
    });

    it('a dip past the max bound restarts the up debounce like any other bounce', () => {
      const d = fresh();
      d.feed(70, 0);
      d.feed(70, 200);
      d.feed(150, 250);
      expect(d.feed(70, 300)).toBe(false);
      expect(d.feed(70, 599)).toBe(false);
      expect(d.feed(70, 600)).toBe(true);
    });
  });

  describe('lowering and hysteresis', () => {
    function lifted(): LiftDetector {
      const d = fresh();
      hold(d, 70, 0, 400);
      expect(d.isLifted()).toBe(true);
      return d;
    }

    it('keeps the lifted state while the pitch is inside the band (between down and up)', () => {
      const d = lifted();
      expect(hold(d, 40, 1000, 5000)).toBe(true);
      expect(hold(d, 30, 5000, 8000)).toBe(true); // strictly less than down is required
      expect(hold(d, 44, 8000, 9000)).toBe(true);
      expect(hold(d, 134, 9000, 10000)).toBe(true); // just under the max bound is still facing the user
    });

    it('lowers only after the pitch stayed below the down threshold for the down debounce', () => {
      const d = lifted();
      expect(d.feed(10, 1000)).toBe(true);
      expect(d.feed(10, 1100)).toBe(true);
      expect(d.feed(10, 1149)).toBe(true);
      expect(d.feed(10, 1150)).toBe(false);
      expect(d.isLifted()).toBe(false);
    });

    it('hides a lifted card that is turned face-down', () => {
      const d = lifted();
      expect(d.feed(170, 1000)).toBe(true);
      expect(d.feed(170, 1149)).toBe(true);
      expect(d.feed(170, 1150)).toBe(false);
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
      const d = fresh();
      expect(hold(d, 70, 0, 400)).toBe(true);
      expect(hold(d, 0, 400, 700)).toBe(false);
      expect(hold(d, 70, 700, 1100)).toBe(true);
      expect(hold(d, 0, 1100, 1400)).toBe(false);
      expect(hold(d, 70, 1400, 1800)).toBe(true);
    });

    it('debounces the re-lift as strictly as the first lift', () => {
      const d = fresh();
      hold(d, 70, 0, 400);
      hold(d, 0, 400, 700);
      expect(d.feed(70, 1000)).toBe(false);
      expect(d.feed(70, 1299)).toBe(false);
      expect(d.feed(70, 1300)).toBe(true);
    });
  });

  describe('pendingMs (debounce on the clock when the sensor goes quiet)', () => {
    it('is null while nothing is pending', () => {
      const d = fresh();
      expect(d.pendingMs(0)).toBeNull();
      d.feed(10, 0);
      expect(d.pendingMs(0)).toBeNull();
      d.feed(40, 10); // inside the band
      expect(d.pendingMs(10)).toBeNull();
    });

    it('counts down the up debounce from the first crossing reading', () => {
      const d = fresh();
      d.feed(60, 1000);
      expect(d.pendingMs(1000)).toBe(300);
      expect(d.pendingMs(1100)).toBe(200);
      expect(d.pendingMs(1299)).toBe(1);
      expect(d.pendingMs(1300)).toBe(0);
      expect(d.pendingMs(5000)).toBe(0);
      // Re-feeding the last reading once it reaches zero completes the transition.
      expect(d.feed(60, 1301)).toBe(true);
      expect(d.pendingMs(1301)).toBeNull();
    });

    it('counts down the down debounce while lifted', () => {
      const d = fresh();
      hold(d, 70, 0, 400);
      d.feed(10, 1000);
      expect(d.pendingMs(1000)).toBe(150);
      expect(d.pendingMs(1100)).toBe(50);
      expect(d.feed(10, 1150)).toBe(false);
      expect(d.pendingMs(1150)).toBeNull();
    });

    it('is cleared by a bounce and by reset()', () => {
      const d = fresh();
      d.feed(60, 0);
      d.feed(40, 100);
      expect(d.pendingMs(100)).toBeNull();
      d.feed(60, 200);
      expect(d.pendingMs(200)).toBe(300);
      d.reset();
      expect(d.pendingMs(200)).toBeNull();
    });

    it('never exceeds the debounce even if the clock runs backwards, and tolerates a bad clock', () => {
      const d = fresh();
      d.feed(60, 1000);
      expect(d.pendingMs(500)).toBe(300);
      expect(d.pendingMs(Number.NaN)).toBe(300);
    });
  });

  describe('invalid readings', () => {
    it('ignores null, undefined and NaN without touching the pending debounce', () => {
      const d = fresh();
      expect(d.feed(60, 0)).toBe(false);
      expect(d.feed(null, 100)).toBe(false);
      expect(d.feed(undefined, 150)).toBe(false);
      expect(d.feed(Number.NaN, 200)).toBe(false);
      expect(d.feed(Number.POSITIVE_INFINITY, 250)).toBe(false);
      // The candidate started at 0, so 300 completes the debounce.
      expect(d.feed(60, 300)).toBe(true);
    });

    it('ignores invalid readings while lifted (does not drop the card)', () => {
      const d = fresh();
      hold(d, 70, 0, 400);
      expect(d.feed(null, 500)).toBe(true);
      expect(d.feed(Number.NaN, 600)).toBe(true);
      expect(d.isLifted()).toBe(true);
    });

    it('ignores a non-finite timestamp', () => {
      const d = fresh();
      d.feed(60, 0);
      expect(d.feed(60, Number.NaN)).toBe(false);
      expect(d.feed(60, 300)).toBe(true);
    });

    it('tolerates a clock that jumps backwards by restarting the debounce from the new time', () => {
      const d = fresh();
      d.feed(60, 1000);
      expect(d.feed(60, 500)).toBe(false);
      expect(d.feed(60, 799)).toBe(false);
      expect(d.feed(60, 800)).toBe(true);
    });
  });

  describe('reset', () => {
    it('returns to lowered and forgets a pending lift', () => {
      const d = fresh();
      d.feed(60, 0);
      d.feed(60, 200);
      d.reset();
      expect(d.isLifted()).toBe(false);
      d.feed(0, 250); // prime again
      expect(d.feed(60, 300)).toBe(false); // the 0..200 run no longer counts
      expect(d.feed(60, 599)).toBe(false);
      expect(d.feed(60, 600)).toBe(true);
    });

    it('returns to lowered from lifted and forgets a pending lower', () => {
      const d = fresh();
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
      const d = fresh({ ...OPTS, upDebounceMs: 0, downDebounceMs: 0 });
      expect(d.feed(50, 0)).toBe(true);
      expect(d.feed(40, 1)).toBe(true); // inside the band: keep
      expect(d.feed(20, 2)).toBe(false);
    });

    it('honours custom thresholds', () => {
      const d = fresh({ upDegrees: 60, downDegrees: 50, maxDegrees: 100, upDebounceMs: 100, downDebounceMs: 100 });
      expect(hold(d, 55, 0, 1000)).toBe(false);
      expect(hold(d, 61, 1000, 1200)).toBe(true);
      expect(hold(d, 55, 1200, 2000)).toBe(true);
      expect(hold(d, 49, 2000, 2200)).toBe(false);
      expect(hold(d, 110, 2200, 3000)).toBe(false); // beyond the custom max bound
    });

    it('treats a negative debounce as zero', () => {
      const d = fresh({ ...OPTS, upDebounceMs: -5 });
      expect(d.feed(50, 0)).toBe(true);
    });
  });
});
