// @vitest-environment jsdom
/**
 * registerPWA must hand vite-plugin-pwa an `onNeedReload` callback: in autoUpdate mode the client
 * otherwise calls window.location.reload() the moment a new service worker activates, which can land
 * mid-round. The no-op keeps the page as it is; the new build is used from the next launch.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';

const { registerSW } = vi.hoisted(() => ({ registerSW: vi.fn() }));
vi.mock('virtual:pwa-register', () => ({ registerSW }));

import { registerPWA } from './pwa';

describe('registerPWA (browser with a service worker)', () => {
  beforeAll(() => {
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
  });

  it('registers once, with a no-op onNeedReload instead of letting the client reload the page', () => {
    registerPWA();
    registerPWA();
    expect(registerSW).toHaveBeenCalledTimes(1);
    const options = registerSW.mock.calls[0][0] as {
      immediate?: boolean;
      onNeedReload?: () => void;
      onNeedRefresh?: () => void;
    };
    expect(options.immediate).toBe(true);
    expect(typeof options.onNeedReload).toBe('function');
    expect(options.onNeedRefresh).toBeUndefined(); // prompt-mode callback, never called in auto mode
    expect(() => options.onNeedReload!()).not.toThrow();
  });
});
