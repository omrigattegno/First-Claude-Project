// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROBE_TIMEOUT_MS,
  __resetSensorsForTests,
  getScreenAngle,
  getSensorPermission,
  pitchFromOrientation,
  requestSensorPermission,
  subscribePitch,
  subscribeSensorPermission,
} from './sensors';

type RequestPermission = () => Promise<'granted' | 'denied'>;

function defineOrientationApi(requestPermission?: RequestPermission): void {
  class FakeDeviceOrientationEvent extends Event {
    static requestPermission?: RequestPermission;
  }
  if (requestPermission) FakeDeviceOrientationEvent.requestPermission = requestPermission;
  Object.defineProperty(window, 'DeviceOrientationEvent', {
    value: FakeDeviceOrientationEvent,
    configurable: true,
    writable: true,
  });
}

function removeOrientationApi(): void {
  Object.defineProperty(window, 'DeviceOrientationEvent', { value: undefined, configurable: true, writable: true });
}

function fireOrientation(beta: number | null, gamma: number | null = 0): void {
  const e = new Event('deviceorientation');
  Object.defineProperty(e, 'beta', { value: beta });
  Object.defineProperty(e, 'gamma', { value: gamma });
  Object.defineProperty(e, 'alpha', { value: 0 });
  window.dispatchEvent(e);
}

function setLegacyOrientation(value: unknown): void {
  Object.defineProperty(window, 'orientation', { value, configurable: true, writable: true });
}

function setScreenOrientation(value: { angle?: number; type?: string } | undefined): void {
  Object.defineProperty(screen, 'orientation', { value, configurable: true, writable: true });
}

beforeEach(() => {
  __resetSensorsForTests();
  removeOrientationApi();
  setLegacyOrientation(undefined);
  setScreenOrientation(undefined);
});

afterEach(() => {
  __resetSensorsForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pitchFromOrientation', () => {
  it('returns beta in portrait', () => {
    expect(pitchFromOrientation(0, 0, 0)).toBe(0);
    expect(pitchFromOrientation(47.5, 12, 0)).toBe(47.5);
    expect(pitchFromOrientation(90, -80, 0)).toBe(90);
    expect(pitchFromOrientation(-60, 0, 0)).toBe(-60);
    expect(pitchFromOrientation(120, 0)).toBe(120);
  });

  it('ignores gamma in portrait (also when it is null)', () => {
    expect(pitchFromOrientation(50, null, 0)).toBe(50);
    expect(pitchFromOrientation(50, Number.NaN, 0)).toBe(50);
  });

  it('returns null for missing or non-finite beta', () => {
    expect(pitchFromOrientation(null, 0, 0)).toBeNull();
    expect(pitchFromOrientation(undefined, 0, 0)).toBeNull();
    expect(pitchFromOrientation(Number.NaN, 0, 0)).toBeNull();
    expect(pitchFromOrientation(Number.POSITIVE_INFINITY, 0, 0)).toBeNull();
  });

  it('clamps beta to [-180, 180]', () => {
    expect(pitchFromOrientation(250, 0, 0)).toBe(180);
    expect(pitchFromOrientation(-250, 0, 0)).toBe(-180);
  });

  it('negates beta when the screen is upside down (180)', () => {
    expect(pitchFromOrientation(60, 0, 180)).toBe(-60);
    expect(pitchFromOrientation(-60, 0, 180)).toBe(60);
  });

  it('landscape-primary (90): lifting the right edge (negative gamma) increases pitch', () => {
    expect(pitchFromOrientation(0, 0, 90)).toBeCloseTo(0, 6);
    expect(pitchFromOrientation(0, -60, 90)).toBeCloseTo(60, 6);
    expect(pitchFromOrientation(0, -89, 90)).toBeCloseTo(89, 6);
    expect(pitchFromOrientation(0, 60, 90)).toBeCloseTo(-60, 6);
  });

  it('landscape-secondary (270): lifting the left edge (positive gamma) increases pitch', () => {
    expect(pitchFromOrientation(0, 60, 270)).toBeCloseTo(60, 6);
    expect(pitchFromOrientation(0, -60, 270)).toBeCloseTo(-60, 6);
    expect(pitchFromOrientation(0, 60, -90)).toBeCloseTo(60, 6); // -90 is the legacy spelling of 270
  });

  it('landscape: tilting past vertical keeps the pitch above 90 (beta flips to 180, gamma wraps)', () => {
    // A pure 120 degree lift about the long axis is reported by browsers as beta=180, gamma=+60.
    expect(pitchFromOrientation(180, 60, 90)).toBeCloseTo(120, 6);
    expect(pitchFromOrientation(-180, -60, 270)).toBeCloseTo(120, 6);
  });

  it('landscape needs a numeric gamma', () => {
    expect(pitchFromOrientation(30, null, 90)).toBeNull();
    expect(pitchFromOrientation(30, Number.NaN, 270)).toBeNull();
  });

  it('rounds a loose screen angle to the nearest quadrant', () => {
    expect(pitchFromOrientation(40, 0, 10)).toBe(40);
    expect(pitchFromOrientation(0, -50, 95)).toBeCloseTo(50, 6);
    expect(pitchFromOrientation(40, 0, 360)).toBe(40);
  });
});

