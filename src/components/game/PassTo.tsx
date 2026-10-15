/**
 * "Pass to {name}" screen shown before a private Reveal or Vote turn.
 * The next player's name is huge; a 3-second anti-peek countdown (PASS_COUNTDOWN_SECONDS) runs and
 * `onArmed()` fires once when it reaches zero. Nothing secret is ever rendered here.
 */
import { useEffect, useRef, useState } from 'react';
import { PASS_COUNTDOWN_SECONDS } from '../../game/constants';
import { useT } from '../../i18n';
import { Ring } from './Ring';
import { useCountdown } from './useCountdown';
import '../../styles/game.css';

export interface PassToProps {
  name: string;
  /** Effective reveal method: decides which hint is shown. */
  method: 'lift' | 'hold';
  /** Called exactly once when the countdown reaches zero. */
  onArmed: () => void;
  /** Small progress label, e.g. "2 of 6". */
  progress?: string;
}

export function PassTo({ name, method, onArmed, progress }: PassToProps) {
  const t = useT();
  const total = PASS_COUNTDOWN_SECONDS * 1000;
  const [endAt] = useState(() => Date.now() + total);
  const remaining = useCountdown(endAt, 100);
  const seconds = Math.ceil(remaining / 1000);

  // Latest callback without re-running the effect; fire once per mount even under StrictMode.
  const onArmedRef = useRef(onArmed);
  onArmedRef.current = onArmed;
  const firedRef = useRef(false);
  useEffect(() => {
    if (remaining > 0 || firedRef.current) return;
    firedRef.current = true;
    onArmedRef.current();
  }, [remaining]);

  return (
    <section className="pass" aria-label={t('pass.to', { name })} data-testid="pass-screen">
      {progress && <div className="pass__progress">{progress}</div>}
      <div className="pass__label">{t('pass.title')}</div>
      <h1 className="pass__name" data-testid="pass-name">
        {name}
      </h1>
      <p className="pass__hint">{method === 'lift' ? t('pass.hintLift') : t('pass.hintHold')}</p>
      <Ring
        fraction={remaining / total}
        size={120}
        stroke={8}
        className="pass__ring"
        ariaLabel={t('pass.countdownAria', { n: seconds })}
      >
        <span className="pass__count" aria-hidden="true" data-testid="pass-count">
          {seconds}
        </span>
      </Ring>
    </section>
  );
}
