/** PLACEHOLDER: replaced by the UI builder. */
import { useGameState } from '../game/store';

export function HomeScreen() {
  const state = useGameState();
  return <main className="screen"><h1>Home</h1><p>phase: {state.phase}</p></main>;
}
