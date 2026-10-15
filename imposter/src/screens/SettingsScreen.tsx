/**
 * Settings: every row of the brief's Settings table (all via UPDATE_SETTINGS) plus custom word packs.
 * Opened from Setup or Results; Back pops to whichever opened it (falling back to Setup, or to the
 * game screen while a round is in progress, when the stack is empty after a refresh).
 */
import { Button } from '../components/Button';
import { Segmented } from '../components/Segmented';
import { TopBar } from '../components/TopBar';
import { BackButton } from '../components/pregame/BackButton';
import { CustomPacks } from '../components/pregame/CustomPacks';
import { languagePatch } from '../components/pregame/LanguageToggle';
import { OnOffSwitch, SettingRow } from '../components/pregame/SettingRow';
import { useGame } from '../game/store';
import type { Difficulty, Lang, Penalty, RevealMethod, Settings } from '../game/types';
import { useT, type MessageKey } from '../i18n';
import { requestSensorPermission, useSensorPermission, type SensorPermission } from '../lib/sensors';
import { useNav } from '../nav';
import '../styles/pregame.css';

const SENSOR_STATUS: Record<SensorPermission, MessageKey> = {
  unsupported: 'settings.sensors.unsupported',
  prompt: 'settings.sensors.prompt',
  granted: 'settings.sensors.granted',
  denied: 'settings.sensors.denied',
};

const DISCUSSION_OPTIONS = [0, 30, 45, 60, 90, 120, 180] as const;

export function SettingsScreen() {
  const t = useT();
  const { state, dispatch } = useGame();
  const { back } = useNav();
  const permission = useSensorPermission();
  const s = state.settings;
  const patch = (p: Partial<Settings>) => dispatch({ type: 'UPDATE_SETTINGS', patch: p });
  const fallback = state.phase === 'setup' ? 'setup' : 'game';
  const goBack = () => back(fallback);

  return (
    <main className="screen settings" data-testid="settings-screen">
      <TopBar leading={<BackButton onClick={goBack} testId="settings-back-top" />} title={t('common.settings')} />

      {state.phase !== 'setup' && (
        <div className="notice settings__note" role="status">
          {t('settings.nextRoundNote')}
        </div>
      )}

      <div className="settings__list">
        <SettingRow label={t('settings.imposters')} hint={t('settings.impostersHint')}>
          <Segmented<1 | 2>
            aria-label={t('settings.imposters')}
            testId="settings-imposters"
            value={s.imposterCount}
            options={[
              { value: 1, label: '1' },
              { value: 2, label: '2' },
            ]}
            onChange={(imposterCount) => patch({ imposterCount })}
          />
        </SettingRow>

        <SettingRow label={t('settings.clueRounds')} hint={t('settings.clueRoundsHint')}>
          <Segmented<1 | 2 | 3>
            aria-label={t('settings.clueRounds')}
            testId="settings-clue-rounds"
            value={s.clueRounds}
            options={[
              { value: 1, label: '1' },
              { value: 2, label: '2' },
              { value: 3, label: '3' },
            ]}
            onChange={(clueRounds) => patch({ clueRounds })}
          />
        </SettingRow>

        <SettingRow label={t('settings.discussion')} hint={t('settings.discussionHint')} className="srow--dense">
          <Segmented<number>
            aria-label={t('settings.discussion')}
            testId="settings-discussion"
            value={s.discussionSeconds}
            options={DISCUSSION_OPTIONS.map((sec) => ({ value: sec, label: sec === 0 ? t('common.off') : String(sec) }))}
            onChange={(discussionSeconds) => patch({ discussionSeconds })}
          />
        </SettingRow>

        <SettingRow label={t('settings.imposterSeesCategory')} hint={t('settings.imposterSeesCategoryHint')}>
          <OnOffSwitch
            aria-label={t('settings.imposterSeesCategory')}
            value={s.imposterSeesCategory}
            onChange={(imposterSeesCategory) => patch({ imposterSeesCategory })}
          />
        </SettingRow>

        <SettingRow label={t('settings.imposterGuess')} hint={t('settings.imposterGuessHint')}>
          <OnOffSwitch
            aria-label={t('settings.imposterGuess')}
            value={s.imposterGuess}
            onChange={(imposterGuess) => patch({ imposterGuess })}
          />
        </SettingRow>

        <SettingRow label={t('settings.revealMethod')} status={t(SENSOR_STATUS[permission])}>
          <Segmented<RevealMethod>
            aria-label={t('settings.revealMethod')}
            testId="settings-reveal"
            value={s.revealMethod}
            options={[
              { value: 'lift', label: t('settings.reveal.lift') },
              { value: 'hold', label: t('settings.reveal.hold') },
            ]}
            onChange={(revealMethod) => {
              patch({ revealMethod });
              // Still inside the tap: iOS grants sensor access only from a user gesture, and the status
              // line below updates right away. Setup's Start button asks again if this was skipped.
              if (revealMethod === 'lift') void requestSensorPermission();
            }}
          />
        </SettingRow>

        <SettingRow label={t('settings.difficulty')}>
          <Segmented<Difficulty>
            aria-label={t('settings.difficulty')}
            testId="settings-difficulty"
            value={s.difficulty}
            options={[
              { value: 'easy', label: t('settings.difficulty.easy') },
              { value: 'normal', label: t('settings.difficulty.normal') },
              { value: 'hard', label: t('settings.difficulty.hard') },
            ]}
            onChange={(difficulty) => patch({ difficulty })}
          />
        </SettingRow>

        <SettingRow label={t('settings.language')} hint={t('settings.languageHint')}>
          <Segmented<Lang>
            aria-label={t('settings.language')}
            testId="settings-lang"
            value={s.language}
            options={[
              { value: 'en', label: t('lang.en') },
              { value: 'he', label: t('lang.he') },
            ]}
            onChange={(language) => patch(languagePatch(s, language))}
          />
        </SettingRow>

        <SettingRow label={t('settings.penalty')} hint={t('settings.penaltyHint')}>
          <Segmented<Penalty>
            aria-label={t('settings.penalty')}
            testId="settings-penalty"
            value={s.penalty}
            options={[
              { value: 'off', label: t('common.off') },
              { value: 'dare', label: t('settings.penalty.dare') },
              { value: 'drink', label: t('settings.penalty.drink') },
            ]}
            onChange={(penalty) => patch({ penalty })}
          />
        </SettingRow>
      </div>

      <hr className="settings__divider" />

      <CustomPacks />

      <div className="pg-grow" />

      <Button variant="secondary" size="l" block data-testid="settings-back" onClick={goBack}>
        {t('common.back')}
      </Button>
    </main>
  );
}
