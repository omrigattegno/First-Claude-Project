/** PLACEHOLDER: replaced by the UI builder. */
import { useGameState } from '../game/store';

export function SetupScreen() {
  const state = useGameState();
  return <main className="screen"><h1>Setup</h1><p>phase: {state.phase}</p></main>;
}
