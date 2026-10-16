/**
 * Screen navigation outside the game phase machine. 'game' renders the screen
 * for the current `state.phase`; the others are pre-game/overlay screens.
 *
 * Platform back (Android back button/gesture, browser back, iOS edge swipe): while the in-app stack has
 * more than one screen, one guard entry sits above the real history entry, so Back pops a screen instead
 * of leaving the app, and the guard is re-armed as long as screens remain below. At the root nothing is
 * pushed, so Back leaves the app as usual (a guard left over from an in-app Back is consumed first).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type Screen = 'home' | 'howto' | 'setup' | 'settings' | 'game';

export interface Nav {
  screen: Screen;
  /** Navigate to a screen, pushing the current one onto the back stack. */
  go: (screen: Screen) => void;
  /** Replace the stack with a single screen. */
  reset: (screen: Screen) => void;
  /** Pop to the previous screen (falls back to `fallback`, default 'home'). */
  back: (fallback?: Screen) => void;
}

const NavContext = createContext<Nav | null>(null);

/** Marker carried by the guard history entry (`history.state` survives a reload). */
const GUARD_STATE = { imposterNav: true };

const hasHistory = (): boolean => typeof window !== 'undefined' && typeof window.history?.pushState === 'function';

const guardArmed = (): boolean => (window.history.state as { imposterNav?: boolean } | null)?.imposterNav === true;

/** Push the guard entry unless the current entry already is one (idempotent: StrictMode and reload safe). */
function armGuard(): void {
  if (guardArmed()) return;
  try {
    window.history.pushState(GUARD_STATE, '');
  } catch {
    /* sandboxed or rate-limited history: Back simply behaves as before */
  }
}

export function NavProvider({ children, initial = 'home' }: { children: ReactNode; initial?: Screen }) {
  const [stack, setStack] = useState<Screen[]>([initial]);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const go = useCallback((s: Screen) => setStack((st) => (st[st.length - 1] === s ? st : [...st, s])), []);
  const reset = useCallback((s: Screen) => setStack([s]), []);
  const back = useCallback(
    (fallback: Screen = 'home') => setStack((st) => (st.length > 1 ? st.slice(0, -1) : [fallback])),
    [],
  );

  // Keep the guard armed whenever a Back has something to pop (also re-arms after a pop consumed it).
  useEffect(() => {
    if (hasHistory() && stack.length > 1) armGuard();
  }, [stack.length]);

  useEffect(() => {
    if (!hasHistory()) return;
    const onPop = () => {
      // Root: nothing to pop, let the platform handle it (exit the app / previous site).
      if (stackRef.current.length <= 1) return;
      setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const value = useMemo<Nav>(() => ({ screen: stack[stack.length - 1], go, reset, back }), [stack, go, reset, back]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('useNav must be used inside <NavProvider>');
  return n;
}
