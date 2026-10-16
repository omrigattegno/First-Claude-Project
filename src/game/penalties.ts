/**
 * Penalty prompts shown on the Results screen for the losing side when
 * `round.config.penalty` is 'dare' or 'drink'. Light-hearted and safe: the
 * drink prompts are sips, never shots, and every dare can be done at a table.
 * Pure data + a picker so it can be unit-tested without a browser.
 */
import { pickOne, seededRng } from './rng';
import type { Lang, Rng, RoundState } from './types';

export type PenaltyKind = 'dare' | 'drink';

const dareEn: readonly string[] = [
  'Do your best impression of someone at the table. Everyone guesses who.',
  'Speak in a terrible accent until the next round starts.',
  'Give a 20-second toast in honor of the winners.',
  'Sing the chorus of any song, as dramatically as you can.',
  'Do 10 jumping jacks (or squats) right now.',
  'Tell the table your most embarrassing nickname and how you got it.',
  'Say the alphabet backwards as fast as you can.',
  'The player on your right picks your new name for the next round.',
  'Compliment every player at the table, one by one.',
  'Show the last photo in your camera roll (if you dare).',
  'Talk like a sports commentator for the whole next round.',
  'Do your best animal impression and hold it for 10 seconds.',
  'Balance a spoon on your nose for 5 seconds.',
  'Tell a joke. If nobody laughs, tell another one.',
  'Describe the player on your left using only food words.',
  'Hold a plank until the next round starts (or 30 seconds, whichever comes first).',
  'Swap seats with the player sitting across from you.',
  'Make up a two-line poem about the secret word.',
];

const dareHe: readonly string[] = [
  'חקו מישהו מהשולחן. כולם מנחשים מי זה.',
  'דברו במבטא מצחיק עד תחילת הסיבוב הבא.',
  'הרימו כוסית ונאמו 20 שניות לכבוד המנצחים.',
  'שירו פזמון של שיר כלשהו, הכי דרמטי שאפשר.',
  'עשו 10 קפיצות (או סקוואטים) עכשיו.',
  'ספרו לשולחן את הכינוי הכי מביך שלכם ואיך קיבלתם אותו.',
  'אמרו את האלף-בית הפוך, כמה שיותר מהר.',
  'מי שיושב מימינכם בוחר לכם שם חדש לסיבוב הבא.',
  'תנו מחמאה לכל שחקן בשולחן, אחד-אחד.',
  'הראו את התמונה האחרונה בגלריה (אם אתם מעיזים).',
  'דברו כמו שדרן ספורט במשך כל הסיבוב הבא.',
  'חקו חיה והחזיקו את זה 10 שניות.',
  'אזנו כפית על האף במשך 5 שניות.',
  'ספרו בדיחה. אם אף אחד לא צחק, ספרו עוד אחת.',
  'תארו את מי שיושב משמאלכם רק במילים של אוכל.',
  'החזיקו פלאנק עד תחילת הסיבוב הבא (או 30 שניות, מה שקודם).',
  'החליפו מקומות עם מי שיושב מולכם.',
  'המציאו שיר של שתי שורות על המילה הסודית.',
];

const drinkEn: readonly string[] = [
  'Take a sip.',
  'Take two sips.',
  'Take a sip, then pick someone to join you.',
  'Finish your current sentence with a sip.',
  'Take a sip for every vote you got this round.',
  'The whole losing side takes a sip together. Cheers first.',
  'Take a sip; the person on your left takes one too, out of sympathy.',
  'Take a sip while keeping eye contact with the winners.',
  'Take a sip and say "well played" to the Imposter.',
  'Take a sip. If you were voted out, take a second one.',
  'Raise your glass, give a one-sentence toast, then sip.',
  'Take a sip with no hands (a straw or a helpful friend is allowed).',
  'Take a sip of water first, then a sip of your drink.',
  'Take a sip; the loudest person at the table decides if it counts.',
  'Take a sip while the table hums a dramatic tune.',
  'Take a sip and clink glasses with both of your neighbors.',
];

const drinkHe: readonly string[] = [
  'קחו לגימה.',
  'קחו שתי לגימות.',
  'קחו לגימה, ואז בחרו מישהו שיצטרף אליכם.',
  'סיימו את המשפט הנוכחי שלכם בלגימה.',
  'לגימה על כל קול שקיבלתם בסיבוב הזה.',
  'כל הצד המפסיד לוגם יחד. קודם לחיים.',
  'קחו לגימה; מי שיושב משמאלכם לוגם גם, מתוך הזדהות.',
  'קחו לגימה תוך קשר עין עם המנצחים.',
  'קחו לגימה ואמרו למתחזה „כל הכבוד”.',
  'קחו לגימה. אם הודחתם בהצבעה, קחו עוד אחת.',
  'הרימו את הכוס, אמרו לחיים במשפט אחד, ואז לגמו.',
  'קחו לגימה בלי ידיים (קשית או חבר שעוזר זה בסדר).',
  'קודם לגימת מים, ואז לגימה מהמשקה שלכם.',
  'קחו לגימה; הכי רועש בשולחן מחליט אם זה נספר.',
  'קחו לגימה בזמן שהשולחן מזמזם מנגינה דרמטית.',
  'קחו לגימה והשיקו כוסות עם שני השכנים שלכם.',
];

export const PENALTY_PROMPTS: Record<PenaltyKind, Record<Lang, readonly string[]>> = {
  dare: { en: dareEn, he: dareHe },
  drink: { en: drinkEn, he: drinkHe },
};

/** Pick one prompt of the given kind in the given language. */
export function pickPenalty(kind: PenaltyKind, lang: Lang, rng: Rng): string {
  const list = PENALTY_PROMPTS[kind][lang] ?? PENALTY_PROMPTS[kind].en;
  return pickOne(rng, list);
}

/** 32-bit FNV-1a hash of a string (seeds the per-round prompt from the secret word). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seed for a round's penalty prompt: fixed for the round, different from one round to the next. */
export function penaltySeed(round: Pick<RoundState, 'number' | 'word'>): number {
  return (Math.imul(round.number, 7919) + hashString(round.word.word)) >>> 0;
}

/**
 * The prompt for a finished round: a pure function of the round (its number and secret word), so the
 * Results screen shows the same prompt after a remount or a reload instead of re-rolling it.
 */
export function penaltyForRound(kind: PenaltyKind, lang: Lang, round: Pick<RoundState, 'number' | 'word'>): string {
  return pickPenalty(kind, lang, seededRng(penaltySeed(round)));
}

/**
 * Player ids on the losing side of a finished round, in seating order:
 * the Imposter(s) when the table won, everyone else when the Imposter won.
 * Empty before the outcome exists.
 */
export function losingSide(round: Pick<RoundState, 'order' | 'imposterIds' | 'outcome'>): string[] {
  const outcome = round.outcome;
  if (!outcome) return [];
  const imp = new Set(round.imposterIds);
  return outcome.winner === 'table'
    ? round.order.filter((id) => imp.has(id))
    : round.order.filter((id) => !imp.has(id));
}
