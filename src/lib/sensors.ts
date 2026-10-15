/**
 * Device-orientation access: permission model + shared pitch stream.
 *
 * Contract (see ARCHITECTURE.md "Reveal contract"):
 *  - getSensorPermission(): cached permission state
 *  - requestSensorPermission(): must be called from a user gesture (iOS 13+); resolves the new state
 *  - subscribeSensorPermission(cb) / useSensorPermission(): react to permission changes
 *  - subscribePitch(cb): stream of device pitch in degrees; 0 = flat screen-up, 90 = upright facing the user,
 *    negative = tilted away. One window listener is shared by all subscribers (ref-counted), so nothing
 *    reads the sensors unless a reveal/vote screen is subscribed.
 *
 * Permission model:
 *  - 'unsupported': no DeviceOrientationEvent, or the API exists but never delivered a numeric reading
 *    (desktop browsers) within PROBE_TIMEOUT_MS of the first subscription.
 *  - 'prompt': iOS 13+ (DeviceOrientationEvent.requestPermission exists) until the host taps Start.
 *  - 'granted' / 'denied': result of requestSensorPermission(); other browsers start as 'granted'.
 */
import { useSyncExternalStore } from 'react';

export type SensorPermission = 'unsupported' | 'prompt' | 'granted' | 'denied';

/** If no event with a numeric beta arrives this long after the first subscription, assume no sensors. */
export const PROBE_TIMEOUT_MS = 1500;

type RequestPermissionFn = () => Promise<'granted' | 'denied'>;
type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: RequestPermissionFn };

// ---------------------------------------------------------------------------
// Permission store
// ---------------------------------------------------------------------------

let permission: SensorPermission | null = null;
const permissionListeners = new Set<() => void>();

function orientationCtor(): OrientationCtor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as Window & { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent;
  return typeof ctor === 'undefined' || ctor === null ? null : ctor;
}

function needsGesture(): boolean {
  const ctor = orientationCtor();
  return !!ctor && typeof ctor.requestPermission === 'function';
}

function detectInitialPermission(): SensorPermission {
  if (!orientationCtor()) return 'unsupported';
  return needsGesture() ? 'prompt' : 'granted';
}

function setPermission(next: SensorPermission): void {
  if (permission === next) return;
  permission = next;
  for (const cb of Array.from(permissionListeners)) {
    try {
      cb();
    } catch {
      /* a listener must never break the others */
    }
  }
}

export function getSensorPermission(): SensorPermission {
  if (permission === null) permission = detectInitialPermission();
  return permission;
}

/**
 * Ask for sensor access. On iOS 13+ this shows the system prompt and therefore MUST be called from a
 * user gesture (Setup's Start button). Elsewhere it resolves immediately with the current state.
 */
export async function requestSensorPermission(): Promise<SensorPermission> {
  const current = getSensorPermission();
  const ctor = orientationCtor();
  if (!ctor) {
    setPermission('unsupported');
    return 'unsupported';
  }
  if (typeof ctor.requestPermission !== 'function') return current;
  if (current !== 'prompt' && current !== 'denied') return current;
  try {
    const result = await ctor.requestPermission();
    setPermission(result === 'granted' ? 'granted' : 'denied');
  } catch {
    // Called outside a user gesture, or the user dismissed the prompt.
    setPermission('denied');
  }
  return getSensorPermission();
}

export function subscribeSensorPermission(cb: () => void): () => void {
  permissionListeners.add(cb);
  return () => {
    permissionListeners.delete(cb);
  };
}

export function useSensorPermission(): SensorPermission {
  return useSyncExternalStore(subscribeSensorPermission, getSensorPermission, getSensorPermission);
}

// ---------------------------------------------------------------------------
// Pitch computation (pure, exported for tests)
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Pitch in degrees from horizontal for the given raw orientation angles.
 * `screenAngle` is the screen's rotation from the device's natural orientation (0, 90, 180, 270).
 *  - 0   (portrait):            pitch = beta (top edge up => positive)
 *  - 90  (landscape-primary):   the device's right edge is the screen's top; derived from gamma (and beta
 *                               so that tilting past vertical keeps increasing the pitch)
 *  - 180 (portrait-secondary):  pitch = -beta
 *  - 270 (landscape-secondary): the device's left edge is the screen's top
 * Returns null when the needed angles are missing or not finite. The result is clamped to [-180, 180].
 */
