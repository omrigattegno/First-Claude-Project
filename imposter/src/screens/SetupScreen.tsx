/**
 * Setup: players (add / remove / rename / reorder), category, Start.
 * Start runs unlockAudio() and, in lift mode, requestSensorPermission() synchronously inside the tap
 * (iOS needs the gesture), then startRound() + reset('game'). Last game's names are pre-filled by
 * bootState() (store.tsx) once per boot, so a list the host clears here stays cleared.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { TopBar } from '../components/TopBar';
import { BackButton } from '../components/pregame/BackButton';
import { CategoryPicker } from '../components/pregame/CategoryPicker';
import { PlayerList } from '../components/pregame/PlayerList';
import { IconGear } from '../components/pregame/icons';
import { MAX_NAME_LENGTH, MAX_PLAYERS, MIN_PLAYERS, MIN_PLAYERS_FOR_TWO_IMPOSTERS } from '../game/constants';
import { canStart, validatePlayerName, type NameError } from '../game/engine';
import { useGame } from '../game/store';
import { RANDOM_CATEGORY } from '../game/types';
import { useT, type MessageKey } from '../i18n';
import { unlockAudio } from '../lib/audio';
import { probeSensors, requestSensorPermission } from '../lib/sensors';
import { useNav } from '../nav';
import '../styles/pregame.css';

const ERROR_KEY: Record<NameError, MessageKey> = {
  empty: 'setup.err.empty',
  too_long: 'setup.err.too_long',
  duplicate: 'setup.err.duplicate',
  too_many: 'setup.err.too_many',
};

export function SetupScreen() {
  const t = useT();
  const { state, dispatch, addPlayer, packs, startRound } = useGame();
  const { go, reset } = useNav();
  const { players, settings } = state;
  const locked = state.phase !== 'setup';

  const [name, setName] = useState('');
  const [error, setError] = useState<NameError | null>(null);
  const [starting, setStarting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submitName = (e?: FormEvent) => {
    e?.preventDefault();
    if (locked) return;
    const err = addPlayer(name);
    if (err) {
      setError(err);
    } else {
      setName('');
      setError(null);
    }
    inputRef.current?.focus();
  };

  // Each new row is inserted above the add field and browsers only scroll a field into view on focus,
  // so after a successful add bring it back above the on-screen keyboard. Only while it is the active
  // element, so a tap on a row button (remove) never scrolls.
  useEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement === el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center' });
    }
  }, [players.length]);

  /** Inline rename from the list; returns false (editor stays open) when the name is rejected. */
  const renamePlayer = (id: string, newName: string): boolean => {
    if (locked) return true;
    const err = validatePlayerName(players, newName, id);
    if (err) {
      setError(err);
      return false;
    }
    setError(null);
    dispatch({ type: 'RENAME_PLAYER', id, name: newName });
    return true;
  };

  const ready = canStart(state) && !locked;
  const selectedCategory = packs.some((p) => p.id === settings.categoryId) ? settings.categoryId : RANDOM_CATEGORY;
  const twoImpostersShort =
    settings.imposterCount === 2 && players.length >= MIN_PLAYERS && players.length < MIN_PLAYERS_FOR_TWO_IMPOSTERS;
  const continuing = state.history.length > 0;

  const onStart = () => {
    if (!ready || starting) return;
    // Both must run inside the tap: WebAudio and iOS motion permission need a user gesture.
    unlockAudio();
    setStarting(true);
    const launch = () => {
      try {
        startRound();
        reset('game');
      } catch (err) {
        console.error(err);
        setStarting(false);
      }
    };
    if (settings.revealMethod === 'lift') {
      // The "does this device deliver readings?" probe runs during the Pass-to countdown (not awaited),
      // so player 1's hint and card start in the right mode on sensorless devices.
      requestSensorPermission().then(() => {
        void probeSensors();
        launch();
      }, launch);
    } else {
      launch();
    }
  };

  return (
    <main className="screen setup" data-testid="setup-screen">
      <TopBar
        leading={<BackButton onClick={() => reset('home')} testId="setup-back" />}
        title={continuing ? t('common.round', { n: state.history.length + 1 }) : t('setup.title')}
        trailing={
          <Button
            variant="ghost"
            aria-label={t('common.settings')}
            data-testid="setup-settings"
            onClick={() => go('settings')}
          >
            <IconGear />
          </Button>
        }
      />

      <div className="setup__body">
        {locked && (
          <div className="notice" role="status">
            <span>{t('setup.inProgress')}</span>
            <Button variant="primary" data-testid="setup-resume" onClick={() => reset('game')}>
              {t('setup.resume')}
            </Button>
          </div>
        )}

        <section className="pg-section" aria-labelledby="setup-players">
          <div className="pg-section__head">
            <h2 id="setup-players" className="pg-section__title">
              {t('common.players')}
            </h2>
            <span className={`pg-counter ${players.length >= MIN_PLAYERS ? 'is-ready' : ''}`.trim()}>
              {t('setup.counter', { n: players.length, max: MAX_PLAYERS })}
            </span>
          </div>

          {players.length === 0 ? (
            <p className="setup__empty">{t('setup.emptyPlayers')}</p>
          ) : (
            <>
              <PlayerList
                players={players}
                disabled={locked}
                onReorder={(ids) => dispatch({ type: 'REORDER_PLAYERS', ids })}
                onRemove={(id) => dispatch({ type: 'REMOVE_PLAYER', id })}
                onRename={renamePlayer}
              />
              <p className="pg-muted">
                {t('setup.seatingHint')}
                {!locked && <> · {t('setup.renameHint')}</>}
              </p>
            </>
          )}

          <form className="addform" onSubmit={submitName} noValidate>
            <input
              ref={inputRef}
              className="input"
              data-testid="setup-name-input"
              type="text"
              value={name}
              placeholder={t('setup.namePlaceholder')}
              aria-label={t('setup.namePlaceholder')}
              aria-invalid={error !== null}
              autoComplete="off"
              autoCapitalize="words"
              autoCorrect="off"
              enterKeyHint="done"
              disabled={locked || players.length >= MAX_PLAYERS}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
            />
            <Button
              type="submit"
              variant="secondary"
              data-testid="setup-add"
              disabled={locked || players.length >= MAX_PLAYERS}
            >
              {t('setup.add')}
            </Button>
          </form>
          {error && (
            <p className="field-error" role="alert">
              {t(ERROR_KEY[error], { max: error === 'too_long' ? MAX_NAME_LENGTH : MAX_PLAYERS })}
            </p>
          )}
        </section>

        <section className="pg-section" aria-labelledby="setup-category">
          <h2 id="setup-category" className="pg-section__title">
            {t('setup.category')}
          </h2>
          <CategoryPicker
            packs={packs}
            selectedId={selectedCategory}
            onSelect={(categoryId) => dispatch({ type: 'UPDATE_SETTINGS', patch: { categoryId } })}
          />
        </section>
      </div>

      <div className="pg-grow" />

      <div className="setup__footer">
        <p className={`setup__hint ${twoImpostersShort ? 'setup__hint--warn' : ''}`.trim()} aria-live="polite">
          {players.length < MIN_PLAYERS
            ? t('setup.needPlayers', { min: MIN_PLAYERS })
            : twoImpostersShort
              ? t('setup.twoImpostersHint', { min: MIN_PLAYERS_FOR_TWO_IMPOSTERS })
              : ''}
        </p>
        <Button variant="primary" size="xl" block data-testid="setup-start" disabled={!ready || starting} onClick={onStart}>
          {starting ? t('setup.starting') : t('setup.start')}
        </Button>
        <div className="setup__links">
          <Button variant="ghost" data-testid="setup-howto" onClick={() => go('howto')}>
            {t('common.howToPlay')}
          </Button>
        </div>
      </div>
    </main>
  );
}
