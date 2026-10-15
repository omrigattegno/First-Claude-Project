/** PLACEHOLDER: replaced by the UI builder. */
import { useGameState } from '../game/store';

export function GuessScreen() {
  const state = useGameState();
  return <main className="screen"><h1>Guess</h1><p>phase: {state.phase}</p></main>;
}
