import { describe, expect, it } from 'vitest';
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  POINTS_IMPOSTER_GUESSES,
  POINTS_IMPOSTER_SURVIVES,
  POINTS_TABLE_WIN,
} from './constants';
import {
  ballotFor,
  canStart,
  chooseImposters,
  clueOrder,
  createInitialState,
  currentRevealer,
  currentSpeaker,
  currentVoter,
  DEFAULT_SETTINGS,
  drawWord,
  effectiveImposterCount,
  guessingImposter,
  isGameState,
  normalizeName,
  playerName,
  prepareRound,
  reduce,
  sanitizeSettings,
  scoreboard,
  tallyVotes,
  validatePlayerName,
  wordKey,
} from './engine';
import { seededRng } from './rng';
import {
  RANDOM_CATEGORY,
  type Action,
  type GameState,
  type HistoryEntry,
  type Lang,
  type Player,
  type Settings,
  type WordPack,
  type WordRecord,
} from './types';

// ---------------------------------------------------------------------------
// Fixtures and helpers
// ---------------------------------------------------------------------------

type StartAction = Extract<Action, { type: 'START_ROUND' }>;

const WORD: WordRecord = { word: 'Pizza', category: 'food', difficulty: 1, aliases: ['pizza pie'] };

function mkPack(id: string, lang: Lang, spec: ReadonlyArray<readonly [string, 1 | 2 | 3]>, name = id): WordPack {
  return {
    id,
    name,
    lang,
    words: spec.map(([word, difficulty]) => ({ word, category: id, difficulty, aliases: [] })),
  };
}

/** A pack with `perLevel` words at each difficulty. */
function levelledPack(id: string, lang: Lang, perLevel: number): WordPack {
  const spec: Array<[string, 1 | 2 | 3]> = [];
  for (const d of [1, 2, 3] as const) for (let i = 0; i < perLevel; i++) spec.push([`${id}-d${d}-${i}`, d]);
  return mkPack(id, lang, spec);
}

const pid = (i: number) => `p${i}`;

function withPlayers(n: number, settings: Partial<Settings> = {}): GameState {
  let s = createInitialState(settings);
  for (let i = 1; i <= n; i++) s = reduce(s, { type: 'ADD_PLAYER', id: pid(i), name: `Player ${i}` });
  return s;
}

function startAction(over: Partial<Omit<StartAction, 'type'>> = {}): StartAction {
  return {
    type: 'START_ROUND',
    word: WORD,
    categoryId: 'food',
    categoryName: 'Food',
    imposterIds: ['p3'],
    starterId: 'p2',
    ...over,
  };
}

const start = (state: GameState, over?: Partial<Omit<StartAction, 'type'>>) => reduce(state, startAction(over));

function revealAll(state: GameState): GameState {
  let s = state;
  const n = s.round!.order.length;
  for (let i = 0; i < n; i++) s = reduce(s, { type: 'REVEAL_NEXT' });
  return s;
}

function cluesAll(state: GameState): GameState {
  let s = state;
  const r = s.round!;
  for (let i = 0; i < r.order.length * r.config.clueRounds; i++) s = reduce(s, { type: 'CLUE_NEXT' });
  return s;
}

/** Drive a freshly started round to the vote phase. */
function toVote(state: GameState): GameState {
  let s = cluesAll(revealAll(state));
  if (s.phase === 'discussion') s = reduce(s, { type: 'DISCUSSION_DONE' });
  return s;
}

function voteAll(state: GameState, pick: (voterId: string) => string): GameState {
  let s = state;
  for (const voterId of s.round!.order) s = reduce(s, { type: 'CAST_VOTE', voterId, votedId: pick(voterId) });
  return s;
}

/** Everyone votes for `target`; the target votes for `fallback`. */
const allFor = (target: string, fallback: string) => (v: string) => (v === target ? fallback : target);

const points = (ids: readonly string[], f: (id: string) => number) =>
  Object.fromEntries(ids.map((id) => [id, f(id)]));

const FIVE = ['p1', 'p2', 'p3', 'p4', 'p5'];

// ---------------------------------------------------------------------------
// Player management
// ---------------------------------------------------------------------------

describe('validatePlayerName', () => {
  const players: Player[] = [
    { id: 'a', name: 'Dana' },
    { id: 'b', name: 'Yossi' },
  ];

  it('rejects empty and whitespace-only names', () => {
    expect(validatePlayerName(players, '')).toBe('empty');
    expect(validatePlayerName(players, '   \t ')).toBe('empty');
  });

  it('rejects names longer than MAX_NAME_LENGTH (after whitespace normalisation)', () => {
    expect(validatePlayerName(players, 'x'.repeat(MAX_NAME_LENGTH))).toBeNull();
    expect(validatePlayerName(players, 'x'.repeat(MAX_NAME_LENGTH + 1))).toBe('too_long');
    // Internal runs of whitespace collapse before the length check.
    expect(validatePlayerName(players, `${'x'.repeat(MAX_NAME_LENGTH - 2)}    y`)).toBeNull();
  });

  it('rejects duplicates case-insensitively and whitespace-insensitively', () => {
    expect(validatePlayerName(players, 'dana')).toBe('duplicate');
    expect(validatePlayerName(players, 'DANA')).toBe('duplicate');
    expect(validatePlayerName(players, '  Dana ')).toBe('duplicate');
    expect(validatePlayerName(players, 'Dan')).toBeNull();
  });

  it('allows a rename to the same (or differently-cased) own name but not another player name', () => {
    expect(validatePlayerName(players, 'DANA', 'a')).toBeNull();
    expect(validatePlayerName(players, 'yossi', 'a')).toBe('duplicate');
  });

  it('rejects the 11th player but not a rename at the limit', () => {
    const full: Player[] = Array.from({ length: MAX_PLAYERS }, (_, i) => ({ id: pid(i), name: `N${i}` }));
    expect(validatePlayerName(full, 'Extra')).toBe('too_many');
    expect(validatePlayerName(full, 'Renamed', 'p0')).toBeNull();
  });

  it('normalizeName collapses whitespace and trims', () => {
    expect(normalizeName('  Dana \t  Cohen  ')).toBe('Dana Cohen');
  });
});

