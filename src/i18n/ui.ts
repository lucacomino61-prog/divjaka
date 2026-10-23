/**
 * ui.ts — t(lang, key, vars?) over every dictionary in src/i18n/dict/*.ts (server side).
 * Each dict file default-exports { sq: Record<string,string>, en: Record<string,string> }.
 * Missing English falls back to Albanian, missing Albanian to the key (and warns in dev).
 * Client code: use src/i18n/client.ts (reads the strings the page ships in #dv-i18n).
 */
import type { Lang } from './routes';
export type { Lang } from './routes';

type Dict = { sq: Record<string, string>; en: Record<string, string> };
const modules = import.meta.glob<{ default: Dict }>('./dict/*.ts', { eager: true });

const merged: Record<Lang, Record<string, string>> = { sq: {}, en: {} };
for (const [file, mod] of Object.entries(modules)) {
  const d = mod.default;
  if (!d || typeof d !== 'object') continue;
  for (const lang of ['sq', 'en'] as const) {
    for (const [k, v] of Object.entries(d[lang] ?? {})) {
      if (import.meta.env.DEV && k in merged[lang] && merged[lang][k] !== v) {
        console.warn(`[i18n] key "${k}" (${lang}) redefined in ${file}`);
      }
      merged[lang][k] = v;
    }
  }
}

import { interpolate, type Vars } from './interpolate';
export { interpolate, type Vars };

export function has(lang: Lang, key: string): boolean {
  return key in merged[lang];
}

export function t(lang: Lang, key: string, vars?: Vars): string {
  const s = merged[lang][key] ?? merged.sq[key];
  if (s === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key "${key}"`);
    return key;
  }
  return interpolate(s, vars);
}

/** Bound translator: const tr = useT(lang); tr('nav.stay'). */
export function useT(lang: Lang) {
  return (key: string, vars?: Vars) => t(lang, key, vars);
}

/** Pick strings for the client island (#dv-i18n) by key prefix, e.g. ['cart.', 'live.']. */
export function pick(lang: Lang, prefixes: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged.sq)) {
    if (prefixes.some((p) => k.startsWith(p))) out[k] = merged[lang][k] ?? v;
  }
  return out;
}

/** Choose the field for the language from a bilingual record: field(row, 'name', 'en') → row.name_en ?? row.name_sq. */
export function field<T extends Record<string, unknown>>(row: T, base: string, lang: Lang): string {
  const v = row[`${base}_${lang}`] ?? row[`${base}_sq`];
  return v == null ? '' : String(v);
}
