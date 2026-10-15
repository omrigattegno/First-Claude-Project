/**
 * Device-orientation access. STUB: the sensors builder replaces this file.
 * Contract (keep the exported names and signatures):
 *  - getSensorPermission(): cached permission state
 *  - requestSensorPermission(): must be called from a user gesture (iOS 13+); resolves the new state
 *  - subscribeSensorPermission(cb) / useSensorPermission(): react to permission changes
 *  - subscribePitch(cb): stream of device pitch in degrees (DeviceOrientationEvent.beta); 0 = flat, 90 = upright
 */
import { useSyncExternalStore } from 'react';

export type SensorPermission = 'unsupported' | 'prompt' | 'granted' | 'denied';

let permission: SensorPermission = 'unsupported';
const listeners = new Set<() => void>();

export function getSensorPermission(): SensorPermission {
  return permission;
}

export async function requestSensorPermission(): Promise<SensorPermission> {
  return permission;
}

export function subscribeSensorPermission(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSensorPermission(): SensorPermission {
  return useSyncExternalStore(subscribeSensorPermission, getSensorPermission, getSensorPermission);
}

export function subscribePitch(_cb: (pitchDeg: number) => void): () => void {
  return () => {};
}
