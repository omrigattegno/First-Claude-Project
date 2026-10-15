/** Renders the in-round screen for the current phase. Phase screens live in their own files. */
import { useGameState } from '../game/store';
import { useNav } from '../nav';
import { useEffect } from 'react';
import { RevealScreen } from './RevealScreen';
import { CluesScreen } from './CluesScreen';
import { DiscussionScreen } from './DiscussionScreen';
import { VoteScreen } from './VoteScreen';
import { GuessScreen } from './GuessScreen';
import { ResultsScreen } from './ResultsScreen';

export function GameScreen() {
  const { phase } = useGameState();
  const { reset } = useNav();
  useEffect(() => {
    if (phase === 'setup') reset('setup');
  }, [phase, reset]);

  switch (phase) {
    case 'reveal':
      return <RevealScreen />;
    case 'clues':
      return <CluesScreen />;
    case 'discussion':
      return <DiscussionScreen />;
    case 'vote':
      return <VoteScreen />;
    case 'guess':
      return <GuessScreen />;
    case 'results':
      return <ResultsScreen />;
    default:
      return null;
  }
}
