/** Strings for Pass-to, Reveal, Clues, Discussion, Vote, Guess and Results. Filled by the in-game UI builder. */
const en = {
  'pass.to': 'Pass to {name}',
} as const;

const he: Record<keyof typeof en, string> = {
  'pass.to': 'להעביר ל{name}',
};

export const game = { en, he };
