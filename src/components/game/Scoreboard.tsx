/** Results scoreboard: rank, name, points earned this round, running total; leaders highlighted. */
import type { Player } from '../../game/types';
import { useT } from '../../i18n';
import '../../styles/game.css';

export interface ScoreboardProps {
  /** Already sorted (scoreboard(state)). */
  rows: Array<{ player: Player; score: number }>;
  /** playerId -> points earned this round (outcome.points). */
  roundPoints?: Record<string, number>;
  /** Imposter ids this round (shown with a badge). */
  imposterIds?: readonly string[];
}

export function Scoreboard({ rows, roundPoints, imposterIds = [] }: ScoreboardProps) {
  const t = useT();
  const max = rows.reduce((m, r) => Math.max(m, r.score), 0);
  return (
    <ol className="scoreboard" aria-label={t('results.scoreboard')}>
      {rows.map(({ player, score }, i) => {
        const leader = max > 0 && score === max;
        const earned = roundPoints?.[player.id] ?? 0;
        return (
          <li key={player.id} className={`scoreboard__row ${leader ? 'is-leader' : ''}`.trim()}>
            <span className="scoreboard__rank" aria-hidden="true">
              {i + 1}
            </span>
            <span className="scoreboard__name">
              {player.name}
              {imposterIds.includes(player.id) && <span className="badge badge--imposter">{t('results.imposterBadge')}</span>}
              {leader && <span className="visually-hidden">{t('results.leader')}</span>}
            </span>
            <span className={`scoreboard__earned ${earned > 0 ? 'is-positive' : ''}`.trim()}>
              {earned > 0 ? t('results.plus', { n: earned }) : ''}
            </span>
            <span className="scoreboard__total">{t('results.pts', { n: score })}</span>
          </li>
        );
      })}
    </ol>
  );
}
