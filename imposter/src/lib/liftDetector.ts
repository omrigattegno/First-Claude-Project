/**
 * Lift-to-reveal state machine. Pure and clock-injected so it can be unit-tested
 * with fake timestamps and reused by any sensor source.
 *
 * Semantics (hysteresis with debounce):
 *  - lowered -> lifted  once the pitch has stayed  > upDegrees   for upDebounceMs
 *  - lifted  -> lowered once the pitch has stayed  < downDegrees for downDebounceMs
 *  - between the two thresholds the current state is kept
 *  - a reading that leaves the "candidate" band restarts the debounce timer (bounce rejection)
 *  - null / undefined / NaN / non-finite readings are ignored (they neither advance nor reset)
 *
 * Pitch is in degrees from horizontal: 0 = flat screen-up, 90 = upright facing the user,
 * negative = tilted away from the user (never counts as lifted).
 */
import {
  LIFT_DOWN_DEBOUNCE_MS,
  LIFT_DOWN_DEGREES,
  LIFT_UP_DEBOUNCE_MS,
  LIFT_UP_DEGREES,
} from '../game/constants';

export interface LiftDetectorOptions {
  /** Pitch above which the phone counts as lifted (strictly greater). Default LIFT_UP_DEGREES. */
  upDegrees?: number;
  /** Pitch below which the phone counts as lowered (strictly less). Default LIFT_DOWN_DEGREES. */
  downDegrees?: number;
  /** How long the pitch must stay above `upDegrees` before showing. Default LIFT_UP_DEBOUNCE_MS. */
  upDebounceMs?: number;
  /** How long the pitch must stay below `downDegrees` before hiding. Default LIFT_DOWN_DEBOUNCE_MS. */
  downDebounceMs?: number;
}

export interface LiftDetector {
  /**
   * Feed one pitch reading taken at `nowMs` (any monotonic clock, e.g. performance.now()).
   * Returns the lifted state after applying the reading.
   */
  feed(pitchDeg: number | null | undefined, nowMs: number): boolean;
  /** Forget the current state and any pending debounce (back to lowered). */
  reset(): void;
  /** Current state without feeding a reading. */
  isLifted(): boolean;
}

export function createLiftDetector(options: LiftDetectorOptions = {}): LiftDetector {
  const upDegrees = options.upDegrees ?? LIFT_UP_DEGREES;
  const downDegrees = options.downDegrees ?? LIFT_DOWN_DEGREES;
  const upDebounceMs = Math.max(0, options.upDebounceMs ?? LIFT_UP_DEBOUNCE_MS);
  const downDebounceMs = Math.max(0, options.downDebounceMs ?? LIFT_DOWN_DEBOUNCE_MS);

  let lifted = false;
  /** Timestamp of the first consecutive reading on the "other side" of the hysteresis band, or null. */
  let candidateSince: number | null = null;

  function feed(pitchDeg: number | null | undefined, nowMs: number): boolean {
    if (typeof pitchDeg !== 'number' || !Number.isFinite(pitchDeg)) return lifted;
    if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return lifted;

    const crossing = lifted ? pitchDeg < downDegrees : pitchDeg > upDegrees;
    if (!crossing) {
      // Back inside the band (or on the current side): any pending transition is a bounce.
      candidateSince = null;
      return lifted;
    }

    if (candidateSince === null || nowMs < candidateSince) candidateSince = nowMs;
    const needed = lifted ? downDebounceMs : upDebounceMs;
    if (nowMs - candidateSince >= needed) {
      lifted = !lifted;
      candidateSince = null;
    }
    return lifted;
  }

  function reset(): void {
    lifted = false;
    candidateSince = null;
  }

  function isLifted(): boolean {
    return lifted;
  }

  return { feed, reset, isLifted };
}
