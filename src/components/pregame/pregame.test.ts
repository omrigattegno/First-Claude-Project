import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../game/engine';
import { RANDOM_CATEGORY } from '../../game/types';
import { pregame } from '../../i18n/messages.pregame';
import { parseWords } from './CustomPacks';
import { languagePatch } from './LanguageToggle';

describe('parseWords', () => {
  it('splits lines, trims, drops blanks and case-insensitive duplicates', () => {
    expect(parseWords(' Pizza \n\nfalafel\nPIZZA\r\nHummus\n  ')).toEqual(['Pizza', 'falafel', 'Hummus']);
  });
  it('returns an empty list for empty input', () => {
    expect(parseWords('')).toEqual([]);
    expect(parseWords('\n \n')).toEqual([]);
  });
});

describe('languagePatch', () => {
  it('keeps Random and categories that exist in the new language', () => {
    expect(languagePatch({ ...DEFAULT_SETTINGS, categoryId: RANDOM_CATEGORY }, 'he')).toEqual({ language: 'he' });
    expect(languagePatch({ ...DEFAULT_SETTINGS, categoryId: 'food' }, 'he')).toEqual({ language: 'he' });
  });
  it('falls back to Random when the category is missing in the new language', () => {
    expect(languagePatch({ ...DEFAULT_SETTINGS, language: 'he', categoryId: 'israeli' }, 'en')).toEqual({
      language: 'en',
      categoryId: RANDOM_CATEGORY,
    });
    expect(languagePatch({ ...DEFAULT_SETTINGS, categoryId: 'custom-c_123' }, 'he')).toEqual({
      language: 'he',
      categoryId: RANDOM_CATEGORY,
    });
  });
});

describe('pregame messages', () => {
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
  it('use the same placeholders in English and Hebrew', () => {
    for (const key of Object.keys(pregame.en) as Array<keyof typeof pregame.en>) {
      expect(placeholders(pregame.he[key]), key).toEqual(placeholders(pregame.en[key]));
    }
  });
  it('have no empty strings', () => {
    for (const [key, value] of Object.entries(pregame.en)) expect(value.trim(), key).not.toBe('');
    for (const [key, value] of Object.entries(pregame.he)) expect(value.trim(), key).not.toBe('');
  });
});
