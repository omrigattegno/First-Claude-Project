/** PLACEHOLDER: replaced by the UI builder. */
import { useGameState } from '../game/store';

export function SettingsScreen() {
  const state = useGameState();
  return <main className="screen"><h1>Settings</h1><p>phase: {state.phase}</p></main>;
}
