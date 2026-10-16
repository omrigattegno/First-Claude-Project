/**
 * Results: winner banner, vote tally, the Imposter(s) and the secret word, the guess line, the
 * scoreboard (points this round + totals, leaders highlighted), an optional penalty prompt for the
 * losing side, and the round-end actions (Next round / Players / Settings / End game).
 */
import { useState } from 'react';
import { Button } from '../components/Button';
import { GameMenu } from '../components/GameMenu';
import { Modal } from '../components/Modal';
import { TopBar } from '../components/TopBar';
import { PenaltyCard } from '../components/game/PenaltyCard';
import { Scoreboard } from '../components/game/Scoreboard';
import { playerName, scoreboard } from '../game/engine';
import { losingSide, penaltyForRound } from '../game/penalties';
import { useGame } from '../game/store';
import { useLang, useT } from '../i18n';
import { useNav } from '../nav';
import '../styles/game.css';

export function ResultsScreen() {
  const t = useT();
  const lang = useLang();
  const { state, dispatch, startRound } = useGame();
  const { go, reset } = useNav();
  const [confirmEnd, setConfirmEnd] = useState(false);

  const round = state.round;
  const outcome = round?.outcome ?? null;
  const penaltyKind = round?.config.penalty ?? 'off';

  if (!round || !outcome) return null;

  // One prompt per round: a pure function of the round, so Home -> Resume or a reload shows the same one.
  const prompt = penaltyKind === 'off' ? null : penaltyForRound(penaltyKind, lang, round);

  const name = (id: string) => playerName(state, id);
  const imposterNames = round.imposterIds.map(name);
  const multi = round.imposterIds.length > 1;

  const winnerText =
    outcome.winner === 'table' ? t('results.tableWins') : multi ? t('results.impostersWin') : t('results.imposterWins');
  const subText =
    outcome.winner === 'table'
      ? outcome.guessCorrect === false
        ? t('results.subCaughtWrongGuess')
        : t('results.subCaught')
      : outcome.tie
        ? t('results.subTie')
        : outcome.imposterCaught
          ? t('results.subGuessed')
          : t('results.subWrongPlayer');

  const tally = Object.entries(outcome.tally)
    .map(([id, n]) => ({ id, name: name(id), n, imposter: round.imposterIds.includes(id) }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

  const guessLine = (() => {
    if (round.guess === null) return null;
    const guesser = name(outcome.votedOutId ?? round.imposterIds[0]);
    if (!round.guess.trim()) return { text: t('results.gaveUp', { name: guesser }), kind: 'wrong' as const };
    return outcome.guessCorrect
      ? { text: t('results.guessCorrect', { name: guesser, guess: round.guess }), kind: 'correct' as const }
      : { text: t('results.guessWrong', { name: guesser, guess: round.guess }), kind: 'wrong' as const };
  })();

  const losers = losingSide(round).map(name);

  const endGame = () => {
    setConfirmEnd(false);
    dispatch({ type: 'END_GAME' });
    reset('home');
  };

  return (
    <main className="screen results" data-testid="results-screen">
      <TopBar title={t('common.round', { n: round.number })} trailing={<GameMenu />} />
      <div className="game-stack">
        <section
          className={`results__banner results__banner--${outcome.winner}`}
          aria-live="polite"
          data-testid="results-banner"
          data-winner={outcome.winner}
        >
          <h2 className="results__winner" data-testid="results-winner">
            {winnerText}
          </h2>
          <p className="results__sub">{subText}</p>
        </section>

        <section className="card" aria-label={t('results.votes')}>
          <h3 className="card__title">{t('results.votes')}</h3>
          <p className="results__voted">
            {outcome.tie || !outcome.votedOutId
              ? t('results.tie')
              : t('results.votedOut', { name: name(outcome.votedOutId) })}
          </p>
          <ul className="tally">
            {tally.map((row) => (
              <li key={row.id} className={`tally__row ${row.id === outcome.votedOutId ? 'is-out' : ''}`.trim()}>
                <span className="tally__name">
                  {row.name}
                  {row.imposter && <span className="badge badge--imposter">{t('results.imposterBadge')}</span>}
                </span>
                <span className="tally__count">
                  {row.n === 1 ? t('results.voteCountOne') : t('results.voteCount', { n: row.n })}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card" aria-label={t('results.secretWord')}>
          <h3 className="card__title">{t('results.secretWord')}</h3>
          <p className="results__word" lang={lang} data-testid="results-word">
            {round.word.word}
          </p>
          <p className="muted text-center">{t('reveal.category', { name: round.categoryName })}</p>
          <p className="results__imposters">
            {multi
              ? t('results.impostersWere', { names: imposterNames.join(', ') })
              : t('results.imposterWas', { name: imposterNames[0] ?? '?' })}
          </p>
          {guessLine && <p className={`results__guess results__guess--${guessLine.kind}`}>{guessLine.text}</p>}
        </section>

        <section className="card" aria-label={t('results.scoreboard')} data-testid="results-scoreboard">
          <h3 className="card__title">{t('results.scoreboard')}</h3>
          <div className="scoreboard__head" aria-hidden="true">
            <span />
            <span />
            <span className="scoreboard__earned faint">{t('results.colRound')}</span>
            <span className="scoreboard__total faint">{t('results.colTotal')}</span>
          </div>
          <Scoreboard rows={scoreboard(state)} roundPoints={outcome.points} imposterIds={round.imposterIds} />
        </section>

        {penaltyKind !== 'off' && prompt && <PenaltyCard kind={penaltyKind} prompt={prompt} loserNames={losers} />}

        <div className="game-actions">
          <Button variant="primary" size="xl" block data-testid="results-next" onClick={() => startRound()}>
            {t('results.nextRound')}
          </Button>
          <div className="game-actions__row">
            <Button data-testid="results-players" onClick={() => dispatch({ type: 'EDIT_PLAYERS' })}>
              {t('common.players')}
            </Button>
            <Button data-testid="results-settings" onClick={() => go('settings')}>
              {t('common.settings')}
            </Button>
            <Button variant="ghost" data-testid="results-end" onClick={() => setConfirmEnd(true)}>
              {t('results.endGame')}
            </Button>
          </div>
        </div>
      </div>

      <Modal
        open={confirmEnd}
        title={t('menu.endGame')}
        confirmLabel={t('menu.endGame')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={endGame}
        onCancel={() => setConfirmEnd(false)}
      >
        {t('menu.endGameConfirm')}
      </Modal>
    </main>
  );
}
