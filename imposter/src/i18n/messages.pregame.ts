/** Strings for Home, How to play, Setup and Settings. Filled by the pre-game UI builder. */
const en = {
  'home.play': 'Play',
} as const;

const he: Record<keyof typeof en, string> = {
  'home.play': 'שחקו',
};

export const pregame = { en, he };