export function pitchFromOrientation(
  beta: number | null | undefined,
  gamma: number | null | undefined,
  screenAngle = 0,
): number | null {
  const b = finiteOrNull(beta);
  if (b === null) return null;
  const angle = ((Math.round(screenAngle / 90) * 90) % 360 + 360) % 360;
  const bc = clampDeg(b);
  if (angle === 0) return bc;
  if (angle === 180) return clampDeg(-bc);

  const g = finiteOrNull(gamma);
  if (g === null) return null;
  // World "up" expressed in the device frame (W3C Z-X'-Y'' Euler order):
  // up = (-sin(gamma)cos(beta), sin(beta), cos(gamma)cos(beta)).
  const cosB = Math.cos(bc * DEG);
  const upX = -Math.sin(g * DEG) * cosB;
  const upZ = Math.cos(g * DEG) * cosB;
  // The screen's top edge is +x for angle 90 and -x for angle 270.
  const alongTop = angle === 90 ? upX : -upX;
  if (Math.abs(alongTop) < 1e-9 && Math.abs(upZ) < 1e-9) return null;
  return clampDeg(Math.atan2(alongTop, upZ) / DEG);
}

function clampDeg(v: number): number {
  return Math.max(-180, Math.min(180, v));
}

/** Current screen rotation from the device's natural orientation, in degrees (0 | 90 | 180 | 270). */
export function getScreenAngle(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const so = typeof screen !== 'undefined' ? screen.orientation : undefined;
    if (so && typeof so.angle === 'number' && Number.isFinite(so.angle)) return normalizeAngle(so.angle);
    if (so && typeof so.type === 'string') {
      // Older browsers without `angle`: assume a portrait-natural device (phones).
      switch (so.type) {
        case 'landscape-primary':
          return 90;
        case 'portrait-secondary':
          return 180;
        case 'landscape-secondary':
          return 270;
        default:
          return 0;
      }
    }
    const legacy = (window as Window & { orientation?: unknown }).orientation;
    if (typeof legacy === 'number' && Number.isFinite(legacy)) return normalizeAngle(legacy);
  } catch {
    /* ignore */
  }
  return 0;
}

function normalizeAngle(a: number): number {
  return ((Math.round(a / 90) * 90) % 360 + 360) % 360;
}

// ---------------------------------------------------------------------------
// Shared pitch stream
// ---------------------------------------------------------------------------

type PitchListener = (pitchDeg: number) => void;

const pitchListeners = new Set<PitchListener>();
let listening = false;
let gotRealReading = false;
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probeWaitingForVisible = false;

function onOrientation(event: DeviceOrientationEvent): void {
  const pitch = pitchFromOrientation(event.beta, event.gamma, getScreenAngle());
  if (pitch === null) return;
  if (!gotRealReading) {
    gotRealReading = true;
    stopProbe();
    // The API exists and delivers readings: whatever the probe concluded, sensors work.
    if (getSensorPermission() === 'unsupported') setPermission('granted');
  }
  for (const cb of Array.from(pitchListeners)) {
    try {
      cb(pitch);
    } catch {
      /* a listener must never break the stream */
    }
  }
}

function onVisibilityForProbe(): void {
  if (document.visibilityState === 'visible' && probeWaitingForVisible) {
    probeWaitingForVisible = false;
    document.removeEventListener('visibilitychange', onVisibilityForProbe);
    startProbe();
  }
}

/** Arm the "no readings => unsupported" timer. Only meaningful while 'granted' and before the first reading. */
function startProbe(): void {
  if (gotRealReading || probeTimer !== null || !listening) return;
  if (getSensorPermission() !== 'granted') return;
  // Browsers do not deliver orientation events to hidden pages; wait until we are visible to judge.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    if (!probeWaitingForVisible) {
      probeWaitingForVisible = true;
      document.addEventListener('visibilitychange', onVisibilityForProbe);
    }
    return;
  }
  probeTimer = setTimeout(() => {
    probeTimer = null;
    if (!gotRealReading && listening && getSensorPermission() === 'granted') setPermission('unsupported');
  }, PROBE_TIMEOUT_MS);
}

function stopProbe(): void {
  if (probeTimer !== null) {
    clearTimeout(probeTimer);
    probeTimer = null;
  }
  if (probeWaitingForVisible) {
    probeWaitingForVisible = false;
    document.removeEventListener('visibilitychange', onVisibilityForProbe);
  }
}

function startListening(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('deviceorientation', onOrientation);
  startProbe();
}

function stopListening(): void {
  if (!listening) return;
  listening = false;
  window.removeEventListener('deviceorientation', onOrientation);
  stopProbe();
}

/**
 * Subscribe to the device pitch stream. The window listener is attached on the first subscription and
 * removed on the last unsubscription; call the returned function to unsubscribe.
 */
export function subscribePitch(cb: PitchListener): () => void {
  if (!orientationCtor()) {
    setPermission('unsupported');
    return () => {};
  }
  pitchListeners.add(cb);
  if (pitchListeners.size === 1) startListening();
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    pitchListeners.delete(cb);
    if (pitchListeners.size === 0) stopListening();
  };
}

/** Test-only: forget all state (listeners, probe, cached permission). */
export function __resetSensorsForTests(): void {
  for (const cb of Array.from(pitchListeners)) pitchListeners.delete(cb);
  stopListening();
  gotRealReading = false;
  permission = null;
  permissionListeners.clear();
}
