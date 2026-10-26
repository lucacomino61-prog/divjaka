/**
 * experiences/seasons.ts — what is in season for an experience, and which park rules apply to it
 * (server side). Everything comes from research/seasons.json and research/heritage.json through
 * T3's facts.ts (verified entries only). The short hints on the index restate one verified item
 * each; hintFor() returns the source so the page can list it.
 */
import { fact, seasonMonths, seasonYearRound, sourceForUrl, type SeasonItem } from '../heritage/facts';
import type { Source } from '../site/SourceList.astro';
import type { Product } from '../../lib/db/repo/products';
import { todayLocal } from '../booking/server';

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
    // August: the young pelicans' dispersal is not seen on the trip (offTrip leaves it off the page
    // too), so the index shows the island rule, as in July
    if (m === 8) return pick('island', factSource('park-23'));
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

/**
 * "Çfarë shihni" lists only what a guest on THIS trip sees (Luca: nothing that does not make
 * sense). Season item types per experience:
 *  - bird trips (dawn birds, boat, the guided park walk): birds + the recurring bird days;
 *  - forest trips (the guided park walk, cycling) and the Visitor Centre + tower: nature (flora);
 *  - never 'practical' (fire risk, mosquitoes: tips, not sights) nor 'beach'.
 * The tower page gets no bird items (dispersal, tracking: not seen from there) — its sight is the
 * 360° view, kept from the year-round list.
 */
function typesFor(p: Product): string[] {
  const t = new Set<string>();
  if (p.tags.includes('birds') && !isTower(p)) { t.add('birds'); t.add('event'); }
  if (p.tags.includes('nature') && (isForest(p) || isTower(p) || p.poi === 'visitor-centre')) t.add('nature');
  return [...t];
}

/** Items that describe other products or places a guest on the trip does not see. */
const offTrip = (i: SeasonItem) =>
  /disperse/i.test(i.text.en) // young pelicans leaving for Prespa and the rivers: not seen here
  || /^boat trips/i.test(i.text.en) // a research note about the lagoon's boat trips (the hotel sells its own)
  || /observation tower/i.test(i.text.en) // a 2020 school visit from the old bird hide (tagged destroyed in OSM)
  || /ringing camp caught/i.test(i.text.en); // a ringing-camp catch: a research record, not a sight

/** A bird day is shown only as a recurring date; one-off events (a 2021 celebration) are not. */
const recurring = (i: SeasonItem) => /second Saturday|around \d{1,2} [A-Z][a-z]+|every year|annual/.test(i.text.en);
/** "… (2026: 10 tetor)": the year-specific example date goes; the rule ("second Saturday") stays. */
const dropYearDate = (s: string) => s.replace(/\s*\(\d{4}: [^)]*\)/g, '');
/**
 * What a guest sees, without the research record around it (Luca: nothing that does not make
 * sense). A dated aside goes: "(in June 2024 five were fitted with satellite trackers)", "(2020:
 * common tern 240–270 pairs …)", "; in 2019 it included a local fair …", ": by late May 2020 most
 * … eggs had hatched"; the sight before it stays. "(… since 2015)" is a standing fact and stays.
 */
const YEAR = /\b(?:19|20)\d{2}\b/;
function sightOnly(s: string): string {
  return s
    .replace(/\s*\(([^)]*)\)/g, (all, inner: string) => (YEAR.test(inner) && !/since|që nga/i.test(inner) ? '' : all))
    .replace(/;\s[^;.]*\b(?:19|20)\d{2}\b[^;.]*(?=[;.]|$)/g, '')
    .replace(/:\s[^:;.]*\b(?:19|20)\d{2}\b[^;.]*(;\s|\.|$)/g, (_all, end: string) => (end.startsWith(';') ? ': ' : end))
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** The year-specific date of an event, as YYYY-MM-DD (from "(2026: 10 October)"), or null. */
function eventDate(en: string): string | null {
  const m = en.match(/\((\d{4}): (\d{1,2}) ([A-Z][a-z]+)\)/);
  const mo = m ? MONTH_EN.indexOf(m[3]) + 1 : 0;
  return m && mo ? `${m[1]}-${String(mo).padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
}

export interface MonthRow { month: number; name: string; runs: boolean; items: { text: string; source: Source }[] }

/** Twelve months: does the experience run, and what verified observations fit it. */
export function seasonRows(p: Product, lang: Lang): { months: MonthRow[]; yearRound: { text: string; source: Source }[]; sources: Source[] } {
  const types = typesFor(p);
  const today = todayLocal();
  const sources: Source[] = [];
  const keep = (i: SeasonItem) => {
    if (!sources.some((s) => s.url === i.source.url)) sources.push(i.source);
    return { text: sightOnly(i.type === 'event' ? dropYearDate(i.text[lang]) : i.text[lang]), source: i.source };
  };
  const fits = (i: SeasonItem) => {
    if (!types.includes(i.type) || offTrip(i)) return false;
    if (i.type !== 'event') return true;
    if (!recurring(i)) return false;
    // this year's date already passed (shown under "Tetor · Tani" on 26 October): leave it out
    const d = eventDate(i.text.en);
    return !(d && d.slice(0, 4) === today.slice(0, 4) && d.slice(0, 7) === today.slice(0, 7) && d < today);
  };
  const runs = new Set(p.seasons.length ? p.seasons : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const months = seasonMonths().map((m) => ({
    month: m.month, name: m.name[lang], runs: runs.has(m.month),
    items: m.items.filter(fits).map(keep),
  }));
  // year-round: flamingos on the bird trips, the forest paths on the forest trips, the 360° view
  // on the tower; never the research note on boat trips or the practical lines
  const yearRound = seasonYearRound().filter((i) => {
    if (!fits(i)) return false;
    if (i.type !== 'nature') return true;
    const tower = /360/.test(i.text.en), forest = /pine forest/i.test(i.text.en);
    return (tower && isTower(p)) || (forest && (isForest(p) || p.poi === 'visitor-centre'));
  }).map(keep);
  return { months, yearRound, sources };
}

/**
 * Source titles that tell entries apart: several AOS pages share the publisher as their title;
 * those get the page's own name from its URL path ("AOS · The greater spotted eagle wintering
 * again in Divjaka-Karavasta National Park").
 */
export function distinctTitle(s: Source, all: Source[]): Source {
  const twin = all.some((x) => x !== s && x.url !== s.url && x.title === s.title);
  if (s.title !== s.publisher && !twin) return s;
  try {
    const u = new URL(s.url);
    const seg = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '')
      .replace(/\.(pdf|html?)$/i, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!seg) return s;
    const words = (seg.charAt(0).toUpperCase() + seg.slice(1))
      .replace(/\b(divjak[aeë]?|karavasta|albania|shqip[eë]ri[aë]?)\b/gi, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    const short = /\(([^)]+)\)$/.exec(s.title)?.[1] ?? s.publisher;
    return { ...s, title: `${short} · ${words}` };
  } catch { return s; }
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
