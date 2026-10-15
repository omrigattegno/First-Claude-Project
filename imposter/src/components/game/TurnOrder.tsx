/** Clue turn order as a wrapping row of numbered chips: done ones ticked, the current one highlighted. */
import { useT } from '../../i18n';
import '../../styles/game.css';

export type TurnStatus = 'done' | 'current' | 'todo';

export interface TurnOrderItem {
  id: string;
  name: string;
  status: TurnStatus;
}

export function TurnOrder({ items }: { items: TurnOrderItem[] }) {
  const t = useT();
  return (
    <ol className="turn-list" aria-label={t('clues.order')}>
      {items.map((it, i) => (
        <li
          key={it.id}
          className={`turn-chip is-${it.status}`}
          aria-current={it.status === 'current' ? 'step' : undefined}
        >
          <span className="turn-chip__n" aria-hidden="true">
            {it.status === 'done' ? '✓' : i + 1}
          </span>
          <span className="turn-chip__name">{it.name}</span>
        </li>
      ))}
    </ol>
  );
}
