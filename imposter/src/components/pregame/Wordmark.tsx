import { useT } from '../../i18n';

/**
 * App wordmark: an "odd one out" tile (three accent dots, one red) next to the app name.
 * Pure SVG + CSS, no image assets, so it renders offline and in both languages.
 */
export function Wordmark() {
  const t = useT();
  return (
    <div className="wordmark">
      <svg className="wordmark__icon" viewBox="0 0 64 64" width="72" height="72" aria-hidden="true" focusable="false">
        <rect x="2" y="2" width="60" height="60" rx="18" fill="var(--bg-elev-2)" stroke="var(--line-strong)" />
        <circle cx="22" cy="22" r="8" fill="var(--accent)" />
        <circle cx="42" cy="22" r="8" fill="var(--accent)" />
        <circle cx="22" cy="42" r="8" fill="var(--accent)" />
        <circle cx="42" cy="42" r="8" fill="var(--danger)" />
        <circle cx="39.5" cy="39.5" r="1.8" fill="#fff" opacity="0.85" />
      </svg>
      <h1 className="wordmark__name">{t('app.name')}</h1>
      <p className="wordmark__tagline">{t('home.tagline')}</p>
    </div>
  );
}