describe('player actions in setup', () => {
  it('ADD_PLAYER adds a normalised name and rejects invalid ones', () => {
    let s = createInitialState();
    s = reduce(s, { type: 'ADD_PLAYER', id: 'a', name: '  Dana   Cohen ' });
    expect(s.players).toEqual([{ id: 'a', name: 'Dana Cohen' }]);

    expect(reduce(s, { type: 'ADD_PLAYER', id: 'b', name: '' })).toBe(s);
    expect(reduce(s, { type: 'ADD_PLAYER', id: 'b', name: 'x'.repeat(MAX_NAME_LENGTH + 1) })).toBe(s);
    expect(reduce(s, { type: 'ADD_PLAYER', id: 'b', name: 'dana cohen' })).toBe(s);
    // Duplicate id is rejected too.
    expect(reduce(s, { type: 'ADD_PLAYER', id: 'a', name: 'Someone' })).toBe(s);
  });

  it('ADD_PLAYER rejects the 11th player', () => {
    const ten = withPlayers(MAX_PLAYERS);
    expect(ten.players).toHaveLength(MAX_PLAYERS);
    expect(reduce(ten, { type: 'ADD_PLAYER', id: 'extra', name: 'Extra' })).toBe(ten);
  });

  it('RENAME_PLAYER renames, allows own-name case changes and rejects duplicates', () => {
    let s = withPlayers(3);
    s = reduce(s, { type: 'RENAME_PLAYER', id: 'p1', name: '  Dana ' });
    expect(s.players[0]).toEqual({ id: 'p1', name: 'Dana' });
    s = reduce(s, { type: 'RENAME_PLAYER', id: 'p1', name: 'DANA' });
    expect(s.players[0].name).toBe('DANA');
    expect(reduce(s, { type: 'RENAME_PLAYER', id: 'p2', name: 'dana' })).toBe(s);
    expect(reduce(s, { type: 'RENAME_PLAYER', id: 'p2', name: '' })).toBe(s);
    // Other players untouched.
    expect(s.players[1]).toEqual({ id: 'p2', name: 'Player 2' });
  });

  it('REMOVE_PLAYER removes the player and drops their score', () => {
    const s: GameState = { ...withPlayers(4), scores: { p1: 3, p2: 1, p3: 2 } };
    const next = reduce(s, { type: 'REMOVE_PLAYER', id: 'p2' });
    expect(next.players.map((p) => p.id)).toEqual(['p1', 'p3', 'p4']);
    expect(next.scores).toEqual({ p1: 3, p3: 2 });
  });

  it('REORDER_PLAYERS reorders and rejects bad id lists', () => {
    const s = withPlayers(4);
    const ok = reduce(s, { type: 'REORDER_PLAYERS', ids: ['p3', 'p1', 'p4', 'p2'] });
    expect(ok.players.map((p) => p.id)).toEqual(['p3', 'p1', 'p4', 'p2']);
    expect(ok.players[0]).toEqual({ id: 'p3', name: 'Player 3' });

    expect(reduce(s, { type: 'REORDER_PLAYERS', ids: ['p3', 'p1', 'p4'] })).toBe(s); // missing one
    expect(reduce(s, { type: 'REORDER_PLAYERS', ids: ['p3', 'p1', 'p4', 'p2', 'p1'] })).toBe(s); // too many
    expect(reduce(s, { type: 'REORDER_PLAYERS', ids: ['p3', 'p1', 'p4', 'ghost'] })).toBe(s); // unknown id
    expect(reduce(s, { type: 'REORDER_PLAYERS', ids: ['p3', 'p1', 'p4', 'p4'] })).toBe(s); // duplicate
    expect(reduce(s, { type: 'REORDER_PLAYERS', ids: [] })).toBe(s);
  });

  it('SET_PLAYERS dedups names case-insensitively, dedups ids, normalises and caps at MAX_PLAYERS', () => {
    const s = reduce(createInitialState(), {
      type: 'SET_PLAYERS',
      players: [
        { id: 'a', name: ' Dana ' },
        { id: 'b', name: 'dana' },
        { id: 'c', name: '' },
        { id: 'a', name: 'Other' },
        { id: 'd', name: 'Yossi' },
      ],
    });
    expect(s.players).toEqual([
      { id: 'a', name: 'Dana' },
      { id: 'd', name: 'Yossi' },
    ]);

    const many = Array.from({ length: MAX_PLAYERS + 3 }, (_, i) => ({ id: pid(i), name: `N${i}` }));
    const capped = reduce(createInitialState(), { type: 'SET_PLAYERS', players: many });
    expect(capped.players).toHaveLength(MAX_PLAYERS);
    expect(capped.players.map((p) => p.id)).toEqual(many.slice(0, MAX_PLAYERS).map((p) => p.id));
  });

  it('all player edits are rejected outside setup', () => {
    const phases: GameState[] = [];
    let s = start(withPlayers(5));
    phases.push(s); // reveal
    s = revealAll(s);
    phases.push(s); // clues
    s = cluesAll(s);
    phases.push(s); // discussion
    s = reduce(s, { type: 'DISCUSSION_DONE' });
    phases.push(s); // vote
    s = voteAll(s, allFor('p3', 'p1'));
    phases.push(s); // guess
    s = reduce(s, { type: 'SUBMIT_GUESS', guess: 'nope' });
    phases.push(s); // results
    expect(phases.map((p) => p.phase)).toEqual(['reveal', 'clues', 'discussion', 'vote', 'guess', 'results']);

    for (const st of phases) {
      expect(reduce(st, { type: 'ADD_PLAYER', id: 'z', name: 'Zed' })).toBe(st);
      expect(reduce(st, { type: 'REMOVE_PLAYER', id: 'p1' })).toBe(st);
      expect(reduce(st, { type: 'RENAME_PLAYER', id: 'p1', name: 'Zed' })).toBe(st);
      expect(reduce(st, { type: 'REORDER_PLAYERS', ids: ['p5', 'p4', 'p3', 'p2', 'p1'] })).toBe(st);
      expect(reduce(st, { type: 'SET_PLAYERS', players: [{ id: 'z', name: 'Zed' }] })).toBe(st);
    }
  });
});

