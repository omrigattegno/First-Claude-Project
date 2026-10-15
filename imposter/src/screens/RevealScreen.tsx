/** PLACEHOLDER: replaced by the UI builder. */
import { useGameState } from '../game/store';

export function RevealScreen() {
  const state = useGameState();
  return <main className="screen"><h1>Reveal</h1><p>phase: {state.phase}</p></main>;
}
