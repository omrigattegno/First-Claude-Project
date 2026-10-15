/**
 * Screen navigation outside the game phase machine. 'game' renders the screen
 * for the current `state.phase`; the others are pre-game/overlay screens.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

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

export function NavProvider({ children, initial = 'home' }: { children: ReactNode; initial?: Screen }) {
  const [stack, setStack] = useState<Screen[]>([initial]);
  const go = useCallback((s: Screen) => setStack((st) => (st[st.length - 1] === s ? st : [...st, s])), []);
  const reset = useCallback((s: Screen) => setStack([s]), []);
  const back = useCallback(
    (fallback: Screen = 'home') => setStack((st) => (st.length > 1 ? st.slice(0, -1) : [fallback])),
    [],
  );
  const value = useMemo<Nav>(() => ({ screen: stack[stack.length - 1], go, reset, back }), [stack, go, reset, back]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('useNav must be used inside <NavProvider>');
  return n;
}
