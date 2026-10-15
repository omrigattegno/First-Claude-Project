/** PLACEHOLDER: replaced by the UI builder. */
import { useGameState } from '../game/store';

export function VoteScreen() {
  const state = useGameState();
  return <main className="screen"><h1>Vote</h1><p>phase: {state.phase}</p></main>;
}
