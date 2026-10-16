/**
 * Lift-to-reveal state machine. Pure and clock-injected so it can be unit-tested
 * with fake timestamps and reused by any sensor source.
 *
 * Semantics (hysteresis with debounce):
 *  - a lift is only counted after at least one "lowered" reading (< downDegrees, or >= maxDegrees i.e.
 *    face-down) since creation/reset ("primed"): a phone still tilted toward the previous holder when the
 *    sensor arms must be lowered first
 *  - lowered -> lifted  once the pitch has stayed in (upDegrees, maxDegrees) for upDebounceMs
 *  - lifted  -> lowered once the pitch has stayed < downDegrees or >= maxDegrees for downDebounceMs
 *  - between the thresholds the current state is kept
 *  - a reading that leaves the "candidate" band restarts the debounce timer (bounce rejection)
 *  - null / undefined / NaN / non-finite readings are ignored (they neither advance nor reset)
 *  - the debounce completes on a reading, never by itself: callers whose sensor goes quiet (Chrome Android
 *    stops dispatching once the angles are steady) use pendingMs() to re-feed the last reading on a timer
 *
 * Pitch is in degrees from horizontal: 0 = flat screen-up, 90 = upright facing the user,
 * negative = tilted away from the user (never counts as lifted), ~180 = face-down (never counts as lifted).
 */
import {
  LIFT_DOWN_DEBOUNCE_MS,
  LIFT_DOWN_DEGREES,
  LIFT_MAX_DEGREES,
  LIFT_UP_DEBOUNCE_MS,
  LIFT_UP_DEGREES,
} from '../game/constants';

export interface LiftDetectorOptions {
  /** Pitch above which the phone counts as lifted (strictly greater). Default LIFT_UP_DEGREES. */
  upDegrees?: number;
  /** Pitch below which the phone counts as lowered (strictly less). Default LIFT_DOWN_DEGREES. */
  downDegrees?: number;
  /** Pitch at or above which the phone counts as turned away (face-down). Default LIFT_MAX_DEGREES. */
  maxDegrees?: number;
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
  /** Forget the current state and any pending debounce (back to lowered and unprimed). */
  reset(): void;
  /** Current state without feeding a reading. */
  isLifted(): boolean;
  /**
   * True once a lowered reading (< `downDegrees`, or face-down >= `maxDegrees`) has been seen since
   * creation/reset; lifts count only after that.
   */
  isPrimed(): boolean;
  /**
   * Milliseconds still needed at `nowMs` for the pending transition to complete if the pitch stays where
   * it is, or null when no transition is pending. Re-feed the last reading after that long when the
   * sensor goes quiet so the debounce elapses on the clock.
   */
  pendingMs(nowMs: number): number | null;
}

export function createLiftDetector(options: LiftDetectorOptions = {}): LiftDetector {
  const upDegrees = options.upDegrees ?? LIFT_UP_DEGREES;
  const downDegrees = options.downDegrees ?? LIFT_DOWN_DEGREES;
  const maxDegrees = options.maxDegrees ?? LIFT_MAX_DEGREES;
  const upDebounceMs = Math.max(0, options.upDebounceMs ?? LIFT_UP_DEBOUNCE_MS);
  const downDebounceMs = Math.max(0, options.downDebounceMs ?? LIFT_DOWN_DEBOUNCE_MS);

  let lifted = false;
  /** False until a lowered reading has been seen since creation/reset. */
  let primed = false;
  /** Timestamp of the first consecutive reading on the "other side" of the hysteresis band, or null. */
  let candidateSince: number | null = null;

  function feed(pitchDeg: number | null | undefined, nowMs: number): boolean {
    if (typeof pitchDeg !== 'number' || !Number.isFinite(pitchDeg)) return lifted;
    if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return lifted;

    const lowered = pitchDeg < downDegrees || pitchDeg >= maxDegrees;
    if (!primed) {
      // The phone must be seen lowered once before the first lift counts (it may still be tilted toward
      // the previous holder when the sensor arms).
      if (lowered) primed = true;
      return lifted;
    }

    const facingUser = pitchDeg > upDegrees && pitchDeg < maxDegrees;
    const crossing = lifted ? lowered : facingUser;
    if (!crossing) {
      // Back inside the band (or on the current side): any pending transition is a bounce.
      candidateSince = null;
      return lifted;
    }

    if (candidateSince === null || nowMs < candidateSince) candidateSince = nowMs;
    if (nowMs - candidateSince >= needed()) {
      lifted = !lifted;
      candidateSince = null;
    }
    return lifted;
  }

  function needed(): number {
    return lifted ? downDebounceMs : upDebounceMs;
  }

  function pendingMs(nowMs: number): number | null {
    if (candidateSince === null) return null;
    if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return needed();
    return Math.min(needed(), Math.max(0, needed() - (nowMs - candidateSince)));
  }

  function reset(): void {
    lifted = false;
    primed = false;
    candidateSince = null;
  }

  function isLifted(): boolean {
    return lifted;
  }

  function isPrimed(): boolean {
    return primed;
  }

  return { feed, reset, isLifted, isPrimed, pendingMs };
}
