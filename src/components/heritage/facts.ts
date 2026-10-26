/**
 * facts.ts — sourced facts from research/heritage.json and research/seasons.json (server side).
 * Only `verified: true` entries are ever returned (PLAN §2). Sources come back in the shape
 * <SourceList> takes, with the publisher named from its host.
 */
import { readResearch } from '../site/site-data';
import type { Source } from '../site/SourceList.astro';

export type Lang = 'sq' | 'en';
export interface Fact {
  id: string; topic: string; confidence: 'high' | 'medium' | 'low';
  claim: { sq: string; en: string };
  source: Source;
}
export interface SeasonItem { type: string; text: { sq: string; en: string }; confidence: string; source: Source }
export interface SeasonMonth { month: number; name: { sq: string; en: string }; items: SeasonItem[] }

/** Research date: every source was opened (and re-checked) on this day. */
export const ACCESSED = '2026-10-23';

const PUBLISHERS: Record<string, string> = {
  'aos-alb.org': 'Shoqata Ornitologjike e Shqipërisë (AOS)',
  'akt.gov.al': 'Agjencia Kombëtare e Turizmit (AKT)',
  'akzm.gov.al': 'Agjencia Kombëtare e Zonave të Mbrojtura (AKZM)',
  'mjedisi.gov.al': 'Ministria e Mjedisit',
  'turizmi.gov.al': 'Ministria e Turizmit dhe Mjedisit',
  'ikmt.gov.al': 'IKMT',
  'medwetmanagers.net': 'MedWet',
  'faolex.fao.org': 'FAO FAOLEX',
  'rsis.ramsar.org': 'Ramsar Sites Information Service',
  'keybiodiversityareas.org': 'Key Biodiversity Areas',
  'en.wikipedia.org': 'Wikipedia (EN)',
  'sq.wikipedia.org': 'Wikipedia (SQ)',
  'router.project-osrm.org': 'OSRM · OpenStreetMap',
  'bio.bas.bg': 'Phytologia Balcanica',
  'ecoalbania.org': 'EcoAlbania',
  'mynews13.com': 'Associated Press',
  'al.boell.org': 'Heinrich Böll Stiftung Tirana',
  'exit.al': 'Exit News',
  'ppnea.org': 'PPNEA',
  'openstreetmap.org': 'OpenStreetMap',
  'worldmigratorybirdday.org': 'World Migratory Bird Day',
  'albania-spirit.com': 'Albania Spirit',
  'koreascience.kr': 'Fisheries and Aquatic Sciences',
  'sealifebase.se': 'SeaLifeBase',
  'enviweb.cz': 'Enviweb (EUCC)',
  'birdingplaces.eu': 'Birdingplaces.eu',
  'medconsortium.org': 'Mediterranean Biodiversity Consortium',
  'aman-alliance.org': 'ATA (AMAN Alliance)',
  'telegrafi.com': 'Telegrafi / BIRN',
  'shqiptarja.com': 'Shqiptarja.com',
  'travel.gjirafa.com': 'GjirafaTravel',
  'komoot.com': 'Komoot',
};
export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}
export const publisherOf = (url: string): string => PUBLISHERS[hostOf(url)] ?? hostOf(url);

type Raw = Record<string, any>;
let factCache: { src: Raw; map: Map<string, Fact> } | null = null;

export function facts(): Map<string, Fact> {
  const h = readResearch<Raw>('heritage.json');
  if (!h || !Array.isArray(h.facts)) return new Map();
  if (factCache && factCache.src === h) return factCache.map;
  const map = new Map<string, Fact>();
  for (const f of h.facts as Raw[]) {
    if (f.verified !== true || !f.source_url) continue;
    map.set(String(f.id), {
      id: String(f.id), topic: String(f.topic ?? ''),
      confidence: f.confidence,
      claim: { sq: String(f.claim_sq ?? ''), en: String(f.claim_en ?? '') },
      source: { title: String(f.source_title ?? publisherOf(f.source_url)), url: String(f.source_url), publisher: publisherOf(f.source_url), accessed: ACCESSED },
    });
  }
  factCache = { src: h, map };
  return map;
}
export const fact = (id: string): Fact | undefined => facts().get(id);
export const factCount = (): number => facts().size;

/** Sources for fact ids, de-duplicated by URL, in order. Unknown or unverified ids are skipped. */
export function sourcesFor(ids: string[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const id of ids) {
    const f = fact(id);
    if (!f || seen.has(f.source.url)) continue;
    seen.add(f.source.url);
    out.push(f.source);
  }
  return out;
}

/** A source for a bare URL (seasons.json items carry only a URL): titled from a fact with the same URL, else the publisher. */
export function sourceForUrl(url: string): Source {
  for (const f of facts().values()) if (f.source.url === url) return f.source;
  return { title: publisherOf(url), url, publisher: publisherOf(url), accessed: ACCESSED };
}

let seasonCache: { src: Raw; months: SeasonMonth[]; yearRound: SeasonItem[] } | null = null;
function seasonData() {
  const s = readResearch<Raw>('seasons.json');
  if (!s || !Array.isArray(s.months)) return { months: [] as SeasonMonth[], yearRound: [] as SeasonItem[] };
  if (seasonCache && seasonCache.src === s) return seasonCache;
  const item = (i: Raw): SeasonItem | null => (i.verified === true && i.source_url ? {
    type: String(i.type ?? ''), confidence: String(i.confidence ?? ''),
    text: { sq: String(i.text_sq ?? ''), en: String(i.text_en ?? '') },
    source: sourceForUrl(String(i.source_url)),
  } : null);
  const months = (s.months as Raw[]).map((m) => ({
    month: Number(m.month),
    name: { sq: String(m.name_sq ?? ''), en: String(m.name_en ?? '') },
    items: ((m.items ?? []) as Raw[]).map(item).filter(Boolean) as SeasonItem[],
  }));
  const yearRound = ((s.year_round ?? []) as Raw[]).map(item).filter(Boolean) as SeasonItem[];
  seasonCache = { src: s, months, yearRound };
  return seasonCache;
}
export const seasonMonths = (): SeasonMonth[] => seasonData().months;
export const seasonYearRound = (): SeasonItem[] => seasonData().yearRound;