describe('getScreenAngle', () => {
  it('is 0 when nothing is exposed', () => {
    expect(getScreenAngle()).toBe(0);
  });

  it('prefers screen.orientation.angle', () => {
    setScreenOrientation({ angle: 270, type: 'landscape-secondary' });
    setLegacyOrientation(90);
    expect(getScreenAngle()).toBe(270);
  });

  it('falls back to screen.orientation.type (assuming a portrait-natural device)', () => {
    setScreenOrientation({ type: 'landscape-primary' });
    expect(getScreenAngle()).toBe(90);
    setScreenOrientation({ type: 'landscape-secondary' });
    expect(getScreenAngle()).toBe(270);
    setScreenOrientation({ type: 'portrait-secondary' });
    expect(getScreenAngle()).toBe(180);
    setScreenOrientation({ type: 'portrait-primary' });
    expect(getScreenAngle()).toBe(0);
  });

  it('falls back to the legacy window.orientation (-90 means 270)', () => {
    setLegacyOrientation(-90);
    expect(getScreenAngle()).toBe(270);
    setLegacyOrientation(90);
    expect(getScreenAngle()).toBe(90);
    setLegacyOrientation(0);
    expect(getScreenAngle()).toBe(0);
  });
});

describe('permission model', () => {
  it("is 'unsupported' without DeviceOrientationEvent", async () => {
    expect(getSensorPermission()).toBe('unsupported');
    await expect(requestSensorPermission()).resolves.toBe('unsupported');
  });

  it("starts 'granted' on browsers that expose the API without a permission prompt (Android)", async () => {
    defineOrientationApi();
    expect(getSensorPermission()).toBe('granted');
    await expect(requestSensorPermission()).resolves.toBe('granted');
  });

  it("starts 'prompt' on iOS 13+ and resolves 'granted' from the system prompt", async () => {
    const request = vi.fn<RequestPermission>().mockResolvedValue('granted');
    defineOrientationApi(request);
    expect(getSensorPermission()).toBe('prompt');
    const seen: string[] = [];
    subscribeSensorPermission(() => seen.push(getSensorPermission()));
    await expect(requestSensorPermission()).resolves.toBe('granted');
    expect(request).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['granted']);
    expect(getSensorPermission()).toBe('granted');
  });

  it("resolves 'denied' when the user refuses", async () => {
    defineOrientationApi(vi.fn<RequestPermission>().mockResolvedValue('denied'));
    await expect(requestSensorPermission()).resolves.toBe('denied');
    expect(getSensorPermission()).toBe('denied');
  });

  it("resolves 'denied' when the prompt throws (e.g. not called from a user gesture)", async () => {
    defineOrientationApi(vi.fn<RequestPermission>().mockRejectedValue(new Error('NotAllowedError')));
    await expect(requestSensorPermission()).resolves.toBe('denied');
  });

  it('does not prompt again once granted', async () => {
    const request = vi.fn<RequestPermission>().mockResolvedValue('granted');
    defineOrientationApi(request);
    await requestSensorPermission();
    await requestSensorPermission();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('can retry after a denial (the host taps Start again)', async () => {
    const request = vi.fn<RequestPermission>().mockResolvedValueOnce('denied').mockResolvedValueOnce('granted');
    defineOrientationApi(request);
    await expect(requestSensorPermission()).resolves.toBe('denied');
    await expect(requestSensorPermission()).resolves.toBe('granted');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('unsubscribing a permission listener stops notifications', async () => {
    defineOrientationApi(vi.fn<RequestPermission>().mockResolvedValue('granted'));
    const cb = vi.fn();
    const unsubscribe = subscribeSensorPermission(cb);
    unsubscribe();
    await requestSensorPermission();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('subscribePitch', () => {
  function countListeners(spy: ReturnType<typeof vi.spyOn>): number {
    return spy.mock.calls.filter((call) => call[0] === 'deviceorientation').length;
  }

  it('attaches one window listener shared by all subscribers and removes it after the last unsubscribe', () => {
    defineOrientationApi();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const a = subscribePitch(() => {});
    const b = subscribePitch(() => {});
    expect(countListeners(add)).toBe(1);
    a();
    expect(countListeners(remove)).toBe(0);
    b();
    expect(countListeners(remove)).toBe(1);
    // Unsubscribing twice is harmless.
    b();
    expect(countListeners(remove)).toBe(1);
    // A fresh subscription re-attaches.
    const c = subscribePitch(() => {});
    expect(countListeners(add)).toBe(2);
    c();
  });

  it('does not listen at all when the API is missing', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const unsubscribe = subscribePitch(() => {});
    expect(countListeners(add)).toBe(0);
    expect(getSensorPermission()).toBe('unsupported');
    unsubscribe();
  });

  it('delivers the pitch (beta in portrait) to every subscriber and ignores events without a numeric beta', () => {
    defineOrientationApi();
    const a = vi.fn();
    const b = vi.fn();
    const ua = subscribePitch(a);
    const ub = subscribePitch(b);
    fireOrientation(null);
    fireOrientation(Number.NaN);
    fireOrientation(52, 5);
    fireOrientation(-20, 0);
    expect(a.mock.calls.map((c) => c[0])).toEqual([52, -20]);
    expect(b.mock.calls.map((c) => c[0])).toEqual([52, -20]);
    ua();
    fireOrientation(70);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(3);
    ub();
  });

  it('uses gamma in landscape', () => {
    defineOrientationApi();
    setScreenOrientation({ angle: 90, type: 'landscape-primary' });
    const cb = vi.fn();
    const unsubscribe = subscribePitch(cb);
    fireOrientation(0, -60);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBeCloseTo(60, 6);
    unsubscribe();
  });

  it('a subscriber that throws does not break the others', () => {
    defineOrientationApi();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    const u1 = subscribePitch(bad);
    const u2 = subscribePitch(good);
    expect(() => fireOrientation(60)).not.toThrow();
    expect(good).toHaveBeenCalledWith(60);
    u1();
    u2();
  });

  describe('desktop probe', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("flips 'granted' to 'unsupported' when no numeric reading arrives within the probe timeout", () => {
      defineOrientationApi();
      const seen: string[] = [];
      subscribeSensorPermission(() => seen.push(getSensorPermission()));
      const unsubscribe = subscribePitch(() => {});
      expect(getSensorPermission()).toBe('granted');
      vi.advanceTimersByTime(PROBE_TIMEOUT_MS - 1);
      expect(getSensorPermission()).toBe('granted');
      vi.advanceTimersByTime(1);
      expect(getSensorPermission()).toBe('unsupported');
      expect(seen).toEqual(['unsupported']);
      unsubscribe();
    });

    it('events without a numeric beta do not count as a reading', () => {
      defineOrientationApi();
      const unsubscribe = subscribePitch(() => {});
      fireOrientation(null, null);
      vi.advanceTimersByTime(PROBE_TIMEOUT_MS);
      expect(getSensorPermission()).toBe('unsupported');
      unsubscribe();
    });

    it("keeps 'granted' once a real reading arrives, and never probes again", () => {
      defineOrientationApi();
      const unsubscribe = subscribePitch(() => {});
      vi.advanceTimersByTime(500);
      fireOrientation(10);
      vi.advanceTimersByTime(PROBE_TIMEOUT_MS * 2);
      expect(getSensorPermission()).toBe('granted');
      unsubscribe();
      const again = subscribePitch(() => {});
      vi.advanceTimersByTime(PROBE_TIMEOUT_MS * 2);
      expect(getSensorPermission()).toBe('granted');
      again();
    });

    it("recovers to 'granted' if a reading arrives after a false 'unsupported' verdict", () => {
      defineOrientationApi();
      const unsubscribe = subscribePitch(() => {});
      vi.advanceTimersByTime(PROBE_TIMEOUT_MS);
      expect(getSensorPermission()).toBe('unsupported');
      fireOrientation(10);
      expect(getSensorPermission()).toBe('granted');
      unsubscribe();
    });

    it('cancels the probe when the last subscriber leaves before the timeout', () => {
      defineOrientationApi();
      const unsubscribe = subscribePitch(() => {});
      vi.advanceTimersByTime(PROBE_TIMEOUT_MS / 2);
      unsubscribe();
      vi.advanceTimersByTime(PROBE_TIMEOUT_MS * 2);
      expect(getSensorPermission()).toBe('granted');
    });

    it("does not probe while the permission is still 'prompt' (iOS before Start)", () => {
      defineOrientationApi(vi.fn<RequestPermission>().mockResolvedValue('granted'));
      const unsubscribe = subscribePitch(() => {});
      vi.advanceTimersByTime(PROBE_TIMEOUT_MS * 2);
      expect(getSensorPermission()).toBe('prompt');
      unsubscribe();
    });

    it('waits for the page to become visible before judging', () => {
      defineOrientationApi();
      const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      const unsubscribe = subscribePitch(() => {});
      vi.advanceTimersByTime(PROBE_TIMEOUT_MS * 2);
      expect(getSensorPermission()).toBe('granted');
      visibility.mockReturnValue('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(PROBE_TIMEOUT_MS - 1);
      expect(getSensorPermission()).toBe('granted');
      vi.advanceTimersByTime(1);
      expect(getSensorPermission()).toBe('unsupported');
      unsubscribe();
    });
  });
});