describe('canStart / effectiveImposterCount', () => {
  it('canStart needs 4-10 players', () => {
    expect(canStart(withPlayers(3))).toBe(false);
    expect(canStart(withPlayers(4))).toBe(true);
    expect(canStart(withPlayers(10))).toBe(true);
    const eleven: GameState = {
      ...createInitialState(),
      players: Array.from({ length: 11 }, (_, i) => ({ id: pid(i), name: `N${i}` })),
    };
    expect(canStart(eleven)).toBe(false);
  });

  it('effectiveImposterCount is 2 only with imposterCount=2 and >= 7 players', () => {
    const two: Settings = { ...DEFAULT_SETTINGS, imposterCount: 2 };
    expect(effectiveImposterCount(two, 6)).toBe(1);
    expect(effectiveImposterCount(two, 7)).toBe(2);
    expect(effectiveImposterCount(two, 10)).toBe(2);
    expect(effectiveImposterCount(DEFAULT_SETTINGS, 7)).toBe(1);
    expect(effectiveImposterCount(DEFAULT_SETTINGS, 10)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Round walk-through
// ---------------------------------------------------------------------------

describe('START_ROUND', () => {
  it('freezes rules into round.config, snapshots order and records the used word', () => {
    const s = start(withPlayers(5, { clueRounds: 3, discussionSeconds: 90, imposterGuess: false, penalty: 'dare' }));
    expect(s.phase).toBe('reveal');
    const r = s.round!;
    expect(r.number).toBe(1);
    expect(r.order).toEqual(FIVE);
    expect(r.imposterIds).toEqual(['p3']);
    expect(r.starterId).toBe('p2');
    expect(r.word).toEqual(WORD);
    expect(r.categoryId).toBe('food');
    expect(r.categoryName).toBe('Food');
    expect(r.config).toEqual({
      clueRounds: 3,
      discussionSeconds: 90,
      imposterSeesCategory: true,
      imposterGuess: false,
      penalty: 'dare',
    });
    expect(r.revealIndex).toBe(0);
    expect(r.clueRound).toBe(1);
    expect(r.clueTurn).toBe(0);
    expect(r.voteIndex).toBe(0);
    expect(r.votes).toEqual({});
    expect(r.guess).toBeNull();
    expect(r.outcome).toBeNull();
    expect(s.usedWords).toEqual([wordKey('en', 'food', 'Pizza')]);
  });

  it('is rejected with too few players, unknown imposter/starter ids, or mid-round', () => {
    const three = withPlayers(3);
    expect(start(three)).toBe(three);
    const five = withPlayers(5);
    expect(start(five, { imposterIds: ['ghost'] })).toBe(five);
    expect(start(five, { imposterIds: [] })).toBe(five);
    expect(start(five, { starterId: 'ghost' })).toBe(five);
    const mid = start(five);
    expect(start(mid)).toBe(mid);
    const clues = revealAll(mid);
    expect(start(clues)).toBe(clues);
  });
});

describe('full round with 5 players', () => {
  it('walks setup -> reveal x5 -> clues x(2x5) -> discussion -> vote x5 -> guess -> results', () => {
    let s = start(withPlayers(5)); // Imposter p3, starter p2

    // Reveal: the phone goes around in seating order.
    for (let i = 0; i < 5; i++) {
      expect(s.phase).toBe('reveal');
      expect(s.round!.revealIndex).toBe(i);
      expect(currentRevealer(s)!.id).toBe(pid(i + 1));
      s = reduce(s, { type: 'REVEAL_NEXT' });
    }
    expect(s.phase).toBe('clues');
    expect(currentRevealer(s)).toBeUndefined();

    // Clues: order starts at the starter and goes around; clueRound increments.
    const expectedOrder = ['p2', 'p3', 'p4', 'p5', 'p1'];
    expect(clueOrder(s.round!)).toEqual(expectedOrder);
    for (let round = 1; round <= 2; round++) {
      for (let turn = 0; turn < 5; turn++) {
        expect(s.phase).toBe('clues');
        expect(s.round!.clueRound).toBe(round);
        expect(s.round!.clueTurn).toBe(turn);
        expect(currentSpeaker(s)!.id).toBe(expectedOrder[turn]);
        s = reduce(s, { type: 'CLUE_NEXT' });
      }
    }
    expect(s.phase).toBe('discussion');
    expect(currentSpeaker(s)).toBeUndefined();

    s = reduce(s, { type: 'DISCUSSION_DONE' });
    expect(s.phase).toBe('vote');

    // Vote: wrong voter, self-vote and unknown target are ignored.
    expect(currentVoter(s)!.id).toBe('p1');
    expect(reduce(s, { type: 'CAST_VOTE', voterId: 'p2', votedId: 'p3' })).toBe(s);
    expect(reduce(s, { type: 'CAST_VOTE', voterId: 'p1', votedId: 'p1' })).toBe(s);
    expect(reduce(s, { type: 'CAST_VOTE', voterId: 'p1', votedId: 'ghost' })).toBe(s);
    expect(ballotFor(s, 'p1').map((p) => p.id)).toEqual(['p2', 'p3', 'p4', 'p5']);

    for (let i = 0; i < 5; i++) {
      expect(s.phase).toBe('vote');
      expect(s.round!.voteIndex).toBe(i);
      const voter = FIVE[i];
      expect(currentVoter(s)!.id).toBe(voter);
      s = reduce(s, { type: 'CAST_VOTE', voterId: voter, votedId: voter === 'p3' ? 'p1' : 'p3' });
    }
    expect(s.round!.votes).toEqual({ p1: 'p3', p2: 'p3', p3: 'p1', p4: 'p3', p5: 'p3' });

    // Imposter caught -> guess phase; nothing scored yet.
    expect(s.phase).toBe('guess');
    expect(guessingImposter(s)!.id).toBe('p3');
    expect(currentVoter(s)).toBeUndefined();
    expect(s.scores).toEqual({});
    expect(s.history).toHaveLength(0);

    s = reduce(s, { type: 'SUBMIT_GUESS', guess: '  PIZZA ' });
    expect(s.phase).toBe('results');
    expect(guessingImposter(s)).toBeUndefined();
    expect(s.round!.guess).toBe('  PIZZA ');
    expect(s.round!.outcome).toEqual({
      tally: { p3: 4, p1: 1 },
      votedOutId: 'p3',
      tie: false,
      imposterCaught: true,
      guessCorrect: true,
      winner: 'imposter',
      points: points(FIVE, (id) => (id === 'p3' ? POINTS_IMPOSTER_GUESSES : 0)),
    });
    expect(s.scores).toEqual({ p1: 0, p2: 0, p3: POINTS_IMPOSTER_GUESSES, p4: 0, p5: 0 });
    expect(s.history).toEqual([{ number: 1, word: 'Pizza', categoryId: 'food', imposterIds: ['p3'], winner: 'imposter' }]);
  });

  it('phase actions are ignored in the wrong phase', () => {
    const reveal = start(withPlayers(5));
    expect(reduce(reveal, { type: 'CLUE_NEXT' })).toBe(reveal);
    expect(reduce(reveal, { type: 'DISCUSSION_DONE' })).toBe(reveal);
    expect(reduce(reveal, { type: 'CAST_VOTE', voterId: 'p1', votedId: 'p2' })).toBe(reveal);
    expect(reduce(reveal, { type: 'SUBMIT_GUESS', guess: 'Pizza' })).toBe(reveal);
    expect(reduce(reveal, { type: 'EDIT_PLAYERS' })).toBe(reveal);

    const clues = revealAll(reveal);
    expect(reduce(clues, { type: 'REVEAL_NEXT' })).toBe(clues);
    expect(reduce(clues, { type: 'DISCUSSION_DONE' })).toBe(clues);

    const setup = withPlayers(5);
    expect(reduce(setup, { type: 'REVEAL_NEXT' })).toBe(setup);
    expect(reduce(setup, { type: 'ABORT_ROUND' })).toBe(setup);
    expect(reduce(setup, { type: 'SUBMIT_GUESS', guess: 'x' })).toBe(setup);
  });

  it('(b) caught, wrong guess -> table wins, 1 point to each non-Imposter', () => {
    let s = voteAll(toVote(start(withPlayers(5))), allFor('p3', 'p1'));
    expect(s.phase).toBe('guess');
    s = reduce(s, { type: 'SUBMIT_GUESS', guess: 'sushi' });
    expect(s.phase).toBe('results');
    const o = s.round!.outcome!;
    expect(o.imposterCaught).toBe(true);
    expect(o.guessCorrect).toBe(false);
    expect(o.winner).toBe('table');
    expect(o.points).toEqual(points(FIVE, (id) => (id === 'p3' ? 0 : POINTS_TABLE_WIN)));
    expect(s.scores).toEqual({ p1: 1, p2: 1, p3: 0, p4: 1, p5: 1 });
    expect(s.history[0].winner).toBe('table');
  });

  it('(b2) an empty guess counts as wrong', () => {
    let s = voteAll(toVote(start(withPlayers(5))), allFor('p3', 'p1'));
    s = reduce(s, { type: 'SUBMIT_GUESS', guess: '   ' });
    expect(s.phase).toBe('results');
    expect(s.round!.outcome!.guessCorrect).toBe(false);
    expect(s.round!.outcome!.winner).toBe('table');
  });

  it('(c) wrong player caught -> Imposter wins 3 points, no guess phase', () => {
    const s = voteAll(toVote(start(withPlayers(5))), allFor('p1', 'p2'));
    expect(s.phase).toBe('results');
    const o = s.round!.outcome!;
    expect(o.votedOutId).toBe('p1');
    expect(o.tie).toBe(false);
    expect(o.imposterCaught).toBe(false);
    expect(o.guessCorrect).toBeNull();
    expect(o.winner).toBe('imposter');
    expect(o.points).toEqual(points(FIVE, (id) => (id === 'p3' ? POINTS_IMPOSTER_SURVIVES : 0)));
    expect(s.scores).toEqual({ p1: 0, p2: 0, p3: 3, p4: 0, p5: 0 });
    expect(s.round!.guess).toBeNull();
  });

  it('(d) a tie at the top means nobody is caught and the Imposter wins', () => {
    // p3: 2 votes, p1: 2 votes, p2: 1 vote.
    const ballots: Record<string, string> = { p1: 'p3', p2: 'p3', p3: 'p1', p4: 'p1', p5: 'p2' };
    const s = voteAll(toVote(start(withPlayers(5))), (v) => ballots[v]);
    expect(s.phase).toBe('results');
    const o = s.round!.outcome!;
    expect(o.tally).toEqual({ p3: 2, p1: 2, p2: 1 });
    expect(o.votedOutId).toBeNull();
    expect(o.tie).toBe(true);
    expect(o.imposterCaught).toBe(false);
    expect(o.winner).toBe('imposter');
    expect(o.points).toEqual(points(FIVE, (id) => (id === 'p3' ? POINTS_IMPOSTER_SURVIVES : 0)));
  });

  it('(e) imposterGuess=false: caught goes straight to results and the table wins', () => {
    const s = voteAll(toVote(start(withPlayers(5, { imposterGuess: false }))), allFor('p3', 'p1'));
    expect(s.phase).toBe('results');
    const o = s.round!.outcome!;
    expect(o.imposterCaught).toBe(true);
    expect(o.guessCorrect).toBeNull();
    expect(o.winner).toBe('table');
    expect(o.points).toEqual(points(FIVE, (id) => (id === 'p3' ? 0 : POINTS_TABLE_WIN)));
    expect(s.scores).toEqual({ p1: 1, p2: 1, p3: 0, p4: 1, p5: 1 });
  });

  it('discussionSeconds=0 goes from clues straight to vote', () => {
    const s = cluesAll(revealAll(start(withPlayers(5, { discussionSeconds: 0 }))));
    expect(s.phase).toBe('vote');
    expect(currentVoter(s)!.id).toBe('p1');
  });

  it('clueRounds=1 needs exactly one pass around the table', () => {
    let s = revealAll(start(withPlayers(5, { clueRounds: 1 })));
    for (let i = 0; i < 4; i++) s = reduce(s, { type: 'CLUE_NEXT' });
    expect(s.phase).toBe('clues');
    s = reduce(s, { type: 'CLUE_NEXT' });
    expect(s.phase).toBe('discussion');
  });

  it('clueOrder wraps around from a starter at the end of the table', () => {
    const s = start(withPlayers(5), { starterId: 'p5' });
    expect(clueOrder(s.round!)).toEqual(['p5', 'p1', 'p2', 'p3', 'p4']);
    expect(currentSpeaker(revealAll(s))!.id).toBe('p5');
  });
});

describe('settings during a round', () => {
  it('UPDATE_SETTINGS does not touch the frozen round.config but applies to the next START_ROUND', () => {
    let s = start(withPlayers(5));
    s = reduce(s, {
      type: 'UPDATE_SETTINGS',
      patch: { clueRounds: 1, discussionSeconds: 0, imposterGuess: false, penalty: 'drink' },
    });
    expect(s.settings.clueRounds).toBe(1);
    expect(s.round!.config).toEqual({
      clueRounds: 2,
      discussionSeconds: 60,
      imposterSeesCategory: true,
      imposterGuess: true,
      penalty: 'off',
    });

    // The running round still takes 2 x 5 clue turns and still has a discussion and a guess.
    s = revealAll(s);
    for (let i = 0; i < 9; i++) s = reduce(s, { type: 'CLUE_NEXT' });
    expect(s.phase).toBe('clues');
    s = reduce(s, { type: 'CLUE_NEXT' });
    expect(s.phase).toBe('discussion');
    s = reduce(s, { type: 'DISCUSSION_DONE' });
    s = voteAll(s, allFor('p3', 'p1'));
    expect(s.phase).toBe('guess');
    s = reduce(s, { type: 'SUBMIT_GUESS', guess: 'pizza' });
    expect(s.phase).toBe('results');

    // Next round picks up the new rules.
    s = start(s, { word: { ...WORD, word: 'Sushi' } });
    expect(s.phase).toBe('reveal');
    expect(s.round!.config).toEqual({
      clueRounds: 1,
      discussionSeconds: 0,
      imposterSeesCategory: true,
      imposterGuess: false,
      penalty: 'drink',
    });
    s = cluesAll(revealAll(s));
    expect(s.phase).toBe('vote');
    s = voteAll(s, allFor('p3', 'p1'));
    expect(s.phase).toBe('results');
    expect(s.round!.outcome!.winner).toBe('table');
  });

  it('sanitizeSettings clamps and defaults', () => {
    const base = DEFAULT_SETTINGS;
    expect(sanitizeSettings({ ...base, discussionSeconds: 10 }).discussionSeconds).toBe(30);
    expect(sanitizeSettings({ ...base, discussionSeconds: 500 }).discussionSeconds).toBe(180);
    expect(sanitizeSettings({ ...base, discussionSeconds: 0 }).discussionSeconds).toBe(0);
    expect(sanitizeSettings({ ...base, discussionSeconds: 45.4 }).discussionSeconds).toBe(45);
    expect(sanitizeSettings({ ...base, clueRounds: 7 as unknown as 2 }).clueRounds).toBe(2);
    expect(sanitizeSettings({ ...base, imposterCount: 3 as unknown as 2 }).imposterCount).toBe(1);
    expect(sanitizeSettings({ ...base, language: 'fr' as unknown as 'en' }).language).toBe('en');
    expect(sanitizeSettings({ ...base, categoryId: '' }).categoryId).toBe(RANDOM_CATEGORY);
    expect(sanitizeSettings({ ...base, difficulty: 'x' as unknown as 'easy' }).difficulty).toBe('normal');
    expect(sanitizeSettings({ ...base, revealMethod: 'x' as unknown as 'hold' }).revealMethod).toBe('lift');
    expect(sanitizeSettings({ ...base, penalty: 'x' as unknown as 'dare' }).penalty).toBe('off');
    expect(sanitizeSettings(base)).toEqual(base);
  });

  it('UPDATE_SETTINGS goes through sanitizeSettings', () => {
    const s = reduce(createInitialState(), { type: 'UPDATE_SETTINGS', patch: { discussionSeconds: 999 } });
    expect(s.settings.discussionSeconds).toBe(180);
  });
});

describe('across rounds', () => {
  function playRound(state: GameState, over: Partial<Omit<StartAction, 'type'>>, pick: (v: string) => string, guess?: string) {
    let s = voteAll(toVote(start(state, over)), pick);
    if (s.phase === 'guess') s = reduce(s, { type: 'SUBMIT_GUESS', guess: guess ?? 'wrong' });
    expect(s.phase).toBe('results');
    return s;
  }

  it('scores accumulate, history grows, usedWords records every word, START_ROUND is allowed from results', () => {
    let s = withPlayers(5);
    // Round 1: wrong player caught -> p3 +3.
    s = playRound(s, { imposterIds: ['p3'] }, allFor('p1', 'p2'));
    expect(s.scores).toEqual({ p1: 0, p2: 0, p3: 3, p4: 0, p5: 0 });
    // Round 2: Imposter p4 caught, wrong guess -> table +1 each.
    const sushi: WordRecord = { word: 'Sushi', category: 'food', difficulty: 2, aliases: [] };
    s = playRound(s, { imposterIds: ['p4'], word: sushi }, allFor('p4', 'p1'), 'sashimi');
    expect(s.scores).toEqual({ p1: 1, p2: 1, p3: 4, p4: 0, p5: 1 });
    expect(s.round!.number).toBe(2);
    expect(s.history.map((h) => [h.number, h.word, h.imposterIds, h.winner])).toEqual([
      [1, 'Pizza', ['p3'], 'imposter'],
      [2, 'Sushi', ['p4'], 'table'],
    ]);
    expect(s.usedWords).toEqual([wordKey('en', 'food', 'Pizza'), wordKey('en', 'food', 'Sushi')]);
    expect(scoreboard(s)).toEqual([
      { player: { id: 'p3', name: 'Player 3' }, score: 4 },
      { player: { id: 'p1', name: 'Player 1' }, score: 1 },
      { player: { id: 'p2', name: 'Player 2' }, score: 1 },
      { player: { id: 'p5', name: 'Player 5' }, score: 1 },
      { player: { id: 'p4', name: 'Player 4' }, score: 0 },
    ]);

    // Round 3 from results.
    const next = start(s, { imposterIds: ['p1'], word: { ...WORD, word: 'Taco' } });
    expect(next.phase).toBe('reveal');
    expect(next.round!.number).toBe(3);
    expect(next.scores).toEqual(s.scores);
    expect(next.usedWords).toHaveLength(3);
  });

  it('re-drawing an already used word does not duplicate the usedWords key', () => {
    let s = playRound(withPlayers(5), {}, allFor('p1', 'p2'));
    s = start(s);
    expect(s.usedWords).toEqual([wordKey('en', 'food', 'Pizza')]);
  });

  it('END_GAME clears scores, history and usedWords but keeps players and settings', () => {
    let s = playRound(withPlayers(5, { clueRounds: 3 }), {}, allFor('p1', 'p2'));
    s = reduce(s, { type: 'END_GAME' });
    expect(s.phase).toBe('setup');
    expect(s.round).toBeNull();
    expect(s.scores).toEqual({});
    expect(s.history).toEqual([]);
    expect(s.usedWords).toEqual([]);
    expect(s.players.map((p) => p.id)).toEqual(FIVE);
    expect(s.settings.clueRounds).toBe(3);
    // A fresh game starts at round 1 again.
    expect(start(s).round!.number).toBe(1);
  });

  it('EDIT_PLAYERS returns to setup keeping scores, history and usedWords', () => {
    let s = playRound(withPlayers(5), {}, allFor('p1', 'p2'));
    const { scores, history, usedWords } = s;
    s = reduce(s, { type: 'EDIT_PLAYERS' });
    expect(s.phase).toBe('setup');
    expect(s.round).toBeNull();
    expect(s.scores).toEqual(scores);
    expect(s.history).toEqual(history);
    expect(s.usedWords).toEqual(usedWords);
    // Editing is possible again and the next round is numbered after the history.
    s = reduce(s, { type: 'ADD_PLAYER', id: 'p6', name: 'Player 6' });
    expect(s.players).toHaveLength(6);
    expect(start(s).round!.number).toBe(2);
  });

  it('ABORT_ROUND mid-round returns to setup keeping scores; the aborted round is not in history', () => {
    let s = playRound(withPlayers(5), {}, allFor('p1', 'p2'));
    s = reduce(toVote(start(s)), { type: 'CAST_VOTE', voterId: 'p1', votedId: 'p2' });
    expect(s.phase).toBe('vote');
    s = reduce(s, { type: 'ABORT_ROUND' });
    expect(s.phase).toBe('setup');
    expect(s.round).toBeNull();
    expect(s.scores).toEqual({ p1: 0, p2: 0, p3: 3, p4: 0, p5: 0 });
    expect(s.history).toHaveLength(1);
    expect(reduce(s, { type: 'REMOVE_PLAYER', id: 'p5' }).players).toHaveLength(4);
  });

  it('LOAD replaces the state wholesale', () => {
    const loaded = withPlayers(6);
    expect(reduce(createInitialState(), { type: 'LOAD', state: loaded })).toBe(loaded);
  });
});

describe('two Imposters', () => {
  const SEVEN = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'];
  const seven = () => withPlayers(7, { imposterCount: 2 });
  const two = { imposterIds: ['p2', 'p5'], starterId: 'p1' };

  it('effective count is 2 and both are marked as Imposters', () => {
    const s = start(seven(), two);
    expect(effectiveImposterCount(s.settings, s.players.length)).toBe(2);
    expect(s.round!.imposterIds).toEqual(['p2', 'p5']);
  });

  it('the voted-out Imposter guesses; a correct guess scores both Imposters', () => {
    let s = voteAll(toVote(start(seven(), two)), allFor('p5', 'p1'));
    expect(s.phase).toBe('guess');
    expect(guessingImposter(s)!.id).toBe('p5');
    s = reduce(s, { type: 'SUBMIT_GUESS', guess: 'pizza pie' });
    expect(s.phase).toBe('results');
    expect(s.round!.outcome!.winner).toBe('imposter');
    expect(s.round!.outcome!.points).toEqual(
      points(SEVEN, (id) => (id === 'p2' || id === 'p5' ? POINTS_IMPOSTER_GUESSES : 0)),
    );
    expect(s.history[0].imposterIds).toEqual(['p2', 'p5']);
  });

  it('a wrong guess gives the table a point each, nothing to either Imposter', () => {
    let s = voteAll(toVote(start(seven(), two)), allFor('p2', 'p1'));
    expect(guessingImposter(s)!.id).toBe('p2');
    s = reduce(s, { type: 'SUBMIT_GUESS', guess: 'burger' });
    expect(s.round!.outcome!.winner).toBe('table');
    expect(s.round!.outcome!.points).toEqual(
      points(SEVEN, (id) => (id === 'p2' || id === 'p5' ? 0 : POINTS_TABLE_WIN)),
    );
  });

  it('when neither is caught both Imposters survive with 3 points', () => {
    const s = voteAll(toVote(start(seven(), two)), allFor('p7', 'p1'));
    expect(s.phase).toBe('results');
    expect(s.round!.outcome!.imposterCaught).toBe(false);
    expect(s.round!.outcome!.points).toEqual(
      points(SEVEN, (id) => (id === 'p2' || id === 'p5' ? POINTS_IMPOSTER_SURVIVES : 0)),
    );
  });

  it('guessingImposter is undefined outside the guess phase', () => {
    const s = start(seven(), two);
    expect(guessingImposter(s)).toBeUndefined();
    expect(guessingImposter(toVote(s))).toBeUndefined();
  });
});

describe('selectors', () => {
  it('playerName falls back to ? for unknown ids', () => {
    expect(playerName(withPlayers(2), 'p1')).toBe('Player 1');
    expect(playerName(withPlayers(2), 'nobody')).toBe('?');
  });

  it('ballotFor is empty without a round and excludes the voter', () => {
    expect(ballotFor(withPlayers(5), 'p1')).toEqual([]);
    const s = start(withPlayers(5));
    expect(ballotFor(s, 'p3').map((p) => p.id)).toEqual(['p1', 'p2', 'p4', 'p5']);
  });

  it('scoreboard sorts by score desc then by name and defaults missing scores to 0', () => {
    const s: GameState = { ...withPlayers(3), scores: { p3: 2, p2: 2 } };
    expect(scoreboard(s).map((e) => [e.player.id, e.score])).toEqual([
      ['p2', 2],
      ['p3', 2],
      ['p1', 0],
    ]);
  });

  it('tallyVotes finds a plurality winner or flags a tie', () => {
    expect(tallyVotes({ a: 'x', b: 'x', c: 'y' })).toEqual({ tally: { x: 2, y: 1 }, top: 'x', tie: false });
    expect(tallyVotes({ a: 'x', b: 'y', c: 'z' })).toEqual({ tally: { x: 1, y: 1, z: 1 }, top: null, tie: true });
    // A tie below the top does not matter.
    expect(tallyVotes({ a: 'x', b: 'x', c: 'x', d: 'y', e: 'z' })).toEqual({
      tally: { x: 3, y: 1, z: 1 },
      top: 'x',
      tie: false,
    });
    // A later higher count clears an earlier tie.
    expect(tallyVotes({ a: 'y', b: 'z', c: 'x', d: 'x' })).toEqual({ tally: { y: 1, z: 1, x: 2 }, top: 'x', tie: false });
    expect(tallyVotes({})).toEqual({ tally: {}, top: null, tie: false });
  });
});

// ---------------------------------------------------------------------------
// drawWord
// ---------------------------------------------------------------------------

describe('drawWord', () => {
  const food = levelledPack('food', 'en', 4);
  const places = levelledPack('places', 'en', 4);
  const heFood = levelledPack('food', 'he', 4);
  const packs = [food, places, heFood];
  const settings = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over });

  it('respects the chosen category and language', () => {
    const rng = seededRng(1);
    for (let i = 0; i < 200; i++) {
      const d = drawWord(packs, settings({ categoryId: 'places' }), [], rng);
      expect(d.pack).toBe(places);
      expect(d.word.category).toBe('places');
      expect(d.recycled).toBe(false);
    }
    for (let i = 0; i < 50; i++) {
      const d = drawWord(packs, settings({ language: 'he', categoryId: 'food' }), [], rng);
      expect(d.pack).toBe(heFood);
    }
  });

  it('Random is category-first: a tiny pack is drawn as often as a big one', () => {
    const tiny = mkPack('tiny', 'en', [['only', 1]]);
    const big = levelledPack('big', 'en', 40);
    const rng = seededRng(7);
    let tinyCount = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const d = drawWord([tiny, big], settings({ categoryId: RANDOM_CATEGORY }), [], rng);
      if (d.pack.id === 'tiny') tinyCount++;
    }
    expect(tinyCount / N).toBeGreaterThan(0.42);
    expect(tinyCount / N).toBeLessThan(0.58);
  });

  it('never repeats a used word until the category is exhausted, relaxing difficulty before recycling', () => {
    const pack = mkPack('mini', 'en', [
      ['a1', 1],
      ['b1', 1],
      ['a2', 2],
      ['b2', 2],
      ['a3', 3],
      ['b3', 3],
    ]);
    const rng = seededRng(3);
    const used: string[] = [];
    const drawn: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = drawWord([pack], settings({ categoryId: 'mini', difficulty: 'normal' }), used, rng);
      expect(d.recycled).toBe(false);
      expect(drawn).not.toContain(d.word.word);
      // Normal = {1,2} first; only once those four are gone are the level-3 words used.
      if (i < 4) expect([1, 2]).toContain(d.word.difficulty);
      else expect(d.word.difficulty).toBe(3);
      drawn.push(d.word.word);
      used.push(wordKey(pack.lang, pack.id, d.word.word));
    }
    expect([...drawn].sort()).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);

    // Everything used: recycle, preferring the configured difficulty again.
    const again = drawWord([pack], settings({ categoryId: 'mini', difficulty: 'normal' }), used, rng);
    expect(again.recycled).toBe(true);
    expect([1, 2]).toContain(again.word.difficulty);
  });

  it('Random skips exhausted categories and only recycles when every category is dry', () => {
    const tiny = mkPack('tiny', 'en', [['only', 1]]);
    const other = mkPack('other', 'en', [
      ['x', 1],
      ['y', 1],
    ]);
    const rng = seededRng(11);
    const used = [wordKey('en', 'tiny', 'only')];
    for (let i = 0; i < 100; i++) {
      const d = drawWord([tiny, other], settings({ categoryId: RANDOM_CATEGORY, difficulty: 'easy' }), used, rng);
      expect(d.pack.id).toBe('other');
      expect(d.recycled).toBe(false);
    }
    const allUsed = [...used, wordKey('en', 'other', 'x'), wordKey('en', 'other', 'y')];
    const d = drawWord([tiny, other], settings({ categoryId: RANDOM_CATEGORY, difficulty: 'easy' }), allUsed, rng);
    expect(d.recycled).toBe(true);
  });

  it.each([
    ['easy', [1]],
    ['normal', [1, 2]],
    ['hard', [2, 3]],
  ] as const)('difficulty %s draws only levels %j', (difficulty, levels) => {
    const rng = seededRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const d = drawWord(packs, settings({ difficulty, categoryId: RANDOM_CATEGORY }), [], rng);
      expect(levels).toContain(d.word.difficulty);
      seen.add(d.word.difficulty);
    }
    expect([...seen].sort()).toEqual([...levels]);
  });

  it('relaxes the difficulty filter when the level is empty rather than recycling', () => {
    const hardOnly = mkPack('hard', 'en', [
      ['h1', 3],
      ['h2', 3],
    ]);
    const rng = seededRng(9);
    const d = drawWord([hardOnly], settings({ categoryId: 'hard', difficulty: 'easy' }), [], rng);
    expect(d.word.difficulty).toBe(3);
    expect(d.recycled).toBe(false);
    // With one of the two used, the unused one is preferred over recycling.
    const d2 = drawWord([hardOnly], settings({ categoryId: 'hard', difficulty: 'easy' }), [wordKey('en', 'hard', 'h1')], rng);
    expect(d2.word.word).toBe('h2');
    expect(d2.recycled).toBe(false);
  });

  it('falls back to all packs of the language for an unknown category id', () => {
    const rng = seededRng(2);
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) ids.add(drawWord(packs, settings({ categoryId: 'nope' }), [], rng).pack.id);
    expect([...ids].sort()).toEqual(['food', 'places']);
  });

  it('throws when there are no packs for the language', () => {
    expect(() => drawWord([heFood], settings({ language: 'en' }), [], seededRng(1))).toThrow(/No word packs/);
    expect(() => drawWord([], settings({}), [], seededRng(1))).toThrow(/No word packs/);
    const empty: WordPack = { id: 'empty', name: 'Empty', lang: 'en', words: [] };
    expect(() => drawWord([empty], settings({}), [], seededRng(1))).toThrow(/No word packs/);
  });

  it('is deterministic for a given seed', () => {
    const a = drawWord(packs, settings({}), [], seededRng(123));
    const b = drawWord(packs, settings({}), [], seededRng(123));
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// chooseImposters / prepareRound
// ---------------------------------------------------------------------------

describe('chooseImposters', () => {
  const players = (n: number): Player[] => Array.from({ length: n }, (_, i) => ({ id: pid(i + 1), name: `N${i + 1}` }));
  const entry = (number: number, imposterIds: string[]): HistoryEntry => ({
    number,
    word: 'w',
    categoryId: 'c',
    imposterIds,
    winner: 'table',
  });

  it('never picks the previous round Imposter with 5+ players', () => {
    for (const n of [5, 7, 10]) {
      const rng = seededRng(100 + n);
      const history: HistoryEntry[] = [];
      for (let round = 1; round <= 400; round++) {
        const chosen = chooseImposters(players(n), history, 1, rng);
        expect(chosen).toHaveLength(1);
        const prev = history[history.length - 1]?.imposterIds ?? [];
        expect(prev).not.toContain(chosen[0]);
        history.push(entry(round, chosen));
      }
    }
  });

  it('may repeat with 4 players (and still picks everyone eventually)', () => {
    const rng = seededRng(4);
    const history: HistoryEntry[] = [];
    let repeats = 0;
    const seen = new Set<string>();
    for (let round = 1; round <= 400; round++) {
      const chosen = chooseImposters(players(4), history, 1, rng);
      const prev = history[history.length - 1]?.imposterIds ?? [];
      if (prev.includes(chosen[0])) repeats++;
      seen.add(chosen[0]);
      history.push(entry(round, chosen));
    }
    expect(repeats).toBeGreaterThan(0);
    // The previous Imposter has half weight: 0.5 / 3.5 ~ 14% of rounds.
    expect(repeats / 400).toBeGreaterThan(0.06);
    expect(repeats / 400).toBeLessThan(0.25);
    expect(seen.size).toBe(4);
  });

  it('halves the weight of the Imposter from two rounds ago', () => {
    const rng = seededRng(21);
    const history = [entry(1, ['p1']), entry(2, ['p2'])];
    const counts: Record<string, number> = {};
    const N = 7000;
    for (let i = 0; i < N; i++) {
      const [c] = chooseImposters(players(5), history, 1, rng);
      counts[c] = (counts[c] ?? 0) + 1;
    }
    expect(counts.p2 ?? 0).toBe(0);
    // weights p1=0.5, p3=p4=p5=1 -> p1 ~ 1/7, others ~ 2/7
    expect(counts.p1 / N).toBeGreaterThan(0.1);
    expect(counts.p1 / N).toBeLessThan(0.19);
    for (const id of ['p3', 'p4', 'p5']) {
      expect(counts[id] / N).toBeGreaterThan(0.24);
      expect(counts[id] / N).toBeLessThan(0.33);
    }
  });

  it('returns two distinct ids for count=2, never the previous Imposters', () => {
    const rng = seededRng(77);
    const history: HistoryEntry[] = [];
    for (let round = 1; round <= 300; round++) {
      const chosen = chooseImposters(players(7), history, 2, rng);
      expect(chosen).toHaveLength(2);
      expect(chosen[0]).not.toBe(chosen[1]);
      const prev = history[history.length - 1]?.imposterIds ?? [];
      for (const id of chosen) expect(prev).not.toContain(id);
      history.push(entry(round, chosen));
    }
  });

  it('picks everyone with roughly equal frequency with no history', () => {
    const rng = seededRng(8);
    const counts: Record<string, number> = {};
    const N = 5000;
    for (let i = 0; i < N; i++) {
      const [c] = chooseImposters(players(5), [], 1, rng);
      counts[c] = (counts[c] ?? 0) + 1;
    }
    for (const id of FIVE) {
      expect(counts[id] / N).toBeGreaterThan(0.17);
      expect(counts[id] / N).toBeLessThan(0.23);
    }
  });
});

describe('prepareRound', () => {
  const packs = [levelledPack('food', 'en', 20), levelledPack('places', 'en', 20)];

  it('throws without enough players', () => {
    expect(() => prepareRound(withPlayers(3), packs, seededRng(1))).toThrow(/4-10/);
  });

  it('builds a START_ROUND action the reducer accepts', () => {
    const s = withPlayers(5);
    const action = prepareRound(s, packs, seededRng(1));
    expect(action.type).toBe('START_ROUND');
    expect(action.imposterIds).toHaveLength(1);
    expect(s.players.map((p) => p.id)).toContain(action.imposterIds[0]);
    expect(s.players.map((p) => p.id)).toContain(action.starterId);
    expect(['food', 'places']).toContain(action.categoryId);
    expect(action.categoryName).toBe(action.categoryId);
    const next = reduce(s, action);
    expect(next.phase).toBe('reveal');
    expect(next.usedWords).toEqual([wordKey('en', action.categoryId, action.word.word)]);
  });

  it('uses two Imposters only when enabled and the table is big enough', () => {
    expect(prepareRound(withPlayers(7, { imposterCount: 2 }), packs, seededRng(1)).imposterIds).toHaveLength(2);
    expect(prepareRound(withPlayers(6, { imposterCount: 2 }), packs, seededRng(1)).imposterIds).toHaveLength(1);
    expect(prepareRound(withPlayers(7), packs, seededRng(1)).imposterIds).toHaveLength(1);
  });

  it('starter is uniform and is the Imposter no more often than chance (chi-square sanity bound)', () => {
    const s = withPlayers(5);
    const rng = seededRng(2024);
    const N = 5000;
    const counts: Record<string, number> = Object.fromEntries(FIVE.map((id) => [id, 0]));
    let starterIsImposter = 0;
    for (let i = 0; i < N; i++) {
      const a = prepareRound(s, packs, rng);
      counts[a.starterId]++;
      if (a.imposterIds.includes(a.starterId)) starterIsImposter++;
    }
    const expected = N / FIVE.length;
    const chi2 = FIVE.reduce((sum, id) => sum + (counts[id] - expected) ** 2 / expected, 0);
    // df = 4; 18.47 is the 99.9% critical value.
    expect(chi2).toBeLessThan(18.47);
    expect(starterIsImposter / N).toBeGreaterThan(0.16);
    expect(starterIsImposter / N).toBeLessThan(0.24);
  });

  it('never draws a used word while the packs have unused ones', () => {
    let s = withPlayers(5, { categoryId: 'food' });
    const rng = seededRng(55);
    const food = packs[0];
    for (let i = 0; i < food.words.length; i++) {
      const a = prepareRound(s, packs, rng);
      expect(s.usedWords).not.toContain(wordKey('en', 'food', a.word.word));
      s = reduce(s, a);
      // Fast-forward: end the round so START_ROUND is allowed again.
      s = reduce(s, { type: 'ABORT_ROUND' });
    }
    expect(s.usedWords).toHaveLength(food.words.length);
  });
});

// ---------------------------------------------------------------------------
// isGameState
// ---------------------------------------------------------------------------

describe('isGameState', () => {
  it('accepts createInitialState() and a mid-round state', () => {
    expect(isGameState(createInitialState())).toBe(true);
    expect(isGameState(start(withPlayers(5)))).toBe(true);
    expect(isGameState(JSON.parse(JSON.stringify(toVote(start(withPlayers(5))))))).toBe(true);
  });

  it('rejects garbage', () => {
    const good = createInitialState();
    for (const bad of [
      null,
      undefined,
      42,
      'state',
      [],
      {},
      { ...good, version: 2 },
      { ...good, phase: 'bogus' },
      { ...good, players: 'none' },
      { ...good, players: [{ id: 1, name: 'x' }] },
      { ...good, players: [null] },
      { ...good, settings: null },
      { ...good, scores: null },
      { ...good, history: {} },
      { ...good, usedWords: 'x' },
      { ...good, round: {} },
      { ...good, round: 'none' },
    ]) {
      expect(isGameState(bad)).toBe(false);
    }
  });
});
