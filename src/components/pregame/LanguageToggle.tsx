import { Segmented } from '../Segmented';
import { RANDOM_CATEGORY, type Lang, type Settings } from '../../game/types';
import { useGame } from '../../game/store';
import { useT } from '../../i18n';
import { packsFor } from '../../words';

/**
 * The UPDATE_SETTINGS patch for switching language. Word packs are per language, so a category
 * that does not exist in the new language (e.g. the Hebrew-only "Israeli" pack, or a custom pack)
 * falls back to Random instead of leaving a dangling selection.
 */
export function languagePatch(settings: Settings, language: Lang): Partial<Settings> {
  const keep = settings.categoryId === RANDOM_CATEGORY || packsFor(language).some((p) => p.id === settings.categoryId);
  return keep ? { language } : { language, categoryId: RANDOM_CATEGORY };
}

/** Compact English / עברית switch. Both labels are shown in their own language on purpose. */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const t = useT();
  const { state, dispatch } = useGame();
  return (
    <div className={`lang-toggle ${className}`.trim()}>
      <Segmented<Lang>
        aria-label={t('home.languageLabel')}
        testId="lang"
        value={state.settings.language}
        options={[
          { value: 'en', label: t('lang.en') },
          { value: 'he', label: t('lang.he') },
        ]}
        onChange={(language) => dispatch({ type: 'UPDATE_SETTINGS', patch: languagePatch(state.settings, language) })}
      />
    </div>
  );
}
