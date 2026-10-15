import type { ReactNode } from 'react';
import './TopBar.css';

export interface TopBarProps {
  title?: ReactNode;
  /** Rendered at the start (leading) edge, e.g. a Back button. */
  leading?: ReactNode;
  /** Rendered at the end (trailing) edge, e.g. a settings gear. */
  trailing?: ReactNode;
}

/** Screen header. Uses logical start/end so it mirrors correctly in RTL. */
export function TopBar({ title, leading, trailing }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__slot">{leading}</div>
      <h1 className="topbar__title">{title}</h1>
      <div className="topbar__slot topbar__slot--end">{trailing}</div>
    </header>
  );
}
