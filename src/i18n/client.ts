/**
 * client.ts — translations in the browser without shipping every dictionary.
 * Base.astro prints <script type="application/json" id="dv-i18n"> with the chrome strings
 * (prefixes in Base's CLIENT_PREFIXES) plus any extra keys a view passes (Base prop
 * `clientKeys`). Views can also add their own island: <script type="application/json"
 * data-dv-i18n>{...}</script> — every such island is merged.
 */
import type { Lang } from './routes';
import { interpolate, type Vars } from './interpolate';

let cache: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (cache) return cache;
  cache = {};
  for (const el of document.querySelectorAll<HTMLScriptElement>('#dv-i18n, script[data-dv-i18n]')) {
    try { Object.assign(cache, JSON.parse(el.textContent || '{}')); } catch { /* ignore a broken island */ }
  }
  return cache;
}

export function lang(): Lang {
  return document.documentElement.lang === 'en' ? 'en' : 'sq';
}

export function tc(key: string, vars?: Vars): string {
  const s = load()[key];
  return s === undefined ? key : interpolate(s, vars);
}
