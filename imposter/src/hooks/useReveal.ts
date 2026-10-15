/**
 * Reveal controller used by the Reveal and Vote screens. STUB: the sensors
 * builder replaces this file with the lift-to-reveal implementation.
 *
 * Contract:
 *  - `revealed` is true only while the secret may be rendered.
 *  - method 'lift' uses device pitch (LIFT_* constants); it falls back to 'hold'
 *    when sensors are unsupported or permission is denied.
 *  - `armed` false (anti-peek countdown) means revealed is always false.
 *  - `holdProps` are spread on the hold-to-reveal button (press = show, release = hide).
 */
import { useCallback, useState, type HTMLAttributes } from 'react';
import type { RevealMethod } from '../game/types';
import { useSensorPermission, type SensorPermission } from '../lib/sensors';

export interface RevealController {
  revealed: boolean;
  effectiveMethod: 'lift' | 'hold';
  permission: SensorPermission;
  holdProps: HTMLAttributes<HTMLElement>;
}

export function useReveal(opts: { method: RevealMethod; armed: boolean }): RevealController {
  const permission = useSensorPermission();
  const [holding, setHolding] = useState(false);
  const effectiveMethod: 'lift' | 'hold' = opts.method === 'lift' && permission === 'granted' ? 'lift' : 'hold';
  const down = useCallback(() => setHolding(true), []);
  const up = useCallback(() => setHolding(false), []);
  return {
    revealed: opts.armed && holding,
    effectiveMethod,
    permission,
    holdProps: {
      onPointerDown: down,
      onPointerUp: up,
      onPointerCancel: up,
      onPointerLeave: up,
      onContextMenu: (e) => e.preventDefault(),
    },
  };
}
