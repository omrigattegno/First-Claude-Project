/**
 * Clue rounds: the table reads this together. Shows the clue round counter, the current speaker
 * huge, the turn order (done / current / upcoming) and a big Next (CLUE_NEXT). On the last turn the
 * button becomes "Start discussion" (or "Go to vote" when the discussion timer is off).
 */
import { Button } from '../components/Button';
import { GameMenu } from '../components/GameMenu';
import { TopBar } from '../components/TopBar';
import { TurnOrder, type TurnOrderItem } from '../components/game/TurnOrder';
import { clueOrder, currentSpeaker, playerName } from '../game/engine';
import { useGame } from '../game/store';
import { useT } from '../i18n';
import { unlockAudio } from '../lib/audio';
import '../styles/game.css';

export function CluesScreen() {
  const t = useT();
  const { state, dispatch } = useGame();
  const round = state.round;
  const speaker = currentSpeaker(state);
  if (!round || !speaker) return null;

  const order = clueOrder(round);
  const n = order.length;
  const firstTurn = round.clueRound === 1 && round.clueTurn === 0;
  const lastTurn = round.clueRound === round.config.clueRounds && round.clueTurn === n - 1;

  const items: TurnOrderItem[] = order.map((id, i) => ({
    id,
    name: playerName(state, id),
    status: i < round.clueTurn ? 'done' : i === round.clueTurn ? 'current' : 'todo',
  }));

  const nextLabel = lastTurn
    ? round.config.discussionSeconds === 0
      ? t('clues.goToVote')
      : t('clues.startDiscussion')
    : t('common.next');

  const onNext = () => {
    // Any tap before the discussion timer unlocks WebAudio on iOS so the 10-second beep can sound.
    unlockAudio();
    dispatch({ type: 'CLUE_NEXT' });
  };

  return (
    <main className="screen clues" data-testid="clues-screen">
      <TopBar title={t('common.round', { n: round.number })} trailing={<GameMenu />} />
      <div className="game-stack">
        <p className="clues__round" data-testid="clues-round">
          {t('clues.round', { k: round.clueRound, total: round.config.clueRounds })}
        </p>

        <section className="clues__speaker" aria-live="polite">
          <div className="clues__speaker-label">
            {firstTurn ? t('clues.starts', { name: speaker.name }) : t('clues.nowSpeaking')}
          </div>
          <h2 className="clues__speaker-name" data-testid="clues-speaker">
            {speaker.name}
          </h2>
        </section>

        <TurnOrder items={items} />

        <p className="clues__hint">{t('clues.hint')}</p>

        <div className="game-actions">
          <Button variant="primary" size="xl" block data-testid="clues-next" onClick={onNext}>
            {nextLabel}
          </Button>
        </div>
      </div>
    </main>
  );
}
