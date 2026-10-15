import { describe, expect, it } from 'vitest';
import { guessMatches, normalizeText } from './guess';

const w = (word: string, aliases: string[] = []) => ({ word, aliases });

describe('normalizeText', () => {
  it('lower-cases, trims and collapses whitespace', () => {
    expect(normalizeText('  Ice   Cream \t ')).toBe('ice cream');
    expect(normalizeText('')).toBe('');
    expect(normalizeText('   ')).toBe('');
  });

  it('turns punctuation and symbols into spaces', () => {
    expect(normalizeText('Spider-Man!')).toBe('spider man');
    expect(normalizeText("rock'n'roll")).toBe('rock n roll');
    expect(normalizeText('$100 (approx.)')).toBe('100 approx');
    expect(normalizeText('!!!')).toBe('');
  });

  it('folds Hebrew final letters', () => {
    expect(normalizeText('ךםןףץ')).toBe('כמנפצ');
    expect(normalizeText('מלך')).toBe('מלכ');
    expect(normalizeText('שולחן')).toBe('שולחנ');
  });

  it('removes niqqud and cantillation marks', () => {
    expect(normalizeText('כֶּלֶב')).toBe('כלב');
    expect(normalizeText('שָׁלוֹם')).toBe('שלומ');
    // Cantillation (U+0591 etna) too.
    expect(normalizeText('בְּרֵאשִׁ֖ית')).toBe('בראשית');
  });

  it('treats Hebrew punctuation (maqaf, geresh, gershayim) as punctuation, not as marks', () => {
    expect(normalizeText('בית־ספר')).toBe('בית ספר'); // U+05BE maqaf
    expect(normalizeText('ג׳ירפה')).toBe('ג ירפה'); // U+05F3 geresh
    expect(normalizeText("ג'ירפה")).toBe('ג ירפה'); // ASCII apostrophe
    expect(normalizeText('צה״ל')).toBe('צה ל'); // U+05F4 gershayim
  });

  it('applies NFKC compatibility normalisation', () => {
    expect(normalizeText('ＣＡＦＥ')).toBe('cafe'); // full-width letters
    expect(normalizeText('ﬁsh')).toBe('fish'); // ligature
  });
});

describe('guessMatches', () => {
  it('matches exact and case-insensitive guesses', () => {
    expect(guessMatches('Pizza', w('Pizza'))).toBe(true);
    expect(guessMatches('pizza', w('Pizza'))).toBe(true);
    expect(guessMatches('PIZZA', w('pizza'))).toBe(true);
  });

  it('ignores extra whitespace and punctuation', () => {
    expect(guessMatches('  ice   cream ', w('Ice cream'))).toBe(true);
    expect(guessMatches('ice-cream', w('Ice cream'))).toBe(true);
    expect(guessMatches('Spider Man', w('Spider-Man'))).toBe(true);
    expect(guessMatches('spiderman', w('Spider-Man'))).toBe(false); // not the same tokens
    expect(guessMatches('pizza!!', w('Pizza'))).toBe(true);
    expect(guessMatches('"pizza"', w('Pizza'))).toBe(true);
  });

  it('accepts aliases (also normalised)', () => {
    expect(guessMatches('puppy', w('Dog', ['puppy', 'dogs']))).toBe(true);
    expect(guessMatches('  DOGS ', w('Dog', ['puppy', 'dogs']))).toBe(true);
    expect(guessMatches('kitten', w('Dog', ['puppy', 'dogs']))).toBe(false);
    expect(guessMatches('einstein', w('Albert Einstein', ['Einstein']))).toBe(true);
  });

  it('tolerates a missing aliases list', () => {
    expect(guessMatches('dog', { word: 'Dog', aliases: undefined as unknown as string[] })).toBe(true);
  });

  it('ignores leading English articles on either side', () => {
    expect(guessMatches('the dog', w('Dog'))).toBe(true);
    expect(guessMatches('A cat', w('Cat'))).toBe(true);
    expect(guessMatches('an elephant', w('Elephant'))).toBe(true);
    expect(guessMatches('lion king', w('The Lion King'))).toBe(true);
    expect(guessMatches('The Lion King', w('Lion King'))).toBe(true);
    // Only a leading article is dropped; "the" inside stays significant.
    expect(guessMatches('lord of rings', w('The Lord of the Rings'))).toBe(false);
    expect(guessMatches('the', w('The'))).toBe(true);
  });

  it('does not match prefixes, suffixes or unrelated words', () => {
    expect(guessMatches('do', w('Dog'))).toBe(false);
    expect(guessMatches('dogma', w('Dog'))).toBe(false);
    expect(guessMatches('cat', w('Dog'))).toBe(false);
    expect(guessMatches('ice', w('Ice cream'))).toBe(false);
    expect(guessMatches('theatre', w('Theatre tickets'))).toBe(false);
  });

  it('tolerates the Hebrew definite article prefix ה on either side', () => {
    expect(guessMatches('הכלב', w('כלב'))).toBe(true);
    expect(guessMatches('כלב', w('הכלב'))).toBe(true);
    expect(guessMatches('הים התיכון', w('ים תיכון'))).toBe(true);
    expect(guessMatches('ים תיכון', w('הים התיכון'))).toBe(true);
    expect(guessMatches('הים התיכון', w('הים התיכון'))).toBe(true);
    // Words that genuinely start with ה still match themselves.
    expect(guessMatches('הר', w('הר'))).toBe(true);
    expect(guessMatches('חתול', w('כלב'))).toBe(false);
  });

  it('folds Hebrew final letters on both sides', () => {
    expect(guessMatches('מלכ', w('מלך'))).toBe(true);
    expect(guessMatches('מלך', w('מלכ'))).toBe(true);
    expect(guessMatches('שולחן', w('שולחן'))).toBe(true);
    expect(guessMatches('ארץ', w('ארצ'))).toBe(true);
  });

  it('ignores niqqud', () => {
    expect(guessMatches('כֶּלֶב', w('כלב'))).toBe(true);
    expect(guessMatches('כלב', w('כֶּלֶב'))).toBe(true);
    expect(guessMatches('הַכֶּלֶב', w('כלב'))).toBe(true);
  });

  it('treats maqaf and geresh variants as punctuation', () => {
    expect(guessMatches('בית־ספר', w('בית ספר'))).toBe(true);
    expect(guessMatches('בית-ספר', w('בית ספר'))).toBe(true);
    expect(guessMatches('בית ספר', w('בית־ספר'))).toBe(true);
    expect(guessMatches('ג׳ירפה', w("ג'ירפה"))).toBe(true);
    expect(guessMatches("ג'ירפה", w('ג׳ירפה'))).toBe(true);
  });

  it('matches Hebrew aliases', () => {
    expect(guessMatches('קפה הפוך', w('הפוך', ['קפה הפוך']))).toBe(true);
    expect(guessMatches('הקפה ההפוך', w('הפוך', ['קפה הפוך']))).toBe(true);
  });

  it('returns false for an empty, blank or punctuation-only guess', () => {
    expect(guessMatches('', w('Pizza'))).toBe(false);
    expect(guessMatches('   ', w('Pizza'))).toBe(false);
    expect(guessMatches('?!.', w('Pizza'))).toBe(false);
    expect(guessMatches('', w('', ['']))).toBe(false);
  });

  it('never matches an empty target or alias', () => {
    expect(guessMatches('the', w('', ['']))).toBe(false);
    expect(guessMatches('a', w('A'))).toBe(true);
  });
});
