/**
 * The black private card used by Reveal and Vote. While `revealed` is false the children are NOT
 * rendered at all (only decorative blurred bars), so the secret never exists in the DOM when the
 * phone is flat. Text selection and the iOS callout are disabled on the whole card.
 */
import type { ReactNode, SyntheticEvent } from 'react';
import '../../styles/game.css';

export interface SecretCardProps {
  revealed: boolean;
  /** Small line at the top of the card (the player's name). */
  name: string;
  className?: string;
  children: ReactNode;
}

function prevent(e: SyntheticEvent) {
  e.preventDefault();
}

export function SecretCard({ revealed, name, className = '', children }: SecretCardProps) {
  return (
    <div
      className={`secret-card no-select ${revealed ? 'is-revealed' : 'is-hidden'} ${className}`.trim()}
      data-testid="secret-card"
      data-revealed={revealed ? 'true' : 'false'}
      onContextMenu={prevent}
      onDragStart={prevent}
    >
      <div className="secret-card__name">{name}</div>
      <div className="secret-card__body">
        {revealed ? (
          children
        ) : (
          <div className="secret-card__placeholder" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </div>
  );
}

/** Size modifier for a word so a long single token (e.g. a 14-letter Hebrew word) fits 375px without clipping. */
export function wordSizeClass(word: string): string {
  const longest = word.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);
  if (longest >= 13) return 'secret-word--xlong';
  if (longest >= 9) return 'secret-word--long';
  return '';
}
