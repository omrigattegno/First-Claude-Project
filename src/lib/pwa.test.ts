/**
 * pwa.ts must be importable and inert outside a browser (vitest runs in the node environment),
 * because main.tsx calls registerPWA() at module load and screens import the install store.
 */
import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY_INSTALL_DISMISSED,
  canInstall,
  dismissInstall,
  isIOS,
  isInstallDismissed,
  isStandalone,
  promptInstall,
  registerPWA,
  subscribeInstall,
} from './pwa';

describe('pwa (non-browser environment)', () => {
  it('registerPWA is a no-op without window', () => {
    expect(() => registerPWA()).not.toThrow();
    expect(() => registerPWA()).not.toThrow(); // idempotent
  });

  it('install store reports nothing to install', async () => {
    expect(canInstall()).toBe(false);
    await expect(promptInstall()).resolves.toBe('unavailable');
    const unsubscribe = subscribeInstall(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });

  it('environment probes default to false', () => {
    expect(isStandalone()).toBe(false);
    expect(isIOS()).toBe(false);
  });

  it('dismissal survives a missing localStorage', () => {
    expect(isInstallDismissed()).toBe(false);
    expect(() => dismissInstall()).not.toThrow();
    expect(STORAGE_KEY_INSTALL_DISMISSED).toBe('imposter.v1.installDismissed');
  });
});
