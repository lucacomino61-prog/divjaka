/**
 * experiences/seasons.ts — what is in season for an experience, and which park rules apply to it
 * (server side). Everything comes from research/seasons.json and research/heritage.json through
 * T3's facts.ts (verified entries only). The short hints on the index restate one verified item
 * each; hintFor() returns the source so the page can list it.
 */
import { fact, seasonMonths, seasonYearRound, sourceForUrl, type SeasonItem } from '../heritage/facts';
import type { Source } from '../site/SourceList.astro';
import type { Product } from '../../lib/db/repo/products';

type Lang = 'sq' | 'en';
export interface Hint { key: string; source: Source }

const isTower = (p: Product) => p.poi === 'tower-360' || /kulla-360/.test(p.slug);
const isForest = (p: Product) => /pisha|pine|biciklete/.test(p.slug) || p.tags.includes('active');
const factSource = (id: string): Source | null => fact(id)?.source ?? null;
const monthSource = (m: number, type: string): Source | null => {
  const it = seasonMonths().find((x) => x.month === m)?.items.find((i) => i.type === type);
  return it?.source ?? null;
};

/** One short "in season" hint for month m (1–12), or null. */
export function hintFor(p: Product, m: number): Hint | null {
  const pick = (key: string, src: Source | null): Hint | null => (src ? { key, source: src } : null);
  if (isTower(p)) return pick('sunset', factSource('visit-02'));
  if (p.tags.includes('birds')) {
    if (m >= 1 && m <= 6) return pick('pelicans', factSource('birds-10'));
    if (m === 7) return pick('island', factSource('park-23'));
    if (m === 8) return pick('young', monthSource(8, 'birds'));
    if (m === 9 || m === 10) return pick('autumn', monthSource(9, 'birds'));
    return pick('winter', monthSource(11, 'birds'));
  }
  if (p.tags.includes('nature') && isForest(p)) {
    if (m >= 3 && m <= 5) return pick('orchid', factSource('flora-07'));
    if (m === 7 || m === 8) return pick('fire', factSource('park-21'));
    return pick('forest', factSource('flora-02'));
  }
  return null;
}

/** Season item types that matter for an experience. */
function typesFor(p: Product): string[] {
  const t = new Set<string>();
  if (p.tags.includes('birds')) { t.add('birds'); t.add('event'); }
  if (p.tags.includes('nature')) { t.add('nature'); t.add('practical'); }
  if (p.tags.includes('beach')) t.add('beach');
  if (isTower(p)) { t.add('nature'); t.add('birds'); }
  return [...t];
}

export interface MonthRow { month: number; name: string; runs: boolean; items: { text: string; source: Source }[] }

/** Twelve months: does the experience run, and what verified observations fit it. */
export function seasonRows(p: Product, lang: Lang): { months: MonthRow[]; yearRound: { text: string; source: Source }[]; sources: Source[] } {
  const types = typesFor(p);
  const sources: Source[] = [];
  const keep = (i: SeasonItem) => {
    if (!sources.some((s) => s.url === i.source.url)) sources.push(i.source);
    return { text: i.text[lang], source: i.source };
  };
  const runs = new Set(p.seasons.length ? p.seasons : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const months = seasonMonths().map((m) => ({
    month: m.month, name: m.name[lang], runs: runs.has(m.month),
    items: types.length ? m.items.filter((i) => types.includes(i.type)).map(keep) : [],
  }));
  const yearRound = types.length
    ? seasonYearRound().filter((i) => types.includes(i.type) && !(i.type === 'nature' && !isTower(p) && /360/.test(i.text.en)) && !(isTower(p) && /cycle|biçiklet/i.test(i.text.en))).map(keep)
    : [];
  return { months, yearRound, sources };
}

/** Park rules (Law 81/2017 and the park's own) that matter for this experience: fact ids. */
export function rulesFor(p: Product): string[] {
  if (!p.tags.includes('nature') && !p.tags.includes('birds')) return [];
  const ids = new Set<string>();
  if (p.poi === 'lagoon-boat-trips' || /varke|boat/.test(p.slug)) { ids.add('park-23'); ids.add('park-22'); }
  if (p.tags.includes('birds')) { ids.add('park-23'); ids.add('park-24'); ids.add('park-22'); }
  if (p.tags.includes('nature')) { ids.add('park-22'); ids.add('park-21'); }
  return [...ids].filter((id) => fact(id));
}

export const ruleText = (id: string, lang: Lang) => fact(id)?.claim[lang] ?? '';
export const ruleSource = (id: string) => fact(id)?.source ?? null;
export { sourceForUrl };
