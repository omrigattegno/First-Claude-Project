/**
 * Pure game state machine.
 *
 *   setup -> reveal (x players) -> clues (x rounds x players) -> discussion -> vote (x players)
 *         -> [guess] -> results -> (START_ROUND again | EDIT_PLAYERS | END_GAME)
 *
 * `reduce` is deterministic; all randomness happens in `prepareRound` which
 * builds a START_ROUND action from an injected rng and the word packs.
 */
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MIN_PLAYERS_FOR_NO_REPEAT_IMPOSTER,
  MIN_PLAYERS_FOR_TWO_IMPOSTERS,
  POINTS_IMPOSTER_GUESSES,
  POINTS_IMPOSTER_SURVIVES,
  POINTS_TABLE_WIN,
} from './constants';
import { guessMatches } from './guess';
import { pickOne, pickWeighted } from './rng';
import {
  RANDOM_CATEGORY,
  type Action,
  type Difficulty,
  type GameState,
  type Player,
  type Rng,
  type RoundOutcome,
  type RoundState,
  type Settings,
  type WordPack,
  type WordRecord,
} from './types';

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  categoryId: RANDOM_CATEGORY,
  imposterCount: 1,
  clueRounds: 2,
  discussionSeconds: 60,
  imposterSeesCategory: true,
  imposterGuess: true,
  revealMethod: 'lift',
  difficulty: 'normal',
  penalty: 'off',
};

export function createInitialState(settings: Partial<Settings> = {}): GameState {
  return {
    version: 1,
    phase: 'setup',
    players: [],
    settings: { ...DEFAULT_SETTINGS, ...settings },
    scores: {},
    round: null,
    history: [],
    usedWords: [],
  };
}

// ---------------------------------------------------------------------------
// Validation helpers (also used by the UI)
// ---------------------------------------------------------------------------

export type NameError = 'empty' | 'too_long' | 'duplicate' | 'too_many';

export function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

export function validatePlayerName(
  players: readonly Player[],
  name: string,
  ignoreId?: string,
): NameError | null {
  const n = normalizeName(name);
  if (!n) return 'empty';
  if (n.length > MAX_NAME_LENGTH) return 'too_long';
  const lower = n.toLocaleLowerCase();
  if (players.some((p) => p.id !== ignoreId && p.name.toLocaleLowerCase() === lower)) return 'duplicate';
  if (!ignoreId && players.length >= MAX_PLAYERS) return 'too_many';
  return null;
}

export function canStart(state: GameState): boolean {
  return state.players.length >= MIN_PLAYERS && state.players.length <= MAX_PLAYERS;
}

