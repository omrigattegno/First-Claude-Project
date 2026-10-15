/** PLACEHOLDER: replaced by the UI builder. */
import { useGameState } from '../game/store';

export function ResultsScreen() {
  const state = useGameState();
  return <main className="screen"><h1>Results</h1><p>phase: {state.phase}</p></main>;
}
