/**
 * Home: wordmark, Play / How to play, last game's players, language toggle, install prompt.
 * While a round is in progress (phase !== 'setup') the primary action becomes "Resume round n"
 * with a smaller "Start over"; Play is hidden then because Setup cannot edit players mid-round.
 * Between rounds of an evening (no round, but scores/history kept after Players or Quit round) the
 * primary action is "Continue (round n)" with a smaller "New game" that clears the scores, so a
 * later session never silently continues an old evening.
 */
import { useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { InstallPrompt } from '../components/InstallPrompt';
import { Modal } from '../components/Modal';
import { LanguageToggle } from '../components/pregame/LanguageToggle';
import { Wordmark } from '../components/pregame/Wordmark';
import { loadLastPlayers } from '../game/storage';
import { useGame } from '../game/store';
import { useT } from '../i18n';
import { useNav } from '../nav';
import '../styles/pregame.css';

export function HomeScreen() {
  const t = useT();
  const { state, dispatch } = useGame();
  const { go, reset } = useNav();
  const [confirmClear, setConfirmClear] = useState(false);

  const inProgress = state.phase !== 'setup';
  // Scores are only written together with a history entry and END_GAME clears both, so a non-empty
  // history with no round means an evening is being continued (after EDIT_PLAYERS / ABORT_ROUND).
  const evening = !inProgress && state.history.length > 0;
  const roundNumber = state.round?.number ?? state.history.length + 1;
  const lastNames = useMemo(
    () => (state.players.length ? state.players.map((p) => p.name) : loadLastPlayers()),
    [state.players],
  );

  const clearGame = () => {
    setConfirmClear(false);
    dispatch({ type: 'END_GAME' });
    go('setup');
  };

  return (
    <main className="screen home" data-testid="home-screen">
      <div className="home__top">
        <LanguageToggle />
      </div>

      <div className="home__hero">
        <Wordmark />
      </div>

      <div className="home__actions">
        {inProgress ? (
          <section className="resume">
            <p className="resume__label">{t('home.inProgress')}</p>
            <Button variant="primary" size="xl" block data-testid="home-resume" onClick={() => reset('game')}>
              {t('home.resume', { n: roundNumber })}
            </Button>
            <Button variant="ghost" block data-testid="home-start-over" onClick={() => setConfirmClear(true)}>
              {t('home.startOver')}
            </Button>
          </section>
        ) : evening ? (
          <section className="resume">
            <p className="resume__label">{t('home.evening')}</p>
            <Button variant="primary" size="xl" block data-testid="home-continue" onClick={() => go('setup')}>
              {t('home.continueEvening', { n: roundNumber })}
            </Button>
            <Button variant="ghost" block data-testid="home-new-game" onClick={() => setConfirmClear(true)}>
              {t('home.newGame')}
            </Button>
          </section>
        ) : (
          <Button variant="primary" size="xl" block data-testid="home-play" onClick={() => go('setup')}>
            {t('home.play')}
          </Button>
        )}
        <Button variant="secondary" size="l" block data-testid="home-howto" onClick={() => go('howto')}>
          {t('common.howToPlay')}
        </Button>
      </div>

      {lastNames.length > 0 && (
        <section className="home__players">
          <h2 className="pg-section__title">{t('home.lastPlayers')}</h2>
          <ul className="chips">
            {lastNames.map((name, i) => (
              <li key={`${i}-${name}`} className="chip">
                {name}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="pg-grow" />

      <div className="home__install">
        <InstallPrompt />
      </div>

      <Modal
        open={confirmClear}
        title={t(inProgress ? 'home.startOverTitle' : 'home.newGameTitle')}
        danger
        confirmLabel={t(inProgress ? 'home.startOver' : 'home.newGame')}
        cancelLabel={t('common.cancel')}
        onConfirm={clearGame}
        onCancel={() => setConfirmClear(false)}
      >
        {t(inProgress ? 'home.startOverBody' : 'home.newGameBody')}
      </Modal>
    </main>
  );
}
