/**
 * Reveal controller used by the Reveal and Vote screens (lift-to-reveal with hold fallback).
 *
 * Contract (see ARCHITECTURE.md "Reveal contract"):
 *  - `revealed` is true only while the secret may be rendered: armed && (lifted || holding).
 *  - `effectiveMethod` is 'lift' when the requested method is 'lift' and sensor permission is 'granted';
 *    otherwise 'hold'. Holding always works, so a hold button can be offered as a backup in lift mode.
 *  - `armed` false (anti-peek countdown) means revealed is always false; flipping it to false also resets
 *    the lift detector and any hold in progress.
 *  - `holdProps` are spread on the hold-to-reveal button: press = show, release = hide. Pointer, keyboard
 *    (Space/Enter) and focus/visibility loss are handled; text selection and the iOS callout are disabled.
 *
 * Sensors are read only while this hook is mounted, armed and in lift mode (privacy).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type SyntheticEvent,
} from 'react';
import type { RevealMethod } from '../game/types';
import { createLiftDetector, type LiftDetector } from '../lib/liftDetector';
import { subscribePitch, useSensorPermission, type SensorPermission } from '../lib/sensors';

export interface RevealController {
  revealed: boolean;
  effectiveMethod: 'lift' | 'hold';
  permission: SensorPermission;
  holdProps: HTMLAttributes<HTMLElement>;
}

/** Inline safety net: no scroll/zoom takeover (pointercancel), no text selection, no iOS callout. */
const HOLD_STYLE: CSSProperties = {
  touchAction: 'none',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
};

function isActivationKey(e: KeyboardEvent<HTMLElement>): boolean {
  return e.key === ' ' || e.key === 'Enter' || e.key === 'Spacebar';
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

export function useReveal(opts: { method: RevealMethod; armed: boolean }): RevealController {
  const { method, armed } = opts;
  const permission = useSensorPermission();
  const effectiveMethod: 'lift' | 'hold' = method === 'lift' && permission === 'granted' ? 'lift' : 'hold';
  const liftActive = effectiveMethod === 'lift' && armed;

  const [holding, setHolding] = useState(false);
  const [lifted, setLifted] = useState(false);

  const detectorRef = useRef<LiftDetector | null>(null);
  if (detectorRef.current === null) detectorRef.current = createLiftDetector();
  const liftedRef = useRef(false);
  const activePointers = useRef<Set<number>>(new Set());

  const setLiftedIfChanged = useCallback((next: boolean) => {
    if (liftedRef.current === next) return;
    liftedRef.current = next;
    setLifted(next);
  }, []);

  const clearHold = useCallback(() => {
    activePointers.current.clear();
    setHolding(false);
  }, []);

  // Lift mode: subscribe to the pitch stream only while mounted, armed and allowed to lift.
  useEffect(() => {
    const detector = detectorRef.current!;
    detector.reset();
    setLiftedIfChanged(false);
    if (!liftActive) return;
    const unsubscribe = subscribePitch((pitch) => {
      setLiftedIfChanged(detector.feed(pitch, now()));
    });
    return () => {
      unsubscribe();
      detector.reset();
      setLiftedIfChanged(false);
    };
  }, [liftActive, setLiftedIfChanged]);

  // A hold never survives disarming or a change of the requested method. (A permission flip that only
  // changes `effectiveMethod` keeps an in-progress hold: holding works in both modes.)
  useEffect(() => {
    if (!armed) clearHold();
  }, [armed, clearHold]);
  useEffect(() => {
    clearHold();
  }, [method, clearHold]);

  // Losing the window (app switch, lock screen, incoming call) hides the secret and forgets the gesture.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onBlur = () => clearHold();
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        clearHold();
        detectorRef.current?.reset();
        setLiftedIfChanged(false);
      }
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [clearHold, setLiftedIfChanged]);

  const holdProps = useMemo<HTMLAttributes<HTMLElement>>(() => {
    const release = (e: PointerEvent<HTMLElement>) => {
      activePointers.current.delete(e.pointerId);
      if (activePointers.current.size === 0) setHolding(false);
    };
    const releaseAll = () => {
      activePointers.current.clear();
      setHolding(false);
    };
    return {
      style: HOLD_STYLE,
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        // Only the primary mouse button holds; touch and pen always do.
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault(); // no text selection / compat mouse events; focus is not needed for a hold
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* capture is best-effort (older browsers) */
        }
        activePointers.current.add(e.pointerId);
        setHolding(true);
      },
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave: release,
      onLostPointerCapture: release,
      onContextMenu: (e: SyntheticEvent) => {
        e.preventDefault();
      },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (!isActivationKey(e)) return;
        e.preventDefault(); // a button would otherwise fire click on Space/Enter
        if (!e.repeat) setHolding(true);
      },
      onKeyUp: (e: KeyboardEvent<HTMLElement>) => {
        if (!isActivationKey(e)) return;
        e.preventDefault();
        setHolding(false);
      },
      onBlur: releaseAll,
      onDragStart: (e: SyntheticEvent) => {
        e.preventDefault();
      },
    };
  }, []);

  return {
    revealed: armed && (lifted || holding),
    effectiveMethod,
    permission,
    holdProps,
  };
}
