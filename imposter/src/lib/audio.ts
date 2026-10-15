/**
 * Tiny WebAudio helpers (no audio assets, works offline). STUB: the sensors builder implements this.
 *  - unlockAudio(): create/resume the AudioContext inside a user gesture (needed on iOS)
 *  - beep(kind): short tone; 'tick' for the 10-second warning, 'end' when the timer hits zero
 *  - vibrate(pattern): navigator.vibrate when available
 */
export function unlockAudio(): void {}
export function beep(_kind: 'tick' | 'end' = 'tick'): void {}
export function vibrate(_pattern: number | number[] = 30): void {}
