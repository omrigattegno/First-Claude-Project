import { describe, expect, it } from 'vitest';
import { MIN_WORDS_PER_CATEGORY } from '../game/constants';
import { guessMatches, normalizeText } from '../game/guess';
import { BUILTIN_PACKS, CATEGORY_IDS } from './index';

const EXPECTED: Record<'en' | 'he', string[]> = {
  en: ['food', 'places', 'animals', 'movies-tv', 'sports', 'household', 'professions', 'famous-people'],
  he: ['food', 'places', 'animals', 'movies-tv', 'sports', 'household', 'professions', 'famous-people', 'israeli'],
};

describe('built-in word packs', () => {
  for (const lang of ['en', 'he'] as const) {
    describe(lang, () => {
      for (const id of EXPECTED[lang]) {
        const pack = BUILTIN_PACKS.find((p) => p.lang === lang && p.id === id);
        it(`${id}: exists with a name`, () => {
          expect(pack).toBeDefined();
          expect(pack!.name.trim().length).toBeGreaterThan(0);
          expect(CATEGORY_IDS).toContain(id);
        });
        it(`${id}: has at least ${MIN_WORDS_PER_CATEGORY} words`, () => {
          expect(pack!.words.length).toBeGreaterThanOrEqual(MIN_WORDS_PER_CATEGORY);
        });
        it(`${id}: words are unique, non-empty, and well-formed`, () => {
          const seen = new Set<string>();
          for (const w of pack!.words) {
            expect(w.word.trim()).toBe(w.word);
            expect(w.word.length).toBeGreaterThan(0);
            expect(w.word.length).toBeLessThanOrEqual(30);
            expect(seen.has(w.word.toLowerCase())).toBe(false);
            seen.add(w.word.toLowerCase());
            expect([1, 2, 3]).toContain(w.difficulty);
            expect(Array.isArray(w.aliases)).toBe(true);
            for (const a of w.aliases) {
              expect(typeof a).toBe('string');
              expect(a.trim().length).toBeGreaterThan(0);
            }
            expect(w.category).toBe(id);
            if (lang === 'he') expect(/[א-ת]/.test(w.word)).toBe(true);
          }
        });
        it(`${id}: has at least one word at each difficulty`, () => {
          const levels = new Set(pack!.words.map((w) => w.difficulty));
          expect(levels.has(1)).toBe(true);
          expect(levels.has(2)).toBe(true);
          expect(levels.has(3)).toBe(true);
        });
      }
    });
  }
});

// usedWords is keyed per pack, so the same word in two packs of one language could be drawn twice in an
// evening (US-2); and a guess that two words of one pack both accept lets the Imposter hedge.
describe('built-in word packs: collisions', () => {
  for (const lang of ['en', 'he'] as const) {
    const packs = BUILTIN_PACKS.filter((p) => p.lang === lang);
    it(`${lang}: no word appears in two packs`, () => {
      const seen = new Map<string, string>();
      for (const pack of packs) {
        for (const w of pack.words) {
          const key = normalizeText(w.word);
          expect(seen.get(key), `"${w.word}" is in both ${seen.get(key)} and ${pack.id}`).toBeUndefined();
          seen.set(key, pack.id);
        }
      }
    });
    for (const pack of packs) {
      it(`${lang}/${pack.id}: no guess is credited to two different words`, () => {
        for (const a of pack.words) {
          for (const b of pack.words) {
            if (a === b) continue;
            for (const guess of [a.word, ...a.aliases]) {
              expect(guessMatches(guess, b), `"${guess}" (${a.word}) also matches "${b.word}"`).toBe(false);
            }
          }
        }
      });
    }
  }
});