/** The Imposter count actually used for a table of `playerCount` players. */
export function effectiveImposterCount(settings: Settings, playerCount: number): 1 | 2 {
  return settings.imposterCount === 2 && playerCount >= MIN_PLAYERS_FOR_TWO_IMPOSTERS ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Round preparation (randomness lives here)
// ---------------------------------------------------------------------------

export function wordKey(lang: string, categoryId: string, word: string): string {
  return `${lang}:${categoryId}:${word}`;
}

function difficultyLevels(d: Difficulty): ReadonlySet<number> {
  switch (d) {
    case 'easy':
      return new Set([1]);
    case 'hard':
      return new Set([2, 3]);
    default:
      return new Set([1, 2]);
  }
}

export interface DrawnWord {
  word: WordRecord;
  pack: WordPack;
  /** True when every word of the category had been used and the used list was ignored. */
  recycled: boolean;
}

/**
 * Draw a word for the round. Category-first for Random so each category is
 * equally likely; never repeats a word used this evening unless the category
 * is exhausted.
 */
export function drawWord(
  packs: readonly WordPack[],
  settings: Settings,
  usedWords: readonly string[],
  rng: Rng,
): DrawnWord {
  const langPacks = packs.filter((p) => p.lang === settings.language && p.words.length > 0);
  if (langPacks.length === 0) throw new Error(`No word packs for language ${settings.language}`);
  const used = new Set(usedWords);
  const levels = difficultyLevels(settings.difficulty);

  const candidatesFor = (pack: WordPack, ignoreUsed: boolean, ignoreDifficulty: boolean) =>
    pack.words.filter(
      (w) =>
        (ignoreDifficulty || levels.has(w.difficulty)) &&
        (ignoreUsed || !used.has(wordKey(pack.lang, pack.id, w.word))),
    );

  let chosenPacks: WordPack[];
  if (settings.categoryId === RANDOM_CATEGORY) {
    chosenPacks = langPacks;
  } else {
    const p = langPacks.find((x) => x.id === settings.categoryId);
    chosenPacks = p ? [p] : langPacks;
  }

  // Prefer packs that still have unused words at the chosen difficulty, then
  // relax difficulty, then allow recycling used words.
  const tiers: Array<{ ignoreUsed: boolean; ignoreDifficulty: boolean }> = [
    { ignoreUsed: false, ignoreDifficulty: false },
    { ignoreUsed: false, ignoreDifficulty: true },
    { ignoreUsed: true, ignoreDifficulty: false },
    { ignoreUsed: true, ignoreDifficulty: true },
  ];
  for (const tier of tiers) {
    const available = chosenPacks.filter((p) => candidatesFor(p, tier.ignoreUsed, tier.ignoreDifficulty).length > 0);
    if (available.length === 0) continue;
    const pack = pickOne(rng, available);
    const word = pickOne(rng, candidatesFor(pack, tier.ignoreUsed, tier.ignoreDifficulty));
    return { word, pack, recycled: tier.ignoreUsed };
  }
  throw new Error('drawWord: no words available');
}

/**
 * Choose Imposters: never the same player twice in a row (tables of 5+),
 * and weighted away from the Imposter of two rounds ago.
 */
export function chooseImposters(
  players: readonly Player[],
  history: GameState['history'],
  count: 1 | 2,
  rng: Rng,
): string[] {
  const last = history[history.length - 1]?.imposterIds ?? [];
  const beforeLast = history[history.length - 2]?.imposterIds ?? [];
  const noRepeat = players.length >= MIN_PLAYERS_FOR_NO_REPEAT_IMPOSTER;
  const weights: number[] = players.map((p) => {
    if (last.includes(p.id)) return noRepeat ? 0 : 0.5;
    if (beforeLast.includes(p.id)) return 0.5;
    return 1;
  });
  // Guard: if everything is zero (can't happen with the limits above, but stay safe).
  if (!weights.some((w) => w > 0)) weights.fill(1);

  const chosen: string[] = [];
  const pool = players.map((p, i) => ({ id: p.id, w: weights[i] }));
  while (chosen.length < count && pool.some((x) => x.w > 0)) {
    const pick = pickWeighted(
      rng,
      pool.map((x) => x.id),
      pool.map((x) => x.w),
    );
    chosen.push(pick);
    const idx = pool.findIndex((x) => x.id === pick);
    pool.splice(idx, 1);
  }
  return chosen;
}

/** Build the START_ROUND action for the current players/settings. */
export function prepareRound(
  state: GameState,
  packs: readonly WordPack[],
  rng: Rng,
): Extract<Action, { type: 'START_ROUND' }> {
  if (!canStart(state)) throw new Error('Need 4-10 players to start');
  const drawn = drawWord(packs, state.settings, state.usedWords, rng);
  const count = effectiveImposterCount(state.settings, state.players.length);
  const imposterIds = chooseImposters(state.players, state.history, count, rng);
  // Uniform random starter (the Imposter is the starter exactly as often as chance).
  const starterId = pickOne(rng, state.players).id;
  return {
    type: 'START_ROUND',
    word: drawn.word,
    categoryId: drawn.pack.id,
    categoryName: drawn.pack.name,
    imposterIds,
    starterId,
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function playerById(state: GameState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

export function playerName(state: GameState, id: string): string {
  return playerById(state, id)?.name ?? '?';
}

/** Player currently holding the phone on the reveal screen. */
export function currentRevealer(state: GameState): Player | undefined {
  const r = state.round;
  if (!r || state.phase !== 'reveal') return undefined;
  return playerById(state, r.order[r.revealIndex]);
}

export function isImposter(state: GameState, playerId: string): boolean {
  return state.round?.imposterIds.includes(playerId) ?? false;
}

/** Clue turn order for the round: starts at the starter and goes around the table. */
export function clueOrder(round: RoundState): string[] {
  const n = round.order.length;
  const start = Math.max(0, round.order.indexOf(round.starterId));
  return Array.from({ length: n }, (_, i) => round.order[(start + i) % n]);
}

export function currentSpeaker(state: GameState): Player | undefined {
  const r = state.round;
  if (!r || state.phase !== 'clues') return undefined;
  return playerById(state, clueOrder(r)[r.clueTurn]);
}

export function currentVoter(state: GameState): Player | undefined {
  const r = state.round;
  if (!r || state.phase !== 'vote') return undefined;
  return playerById(state, r.order[r.voteIndex]);
}

/** Players a voter may vote for (everyone but themselves). */
export function ballotFor(state: GameState, voterId: string): Player[] {
  const r = state.round;
  if (!r) return [];
  return r.order.filter((id) => id !== voterId).map((id) => playerById(state, id)!).filter(Boolean);
}

/** The Imposter who was voted out and must now guess (phase 'guess'). */
export function guessingImposter(state: GameState): Player | undefined {
  const r = state.round;
  if (!r || state.phase !== 'guess' || !r.outcome?.votedOutId) return undefined;
  return playerById(state, r.outcome.votedOutId);
}

export function scoreboard(state: GameState): Array<{ player: Player; score: number }> {
  return state.players
    .map((player) => ({ player, score: state.scores[player.id] ?? 0 }))
    .sort((a, b) => b.score - a.score || a.player.name.localeCompare(b.player.name));
}

// ---------------------------------------------------------------------------
// Outcome computation
// ---------------------------------------------------------------------------

export function tallyVotes(votes: Record<string, string>): { tally: Record<string, number>; top: string | null; tie: boolean } {
  const tally: Record<string, number> = {};
  for (const votedId of Object.values(votes)) tally[votedId] = (tally[votedId] ?? 0) + 1;
  let top: string | null = null;
  let best = 0;
  let tie = false;
  for (const [id, n] of Object.entries(tally)) {
    if (n > best) {
      best = n;
      top = id;
      tie = false;
    } else if (n === best) {
      tie = true;
    }
  }
  return { tally, top: tie ? null : top, tie };
}

function computeOutcome(round: RoundState, guessCorrect: boolean | null): RoundOutcome {
  const { tally, top, tie } = tallyVotes(round.votes);
  const imposterCaught = top !== null && round.imposterIds.includes(top);
  const winner: RoundOutcome['winner'] = !imposterCaught ? 'imposter' : guessCorrect ? 'imposter' : 'table';
  const points: Record<string, number> = {};
  for (const id of round.order) {
    const imp = round.imposterIds.includes(id);
    if (winner === 'table') points[id] = imp ? 0 : POINTS_TABLE_WIN;
    else if (!imposterCaught) points[id] = imp ? POINTS_IMPOSTER_SURVIVES : 0;
    else points[id] = imp ? POINTS_IMPOSTER_GUESSES : 0;
  }
  return { tally, votedOutId: top, tie, imposterCaught, guessCorrect, winner, points };
}

function applyOutcome(state: GameState, round: RoundState, outcome: RoundOutcome): GameState {
  const scores = { ...state.scores };
  for (const [id, pts] of Object.entries(outcome.points)) scores[id] = (scores[id] ?? 0) + pts;
  return {
    ...state,
    phase: 'results',
    scores,
    round: { ...round, outcome },
    history: [
      ...state.history,
      {
        number: round.number,
        word: round.word.word,
        categoryId: round.categoryId,
        imposterIds: round.imposterIds,
        winner: outcome.winner,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduce(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'LOAD':
      return action.state;

    case 'ADD_PLAYER': {
      if (state.phase !== 'setup') return state;
      if (validatePlayerName(state.players, action.name)) return state;
      if (state.players.some((p) => p.id === action.id)) return state;
      return { ...state, players: [...state.players, { id: action.id, name: normalizeName(action.name) }] };
    }

    case 'REMOVE_PLAYER': {
      if (state.phase !== 'setup') return state;
      const { [action.id]: _dropped, ...scores } = state.scores;
      void _dropped;
      return { ...state, players: state.players.filter((p) => p.id !== action.id), scores };
    }

    case 'RENAME_PLAYER': {
      if (state.phase !== 'setup') return state;
      if (validatePlayerName(state.players, action.name, action.id)) return state;
      return {
        ...state,
        players: state.players.map((p) => (p.id === action.id ? { ...p, name: normalizeName(action.name) } : p)),
      };
    }

    case 'REORDER_PLAYERS': {
      if (state.phase !== 'setup') return state;
      const byId = new Map(state.players.map((p) => [p.id, p]));
      if (action.ids.length !== state.players.length || !action.ids.every((id) => byId.has(id))) return state;
      if (new Set(action.ids).size !== action.ids.length) return state;
      return { ...state, players: action.ids.map((id) => byId.get(id)!) };
    }

    case 'SET_PLAYERS': {
      if (state.phase !== 'setup') return state;
      const players: Player[] = [];
      for (const p of action.players) {
        if (players.length >= MAX_PLAYERS) break;
        if (validatePlayerName(players, p.name)) continue;
        if (players.some((x) => x.id === p.id)) continue;
        players.push({ id: p.id, name: normalizeName(p.name) });
      }
      return { ...state, players };
    }

    case 'UPDATE_SETTINGS':
      return { ...state, settings: sanitizeSettings({ ...state.settings, ...action.patch }) };

    case 'START_ROUND': {
      if (state.phase !== 'setup' && state.phase !== 'results') return state;
      if (!canStart(state)) return state;
      const ids = new Set(state.players.map((p) => p.id));
      if (!action.imposterIds.length || !action.imposterIds.every((id) => ids.has(id))) return state;
      if (!ids.has(action.starterId)) return state;
      const s = state.settings;
      const round: RoundState = {
        number: state.history.length + 1,
        word: action.word,
        categoryId: action.categoryId,
        categoryName: action.categoryName,
        order: state.players.map((p) => p.id),
        imposterIds: action.imposterIds,
        starterId: action.starterId,
        config: {
          clueRounds: s.clueRounds,
          discussionSeconds: s.discussionSeconds,
          imposterSeesCategory: s.imposterSeesCategory,
          imposterGuess: s.imposterGuess,
          penalty: s.penalty,
        },
        revealIndex: 0,
        clueRound: 1,
        clueTurn: 0,
        voteIndex: 0,
        votes: {},
        guess: null,
        outcome: null,
      };
      const key = wordKey(s.language, action.categoryId, action.word.word);
      return {
        ...state,
        phase: 'reveal',
        round,
        usedWords: state.usedWords.includes(key) ? state.usedWords : [...state.usedWords, key],
      };
    }

    case 'REVEAL_NEXT': {
      const r = state.round;
      if (!r || state.phase !== 'reveal') return state;
      const next = r.revealIndex + 1;
      if (next >= r.order.length) return { ...state, phase: 'clues', round: { ...r, revealIndex: r.order.length - 1 } };
      return { ...state, round: { ...r, revealIndex: next } };
    }

    case 'CLUE_NEXT': {
      const r = state.round;
      if (!r || state.phase !== 'clues') return state;
      const n = r.order.length;
      if (r.clueTurn + 1 < n) return { ...state, round: { ...r, clueTurn: r.clueTurn + 1 } };
      if (r.clueRound < r.config.clueRounds) return { ...state, round: { ...r, clueRound: r.clueRound + 1, clueTurn: 0 } };
      const nextPhase = r.config.discussionSeconds > 0 ? 'discussion' : 'vote';
      return { ...state, phase: nextPhase };
    }

    case 'DISCUSSION_DONE': {
      if (!state.round || state.phase !== 'discussion') return state;
      return { ...state, phase: 'vote' };
    }

    case 'CAST_VOTE': {
      const r = state.round;
      if (!r || state.phase !== 'vote') return state;
      const voterId = r.order[r.voteIndex];
      if (action.voterId !== voterId) return state;
      if (action.votedId === voterId || !r.order.includes(action.votedId)) return state;
      const votes = { ...r.votes, [voterId]: action.votedId };
      const next = r.voteIndex + 1;
      if (next < r.order.length) return { ...state, round: { ...r, votes, voteIndex: next } };
      // Everyone has voted.
      const withVotes: RoundState = { ...r, votes, voteIndex: r.order.length - 1 };
      const { top } = tallyVotes(votes);
      const caught = top !== null && r.imposterIds.includes(top);
      if (caught && r.config.imposterGuess) {
        const pending = computeOutcome(withVotes, null);
        return { ...state, phase: 'guess', round: { ...withVotes, outcome: pending } };
      }
      return applyOutcome(state, withVotes, computeOutcome(withVotes, null));
    }

    case 'SUBMIT_GUESS': {
      const r = state.round;
      if (!r || state.phase !== 'guess') return state;
      const correct = guessMatches(action.guess, r.word);
      return applyOutcome(state, { ...r, guess: action.guess }, computeOutcome(r, correct));
    }

    case 'EDIT_PLAYERS': {
      if (state.phase !== 'results' && state.phase !== 'setup') return state;
      return { ...state, phase: 'setup', round: null };
    }

    case 'ABORT_ROUND': {
      if (state.phase === 'setup') return state;
      return { ...state, phase: 'setup', round: null };
    }

    case 'END_GAME':
      return { ...state, phase: 'setup', round: null, scores: {}, history: [], usedWords: [] };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Settings sanitising
// ---------------------------------------------------------------------------

export function sanitizeSettings(s: Settings): Settings {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const discussion = s.discussionSeconds === 0 ? 0 : clamp(Math.round(s.discussionSeconds), 30, 180);
  return {
    language: s.language === 'he' ? 'he' : 'en',
    categoryId: s.categoryId || RANDOM_CATEGORY,
    imposterCount: s.imposterCount === 2 ? 2 : 1,
    clueRounds: s.clueRounds === 1 || s.clueRounds === 3 ? s.clueRounds : 2,
    discussionSeconds: discussion,
    imposterSeesCategory: !!s.imposterSeesCategory,
    imposterGuess: !!s.imposterGuess,
    revealMethod: s.revealMethod === 'hold' ? 'hold' : 'lift',
    difficulty: s.difficulty === 'easy' || s.difficulty === 'hard' ? s.difficulty : 'normal',
    penalty: s.penalty === 'dare' || s.penalty === 'drink' ? s.penalty : 'off',
  };
}

/** Validate a persisted snapshot before resuming it. */
export function isGameState(x: unknown): x is GameState {
  if (!x || typeof x !== 'object') return false;
  const s = x as Partial<GameState>;
  const phases: string[] = ['setup', 'reveal', 'clues', 'discussion', 'vote', 'guess', 'results'];
  return (
    s.version === 1 &&
    typeof s.phase === 'string' &&
    phases.includes(s.phase) &&
    Array.isArray(s.players) &&
    s.players.every((p) => p && typeof p.id === 'string' && typeof p.name === 'string') &&
    !!s.settings &&
    typeof s.settings === 'object' &&
    !!s.scores &&
    typeof s.scores === 'object' &&
    Array.isArray(s.history) &&
    Array.isArray(s.usedWords) &&
    (s.round === null || (typeof s.round === 'object' && s.round !== null && Array.isArray(s.round.order)))
  );
}
