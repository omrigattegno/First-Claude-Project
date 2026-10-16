import { describe, expect, it } from 'vitest';
import { PENALTY_PROMPTS, hashString, penaltyForRound, penaltySeed } from './penalties';
import type { RoundState, WordRecord } from './types';

function round(number: number, word: string): Pick<RoundState, 'number' | 'word'> {
  const rec: WordRecord = { word, category: 'food', difficulty: 1, aliases: [] };
  return { number, word: rec };
}

describe('hashString', () => {
  it('is deterministic and spreads nearby inputs', () => {
    expect(hashString('pizza')).toBe(hashString('pizza'));
    expect(hashString('pizza')).not.toBe(hashString('pizzb'));
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('שווארמה')).toBeGreaterThanOrEqual(0);
  });
});

describe('penaltyForRound', () => {
  it('is a pure function of the round: the same round always gets the same prompt', () => {
    const r = round(3, 'Espresso');
    const a = penaltyForRound('dare', 'en', r);
    const b = penaltyForRound('dare', 'en', { number: 3, word: { ...r.word } });
    expect(a).toBe(b);
    expect(PENALTY_PROMPTS.dare.en).toContain(a);
  });

  it('returns a prompt from the requested kind and language', () => {
    const r = round(1, 'פיצה');
    expect(PENALTY_PROMPTS.drink.he).toContain(penaltyForRound('drink', 'he', r));
    expect(PENALTY_PROMPTS.dare.he).toContain(penaltyForRound('dare', 'he', r));
    expect(PENALTY_PROMPTS.drink.en).toContain(penaltyForRound('drink', 'en', r));
  });

  it('varies from round to round rather than repeating one prompt', () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 12; n++) seen.add(penaltyForRound('dare', 'en', round(n, `word${n}`)));
    expect(seen.size).toBeGreaterThan(3);
  });

  it('seeds differ by round number and by word', () => {
    expect(penaltySeed(round(1, 'Pizza'))).not.toBe(penaltySeed(round(2, 'Pizza')));
    expect(penaltySeed(round(1, 'Pizza'))).not.toBe(penaltySeed(round(1, 'Sushi')));
    expect(Number.isInteger(penaltySeed(round(99, 'x')))).toBe(true);
  });
});
