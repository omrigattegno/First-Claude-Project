// @vitest-environment jsdom
/**
 * The platform-back guard in NavProvider: a Back (popstate) pops the in-app stack while there is a
 * screen below, the guard entry is re-armed while screens remain, and at the root nothing is pushed
 * so the next Back can leave the app.
 */
import { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { NavProvider, useNav, type Nav, type Screen } from './nav';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(initial: Screen = 'home', strict = false): { nav: () => Nav; unmount: () => void } {
  let latest: Nav | null = null;
  function Probe() {
    latest = useNav();
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const tree = (
    <NavProvider initial={initial}>
      <Probe />
    </NavProvider>
  );
  act(() => {
    root.render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  });
  return {
    nav: () => latest!,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const guardArmed = (): boolean => (window.history.state as { imposterNav?: boolean } | null)?.imposterNav === true;

/** The platform Back: jsdom traverses the history and fires popstate asynchronously (none at the first entry). */
async function pressBack(): Promise<void> {
  await act(async () => {
    const popped = new Promise<void>((resolve) => {
      const done = () => {
        window.removeEventListener('popstate', done);
        resolve();
      };
      window.addEventListener('popstate', done);
      setTimeout(done, 200);
    });
    window.history.back();
    await popped;
  });
}

let mounted: ReturnType<typeof mount> | null = null;
let pushes: MockInstance;

beforeEach(() => {
  pushes = vi.spyOn(window.history, 'pushState');
});

afterEach(async () => {
  mounted?.unmount();
  mounted = null;
  pushes.mockRestore();
  // Leave the shared jsdom history on a plain entry for the next test.
  while (guardArmed()) await pressBack();
});

describe('NavProvider platform back', () => {
  it('arms one guard entry only once a screen can be popped', () => {
    mounted = mount();
    expect(guardArmed()).toBe(false);
    expect(pushes).not.toHaveBeenCalled();

    act(() => mounted!.nav().go('setup'));
    expect(guardArmed()).toBe(true);
    expect(pushes).toHaveBeenCalledTimes(1);
    expect(pushes).toHaveBeenCalledWith({ imposterNav: true }, '');

    act(() => mounted!.nav().go('settings'));
    expect(pushes).toHaveBeenCalledTimes(1); // still a single guard above the real entry
  });

  it('pops a screen per Back, re-arms while screens remain, and leaves the root alone', async () => {
    mounted = mount();
    act(() => mounted!.nav().go('setup'));
    act(() => mounted!.nav().go('settings'));
    expect(mounted.nav().screen).toBe('settings');
    expect(pushes).toHaveBeenCalledTimes(1);

    await pressBack();
    expect(mounted.nav().screen).toBe('setup');
    expect(guardArmed()).toBe(true); // 'home' is still below: Back must keep popping
    expect(pushes).toHaveBeenCalledTimes(2);

    await pressBack();
    expect(mounted.nav().screen).toBe('home');
    expect(guardArmed()).toBe(false); // root: nothing pushed, so the next Back exits the app
    expect(pushes).toHaveBeenCalledTimes(2);

    await pressBack(); // nothing to pop: the stack is untouched and nothing is pushed
    expect(mounted.nav().screen).toBe('home');
    expect(guardArmed()).toBe(false);
    expect(pushes).toHaveBeenCalledTimes(2);
  });

  it('a guard left over by an in-app reset is consumed without popping anything', async () => {
    mounted = mount();
    act(() => mounted!.nav().go('setup'));
    act(() => mounted!.nav().reset('game'));
    expect(mounted.nav().screen).toBe('game');
    expect(guardArmed()).toBe(true);

    await pressBack();
    expect(mounted.nav().screen).toBe('game');
    expect(guardArmed()).toBe(false);
    expect(pushes).toHaveBeenCalledTimes(1);
  });

  it('is StrictMode-safe: double effects push a single guard', () => {
    mounted = mount('home', true);
    act(() => mounted!.nav().go('howto'));
    expect(guardArmed()).toBe(true);
    expect(pushes).toHaveBeenCalledTimes(1);
  });
});
