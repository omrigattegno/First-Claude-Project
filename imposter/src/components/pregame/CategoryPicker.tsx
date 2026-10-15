import { RANDOM_CATEGORY, type WordPack } from '../../game/types';
import { useT } from '../../i18n';

export interface CategoryPickerProps {
  packs: WordPack[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/** Chip grid: Random first, then every pack of the current language (custom packs marked). */
export function CategoryPicker({ packs, selectedId, onSelect }: CategoryPickerProps) {
  const t = useT();
  const items = [
    { id: RANDOM_CATEGORY, name: t('common.random'), custom: false },
    ...packs.map((p) => ({ id: p.id, name: p.name, custom: p.id.startsWith('custom-') })),
  ];
  return (
    <div className="chips" role="radiogroup" aria-label={t('setup.category')}>
      {items.map((it) => {
        const selected = it.id === selectedId;
        return (
          <button
            type="button"
            key={it.id}
            role="radio"
            aria-checked={selected}
            className={`chip chip--button ${selected ? 'is-selected' : ''}`.trim()}
            onClick={() => onSelect(it.id)}
          >
            {it.name}
            {it.custom && <span className="chip__badge">{t('setup.customBadge')}</span>}
          </button>
        );
      })}
    </div>
  );
}
