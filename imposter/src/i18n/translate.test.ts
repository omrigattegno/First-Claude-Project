import { describe, expect, it } from 'vitest';
import { translate } from './index';
import { common } from './messages.common';
import { game } from './messages.game';
import { pregame } from './messages.pregame';

const FSI = '⁨';
const PDI = '⁩';
const HEBREW = /[א-ת]/;
const LETTER = /\p{L}/u;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translate', () => {
  it('fills placeholders and keeps unknown ones', () => {
    expect(translate('en', 'pass.to', { name: 'Dana' })).toBe('Pass to Dana');
    expect(translate('en', 'setup.counter', { n: 3, max: 10 })).toBe('3/10');
    expect(translate('en', 'common.round', {})).toBe('Round {n}');
    expect(translate('en', 'common.round')).toBe('Round {n}');
  });

  it('isolates string params in Hebrew so Latin values cannot merge into one LTR run', () => {
    const s = translate('he', 'results.guessCorrect', { name: 'Dana', guess: 'Pizza' });
    expect(s).toContain(`${FSI}Dana${PDI}`);
    expect(s).toContain(`„${FSI}Pizza${PDI}”`);
    expect(translate('he', 'pass.to', { name: 'דנה' })).toBe(`להעביר ל${FSI}דנה${PDI}`);
  });

  it('leaves numbers alone in Hebrew and never isolates in English', () => {
    expect(translate('he', 'setup.counter', { n: 3, max: 10 })).toBe('3/10');
    expect(translate('he', 'reveal.progress', { current: 2, total: 5 })).toBe('2 מתוך 5');
    expect(translate('he', 'common.round', { n: 4 })).toBe('סיבוב 4');
    const en = translate('en', 'results.guessWrong', { name: 'Dana', guess: 'Pizza' });
    expect(en).toBe('Dana guessed “Pizza”: wrong');
    expect(en).not.toContain(FSI);
  });

  it('isolates a Hebrew value too (no visual change, keeps the rule simple)', () => {
    expect(translate('he', 'results.votedOut', { name: 'דנה' })).toBe(`הצביעו נגד ${FSI}דנה${PDI}`);
  });
});

describe('messages', () => {
  type Messages = { en: Record<string, string>; he: Record<string, string> };
  const modules: Record<string, Messages> = { common, pregame, game };

  it('every Hebrew string uses the same placeholders as its English source', () => {
    for (const [mod, { en, he }] of Object.entries(modules)) {
      for (const key of Object.keys(en)) {
        expect(placeholders(he[key]), `${mod}:${key}`).toEqual(placeholders(en[key]));
      }
    }
  });

  it('every Hebrew string is actually Hebrew (except language names)', () => {
    const latinOk = new Set(['lang.en', 'lang.he']);
    for (const [mod, { en, he }] of Object.entries(modules)) {
      for (const key of Object.keys(en)) {
        // Placeholder names are not words: '{n}/{max}' has nothing to translate.
        if (latinOk.has(key) || !LETTER.test(en[key].replace(/\{\w+\}/g, ''))) continue;
        expect(he[key], `${mod}:${key}`).toMatch(HEBREW);
        expect(he[key], `${mod}:${key} is untranslated`).not.toBe(en[key]);
      }
    }
  });

  it('strings that quote a button label quote the real label', () => {
    // How to play names the hold-to-reveal fallback button.
    expect(pregame.en['howto.liftNote']).toContain(`"${game.en['reveal.holdButton']}"`);
    expect(pregame.he['howto.liftNote']).toContain(`„${game.he['reveal.holdButton']}”`);
    // The sensors hint names the Start button.
    expect(pregame.en['settings.sensors.prompt']).toContain(pregame.en['setup.start']);
    expect(pregame.he['settings.sensors.prompt']).toContain(`„${pregame.he['setup.start']}”`);
  });

  it('uses one Hebrew term per concept across screens', () => {
    // The clue round: Settings, How to play and the Clues screen agree.
    expect(game.he['clues.round']).toContain('סיבוב רמזים');
    expect(pregame.he['settings.clueRounds']).toBe('סיבובי רמזים');
    expect(pregame.he['howto.step3']).toContain('סיבובי רמזים');
    // The role card is "הקלף" in the reveal hints and in How to play.
    expect(game.he['reveal.liftHint']).toContain('הקלף');
    expect(pregame.he['howto.liftNote']).toContain('הקלף');
    expect(pregame.he['howto.liftNote']).not.toContain('הכרטיס');
    // Results never claim a majority (the engine uses a plurality rule).
    expect(game.he['results.votedOut']).not.toContain('הרוב');
  });

  it('keeps single-reader screens in the neutral singular', () => {
    for (const key of ['reveal.imposterNote', 'guess.prompt', 'guess.label'] as const) {
      expect(game.he[key], key).not.toMatch(/אתם|שלכם|נחשו|תנו/);
    }
  });
});
