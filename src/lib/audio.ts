/**
 * Tiny WebAudio helpers (no audio assets, works offline). Never throws.
 *  - unlockAudio(): create/resume the AudioContext inside a user gesture (needed on iOS); call it from the
 *    tap that starts the discussion timer (or any earlier tap). On iOS 17+ it also switches the page's
 *    audio session to 'playback' so the beeps are heard with the ring/silent switch on silent (the default
 *    'ambient' session is muted by it and iOS has no vibrate fallback). 'playback' is exclusive: another
 *    app's music pauses while the page produces sound, which is why this is a one-time set here and not a
 *    toggle around each beep (a category switch right before a 90 ms tone can be processed late and clip it).
 *  - beep(kind): 'tick' = one short 880 Hz tone (~90 ms) for the 10-second warning;
 *                'end'  = three short tones when the timer hits zero.
 *    Both are no-ops until unlockAudio() has run, or when WebAudio is unsupported.
 *  - vibrate(pattern): navigator.vibrate when available (Android; iOS ignores it).
 */

type AudioContextCtor = typeof AudioContext;

let ctx: AudioContext | null = null;
let unlocked = false;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function unlockAudio(): void {
  try {
    // iOS 17+: the default ('auto') session is 'ambient' for Web-Audio-only pages and is muted by the
    // ring/silent switch; 'playback' is not. Idempotent, and a no-op where navigator.audioSession is missing.
    if (typeof navigator !== 'undefined') {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession && nav.audioSession.type !== 'playback') {
        try {
          nav.audioSession.type = 'playback';
        } catch {
          /* ignore: unsupported value or read-only */
        }
      }
    }
    if (!ctx) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    // iOS needs an actual (silent) buffer to start inside the gesture before oscillators will sound.
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    unlocked = true;
  } catch {
    /* audio is a nicety; never break the game */
  }
}

/** Schedule one sine tone on the shared context. `at` is in context time (seconds). */
function tone(context: AudioContext, at: number, freqHz: number, durationSec: number, peak = 0.25): void {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freqHz, at);
  // Short attack/release ramps avoid clicks at the tone edges.
  const attack = 0.006;
  const releaseStart = Math.max(at + attack, at + durationSec - 0.02);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.setValueAtTime(peak, releaseStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + durationSec);
  osc.connect(gain);
  gain.connect(context.destination);
  osc.onended = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      /* ignore */
    }
  };
  osc.start(at);
  osc.stop(at + durationSec + 0.01);
}

export function beep(kind: 'tick' | 'end' = 'tick'): void {
  try {
    if (!ctx || !unlocked) return;
    if (ctx.state === 'closed') return;
    if (ctx.state === 'suspended') {
      // May succeed if the page still has sticky activation; otherwise the tones are silently dropped.
      void ctx.resume().catch(() => {});
    }
    const start = ctx.currentTime + 0.01;
    if (kind === 'tick') {
      tone(ctx, start, 880, 0.09);
    } else {
      tone(ctx, start, 880, 0.1);
      tone(ctx, start + 0.16, 880, 0.1);
      tone(ctx, start + 0.32, 1174.66, 0.18);
    }
  } catch {
    /* ignore */
  }
}

export function vibrate(pattern: number | number[] = 30): void {
  try {
    if (typeof navigator === 'undefined') return;
    const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => boolean };
    if (typeof nav.vibrate === 'function') nav.vibrate(pattern);
  } catch {
    /* ignore: unsupported or blocked without a user gesture */
  }
}
