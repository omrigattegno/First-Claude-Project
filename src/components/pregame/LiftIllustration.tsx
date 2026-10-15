/**
 * Inline SVG of the lift gesture: a phone flat on the table with a blurred card, an arrow, then the
 * phone tilted toward a face with the word visible. Contains no text so it can be mirrored with CSS
 * in RTL (the captions are HTML, rendered by the How-to screen).
 */
export function LiftIllustration({ title }: { title: string }) {
  return (
    <svg className="lift-illus" viewBox="0 0 320 150" role="img" aria-label={title}>
      <defs>
        <filter id="lift-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      {/* Flat on the table: card blurred */}
      <g>
        <ellipse cx="70" cy="122" rx="48" ry="8" fill="rgba(255,255,255,0.06)" />
        <rect x="46" y="28" width="48" height="90" rx="9" fill="var(--bg-elev-2)" stroke="var(--line-strong)" />
        <rect x="51" y="36" width="38" height="72" rx="5" fill="var(--card-secret-bg)" />
        <g filter="url(#lift-blur)" stroke="var(--card-secret-text)" strokeWidth="5" strokeLinecap="round" opacity="0.9">
          <line x1="59" y1="64" x2="81" y2="64" />
          <line x1="62" y1="78" x2="78" y2="78" />
        </g>
        <circle cx="70" cy="113" r="2" fill="rgba(255,255,255,0.3)" />
      </g>

      {/* Lift arrow */}
      <g stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M116 80 C 136 54, 158 54, 178 68" />
        <path d="M168 60 L178 68 L166 73" />
      </g>

      {/* Lifted toward the face: word visible */}
      <g>
        <g transform="rotate(32 222 118)">
          <rect x="198" y="28" width="48" height="90" rx="9" fill="var(--bg-elev-2)" stroke="var(--line-strong)" />
          <rect x="203" y="36" width="38" height="72" rx="5" fill="var(--card-secret-bg)" />
          <g stroke="var(--accent)" strokeWidth="6" strokeLinecap="round">
            <line x1="211" y1="64" x2="233" y2="64" />
            <line x1="214" y1="78" x2="230" y2="78" />
          </g>
          <circle cx="222" cy="113" r="2" fill="rgba(255,255,255,0.3)" />
        </g>
        {/* face profile looking at the phone */}
        <path
          d="M300 42 a22 22 0 1 0 0 44 l-8 -7 l8 -4 l-6 -8 l6 -3 Z"
          fill="var(--bg-elev-2)"
          stroke="var(--line-strong)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="284" cy="56" r="2.6" fill="var(--text)" />
        <path d="M278 58 L250 74" stroke="var(--accent-2)" strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
