import { describe, expect, it } from 'vitest';
import { cryptoRng, newId, pickOne, pickWeighted, randomInt, seededRng, shuffle } from './rng';

describe('seededRng', () => {
  it('is deterministic for a seed and yields values in [0, 1)', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('differs between seeds', () => {
    const a = seededRng(1);
    const b = seededRng(2);
    const sa = Array.from({ length: 10 }, () => a());
    const sb = Array.from({ length: 10 }, () => b());
    expect(sa).not.toEqual(sb);
  });

  it('is roughly uniform', () => {
    const rng = seededRng(99);
    const buckets = new Array<number>(10).fill(0);
    const N = 20000;
    for (let i = 0; i < N; i++) buckets[Math.floor(rng() * 10)]++;
    for (const n of buckets) {
      expect(n / N).toBeGreaterThan(0.08);
      expect(n / N).toBeLessThan(0.12);
    }
  });

  it('accepts a 0 seed and non-integer seeds', () => {
    expect(() => seededRng(0)()).not.toThrow();
    expect(seededRng(1.7)()).toBe(seededRng(1)());
  });
});

describe('cryptoRng', () => {
  it('yields values in [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const x = cryptoRng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('does not return the same value every time', () => {
    const s = new Set(Array.from({ length: 50 }, () => cryptoRng()));
    expect(s.size).toBeGreaterThan(1);
  });
});

describe('randomInt', () => {
  it('stays within [0, max)', () => {
    const rng = seededRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = randomInt(rng, 6);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
      seen.add(n);
    }
    expect(seen.size).toBe(6);
  });

  it('clamps an rng that returns (almost) 1', () => {
    expect(randomInt(() => 0.9999999999999999, 3)).toBe(2);
    expect(randomInt(() => 0, 3)).toBe(0);
    expect(randomInt(() => 0.5, 1)).toBe(0);
  });

  it('throws for a non-positive bound', () => {
    expect(() => randomInt(seededRng(1), 0)).toThrow();
    expect(() => randomInt(seededRng(1), -2)).toThrow();
  });
});

describe('pickOne', () => {
  it('returns a member of the list and covers every member', () => {
    const rng = seededRng(3);
    const items = ['a', 'b', 'c', 'd'];
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const x = pickOne(rng, items);
      expect(items).toContain(x);
      seen.add(x);
    }
    expect(seen.size).toBe(4);
  });

  it('is deterministic and returns the only item of a singleton', () => {
    expect(pickOne(seededRng(8), ['x'])).toBe('x');
    expect(pickOne(seededRng(8), [1, 2, 3])).toBe(pickOne(seededRng(8), [1, 2, 3]));
  });

  it('throws on an empty list', () => {
    expect(() => pickOne(seededRng(1), [])).toThrow(/empty/);
  });
});

describe('pickWeighted', () => {
  it('never picks a zero-weight item and follows the weights', () => {
    const rng = seededRng(13);
    const counts = { a: 0, b: 0, c: 0 };
    const N = 4000;
    for (let i = 0; i < N; i++) counts[pickWeighted(rng, ['a', 'b', 'c'] as const, [1, 0, 3])]++;
    expect(counts.b).toBe(0);
    expect(counts.a / N).toBeGreaterThan(0.2);
    expect(counts.a / N).toBeLessThan(0.3);
    expect(counts.c / N).toBeGreaterThan(0.7);
    expect(counts.c / N).toBeLessThan(0.8);
  });

  it('treats negative weights as zero', () => {
    const rng = seededRng(2);
    for (let i = 0; i < 200; i++) expect(pickWeighted(rng, ['a', 'b'], [-5, 1])).toBe('b');
  });

  it('returns the single positive item even when the rng returns ~1', () => {
    expect(pickWeighted(() => 0.9999999999999999, ['a', 'b', 'c'], [0, 2, 0])).toBe('b');
    expect(pickWeighted(() => 0.9999999999999999, ['a', 'b', 'c'], [1, 1, 0])).toBe('b');
  });

  it('throws on a length mismatch or when no weight is positive', () => {
    expect(() => pickWeighted(seededRng(1), ['a', 'b'], [1])).toThrow(/mismatch/);
    expect(() => pickWeighted(seededRng(1), ['a', 'b'], [0, 0])).toThrow(/positive/);
    expect(() => pickWeighted(seededRng(1), [], [])).toThrow(/positive/);
  });
});

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const copy = items.slice();
    const out = shuffle(seededRng(6), items);
    expect(items).toEqual(copy);
    expect(out).not.toBe(items);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
  });

  it('is deterministic per seed and actually reorders', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(seededRng(6), items)).toEqual(shuffle(seededRng(6), items));
    let moved = false;
    for (let seed = 1; seed <= 5 && !moved; seed++) moved = shuffle(seededRng(seed), items).some((x, i) => x !== i);
    expect(moved).toBe(true);
  });

  it('handles empty and singleton lists', () => {
    expect(shuffle(seededRng(1), [])).toEqual([]);
    expect(shuffle(seededRng(1), ['x'])).toEqual(['x']);
  });
});

describe('newId', () => {
  it('uses the prefix and is unique', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^p_[0-9a-z-]+$/);
    expect(newId('x')).toMatch(/^x_[0-9a-z-]+$/);
  });
});
