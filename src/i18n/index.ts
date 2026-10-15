import { useCallback } from 'react';
import type { Lang } from '../game/types';
import { useGameState } from '../game/store';
import { common } from './messages.common';
import { game } from './messages.game';
import { pregame } from './messages.pregame';

export type MessageKey = keyof typeof common.en | keyof typeof pregame.en | keyof typeof game.en;
type Params = Record<string, string | number>;

const messages: Record<Lang, Record<MessageKey, string>> = {
  en: { ...common.en, ...pregame.en, ...game.en },
  he: { ...common.he, ...pregame.he, ...game.he },
};

export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  const template = messages[lang][key] ?? messages.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}

export function isRtl(lang: Lang): boolean {
  return lang === 'he';
}

export type Translate = (key: MessageKey, params?: Params) => string;

/** Translation hook bound to the current game language. */
export function useT(): Translate {
  const lang = useGameState().settings.language;
  return useCallback((key: MessageKey, params?: Params) => translate(lang, key, params), [lang]);
}

export function useLang(): Lang {
  return useGameState().settings.language;
}
