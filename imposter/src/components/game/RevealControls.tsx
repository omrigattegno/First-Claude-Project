/**
 * The controls under a SecretCard: in hold mode the big hold button; in lift mode the lift hint plus a
 * small "Can't lift? Hold here" fallback that swaps in the same hold button (lifting keeps working).
 * When the host chose Lift but iOS has not granted sensor access yet (permission 'prompt', e.g. after a
 * refresh mid-round), an "Enable lift-to-reveal" button asks for it inside the tap, as iOS requires.
 */
import { useState, type HTMLAttributes } from 'react';
import type { RevealMethod } from '../../game/types';
import { useT } from '../../i18n';
import { requestSensorPermission, type SensorPermission } from '../../lib/sensors';
import { Button } from '../Button';
import { HoldButton } from './HoldButton';
import '../../styles/game.css';

export interface RevealControlsProps {
  effectiveMethod: 'lift' | 'hold';
  /** The method chosen in Settings (differs from effectiveMethod when sensors are unavailable). */
  requestedMethod?: RevealMethod;
  permission?: SensorPermission;
  holdProps: HTMLAttributes<HTMLElement>;
  revealed: boolean;
  liftHint: string;
  holdHint: string;
  holdLabel: string;
}

export function RevealControls({
  effectiveMethod,
  requestedMethod,
  permission,
  holdProps,
  revealed,
  liftHint,
  holdHint,
  holdLabel,
}: RevealControlsProps) {
  const t = useT();
  const [showHold, setShowHold] = useState(false);
  const hold = effectiveMethod === 'hold' || showHold;
  const canEnableSensors = requestedMethod === 'lift' && permission === 'prompt';

  return (
    <div className="reveal-controls" data-testid="reveal-controls" data-method={hold ? 'hold' : 'lift'}>
      {canEnableSensors && (
        <Button
          variant="secondary"
          className="reveal-controls__enable"
          data-testid="reveal-enable-sensors"
          onClick={() => {
            // Must be the tap handler itself: iOS only grants the permission inside a user gesture.
            void requestSensorPermission();
          }}
        >
          {t('reveal.enableSensors')}
        </Button>
      )}
      {hold ? (
        <>
          <p className="reveal-controls__hint">{holdHint}</p>
          <HoldButton holdProps={holdProps} active={revealed}>
            {holdLabel}
          </HoldButton>
        </>
      ) : (
        <>
          <p className="reveal-controls__hint">{liftHint}</p>
          <Button
            variant="ghost"
            className="reveal-controls__fallback"
            data-testid="reveal-cant-lift"
            onClick={() => setShowHold(true)}
          >
            {t('reveal.cantLift')}
          </Button>
        </>
      )}
    </div>
  );
}
