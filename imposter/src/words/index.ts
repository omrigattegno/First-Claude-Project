/**
 * Built-in word packs. They are imported statically so they are bundled into
 * the app shell and work fully offline. Each JSON file is one category in one
 * language: { id, name, lang, words: [{ word, difficulty, aliases, pair? }] }.
 */
import type { Lang, WordPack, WordRecord } from '../game/types';
import { loadCustomPacks } from './custom';

import enAnimals from './en/animals.json';
import enFamousPeople from './en/famous-people.json';
import enFood from './en/food.json';
import enHousehold from './en/household.json';
import enMoviesTv from './en/movies-tv.json';
import enPlaces from './en/places.json';
import enProfessions from './en/professions.json';
import enSports from './en/sports.json';

import heAnimals from './he/animals.json';
import heFamousPeople from './he/famous-people.json';
import heFood from './he/food.json';
import heHousehold from './he/household.json';
import heIsraeli from './he/israeli.json';
import heMoviesTv from './he/movies-tv.json';
import hePlaces from './he/places.json';
import heProfessions from './he/professions.json';
import heSports from './he/sports.json';

export interface RawWord {
  word: string;
  difficulty: number;
  aliases?: string[];
  pair?: string;
}
export interface RawPack {
  id: string;
  name: string;
  lang: string;
  words: RawWord[];
}

export function toPack(raw: RawPack): WordPack {
  const lang: Lang = raw.lang === 'he' ? 'he' : 'en';
  const words: WordRecord[] = raw.words.map((w) => ({
    word: w.word,
    category: raw.id,
    difficulty: w.difficulty === 1 || w.difficulty === 3 ? w.difficulty : 2,
    aliases: w.aliases ?? [],
    ...(w.pair ? { pair: w.pair } : {}),
  }));
  return { id: raw.id, name: raw.name, lang, words };
}

export const CATEGORY_IDS = [
  'food',
  'places',
  'animals',
  'movies-tv',
  'sports',
  'household',
  'professions',
  'famous-people',
  'israeli',
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

export const BUILTIN_PACKS: WordPack[] = [
  enFood,
  enPlaces,
  enAnimals,
  enMoviesTv,
  enSports,
  enHousehold,
  enProfessions,
  enFamousPeople,
  heFood,
  hePlaces,
  heAnimals,
  heMoviesTv,
  heSports,
  heHousehold,
  heProfessions,
  heFamousPeople,
  heIsraeli,
].map((p) => toPack(p as RawPack));

/** Built-in + custom packs for a language, in display order. */
export function packsFor(lang: Lang): WordPack[] {
  return [...BUILTIN_PACKS.filter((p) => p.lang === lang), ...loadCustomPacks().filter((p) => p.lang === lang)];
}

export function allPacks(): WordPack[] {
  return [...BUILTIN_PACKS, ...loadCustomPacks()];
}
