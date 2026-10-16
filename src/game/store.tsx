/**
 * React binding for the game engine: a reducer-backed context with a
 * localStorage snapshot after every change so a refresh mid-round resumes.
 * Another window sharing the storage (a browser tab next to the installed app)
 * is followed through the 'storage' event so both show the same round.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from 'react';
import { STORAGE_KEY_STATE } from './constants';
import { createInitialState, prepareRound, reduce, validatePlayerName, type NameError } from './engine';
import { cryptoRng, newId } from './rng';
import { detectLanguage, loadLastPlayers, loadSavedSettings, loadSnapshot, saveSnapshot } from './storage';
import type { Action, GameState, WordPack } from './types';
import { packsFor } from '../words';
import { subscribeCustomPacks } from '../words/custom';
import { useSyncExternalStore } from 'react';

export interface GameApi {
  state: GameState;
  dispatch: Dispatch<Action>;
  /** Draw a word, choose Imposters and starter, then dispatch START_ROUND. */
  startRound: () => void;
  /** Validate + add a player; returns the error code or null on success. */
  addPlayer: (name: string) => NameError | null;
  /** Packs available for the current language (built-in + custom). */
  packs: WordPack[];
}

const StateContext = createContext<GameState | null>(null);
const ApiContext = createContext<GameApi | null>(null);

function bootState(): GameState {
  const snapshot = loadSnapshot();
  if (snapshot) return snapshot;
  const saved = loadSavedSettings();
  const fresh = createInitialState(saved ?? { language: detectLanguage() });
  // No snapshot to resume: pre-fill last game's names so a regular group starts in seconds. This
  // happens once per boot, so a list the host clears on Setup stays cleared until the next launch.
  const names = loadLastPlayers();
  if (names.length === 0) return fresh;
  return reduce(fresh, { type: 'SET_PLAYERS', players: names.map((name) => ({ id: newId(), name })) });
}

let customVersion = 0;
const subscribeCustom = (cb: () => void) =>
  subscribeCustomPacks(() => {
    customVersion++;
    cb();
  });
const getCustomVersion = () => customVersion;

export function GameProvider({ children, initialState }: { children: ReactNode; initialState?: GameState }) {
  const [state, dispatch] = useReducer(reduce, initialState, (init) => init ?? bootState());
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    saveSnapshot(state);
  }, [state]);

  // A snapshot written by another window: adopt it. Our own writes never raise this event, and
  // re-saving an adopted snapshot writes the same string, so two windows settle without looping.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY_STATE) return;
      const snapshot = loadSnapshot();
      if (snapshot) dispatch({ type: 'LOAD', state: snapshot });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const version = useSyncExternalStore(subscribeCustom, getCustomVersion, getCustomVersion);
  const packs = useMemo(() => packsFor(state.settings.language), [state.settings.language, version]);
  const packsRef = useRef(packs);
  packsRef.current = packs;

  const startRound = useCallback(() => {
    const s = stateRef.current;
    dispatch(prepareRound(s, packsRef.current, cryptoRng));
  }, []);

  const addPlayer = useCallback((name: string): NameError | null => {
    const err = validatePlayerName(stateRef.current.players, name);
    if (err) return err;
    dispatch({ type: 'ADD_PLAYER', id: newId(), name });
    return null;
  }, []);

  const api = useMemo<GameApi>(
    () => ({ state, dispatch, startRound, addPlayer, packs }),
    [state, startRound, addPlayer, packs],
  );

  return (
    <StateContext.Provider value={state}>
      <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
    </StateContext.Provider>
  );
}

export function useGameState(): GameState {
  const s = useContext(StateContext);
  if (!s) throw new Error('useGameState must be used inside <GameProvider>');
  return s;
}

export function useGame(): GameApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useGame must be used inside <GameProvider>');
  return api;
}
