import type { WordRecord } from './types';

/**
 * Normalise a guess or word for comparison: case- and whitespace-insensitive,
 * punctuation and Hebrew niqqud removed, final-form Hebrew letters folded.
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    // Hebrew niqqud / cantillation (combining marks only; maqaf U+05BE, paseq U+05C0,
    // sof pasuq U+05C3 and nun hafukha U+05C6 are punctuation and fall through to the rule below).
    .replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g, '')
    .replace(/[ך]/g, 'כ') // ך -> כ
    .replace(/[ם]/g, 'מ') // ם -> מ
    .replace(/[ן]/g, 'נ') // ן -> נ
    .replace(/[ף]/g, 'פ') // ף -> פ
    .replace(/[ץ]/g, 'צ') // ץ -> צ
    .replace(/[\p{P}\p{S}]/gu, ' ') // punctuation & symbols -> space
    .replace(/\s+/g, ' ')
    .trim();
}

/** Variants of a normalised string we also accept (e.g. Hebrew without the definite article). */
function variants(normalized: string): string[] {
  const out = new Set<string>([normalized]);
  // English articles
  for (const art of ['the ', 'a ', 'an ']) {
    if (normalized.startsWith(art)) out.add(normalized.slice(art.length));
  }
  // Hebrew definite article ה prefix (on the first word only)
  if (/^ה[א-ת]/.test(normalized)) out.add(normalized.slice(1));
  // Also strip "ה" from every word, e.g. "הים התיכון" -> "ים תיכון"
  const stripped = normalized
    .split(' ')
    .map((w) => (/^ה[א-ת]{2,}/.test(w) ? w.slice(1) : w))
    .join(' ');
  out.add(stripped);
  return [...out];
}

export function guessMatches(guess: string, word: Pick<WordRecord, 'word' | 'aliases'>): boolean {
  const g = normalizeText(guess);
  if (!g) return false;
  const guessVariants = new Set(variants(g));
  const targets = [word.word, ...(word.aliases ?? [])];
  for (const t of targets) {
    for (const tv of variants(normalizeText(t))) {
      if (tv && guessVariants.has(tv)) return true;
    }
  }
  return false;
}
