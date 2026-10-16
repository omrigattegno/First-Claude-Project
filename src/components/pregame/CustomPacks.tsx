/**
 * Custom word packs section of Settings: the list of host-typed packs (with delete) and a small form
 * (name + one word per line). Packs are stored on the device only (src/words/custom.ts).
 */
import { useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Button } from '../Button';
import { Modal } from '../Modal';
import { newId } from '../../game/rng';
import { useGame } from '../../game/store';
import { RANDOM_CATEGORY } from '../../game/types';
import { useT } from '../../i18n';
import {
  deleteCustomPack,
  listCustomPacks,
  saveCustomPack,
  subscribeCustomPacks,
  type CustomPack,
} from '../../words/custom';
import { IconTrash } from './icons';

export const MIN_CUSTOM_WORDS = 5;

/** One word per line, trimmed, blank lines dropped, case-insensitive duplicates removed (first spelling wins). */
export function parseWords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const w = line.trim();
    if (!w) continue;
    const key = w.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

export function CustomPacks() {
  const t = useT();
  const { state, dispatch } = useGame();
  const packs = useSyncExternalStore(subscribeCustomPacks, listCustomPacks, listCustomPacks);
  const lang = state.settings.language;

  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<'name' | 'words' | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomPack | null>(null);
  const wordsRef = useRef<HTMLTextAreaElement>(null);

  const words = parseWords(text);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      setError('name');
      setSavedName(null);
      return;
    }
    if (words.length < MIN_CUSTOM_WORDS) {
      setError('words');
      setSavedName(null);
      return;
    }
    const id = 'custom-' + newId('c');
    saveCustomPack({ id, name: trimmed, lang, words });
    dispatch({ type: 'UPDATE_SETTINGS', patch: { categoryId: id } });
    setName('');
    setText('');
    setError(null);
    setSavedName(trimmed);
  };

  const confirmDelete = () => {
    const pack = pendingDelete;
    if (!pack) return;
    deleteCustomPack(pack.id);
    if (state.settings.categoryId === pack.id) dispatch({ type: 'UPDATE_SETTINGS', patch: { categoryId: RANDOM_CATEGORY } });
    setPendingDelete(null);
    setSavedName(null);
  };

  const langLabel = t(lang === 'he' ? 'lang.he' : 'lang.en');

  return (
    <section className="cpack">
      <div className="pg-section">
        <h2 className="pg-section__title">{t('settings.customPacks')}</h2>
        <p className="pg-muted">{t('settings.customPacksIntro')}</p>
      </div>

      {packs.length === 0 ? (
        <p className="pg-muted">{t('settings.noCustomPacks')}</p>
      ) : (
        <ul className="cpack__list">
          {packs.map((p) => (
            <li key={p.id} className="cpack__item">
              <div className="cpack__meta">
                <span className="cpack__name">{p.name}</span>
                <span className="cpack__sub">
                  {t('settings.packWords', { n: p.words.length })} · {t(p.lang === 'he' ? 'lang.he' : 'lang.en')}
                </span>
              </div>
              <button
                type="button"
                className="prow__btn prow__btn--remove"
                aria-label={t('settings.packDelete', { name: p.name })}
                onClick={() => setPendingDelete(p)}
              >
                <IconTrash />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="cpack__form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field__label">{t('settings.packName')}</span>
          <input
            className="input"
            type="text"
            value={name}
            placeholder={t('settings.packNamePlaceholder')}
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            onChange={(e) => {
              setName(e.target.value);
              if (error === 'name') setError(null);
            }}
            onKeyDown={(e) => {
              // "Next" on the keyboard moves to the words, instead of the form's implicit submission
              // (which would complain about the still-empty word list).
              if (e.key === 'Enter') {
                e.preventDefault();
                wordsRef.current?.focus();
              }
            }}
          />
        </label>
        <label className="field">
          <span className="field__label">{t('settings.packWordsLabel')}</span>
          <textarea
            ref={wordsRef}
            className="textarea"
            value={text}
            placeholder={t('settings.packWordsPlaceholder')}
            autoComplete="off"
            autoCapitalize="words"
            rows={6}
            onChange={(e) => {
              setText(e.target.value);
              if (error === 'words') setError(null);
            }}
          />
        </label>
        <p className={`pg-muted ${error === 'words' ? 'field-error' : ''}`.trim()}>
          {error === 'words'
            ? t('settings.packErr.words', { min: MIN_CUSTOM_WORDS })
            : words.length === 1
              ? t('settings.packWordsCountOne', { min: MIN_CUSTOM_WORDS })
              : t('settings.packWordsCount', { n: words.length, min: MIN_CUSTOM_WORDS })}
        </p>
        {error === 'name' && <p className="field-error">{t('settings.packErr.name')}</p>}
        <p className="pg-muted">{t('settings.packLangNote', { lang: langLabel })}</p>
        <Button type="submit" variant="primary" size="l" block>
          {t('settings.packSave')}
        </Button>
        {savedName && (
          <p className="field-ok" role="status">
            {t('settings.packSaved', { name: savedName })}
          </p>
        )}
      </form>

      <Modal
        open={pendingDelete !== null}
        title={t('settings.packDeleteTitle')}
        danger
        confirmLabel={t('settings.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        {pendingDelete ? t('settings.packDeleteBody', { name: pendingDelete.name }) : null}
      </Modal>
    </section>
  );
}
