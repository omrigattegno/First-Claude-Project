// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIFT_DOWN_DEBOUNCE_MS, LIFT_UP_DEBOUNCE_MS } from '../game/constants';
import type { RevealMethod } from '../game/types';
import { PROBE_TIMEOUT_MS, __resetSensorsForTests, getSensorPermission } from '../lib/sensors';
import { useReveal, type RevealController } from './useReveal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function defineOrientationApi(): void {
  class FakeDeviceOrientationEvent extends Event {}
  Object.defineProperty(window, 'DeviceOrientationEvent', {
    value: FakeDeviceOrientationEvent,
    configurable: true,
    writable: true,
  });
}

/** One synthetic reading (portrait: pitch = beta). */
function fire(beta: number): void {
  const e = new Event('deviceorientation');
  Object.defineProperty(e, 'beta', { value: beta });
  Object.defineProperty(e, 'gamma', { value: 0 });
  Object.defineProperty(e, 'alpha', { value: 0 });
  act(() => {
    window.dispatchEvent(e);
  });
}

/** Readings every `stepMs` for `durationMs` (the iOS / fake-sensor pattern). */
function stream(beta: number, durationMs: number, stepMs = 16): void {
  for (let t = 0; t < durationMs; t += stepMs) {
    fire(beta);
    act(() => {
      vi.advanceTimersByTime(stepMs);
    });
  }
}

function elapse(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: RevealController | null = null;

function Harness(props: { method: RevealMethod; armed: boolean }) {
  latest = useReveal(props);
  return null;
}

function render(props: { method: RevealMethod; armed: boolean }): RevealController {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => {
    root!.render(createElement(Harness, props));
  });
  return latest!;
}

const current = (): RevealController => latest!;

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  });
  __resetSensorsForTests();
  defineOrientationApi();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latest = null;
  __resetSensorsForTests();
  vi.useRealTimers();
});

describe('useReveal in lift mode', () => {
  it('needs the phone lowered once after arming before a lift shows the card', () => {
    render({ method: 'lift', armed: true });
    expect(current().effectiveMethod).toBe('lift');
    expect(current().needsLower).toBe(true);
    // Still pointed at the previous holder when the countdown ends: never reveals.
    stream(70, 2000);
    expect(current().revealed).toBe(false);
    expect(current().needsLower).toBe(true);
    // Lowered once: primed; the next lift counts after the usual debounce.
    fire(5);
    expect(current().needsLower).toBe(false);
    stream(70, LIFT_UP_DEBOUNCE_MS + 32);
    expect(current().revealed).toBe(true);
  });

  it('disarming resets the lift state and asks for a lowered reading again', () => {
    render({ method: 'lift', armed: true });
    fire(5);
    stream(70, LIFT_UP_DEBOUNCE_MS + 32);
    expect(current().revealed).toBe(true);
    render({ method: 'lift', armed: false });
    expect(current().revealed).toBe(false);
    expect(current().needsLower).toBe(false); // not shown while disarmed
    render({ method: 'lift', armed: true });
    expect(current().needsLower).toBe(true);
    stream(70, 1000);
    expect(current().revealed).toBe(false);
  });

  it('finishes the debounce on the clock when the sensor goes quiet (Chrome Android)', () => {
    render({ method: 'lift', armed: true });
    fire(5);
    // One reading above the threshold, then silence: the card must still appear after the up debounce.
    fire(70);
    elapse(LIFT_UP_DEBOUNCE_MS - 10);
    expect(current().revealed).toBe(false);
    elapse(20);
    expect(current().revealed).toBe(true);
    // One reading below the threshold, then silence: the card must still hide after the down debounce.
    fire(10);
    elapse(LIFT_DOWN_DEBOUNCE_MS - 10);
    expect(current().revealed).toBe(true);
    elapse(20);
    expect(current().revealed).toBe(false);
  });

  it('a bounce cancels the pending clock-driven transition', () => {
    render({ method: 'lift', armed: true });
    fire(5);
    fire(70);
    elapse(200);
    fire(40); // back inside the band, then quiet
    elapse(LIFT_UP_DEBOUNCE_MS * 2);
    expect(current().revealed).toBe(false);
  });

  it('losing the window hides the card and re-arms the lowered requirement', () => {
    render({ method: 'lift', armed: true });
    fire(5);
    stream(70, LIFT_UP_DEBOUNCE_MS + 32);
    expect(current().revealed).toBe(true);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(current().revealed).toBe(false);
    expect(current().needsLower).toBe(true);
    visibility.mockReturnValue('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    stream(70, 1000);
    expect(current().revealed).toBe(false);
    fire(0);
    stream(70, LIFT_UP_DEBOUNCE_MS + 32);
    expect(current().revealed).toBe(true);
  });

  it("keeps listening through a false 'unsupported' verdict so a late first reading restores lift mode", () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    render({ method: 'lift', armed: true });
    expect(current().effectiveMethod).toBe('lift');
    elapse(PROBE_TIMEOUT_MS);
    expect(getSensorPermission()).toBe('unsupported');
    expect(current().effectiveMethod).toBe('hold');
    expect(current().needsLower).toBe(false); // the hold UI is shown, no lift hint
    expect(remove.mock.calls.filter((c) => c[0] === 'deviceorientation')).toHaveLength(0);
    // The first real reading arrives late: back to lift mode without re-arming, and it primes.
    fire(5);
    expect(getSensorPermission()).toBe('granted');
    expect(current().effectiveMethod).toBe('lift');
    expect(current().needsLower).toBe(false);
    stream(70, LIFT_UP_DEBOUNCE_MS + 32);
    expect(current().revealed).toBe(true);
  });

  it('does not read the sensors when the host chose Hold, and the hold button still works', () => {
    const add = vi.spyOn(window, 'addEventListener');
    render({ method: 'hold', armed: true });
    expect(current().effectiveMethod).toBe('hold');
    expect(current().needsLower).toBe(false);
    expect(add.mock.calls.filter((c) => c[0] === 'deviceorientation')).toHaveLength(0);
  });

  it('unmounting stops the stream and the pending timer', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    render({ method: 'lift', armed: true });
    fire(5);
    fire(70);
    act(() => {
      root!.unmount();
    });
    root = null;
    expect(remove.mock.calls.filter((c) => c[0] === 'deviceorientation')).toHaveLength(1);
    expect(() => elapse(LIFT_UP_DEBOUNCE_MS * 2)).not.toThrow();
  });
});
