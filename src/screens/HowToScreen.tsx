/** PLACEHOLDER: replaced by the UI builder. */
import { useGameState } from '../game/store';

export function HowToScreen() {
  const state = useGameState();
  return <main className="screen"><h1>HowTo</h1><p>phase: {state.phase}</p></main>;
}
