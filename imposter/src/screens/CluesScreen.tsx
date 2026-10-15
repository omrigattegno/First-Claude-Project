/** PLACEHOLDER: replaced by the UI builder. */
import { useGameState } from '../game/store';

export function CluesScreen() {
  const state = useGameState();
  return <main className="screen"><h1>Clues</h1><p>phase: {state.phase}</p></main>;
}
