// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY_LAST_PLAYERS, STORAGE_KEY_STATE } from './constants';
import { createInitialState, reduce } from './engine';
import { GameProvider, useGameState } from './store';
import type { GameState } from './types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Renders a GameProvider and exposes the latest state it provides. */
function mount(): { current: () => GameState; unmount: () => void } {
  let latest: GameState | null = null;
  function Probe() {
    latest = useGameState();
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <GameProvider>
        <Probe />
      </GameProvider>,
    );
  });
  return {
    current: () => latest!,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function midRoundState(): GameState {
  let s = createInitialState({ language: 'en' });
  for (const [id, name] of [
    ['a', 'Dana'],
    ['b', 'Yossi'],
    ['c', 'Noa'],
    ['d', 'Omri'],
  ] as const) {
    s = reduce(s, { type: 'ADD_PLAYER', id, name });
  }
  return reduce(s, {
    type: 'START_ROUND',
    word: { word: 'Pizza', category: 'food', difficulty: 1, aliases: [] },
    categoryId: 'food',
    categoryName: 'Food',
    imposterIds: ['c'],
    starterId: 'b',
  });
}

function fireStorage(key: string | null, newValue: string | null): void {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }));
  });
}

let mounted: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  localStorage.clear();
});

describe('GameProvider boot', () => {
  it('resumes the stored snapshot without re-adding last game players', () => {
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify({ ...createInitialState(), players: [] }));
    localStorage.setItem(STORAGE_KEY_LAST_PLAYERS, JSON.stringify(['Dana', 'Yossi']));
    mounted = mount();
    expect(mounted.current().players).toEqual([]);
  });

  it('pre-fills last game players once when there is no snapshot', () => {
    localStorage.setItem(STORAGE_KEY_LAST_PLAYERS, JSON.stringify(['Dana', 'dana', 'Yossi', '']));
    mounted = mount();
    const players = mounted.current().players;
    expect(players.map((p) => p.name)).toEqual(['Dana', 'Yossi']);
    expect(new Set(players.map((p) => p.id)).size).toBe(2);
    expect(mounted.current().phase).toBe('setup');
    // The boot state is snapshotted right away, so the next boot resumes it instead of re-prefilling.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY_STATE)!).players).toHaveLength(2);
  });

  it('starts empty when neither a snapshot nor last players exist', () => {
    mounted = mount();
    expect(mounted.current().players).toEqual([]);
  });
});

describe('GameProvider cross-window sync', () => {
  it('adopts a snapshot written by another window', () => {
    mounted = mount();
    expect(mounted.current().phase).toBe('setup');

    const other = midRoundState();
    const json = JSON.stringify(other);
    localStorage.setItem(STORAGE_KEY_STATE, json);
    fireStorage(STORAGE_KEY_STATE, json);

    expect(mounted.current().phase).toBe('reveal');
    expect(mounted.current().players.map((p) => p.name)).toEqual(['Dana', 'Yossi', 'Noa', 'Omri']);
    expect(mounted.current().round!.word.word).toBe('Pizza');
    // Re-saving the adopted snapshot writes the identical string, so the other window gets no echo.
    expect(localStorage.getItem(STORAGE_KEY_STATE)).toBe(json);
  });

  it('ignores other keys and unreadable snapshots', () => {
    mounted = mount();
    const before = mounted.current();

    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(midRoundState()));
    fireStorage(STORAGE_KEY_LAST_PLAYERS, '["x"]');
    expect(mounted.current()).toBe(before);

    localStorage.setItem(STORAGE_KEY_STATE, '{broken');
    fireStorage(STORAGE_KEY_STATE, '{broken');
    expect(mounted.current()).toBe(before);

    localStorage.removeItem(STORAGE_KEY_STATE);
    fireStorage(STORAGE_KEY_STATE, null);
    expect(mounted.current()).toBe(before);
  });
});
