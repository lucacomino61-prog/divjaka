/**
 * prefs.ts — visitor preferences in localStorage (no cookies, PLAN §8).
 *   'dv-prefs'  { interests: string[], currency: 'ALL' | 'EUR' }
 *   'dv-viewed' string[] of product slugs, newest first, max 30
 * Emits window 'dv:prefs' (detail = prefs) after every change, also for changes in other tabs.
 */
export type Currency = 'ALL' | 'EUR';
export interface Prefs { interests: string[]; currency: Currency }

const KEY = 'dv-prefs';
const VIEWED = 'dv-viewed';
const MAX_VIEWED = 30;
const DEFAULTS: Prefs = { interests: [], currency: 'ALL' };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode / quota */ }
}

export function getPrefs(): Prefs {
  const p = read<Partial<Prefs>>(KEY, {});
  return {
    interests: Array.isArray(p.interests) ? p.interests.filter((s) => typeof s === 'string').slice(0, 20) : [],
    currency: p.currency === 'EUR' ? 'EUR' : 'ALL',
  };
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...DEFAULTS, ...getPrefs(), ...patch };
  write(KEY, next);
  window.dispatchEvent(new CustomEvent('dv:prefs', { detail: next }));
  return next;
}

export const setInterests = (interests: string[]) => setPrefs({ interests: [...new Set(interests)] });
export function toggleInterest(tag: string): string[] {
  const cur = new Set(getPrefs().interests);
  cur.has(tag) ? cur.delete(tag) : cur.add(tag);
  return setPrefs({ interests: [...cur] }).interests;
}
export const setCurrency = (currency: Currency) => setPrefs({ currency });
export const getCurrency = (): Currency => getPrefs().currency;

/** Lek per euro, printed by the server on <html data-eur-rate> from the admin setting. */
export function eurRate(): number {
  const r = Number(document.documentElement.dataset.eurRate);
  return Number.isFinite(r) && r > 0 ? r : 0;
}

export function getViewed(): string[] {
  const v = read<unknown>(VIEWED, []);
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, MAX_VIEWED) : [];
}
/** Record a product view (moves it to the front). */
export function addViewed(slug: string): string[] {
  if (!slug) return getViewed();
  const next = [slug, ...getViewed().filter((s) => s !== slug)].slice(0, MAX_VIEWED);
  write(VIEWED, next);
  window.dispatchEvent(new CustomEvent('dv:prefs', { detail: getPrefs() }));
  return next;
}
export function clearViewed() { write(VIEWED, []); window.dispatchEvent(new CustomEvent('dv:prefs', { detail: getPrefs() })); }

export function onPrefs(cb: (p: Prefs) => void): () => void {
  const h = () => cb(getPrefs());
  const s = (e: StorageEvent) => { if (e.key === KEY || e.key === VIEWED) h(); };
  window.addEventListener('dv:prefs', h);
  window.addEventListener('storage', s);
  return () => { window.removeEventListener('dv:prefs', h); window.removeEventListener('storage', s); };
}
