/**
 * Guess: the caught Imposter (guessingImposter) types one guess at the secret word.
 * Submit -> SUBMIT_GUESS {guess}; "I give up" -> SUBMIT_GUESS {guess: ''}.
 */
import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { GameMenu } from '../components/GameMenu';
import { TopBar } from '../components/TopBar';
import { guessingImposter } from '../game/engine';
import { useGame } from '../game/store';
import { useT } from '../i18n';
import '../styles/game.css';

export function GuessScreen() {
  const t = useT();
  const { state, dispatch } = useGame();
  const [guess, setGuess] = useState('');
  const round = state.round;
  const imposter = guessingImposter(state);
  if (!round || !imposter) return null;

  const trimmed = guess.trim();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    dispatch({ type: 'SUBMIT_GUESS', guess: trimmed });
  };

  const giveUp = () => dispatch({ type: 'SUBMIT_GUESS', guess: '' });

  return (
    <main className="screen guess" data-testid="guess-screen">
      <TopBar title={t('common.round', { n: round.number })} trailing={<GameMenu />} />
      <div className="game-stack">
        <h2 className="guess__title">{t('guess.title')}</h2>
        <p className="guess__prompt">{t('guess.prompt', { name: imposter.name })}</p>
        {round.config.imposterSeesCategory ? (
          <p className="guess__category" data-testid="guess-category">
            {t('guess.category', { name: round.categoryName })}
          </p>
        ) : (
          // The frozen round rule hides the category here too: the guess is where it matters most.
          <p className="guess__category" data-testid="guess-category-hidden">
            {t('reveal.categoryHidden')}
          </p>
        )}

        <form className="guess__form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="guess-input">
            {t('guess.label')}
          </label>
          <input
            id="guess-input"
            data-testid="guess-input"
            className="guess__input"
            type="text"
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder={t('guess.placeholder')}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            inputMode="text"
            dir="auto"
            maxLength={60}
          />
          <Button type="submit" variant="primary" size="xl" block data-testid="guess-submit" disabled={!trimmed}>
            {t('guess.submit')}
          </Button>
          <Button variant="ghost" size="l" block data-testid="guess-giveup" onClick={giveUp}>
            {t('guess.giveUp')}
          </Button>
        </form>
      </div>
    </main>
  );
}
