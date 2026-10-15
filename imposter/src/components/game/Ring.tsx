import type { CSSProperties, ReactNode } from 'react';
import '../../styles/game.css';

export interface RingProps {
  /** 0..1 share of the ring that is still filled. */
  fraction: number;
  /** Diameter in px. */
  size?: number;
  /** Stroke width in px. */
  stroke?: number;
  /** Use the danger colour for the fill (e.g. last seconds). */
  danger?: boolean;
  /** Accessible description of the ring (the number inside is aria-hidden). */
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
}

/** Circular progress ring with a centred label; drawn with inline SVG so it works offline and in RTL. */
export function Ring({ fraction, size = 120, stroke = 8, danger = false, ariaLabel, className = '', children }: RingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  const style = { '--ring-size': `${size}px` } as CSSProperties;
  return (
    <div
      className={`ring ${danger ? 'ring--danger' : ''} ${className}`.trim()}
      style={style}
      role="img"
      aria-label={ariaLabel}
    >
      <svg className="ring__svg" viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="ring__fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - f)}
        />
      </svg>
      <div className="ring__label">{children}</div>
    </div>
  );
}
