/**
 * Discussion timer: a big m:ss countdown derived from an end timestamp (never a decrementing
 * counter), a progress ring, one beep + vibration at DISCUSSION_BEEP_AT_SECONDS, an end beep at zero.
 * The screen never advances by itself: "Vote now" is available throughout and becomes the primary
 * "Vote" button once time is up (DISCUSSION_DONE). The deadline lives in the round
 * (round.discussionEndsAt, set once by DISCUSSION_START on the first mount) so a reload, a remount or
 * another window resumes the countdown instead of restarting it.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/Button';
import { GameMenu } from '../components/GameMenu';
import { TopBar } from '../components/TopBar';
import { Ring } from '../components/game/Ring';
import { formatClock, useCountdown } from '../components/game/useCountdown';
import { DISCUSSION_BEEP_AT_SECONDS } from '../game/constants';
import { useGame } from '../game/store';
import { useTapGuard } from '../hooks/useTapGuard';
import { useT } from '../i18n';
import { beep, unlockAudio, vibrate } from '../lib/audio';
import '../styles/game.css';

export function DiscussionScreen() {
  const t = useT();
  const { state, dispatch } = useGame();
  const round = state.round;
  const totalSeconds = Math.max(1, round?.config.discussionSeconds ?? 60);
  const totalMs = totalSeconds * 1000;

  // Until DISCUSSION_START lands (one render) the countdown runs on the same deadline we dispatch,
  // so the clock does not jump; afterwards the persisted deadline is the only source.
  const [fallbackEndAt] = useState(() => Date.now() + totalMs);
  const endAt = round?.discussionEndsAt ?? fallbackEndAt;
  const remaining = useCountdown(endAt, 200);
  // Absorbs the second tap of a double tap on Clues' "Start discussion", which sits where "Vote now" is.
  const [guarded] = useTapGuard();

  useEffect(() => {
    // The reducer ignores it unless the phase is 'discussion' and no deadline is set yet, so
    // StrictMode's double effect and remounts keep the first deadline.
    if (round && round.discussionEndsAt === null) dispatch({ type: 'DISCUSSION_START', endsAt: fallbackEndAt });
  }, [round, dispatch, fallbackEndAt]);

  const warnedRef = useRef(false);
  const endedRef = useRef(false);
  useEffect(() => {
    if (!warnedRef.current && remaining > 0 && remaining <= DISCUSSION_BEEP_AT_SECONDS * 1000) {
      warnedRef.current = true;
      beep('tick');
      vibrate(80);
    }
    if (!endedRef.current && remaining <= 0) {
      endedRef.current = true;
      beep('end');
      vibrate([120, 60, 120]);
    }
  }, [remaining]);

  if (!round) return null;

  const done = remaining <= 0;
  const seconds = Math.ceil(remaining / 1000);
  const clock = formatClock(seconds);

  const onVote = () => {
    unlockAudio();
    dispatch({ type: 'DISCUSSION_DONE' });
  };

  return (
    <main className="screen discussion-screen" data-testid="discussion-screen">
      <TopBar title={t('common.round', { n: round.number })} trailing={<GameMenu />} />

      <section className="discussion">
        <h2 className="pass__label">{t('discussion.title')}</h2>
        <Ring
          fraction={remaining / totalMs}
          size={240}
          stroke={12}
          danger={seconds <= DISCUSSION_BEEP_AT_SECONDS}
          className={`discussion__ring ${done ? 'is-done' : ''}`.trim()}
          ariaLabel={done ? t('discussion.timeUp') : t('discussion.remaining', { time: clock })}
        >
          <span aria-hidden="true" data-testid="discussion-clock">
            {clock}
          </span>
        </Ring>
        {done ? (
          <p className="discussion__timeup" role="status">
            {t('discussion.timeUp')}
          </p>
        ) : (
          <p className="discussion__hint">{t('discussion.hint')}</p>
        )}
      </section>

      <div className="game-actions">
        {done ? (
          <Button
            variant="primary"
            size="xl"
            block
            className={guarded ? 'is-guarded' : ''}
            disabled={guarded}
            data-testid="discussion-vote"
            onClick={onVote}
          >
            {t('discussion.vote')}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="l"
            block
            className={guarded ? 'is-guarded' : ''}
            disabled={guarded}
            data-testid="discussion-vote"
            onClick={onVote}
          >
            {t('discussion.voteNow')}
          </Button>
        )}
      </div>
    </main>
  );
}
