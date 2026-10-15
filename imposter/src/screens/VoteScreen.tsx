/**
 * Vote: each player gets a Pass-to screen, then a private ballot that exists in the DOM only while
 * useReveal says `revealed`. The selection lives in component state so it survives lowering and
 * re-lifting; "Lock vote and pass" (shown once a name is chosen, usable with the phone lowered)
 * dispatches CAST_VOTE. After the last voter the engine moves to guess/results by itself.
 */
import { useState } from 'react';
import { Button } from '../components/Button';
import { GameMenu } from '../components/GameMenu';
import { PassTo } from '../components/game/PassTo';
import { RevealControls } from '../components/game/RevealControls';
import { SecretCard } from '../components/game/SecretCard';
import { ballotFor, currentVoter } from '../game/engine';
import { useGame } from '../game/store';
import type { Player } from '../game/types';
import { useReveal } from '../hooks/useReveal';
import { useT } from '../i18n';
import '../styles/game.css';

export function VoteScreen() {
  const { state } = useGame();
  const voter = currentVoter(state);
  const round = state.round;
  if (!voter || !round) return null;
  return <VoteTurn key={`${round.number}:${voter.id}`} voter={voter} />;
}

function VoteTurn({ voter }: { voter: Player }) {
  const t = useT();
  const { state, dispatch } = useGame();
  const round = state.round;
  const [armed, setArmed] = useState(false);
  const { revealed, effectiveMethod, permission, holdProps } = useReveal({
    method: state.settings.revealMethod,
    armed,
  });
  const [selected, setSelected] = useState<string | null>(null);

  if (!round) return null;
  const ballot = ballotFor(state, voter.id);
  const progress = t('vote.progress', { current: round.voteIndex + 1, total: round.order.length });

  const lock = () => {
    if (!selected) return;
    dispatch({ type: 'CAST_VOTE', voterId: voter.id, votedId: selected });
  };

  return (
    <main className="screen vote" data-testid="vote-screen">
      <div className="game-chrome">
        <span className="game-chrome__label" data-testid="vote-progress">
          {progress}
        </span>
        <GameMenu />
      </div>

      {!armed ? (
        <PassTo name={voter.name} method={effectiveMethod} onArmed={() => setArmed(true)} />
      ) : (
        <div className="game-stack">
          <SecretCard revealed={revealed} name={voter.name} className="secret-card--ballot">
            <div className="ballot" data-testid="vote-ballot">
              <h2 className="ballot__question">{t('vote.question', { name: voter.name })}</h2>
              <p className="muted">{t('vote.pickOne')}</p>
              <div
                className={`ballot__opts ${ballot.length > 6 ? 'ballot__opts--two' : ''}`.trim()}
                role="radiogroup"
                aria-label={t('vote.question', { name: voter.name })}
              >
                {ballot.map((p) => {
                  const isSelected = selected === p.id;
                  return (
                    <button
                      type="button"
                      key={p.id}
                      role="radio"
                      aria-checked={isSelected}
                      className={`ballot__opt ${isSelected ? 'is-selected' : ''}`.trim()}
                      data-testid="ballot-opt"
                      data-player-id={p.id}
                      onClick={() => setSelected(p.id)}
                    >
                      <span className="ballot__opt-name">{p.name}</span>
                      <span className="ballot__opt-check" aria-hidden="true">
                        ✓
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </SecretCard>

          <RevealControls
            effectiveMethod={effectiveMethod}
            requestedMethod={state.settings.revealMethod}
            permission={permission}
            holdProps={holdProps}
            revealed={revealed}
            liftHint={t('vote.liftHint')}
            holdHint={t('vote.holdHint')}
            holdLabel={t('vote.holdButton')}
          />

          <div className="reveal__pass">
            {selected !== null && (
              <Button variant="primary" size="xl" block className="vote__lock" data-testid="vote-lock" onClick={lock}>
                {t('vote.lock')}
              </Button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
