/**
 * Shop filters in the URL (PLAN §4, §8: state in the URL). Shared by the server (Shop.astro)
 * and the browser (scripts/shop.ts), so both read and write the same query string:
 *   ?lloji=<kind>&interes=<interest>&q=<words>&rendit=<sort>&pamja=liste
 * The keys and values are Albanian on both language versions (one URL scheme, shareable);
 * English aliases (room, birds, price…) are accepted on input and rewritten to the Albanian
 * value. Unknown values are ignored, never echoed.
 */
import { fold } from '../../lib/text';

export type Kind = 'room' | 'experience' | 'bundle' | 'gift' | 'goods';
export type Sort = 'featured' | 'price' | 'price_desc' | 'name' | 'soon';
export type View = 'grid' | 'list';

export const KIND_ORDER: Kind[] = ['room', 'experience', 'bundle', 'gift', 'goods'];
export const KIND_PARAM: Record<Kind, string> = {
  room: 'qendrime', experience: 'eksperienca', bundle: 'paketa', gift: 'dhurata', goods: 'per-udhetimin',
};
export const INTEREST_ORDER = ['birds', 'nature', 'beach', 'culture', 'food', 'active', 'family', 'couple', 'slow', 'rainy'] as const;
export type Interest = (typeof INTEREST_ORDER)[number];
export const INTEREST_PARAM: Record<Interest, string> = {
  birds: 'zogj', nature: 'natyre', beach: 'plazh', culture: 'kulture', food: 'ushqim',
  active: 'aktiv', family: 'familje', couple: 'cift', slow: 'qetesi', rainy: 'dite-me-shi',
};
export const SORT_ORDER: Sort[] = ['featured', 'price', 'price_desc', 'name', 'soon'];
export const SORT_PARAM: Record<Sort, string> = {
  featured: '', price: 'cmimi', price_desc: 'cmimi-zbrites', name: 'emri', soon: 'data',
};

const invert = <K extends string>(m: Record<K, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k])) as Record<string, K>;
const KIND_FROM = { ...invert(KIND_PARAM), room: 'room', experience: 'experience', bundle: 'bundle', gift: 'gift', goods: 'goods' } as Record<string, Kind>;
const INTEREST_FROM = { ...invert(INTEREST_PARAM), ...Object.fromEntries(INTEREST_ORDER.map((i) => [i, i])) } as Record<string, Interest>;
const SORT_FROM = { ...invert(SORT_PARAM), price: 'price', '-price': 'price_desc', name: 'name', soon: 'soon', featured: 'featured' } as Record<string, Sort>;

export interface ShopState { kind: Kind | null; interest: Interest | null; q: string; sort: Sort; view: View }

export function readState(params: URLSearchParams): ShopState {
  const k = (params.get('lloji') ?? '').trim().toLowerCase();
  const i = (params.get('interes') ?? '').trim().toLowerCase();
  const s = (params.get('rendit') ?? '').trim().toLowerCase();
  const v = (params.get('pamja') ?? '').trim().toLowerCase();
  const q = (params.get('q') ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60);
  return {
    kind: KIND_FROM[k] ?? null,
    interest: INTEREST_FROM[i] ?? null,
    q,
    sort: s ? SORT_FROM[s] ?? 'featured' : 'featured',
    view: v === 'liste' || v === 'list' ? 'list' : 'grid',
  };
}

/** The canonical query string for a state ('' when nothing is set). */
export function writeState(s: ShopState): string {
  const p = new URLSearchParams();
  if (s.kind) p.set('lloji', KIND_PARAM[s.kind]);
  if (s.interest) p.set('interes', INTEREST_PARAM[s.interest]);
  if (s.q) p.set('q', s.q);
  if (s.sort !== 'featured') p.set('rendit', SORT_PARAM[s.sort]);
  if (s.view === 'list') p.set('pamja', 'liste');
  const str = p.toString();
  return str ? `?${str}` : '';
}

/** What each specimen carries for filtering on both sides. */
export interface ItemFacts { kind: Kind; tags: string[]; hay: string; price: number; name: string; rank: number; next: string | null }

export function queryTokens(q: string): string[] {
  return fold(q).split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
}

export function matches(it: ItemFacts, s: ShopState, qt = queryTokens(s.q)): boolean {
  if (s.kind && it.kind !== s.kind) return false;
  if (s.interest && !it.tags.includes(s.interest)) return false;
  if (qt.length && !qt.every((t) => it.hay.includes(t))) return false;
  return true;
}

export function compare(s: Sort, lang: 'sq' | 'en') {
  return (a: ItemFacts, b: ItemFacts): number => {
    switch (s) {
      case 'price': return a.price - b.price || a.rank - b.rank;
      case 'price_desc': return b.price - a.price || a.rank - b.rank;
      // Albanian by its own alphabet (Chrome has no Albanian collation, Node's ICU has one: the
      // server and the browser must agree), English by the browser's English collation
      case 'name': return (lang === 'sq' ? albCompare(a.name, b.name) : a.name.localeCompare(b.name, 'en')) || a.rank - b.rank;
      case 'soon': {
        // experiences by their next open session; undated items (rooms, goods, gifts, bundles)
        // follow in the hotel's own order

        const x = a.next ?? '9999', y = b.next ?? '9999';
        return x < y ? -1 : x > y ? 1 : a.rank - b.rank;
      }
      default: return a.rank - b.rank;
    }
  };
}

/** The Albanian alphabet, digraphs as single letters: a b c ç d dh e ë f g gj h i j k l ll m n nj o p q r rr s sh t th u v x xh y z zh. */
const ALB = ['a', 'b', 'c', 'ç', 'd', 'dh', 'e', 'ë', 'f', 'g', 'gj', 'h', 'i', 'j', 'k', 'l', 'll', 'm', 'n', 'nj', 'o', 'p', 'q', 'r', 'rr', 's', 'sh', 't', 'th', 'u', 'v', 'x', 'xh', 'y', 'z', 'zh'];
const ALB_INDEX = new Map(ALB.map((l, i) => [l, i]));

/** Sort key: spaces/punctuation < digits < letters in Albanian order; other letters by their base letter. */
export function albKey(s: string): number[] {
  const str = s.normalize('NFC').toLowerCase();
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const two = str.slice(i, i + 2);
    if (two.length === 2 && ALB_INDEX.has(two)) { out.push(100 + ALB_INDEX.get(two)!); i++; continue; }
    const c = str[i];
    if (ALB_INDEX.has(c)) { out.push(100 + ALB_INDEX.get(c)!); continue; }
    if (c >= '0' && c <= '9') { out.push(10 + Number(c)); continue; }
    const base = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (ALB_INDEX.has(base)) { out.push(100 + ALB_INDEX.get(base)!); continue; }
    if (/[\s\p{P}\p{S}]/u.test(c)) { out.push(0); continue; }
    out.push(1000 + c.codePointAt(0)!);
  }
  return out;
}

export function albCompare(a: string, b: string): number {
  const x = albKey(a), y = albKey(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}

/** The folded search haystack for a product (names in both languages, summary, tags, kind words). */
export function haystack(parts: (string | null | undefined)[]): string {
  return fold(parts.filter(Boolean).join(' ')).replace(/\s+/g, ' ');
}
