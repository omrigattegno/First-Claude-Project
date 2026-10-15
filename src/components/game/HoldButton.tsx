/** Big press-and-hold button; spread `holdProps` from useReveal() on it (press shows, release hides). */
import type { HTMLAttributes, ReactNode } from 'react';
import '../../styles/game.css';

export interface HoldButtonProps {
  holdProps: HTMLAttributes<HTMLElement>;
  /** True while the secret is showing (styles the button as pressed). */
  active: boolean;
  children: ReactNode;
}

export function HoldButton({ holdProps, active, children }: HoldButtonProps) {
  return (
    <button
      type="button"
      {...holdProps}
      className={`hold-btn no-select ${active ? 'is-active' : ''}`.trim()}
      aria-pressed={active}
      data-testid="hold-button"
    >
      {children}
    </button>
  );
}
