/**
 * PWA glue: service-worker registration (vite-plugin-pwa) and the "Add to Home Screen" install store.
 *
 *  - registerPWA(): call once at startup (main.tsx). Registers the service worker and starts capturing
 *    the Chromium `beforeinstallprompt` event so the app can show its own install card.
 *  - canInstall() / promptInstall() / subscribeInstall(): a tiny external store for React
 *    (`useCanInstall()` wraps it in useSyncExternalStore).
 *  - isStandalone(): running as an installed app (display-mode media query, iOS navigator.standalone, TWA).
 *  - isIOS(): iPhone/iPad/iPod, including iPadOS 13+ which reports itself as a Mac.
 *
 * Every export is safe outside a browser (vitest node env, SSR): it degrades to a no-op / false.
 */
import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

/** localStorage key set when the user dismisses the install card. */
export const STORAGE_KEY_INSTALL_DISMISSED = 'imposter.v1.installDismissed';

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/** Chromium-only event; not in lib.dom. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const hasWindow = (): boolean => typeof window !== 'undefined' && typeof navigator !== 'undefined';

// ---------------------------------------------------------------------------
// Install store
// ---------------------------------------------------------------------------

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
let listening = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const cb of Array.from(listeners)) {
    try {
      cb();
    } catch {
      /* a listener must never break the others */
    }
  }
}

/** Attach the window listeners once. Safe to call repeatedly. */
function listen(): void {
  if (listening || !hasWindow()) return;
  listening = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own card and call prompt() from it
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
}

/** True when the browser offered an install prompt we can trigger (Android / desktop Chromium). */
export function canInstall(): boolean {
  return deferredPrompt !== null && !installed;
}

export function subscribeInstall(cb: () => void): () => void {
  listen();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Open the native install dialog. Must be called from a user gesture. */
export async function promptInstall(): Promise<InstallOutcome> {
  const ev = deferredPrompt;
  if (!ev) return 'unavailable';
  // The event can be used only once; Chromium fires a new one later if the user declines.
  deferredPrompt = null;
  notify();
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'accepted') {
      installed = true;
      notify();
    }
    return outcome;
  } catch {
    return 'unavailable';
  }
}

const getServerSnapshot = (): boolean => false;

/** React binding for canInstall(). */
export function useCanInstall(): boolean {
  return useSyncExternalStore(subscribeInstall, canInstall, getServerSnapshot);
}

// ---------------------------------------------------------------------------
// Dismissal (per device, persisted)
// ---------------------------------------------------------------------------

export function isInstallDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY_INSTALL_DISMISSED) !== null;
  } catch {
    return false;
  }
}

export function dismissInstall(): void {
  try {
    localStorage.setItem(STORAGE_KEY_INSTALL_DISMISSED, String(Date.now()));
  } catch {
    /* private mode / quota: the card simply comes back next launch */
  }
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Running as an installed app (home-screen launch) rather than in a browser tab. */
export function isStandalone(): boolean {
  if (!hasWindow()) return false;
  try {
    if (typeof window.matchMedia === 'function') {
      for (const mode of ['standalone', 'fullscreen', 'minimal-ui']) {
        if (window.matchMedia(`(display-mode: ${mode})`).matches) return true;
      }
    }
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true; // iOS Safari
    if (typeof document !== 'undefined' && document.referrer.startsWith('android-app://')) return true; // TWA
  } catch {
    /* fall through */
  }
  return false;
}

/** iPhone / iPad / iPod (any browser: they are all WebKit and share the Share-sheet install flow). */
export function isIOS(): boolean {
  if (!hasWindow()) return false;
  const ua = navigator.userAgent ?? '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ masquerades as a Mac; the touch points give it away.
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
}

// ---------------------------------------------------------------------------
// Service worker
// ---------------------------------------------------------------------------

let registered = false;

/**
 * Register the service worker and start listening for the install prompt. Idempotent.
 * registerType is 'autoUpdate' (vite.config.ts): a new build takes over quietly and is shown on the
 * next launch, so nothing interrupts a round in progress.
 */
export function registerPWA(): void {
  if (!hasWindow()) return;
  listen();
  if (registered || !('serviceWorker' in navigator)) return;
  registered = true;
  try {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        /* autoUpdate: handled by the service worker; the fresh version loads on the next launch */
      },
      onOfflineReady() {
        /* everything (app shell + bundled word packs) is precached; no UI needed */
      },
      onRegisterError(error: unknown) {
        if (import.meta.env.DEV) console.warn('[pwa] service worker registration failed', error);
      },
    });
  } catch {
    /* insecure context or unsupported browser: the app still runs, just not offline */
  }
}
