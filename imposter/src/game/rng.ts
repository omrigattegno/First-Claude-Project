import type { Rng } from './types';

/** Uniform [0, 1) using crypto.getRandomValues; falls back to Math.random only where crypto is missing (tests). */
export const cryptoRng: Rng = () => {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
};

/** Deterministic rng for tests (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  if (maxExclusive <= 0) throw new Error('randomInt: maxExclusive must be > 0');
  return Math.min(maxExclusive - 1, Math.floor(rng() * maxExclusive));
}

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pickOne: empty list');
  return items[randomInt(rng, items.length)];
}

/** Pick one item with the given non-negative weights. Items with weight 0 are never chosen. */
export function pickWeighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  if (items.length !== weights.length) throw new Error('pickWeighted: length mismatch');
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) throw new Error('pickWeighted: no positive weights');
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    const w = Math.max(0, weights[i]);
    if (w === 0) continue;
    if (r < w) return items[i];
    r -= w;
  }
  // Floating point edge: return the last positive-weight item.
  for (let i = items.length - 1; i >= 0; i--) if (weights[i] > 0) return items[i];
  throw new Error('pickWeighted: unreachable');
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newId(prefix = 'p'): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return `${prefix}_${c.randomUUID().slice(0, 8)}`;
  return `${prefix}_${Math.floor(cryptoRng() * 1e9).toString(36)}`;
}
