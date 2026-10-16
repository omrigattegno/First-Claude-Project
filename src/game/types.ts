/**
 * Core game types. Everything in src/game is framework-free and pure so the
 * state machine can be unit-tested without a browser.
 */

export type Lang = 'en' | 'he';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type RevealMethod = 'lift' | 'hold';
export type Penalty = 'off' | 'dare' | 'drink';

/** The id 'random' means "draw from any category". */
export const RANDOM_CATEGORY = 'random';
/** Host-typed packs (src/words/custom.ts) carry this id prefix; their words match every difficulty. */
export const CUSTOM_PACK_PREFIX = 'custom-';

export type Phase =
  | 'setup'
  | 'reveal'
  | 'clues'
  | 'discussion'
  | 'vote'
  | 'guess'
  | 'results';

export interface Settings {
  language: Lang;
  /** Category id or RANDOM_CATEGORY. */
  categoryId: string;
  imposterCount: 1 | 2;
  clueRounds: 1 | 2 | 3;
  /** Seconds of discussion; 0 = timer off (go straight to the vote). */
  discussionSeconds: number;
  imposterSeesCategory: boolean;
  imposterGuess: boolean;
  revealMethod: RevealMethod;
  difficulty: Difficulty;
  penalty: Penalty;
}

export interface Player {
  id: string;
  name: string;
}

export interface WordRecord {
  word: string;
  /** Category id (e.g. 'food'). */
  category: string;
  /** 1 = easy/generic, 3 = hard/specific. */
  difficulty: 1 | 2 | 3;
  /** Alternative spellings / synonyms accepted for the Imposter's guess. */
  aliases: string[];
  /** Optional similar word for the (later) Undercover variant. */
  pair?: string;
}

export interface WordPack {
  id: string;
  /** Display name in the pack's own language. */
  name: string;
  lang: Lang;
  words: WordRecord[];
}

/** Rule values frozen at round start so settings changes apply from the next round. */
export interface RoundConfig {
  clueRounds: 1 | 2 | 3;
  discussionSeconds: number;
  imposterSeesCategory: boolean;
  imposterGuess: boolean;
  penalty: Penalty;
}

export type Winner = 'table' | 'imposter';

export interface RoundOutcome {
  /** votedId -> number of votes */
  tally: Record<string, number>;
  /** Player with the most votes, or null when the top is tied (nobody is caught). */
  votedOutId: string | null;
  tie: boolean;
  imposterCaught: boolean;
  /** null when no guess was made (not caught, or guessing disabled). */
  guessCorrect: boolean | null;
  winner: Winner;
  /** Points awarded this round, per player id. */
  points: Record<string, number>;
}

export interface RoundState {
  number: number;
  word: WordRecord;
  categoryId: string;
  categoryName: string;
  /** Snapshot of seating order (player ids) at round start. */
  order: string[];
  imposterIds: string[];
  starterId: string;
  config: RoundConfig;
  /** Index into `order` of the player currently revealing. */
  revealIndex: number;
  /** 1-based clue round counter. */
  clueRound: number;
  /** 0-based turn offset from the starter within the current clue round. */
  clueTurn: number;
  /** Index into `order` of the player currently voting. */
  voteIndex: number;
  /** voterId -> votedId */
  votes: Record<string, string>;
  /** The caught Imposter's typed guess (if any). */
  guess: string | null;
  outcome: RoundOutcome | null;
  /**
   * Epoch ms at which the discussion timer ends; null until the Discussion screen opens
   * (DISCUSSION_START). Persisted so a reload mid-discussion resumes the countdown.
   */
  discussionEndsAt: number | null;
}

export interface HistoryEntry {
  number: number;
  word: string;
  categoryId: string;
  imposterIds: string[];
  winner: Winner;
}

export interface GameState {
  version: 1;
  phase: Phase;
  players: Player[];
  settings: Settings;
  /** playerId -> total points this evening. */
  scores: Record<string, number>;
  round: RoundState | null;
  history: HistoryEntry[];
  /** Keys of words already drawn this evening (`${lang}:${categoryId}:${word}`), most recent draw last. */
  usedWords: string[];
  /**
   * Players removed during setup this evening. Scores and history stay keyed by their id, so
   * ADD_PLAYER with the same name (case-insensitive) brings them back with their points. Optional
   * because snapshots written before this field existed must still load (treated as []).
   */
  benched?: Player[];
}

export type Action =
  | { type: 'ADD_PLAYER'; id: string; name: string }
  | { type: 'REMOVE_PLAYER'; id: string }
  | { type: 'RENAME_PLAYER'; id: string; name: string }
  | { type: 'REORDER_PLAYERS'; ids: string[] }
  | { type: 'SET_PLAYERS'; players: Player[] }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<Settings> }
  | {
      type: 'START_ROUND';
      word: WordRecord;
      categoryId: string;
      categoryName: string;
      imposterIds: string[];
      starterId: string;
    }
  | { type: 'REVEAL_NEXT' }
  | { type: 'CLUE_NEXT' }
  /** Sets `round.discussionEndsAt` once (ignored unless phase is 'discussion' and it is still null). */
  | { type: 'DISCUSSION_START'; endsAt: number }
  | { type: 'DISCUSSION_DONE' }
  | { type: 'CAST_VOTE'; voterId: string; votedId: string }
  | { type: 'SUBMIT_GUESS'; guess: string }
  | { type: 'EDIT_PLAYERS' }
  | { type: 'ABORT_ROUND' }
  | { type: 'END_GAME' }
  | { type: 'LOAD'; state: GameState };

export type Rng = () => number;
