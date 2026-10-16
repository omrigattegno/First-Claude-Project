// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TAP_GUARD_MS, useTapGuard } from './useTapGuard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Guard = ReturnType<typeof useTapGuard>;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let latest: Guard | null = null;

function Harness({ ms }: { ms?: number }) {
  latest = useTapGuard(ms);
  return null;
}

function render(ms?: number): void {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => {
    root!.render(createElement(Harness, { ms }));
  });
}

const guarded = (): boolean => latest![0];
const arm = (): void => {
  act(() => {
    latest![1]();
  });
};
const elapse = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latest = null;
  vi.useRealTimers();
});

describe('useTapGuard', () => {
  it('guards for TAP_GUARD_MS after mount, then releases', () => {
    render();
    expect(guarded()).toBe(true);
    elapse(TAP_GUARD_MS - 1);
    expect(guarded()).toBe(true);
    elapse(1);
    expect(guarded()).toBe(false);
  });

  it('arm() re-guards for the full window and restarts a running one', () => {
    render();
    elapse(TAP_GUARD_MS);
    expect(guarded()).toBe(false);
    arm();
    expect(guarded()).toBe(true);
    elapse(TAP_GUARD_MS / 2);
    arm(); // a second tap inside the window extends it
    elapse(TAP_GUARD_MS / 2);
    expect(guarded()).toBe(true);
    elapse(TAP_GUARD_MS / 2);
    expect(guarded()).toBe(false);
  });

  it('honours a custom window', () => {
    render(50);
    elapse(49);
    expect(guarded()).toBe(true);
    elapse(1);
    expect(guarded()).toBe(false);
  });

  it('clears its timer on unmount (no state update after unmount)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render();
    act(() => {
      root!.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    expect(vi.getTimerCount()).toBe(0);
    elapse(TAP_GUARD_MS * 2);
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
