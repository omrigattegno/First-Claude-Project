/** Host-typed word packs, stored on the device only (localStorage). */
import { STORAGE_KEY_CUSTOM_PACKS } from '../game/constants';
import type { Lang, WordPack } from '../game/types';

export interface CustomPack {
  id: string; // always prefixed 'custom-'
  name: string;
  lang: Lang;
  words: string[];
}

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: CustomPack[] | null = null;

function read(): CustomPack[] {
  if (cache) return cache;
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY_CUSTOM_PACKS);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed)
      ? parsed.filter(
          (p): p is CustomPack =>
            !!p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.words),
        )
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(packs: CustomPack[]): void {
  cache = packs;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY_CUSTOM_PACKS, JSON.stringify(packs));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function listCustomPacks(): CustomPack[] {
  return read();
}

export function saveCustomPack(pack: CustomPack): void {
  const words = Array.from(new Set(pack.words.map((w) => w.trim()).filter(Boolean)));
  const next = read().filter((p) => p.id !== pack.id);
  next.push({ ...pack, words });
  write(next);
}

export function deleteCustomPack(id: string): void {
  write(read().filter((p) => p.id !== id));
}

export function subscribeCustomPacks(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadCustomPacks(): WordPack[] {
  return read()
    .filter((p) => p.words.length > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      lang: p.lang === 'he' ? 'he' : 'en',
      words: p.words.map((word) => ({ word, category: p.id, difficulty: 2 as const, aliases: [] })),
    }));
}
