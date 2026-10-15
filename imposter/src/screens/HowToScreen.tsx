/** How to play: one screen, six numbered steps, the scoring line and the lift gesture illustrated. */
import { Button } from '../components/Button';
import { TopBar } from '../components/TopBar';
import { BackButton } from '../components/pregame/BackButton';
import { LiftIllustration } from '../components/pregame/LiftIllustration';
import { useT, type MessageKey } from '../i18n';
import { useNav } from '../nav';
import '../styles/pregame.css';

const STEPS: MessageKey[] = [
  'howto.step1',
  'howto.step2',
  'howto.step3',
  'howto.step4',
  'howto.step5',
  'howto.step6',
];

export function HowToScreen() {
  const t = useT();
  const { back } = useNav();

  return (
    <main className="screen howto" data-testid="howto-screen">
      <TopBar leading={<BackButton onClick={() => back()} testId="howto-back" />} title={t('common.howToPlay')} />

      <p className="howto__intro">{t('howto.intro')}</p>

      <ol className="howto__steps">
        {STEPS.map((key, i) => (
          <li key={key} className="howto__step">
            <span className="howto__num" aria-hidden="true">
              {i + 1}
            </span>
            <span className="howto__text">{t(key)}</span>
          </li>
        ))}
      </ol>

      <p className="howto__scoring">{t('howto.scoring')}</p>

      <section className="howto__lift">
        <h2 className="howto__liftTitle">{t('howto.liftTitle')}</h2>
        <LiftIllustration title={t('howto.liftTitle')} />
        <div className="howto__captions">
          <span>{t('howto.liftFlat')}</span>
          <span>{t('howto.liftUp')}</span>
        </div>
        <p className="howto__note">{t('howto.liftNote')}</p>
      </section>

      <div className="pg-grow" />

      <Button variant="primary" size="l" block data-testid="howto-done" onClick={() => back()}>
        {t('howto.gotIt')}
      </Button>
    </main>
  );
}
