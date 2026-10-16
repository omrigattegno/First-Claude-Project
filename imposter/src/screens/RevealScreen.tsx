/**
 * Reveal: each player in seating order gets a Pass-to screen (3 s anti-peek countdown, sensor
 * disarmed), then their private card. The secret is in the DOM only while useReveal says `revealed`.
 * "Got it, pass" appears PASS_BUTTON_DELAY_MS after the first reveal of the turn and is the only
 * thing that advances (REVEAL_NEXT); lowering the phone just hides the card again.
 */
import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { GameMenu } from '../components/GameMenu';
import { PassTo } from '../components/game/PassTo';
import { RevealControls } from '../components/game/RevealControls';
import { SecretCard, wordSizeClass } from '../components/game/SecretCard';
import { PASS_BUTTON_DELAY_MS } from '../game/constants';
import { currentRevealer, isImposter } from '../game/engine';
import { useGame } from '../game/store';
import type { Player } from '../game/types';
import { useReveal } from '../hooks/useReveal';
import { useTapGuard } from '../hooks/useTapGuard';
import { useT } from '../i18n';
import '../styles/game.css';

export function RevealScreen() {
  const { state } = useGame();
  const revealer = currentRevealer(state);
  const round = state.round;
  if (!revealer || !round) return null;
  // Keyed per turn so armed/reveal/pass-button state starts fresh for every player.
  return <RevealTurn key={`${round.number}:${revealer.id}`} player={revealer} />;
}

function RevealTurn({ player }: { player: Player }) {
  const t = useT();
  const { state, dispatch } = useGame();
  const round = state.round;
  const [armed, setArmed] = useState(false);
  const { revealed, effectiveMethod, permission, holdProps, needsLower } = useReveal({
    method: state.settings.revealMethod,
    armed,
  });
  const [guarded, arm] = useTapGuard();

  // The pass button appears a fixed delay after the FIRST reveal of this turn and then stays,
  // even while the card is lowered again. The timestamp survives StrictMode effect re-runs.
  const [firstRevealAt, setFirstRevealAt] = useState<number | null>(null);
  const [passReady, setPassReady] = useState(false);
  useEffect(() => {
    if (revealed && firstRevealAt === null) setFirstRevealAt(Date.now());
  }, [revealed, firstRevealAt]);
  useEffect(() => {
    if (firstRevealAt === null || passReady) return;
    const delay = Math.max(0, firstRevealAt + PASS_BUTTON_DELAY_MS - Date.now());
    const id = setTimeout(() => setPassReady(true), delay);
    return () => clearTimeout(id);
  }, [firstRevealAt, passReady]);

  if (!round) return null;
  const imposter = isImposter(state, player.id);
  const progress = t('reveal.progress', { current: round.revealIndex + 1, total: round.order.length });

  return (
    <main className="screen reveal" data-testid="reveal-screen">
      <div className="game-chrome">
        <span className="game-chrome__label" data-testid="reveal-progress">
          {progress}
        </span>
        <GameMenu />
      </div>

      {!armed ? (
        <PassTo name={player.name} method={effectiveMethod} onArmed={() => setArmed(true)} />
      ) : (
        <div className="game-stack">
          <SecretCard revealed={revealed} name={player.name}>
            {imposter ? (
              <>
                <div className="secret-word secret-word--imposter" data-testid="secret-imposter">
                  {t('common.imposter')}
                </div>
                <div className="secret-card__sub">
                  {round.config.imposterSeesCategory ? (
                    t('reveal.category', { name: round.categoryName })
                  ) : (
                    <span className="faint">{t('reveal.categoryHidden')}</span>
                  )}
                </div>
                <div className="secret-card__note">{t('reveal.imposterNote')}</div>
              </>
            ) : (
              <>
                <div className="secret-card__label">{t('reveal.secretWord')}</div>
                <div
                  className={`secret-word ${wordSizeClass(round.word.word)}`.trim()}
                  lang={state.settings.language}
                  data-testid="secret-word"
                >
                  {round.word.word}
                </div>
                <div className="secret-card__sub">{t('reveal.category', { name: round.categoryName })}</div>
              </>
            )}
          </SecretCard>

          <RevealControls
            effectiveMethod={effectiveMethod}
            requestedMethod={state.settings.revealMethod}
            permission={permission}
            holdProps={holdProps}
            revealed={revealed}
            needsLower={needsLower}
            liftHint={t('reveal.liftHint')}
            holdHint={t('reveal.holdHint')}
            holdLabel={t('reveal.holdButton')}
          />

          <div className="reveal__pass">
            {passReady && (
              <Button
                variant="primary"
                size="xl"
                block
                className={guarded ? 'is-guarded' : ''}
                disabled={guarded}
                data-testid="reveal-pass"
                onClick={() => {
                  if (guarded) return;
                  arm();
                  dispatch({ type: 'REVEAL_NEXT' });
                }}
              >
                {t('reveal.gotIt')}
              </Button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
