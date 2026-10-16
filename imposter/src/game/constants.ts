/** Tunable constants. Sensor thresholds live here so they can be adjusted after table testing. */

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 10;
export const MAX_NAME_LENGTH = 20;
/** Two Imposters are allowed only with this many players or more. */
export const MIN_PLAYERS_FOR_TWO_IMPOSTERS = 7;
/** Below this table size the same player may be Imposter twice in a row. */
export const MIN_PLAYERS_FOR_NO_REPEAT_IMPOSTER = 5;

export const MIN_WORDS_PER_CATEGORY = 40;

export const DISCUSSION_MIN_SECONDS = 30;
export const DISCUSSION_MAX_SECONDS = 180;
export const DISCUSSION_STEP_SECONDS = 15;
export const DISCUSSION_BEEP_AT_SECONDS = 10;

/** Lift-to-reveal: device pitch (DeviceOrientationEvent.beta, degrees from horizontal). */
export const LIFT_UP_DEGREES = 45;
export const LIFT_DOWN_DEGREES = 30;
/**
 * Pitch at or beyond which the screen is turning away from the player (face-down on a table reads ~180):
 * such readings never count as lifted and hide a lifted card (same debounce as lowering).
 */
export const LIFT_MAX_DEGREES = 135;
export const LIFT_UP_DEBOUNCE_MS = 300;
export const LIFT_DOWN_DEBOUNCE_MS = 150;

/** Anti-peek: seconds the "Pass to" screen waits before the sensor arms. */
export const PASS_COUNTDOWN_SECONDS = 3;
/** The "Got it, pass" button appears this long after the card is first revealed. */
export const PASS_BUTTON_DELAY_MS = 1000;

export const POINTS_TABLE_WIN = 1;
export const POINTS_IMPOSTER_SURVIVES = 3;
export const POINTS_IMPOSTER_GUESSES = 2;

export const STORAGE_KEY_STATE = 'imposter.v1.state';
export const STORAGE_KEY_LAST_PLAYERS = 'imposter.v1.lastPlayers';
export const STORAGE_KEY_SETTINGS = 'imposter.v1.settings';
export const STORAGE_KEY_CUSTOM_PACKS = 'imposter.v1.customPacks';
