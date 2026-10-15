/** PLACEHOLDER: replaced by the UI builder. */
import { useGameState } from '../game/store';

export function DiscussionScreen() {
  const state = useGameState();
  return <main className="screen"><h1>Discussion</h1><p>phase: {state.phase}</p></main>;
}
