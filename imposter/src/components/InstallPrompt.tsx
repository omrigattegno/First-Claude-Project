/**
 * "Add to Home Screen" card (rendered on the Home screen).
 *  - Android / desktop Chromium: appears once `beforeinstallprompt` was captured (lib/pwa.ts); the button
 *    opens the native install dialog.
 *  - iOS: Safari has no install API, so the card explains Share > Add to Home Screen.
 *  - Hidden when already running standalone, and after the user dismisses it (localStorage).
 *
 * The strings live here rather than in i18n/messages.* (those modules belong to the screens); both
 * languages are still required by the `Record<keyof typeof en, string>` shape, like the message modules.
 * Styling is inline with design tokens and logical properties, so the card mirrors under dir="rtl".
 */
import { useState, type CSSProperties } from 'react';
import { useLang } from '../i18n';
import { dismissInstall, isInstallDismissed, isIOS, isStandalone, promptInstall, useCanInstall } from '../lib/pwa';
import { Button } from './Button';

const en = {
  title: 'Add Imposter to your Home Screen',
  body: 'Opens full screen and works with no internet, so it is ready at any table.',
  install: 'Add to Home Screen',
  iosHint: 'In Safari tap Share ▸ Add to Home Screen',
  dismiss: 'Not now',
} as const;

const he: Record<keyof typeof en, string> = {
  title: 'הוסיפו את „מתחזה” למסך הבית',
  body: 'נפתח במסך מלא ועובד גם בלי אינטרנט, מוכן לכל שולחן.',
  install: 'הוספה למסך הבית',
  iosHint: 'ב‑Safari הקישו על שיתוף ◂ הוסף למסך הבית',
  dismiss: 'לא עכשיו',
};

const messages = { en, he };

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
  borderRadius: 'var(--radius-l)',
  background: 'var(--bg-elev)',
  border: '1px solid var(--line)',
};
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' };
const textStyle: CSSProperties = { flex: '1 1 auto', minWidth: 0, textAlign: 'start' };
const titleStyle: CSSProperties = { fontSize: 'var(--fs-m)', fontWeight: 700, marginBlockEnd: 'var(--space-1)' };
const bodyStyle: CSSProperties = { color: 'var(--text-muted)', fontSize: 'var(--fs-s)' };
const closeStyle: CSSProperties = {
  flex: 'none',
  minWidth: 'var(--tap)',
  paddingInline: 0,
  marginBlockStart: 'calc(-1 * var(--space-2))',
  marginInlineEnd: 'calc(-1 * var(--space-2))',
};

export function InstallPrompt() {
  const lang = useLang();
  const canInstall = useCanInstall();
  const [dismissed, setDismissed] = useState(isInstallDismissed);
  // Environment facts do not change during a page's life; read them once.
  const [standalone] = useState(isStandalone);
  const [ios] = useState(isIOS);
  const [busy, setBusy] = useState(false);

  if (dismissed || standalone) return null;
  const mode = canInstall ? 'native' : ios ? 'ios' : null;
  if (!mode) return null;
  const m = messages[lang];

  const dismiss = () => {
    dismissInstall();
    setDismissed(true);
  };

  const install = async () => {
    setBusy(true);
    const outcome = await promptInstall();
    setBusy(false);
    if (outcome === 'accepted') dismiss();
  };

  return (
    <section className="install-card" aria-label={m.title} style={cardStyle}>
      <div style={rowStyle}>
        <div style={textStyle}>
          <h2 style={titleStyle}>{m.title}</h2>
          <p style={bodyStyle}>{mode === 'native' ? m.body : m.iosHint}</p>
        </div>
        <Button variant="ghost" aria-label={m.dismiss} title={m.dismiss} onClick={dismiss} style={closeStyle}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Button>
      </div>
      {mode === 'native' && (
        <Button variant="primary" size="l" block onClick={install} disabled={busy}>
          {m.install}
        </Button>
      )}
    </section>
  );
}
