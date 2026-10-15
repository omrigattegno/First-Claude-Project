import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY_LAST_PLAYERS, STORAGE_KEY_SETTINGS, STORAGE_KEY_STATE } from './constants';
import { createInitialState, DEFAULT_SETTINGS, reduce } from './engine';
import {
  clearSnapshot,
  detectLanguage,
  loadLastPlayers,
  loadSavedSettings,
  loadSnapshot,
  saveSnapshot,
} from './storage';
import type { GameState } from './types';

// ---------------------------------------------------------------------------
// Fake localStorage (vitest runs these in the node environment)
// ---------------------------------------------------------------------------

class FakeStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

const g = globalThis as { localStorage?: Storage; navigator?: unknown };
let fake: FakeStorage;

function installStorage(storage: Storage | undefined): void {
  if (storage) Object.defineProperty(g, 'localStorage', { value: storage, configurable: true, writable: true });
  else Reflect.deleteProperty(g, 'localStorage');
}

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeAll(() => {
  fake = new FakeStorage();
  installStorage(fake);
});

beforeEach(() => {
  fake.clear();
  installStorage(fake);
});

afterAll(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(g, 'localStorage');
});

function sampleState(): GameState {
  let s = createInitialState({ language: 'he', clueRounds: 3, discussionSeconds: 90 });
  for (const [id, name] of [
    ['a', 'Dana'],
    ['b', 'Yossi'],
    ['c', 'Noa'],
    ['d', 'Omri'],
    ['e', 'Tal'],
  ] as const) {
    s = reduce(s, { type: 'ADD_PLAYER', id, name });
  }
  s = reduce(s, {
    type: 'START_ROUND',
    word: { word: 'פיצה', category: 'food', difficulty: 1, aliases: [] },
    categoryId: 'food',
    categoryName: 'אוכל',
    imposterIds: ['c'],
    starterId: 'b',
  });
  s = reduce(s, { type: 'REVEAL_NEXT' });
  return { ...s, scores: { a: 2, c: 3 } };
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

describe('saveSnapshot / loadSnapshot', () => {
  it('round-trips a mid-round state', () => {
    const state = sampleState();
    saveSnapshot(state);
    expect(fake.getItem(STORAGE_KEY_STATE)).not.toBeNull();
    const loaded = loadSnapshot();
    expect(loaded).toEqual(state);
    expect(loaded).not.toBe(state);
  });

  it('round-trips the initial state', () => {
    const state = createInitialState();
    saveSnapshot(state);
    expect(loadSnapshot()).toEqual(state);
  });

  it('returns null when nothing is stored', () => {
    expect(loadSnapshot()).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    fake.setItem(STORAGE_KEY_STATE, '{not json');
    expect(loadSnapshot()).toBeNull();
    fake.setItem(STORAGE_KEY_STATE, '');
    expect(loadSnapshot()).toBeNull();
  });

  it('returns null for JSON that is not a GameState', () => {
    for (const bad of ['null', '42', '"state"', '[]', '{}', '{"version":1}', JSON.stringify({ ...createInitialState(), version: 2 })]) {
      fake.setItem(STORAGE_KEY_STATE, bad);
      expect(loadSnapshot()).toBeNull();
    }
  });

  it('sanitises the stored settings and fills in missing keys', () => {
    const state = createInitialState();
    const stored = {
      ...state,
      settings: { language: 'he', discussionSeconds: 999, clueRounds: 9 },
    };
    fake.setItem(STORAGE_KEY_STATE, JSON.stringify(stored));
    const loaded = loadSnapshot()!;
    expect(loaded.settings).toEqual({ ...DEFAULT_SETTINGS, language: 'he', discussionSeconds: 180, clueRounds: 2 });
  });

  it('also stores settings and last player names', () => {
    const state = sampleState();
    saveSnapshot(state);
    expect(JSON.parse(fake.getItem(STORAGE_KEY_SETTINGS)!)).toEqual(state.settings);
    expect(JSON.parse(fake.getItem(STORAGE_KEY_LAST_PLAYERS)!)).toEqual(['Dana', 'Yossi', 'Noa', 'Omri', 'Tal']);
  });

  it('keeps the last players when saving a state with no players', () => {
    saveSnapshot(sampleState());
    saveSnapshot(createInitialState());
    expect(loadLastPlayers()).toEqual(['Dana', 'Yossi', 'Noa', 'Omri', 'Tal']);
  });

  it('clearSnapshot removes only the state', () => {
    saveSnapshot(sampleState());
    clearSnapshot();
    expect(loadSnapshot()).toBeNull();
    expect(fake.getItem(STORAGE_KEY_STATE)).toBeNull();
    expect(loadLastPlayers()).toHaveLength(5);
    expect(loadSavedSettings()).not.toBeNull();
  });
});

describe('loadLastPlayers', () => {
  it('returns [] when missing or corrupt', () => {
    expect(loadLastPlayers()).toEqual([]);
    fake.setItem(STORAGE_KEY_LAST_PLAYERS, 'nope');
    expect(loadLastPlayers()).toEqual([]);
    fake.setItem(STORAGE_KEY_LAST_PLAYERS, '{"a":1}');
    expect(loadLastPlayers()).toEqual([]);
  });

  it('keeps only strings', () => {
    fake.setItem(STORAGE_KEY_LAST_PLAYERS, JSON.stringify(['Dana', 3, null, 'Noa', { x: 1 }]));
    expect(loadLastPlayers()).toEqual(['Dana', 'Noa']);
  });
});

describe('loadSavedSettings', () => {
  it('returns null when missing or corrupt', () => {
    expect(loadSavedSettings()).toBeNull();
    fake.setItem(STORAGE_KEY_SETTINGS, '{bad');
    expect(loadSavedSettings()).toBeNull();
  });

  it('merges over the defaults and sanitises', () => {
    fake.setItem(STORAGE_KEY_SETTINGS, JSON.stringify({ language: 'he', discussionSeconds: 5, penalty: 'drink' }));
    expect(loadSavedSettings()).toEqual({ ...DEFAULT_SETTINGS, language: 'he', discussionSeconds: 30, penalty: 'drink' });
  });
});

describe('without a working localStorage', () => {
  it('is a no-op when localStorage is missing', () => {
    installStorage(undefined);
    expect(() => saveSnapshot(sampleState())).not.toThrow();
    expect(loadSnapshot()).toBeNull();
    expect(loadLastPlayers()).toEqual([]);
    expect(loadSavedSettings()).toBeNull();
    expect(() => clearSnapshot()).not.toThrow();
  });

  it('swallows storage errors (quota, blocked)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
      clear: () => {},
      key: () => null,
      length: 0,
    } as unknown as Storage;
    installStorage(throwing);
    expect(() => saveSnapshot(sampleState())).not.toThrow();
    expect(loadSnapshot()).toBeNull();
    expect(loadLastPlayers()).toEqual([]);
    expect(loadSavedSettings()).toBeNull();
    expect(() => clearSnapshot()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// detectLanguage
// ---------------------------------------------------------------------------

describe('detectLanguage', () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  function setNavigator(value: unknown): void {
    if (value === undefined) Reflect.deleteProperty(g, 'navigator');
    else Object.defineProperty(g, 'navigator', { value, configurable: true, writable: true });
  }

  afterEach(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(g, 'navigator');
  });

  it('is Hebrew when any preferred language is Hebrew', () => {
    setNavigator({ languages: ['he-IL', 'en-US'], language: 'he-IL' });
    expect(detectLanguage()).toBe('he');
    setNavigator({ languages: ['en-US', 'he'], language: 'en-US' });
    expect(detectLanguage()).toBe('he');
    setNavigator({ languages: ['HE-IL'], language: 'HE-IL' });
    expect(detectLanguage()).toBe('he');
  });

  it('is English otherwise', () => {
    setNavigator({ languages: ['en-US', 'fr'], language: 'en-US' });
    expect(detectLanguage()).toBe('en');
    setNavigator({ languages: ['de'], language: 'de' });
    expect(detectLanguage()).toBe('en');
  });

  it('falls back to navigator.language when languages is missing', () => {
    setNavigator({ language: 'he' });
    expect(detectLanguage()).toBe('he');
    setNavigator({ language: 'en' });
    expect(detectLanguage()).toBe('en');
  });

  it('is English with no navigator or garbage entries', () => {
    setNavigator(undefined);
    expect(detectLanguage()).toBe('en');
    setNavigator({ languages: [null, 42, 'he-IL'] });
    expect(detectLanguage()).toBe('he');
    setNavigator({});
    expect(detectLanguage()).toBe('en');
  });
});
