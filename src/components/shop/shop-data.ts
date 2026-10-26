/**
 * Server-side view models for the shop (Shop.astro, Product.astro): specimen tags with their
 * live readouts (next session + free places, stock, rooms tonight only once the owner has saved
 * real room counts), price + strike-through, offer stamps, and the facts the URL filters use.
 * Everything comes from T1's catalogue (lib/catalog) — nothing here invents a number.
 */
import { catalog, type ProductCard } from '../../lib/catalog';
import { roomsVerified } from '../../lib/availability';
import { automaticOffers, type Offer } from '../../lib/db/repo/offers';
import { getProductBySlug } from '../../lib/db/repo/products';
import { offerName } from '../../lib/offers';
import { today } from '../../lib/time';
import { t } from '../../i18n/ui';
import { MONTHS, money, relativeDay } from '../../i18n/format';
import type { Lang } from '../../i18n/routes';
import { haystack, type ItemFacts, type Kind } from './filters';

export interface Readout { text: string; tone?: 'signal' | 'muted' }

export interface Specimen extends ItemFacts {
  card: ProductCard;
  nr: string;
  kindLabel: string;
  readouts: Readout[];
  soldOut: boolean;
  offer: boolean;
  lek: number;
  compare: number | null;
  per: 'night' | 'person' | null;
  from: boolean;
  image: { slug: string | null; alt?: string };
}

/** Months a product runs, as runs of consecutive months ("janar – qershor", wraps the year). */
export function monthsLabel(seasons: number[], lang: Lang): string {
  const set = [...new Set(seasons.filter((m) => m >= 1 && m <= 12))].sort((a, b) => a - b);
  if (!set.length || set.length === 12) return '';
  const M = MONTHS[lang];
  const has = (m: number) => set.includes(((m - 1 + 12) % 12) + 1);
  // start of a run = a month whose previous month is not in the set
  const starts = set.filter((m) => !has(m - 1));
  const runs = starts.map((s) => {
    let e = s;
    while (has(e + 1) && ((e % 12) + 1) !== s) e = (e % 12) + 1;
    return [s, e] as const;
  });
  return runs.map(([s, e]) => (s === e ? M[s - 1] : `${M[s - 1]} – ${M[e - 1]}`)).join(', ');
}

export const catNo = (id: number) => String(id).padStart(3, '0');

/** Gift card value limits, the same defaults pricing.ts applies when the owner left them empty. */
export function giftLimits(slug: string): { min: number; max: number; step: number } {
  const o = getProductBySlug(slug)?.options ?? {};
  return {
    min: Number(o.amount_min ?? 1000),
    max: Number(o.amount_max ?? 200000),
    step: Math.max(1, Number(o.amount_step ?? 100)),
  };
}

export function readouts(c: ProductCard, lang: Lang, verifiedRooms: boolean): { list: Readout[]; soldOut: boolean } {
  const list: Readout[] = [];
  let soldOut = false;
  if (c.kind === 'room') {
    if (verifiedRooms && c.left && c.left > 0) list.push({ text: t(lang, 'shop.read.rooms', { n: c.left }) });
    else list.push({ text: t(lang, 'shop.read.dates'), tone: 'muted' });
  } else if (c.kind === 'experience') {
    if (c.next) {
      const when = `${relativeDay(c.next.slice(0, 10), lang)}, ${c.next.slice(11, 16)}`;
      list.push({ text: t(lang, 'shop.read.next', { when }) });
      if (c.left != null) list.push({ text: c.left === 1 ? t(lang, 'shop.read.seats.one') : t(lang, 'shop.read.seats', { n: c.left }) });
    } else {
      list.push({ text: t(lang, 'shop.read.none'), tone: 'muted' });
    }
  } else if (c.kind === 'gift') {
    // the value range is the owner's setting (products.options.amount_min/max)
    const g = giftLimits(c.slug);
    list.push({ text: t(lang, 'shop.read.gift', { min: money(g.min, lang), max: money(g.max, lang) }) });
  } else if (c.left != null) {
    if (c.left <= 0) { soldOut = true; list.push({ text: t(lang, 'shop.read.soldout'), tone: 'signal' }); }
    else list.push({ text: c.left === 1 ? t(lang, 'shop.read.stock.one') : t(lang, 'shop.read.stock', { n: c.left }) });
  }
  if (c.kind === 'bundle') {
    const m = monthsLabel(c.seasons, lang);
    if (m) list.push({ text: t(lang, 'shop.read.season', { months: m }), tone: 'muted' });
  }
  return { list, soldOut };
}

export function specimens(lang: Lang): { items: Specimen[]; categories: { id: string; name: string; count: number }[] } {
  const cat = catalog({ lang });
  const verified = roomsVerified();
  const items = cat.items.map((c, i): Specimen => {
    const r = readouts(c, lang, verified);
    const sale = c.sale_price != null && c.sale_price < c.price ? c.sale_price : null;
    const kindLabel = t(lang, `recommend.kind.${c.kind}`);
    const alt = lang === 'en' ? c.images[0]?.alt_en : c.images[0]?.alt_sq;
    return {
      card: c,
      kind: c.kind as Kind,
      tags: c.tags,
      hay: haystack([c.name, c.summary, kindLabel, t(lang === 'sq' ? 'en' : 'sq', `recommend.kind.${c.kind}`), ...c.tags.map((tg) => tagWords(tg))]),
      price: sale ?? c.price,
      name: c.name,
      rank: i,
      next: c.kind === 'experience' ? c.next : null,
      nr: catNo(c.id),
      kindLabel,
      readouts: r.list,
      soldOut: r.soldOut,
      offer: c.offers.length > 0 || sale != null,
      lek: sale ?? c.price,
      compare: sale != null ? c.price : c.compare_at,
      per: c.kind === 'room' ? 'night' : c.kind === 'experience' ? 'person' : null,
      from: c.kind === 'room' || c.kind === 'gift',
      image: { slug: c.images[0]?.slug ?? null, alt: alt || undefined },
    };
  });
  return { items, categories: cat.categories };
}

/** Both languages' words for a tag, so "zogj" and "birds" both find the dawn birdwatch. */
function tagWords(tag: string): string {
  const k = `recommend.interest.${tag}`;
  const sq = t('sq', k), en = t('en', k);
  return [tag, sq === k ? '' : sq, en === k ? '' : en].join(' ');
}

export interface OfferRow { id: number; name: string; value: string; conditions: string[]; kinds: Kind[] }

/** Automatic offers that are on and not over (the band on the shop). Promo codes are never listed. */
export function liveOffers(lang: Lang): OfferRow[] {
  const d = today();
  return automaticOffers()
    .filter((o: Offer) => !o.ends_on || o.ends_on >= d)
    .map((o: Offer): OfferRow => {
      const kinds = (o.scope?.kinds ?? []).filter((k): k is Kind => ['room', 'experience', 'bundle', 'gift', 'goods'].includes(k));
      const cond: string[] = [];
      cond.push(kinds.length ? t(lang, 'shop.offers.kinds', { kinds: kinds.map((k) => t(lang, `shop.kind.${k}`).toLowerCase()).join(', ') }) : t(lang, 'shop.offers.everything'));
      if (o.min_nights) cond.push(t(lang, 'shop.offers.minNights', { n: o.min_nights }));
      if (o.min_total) cond.push(t(lang, 'shop.offers.minTotal', { amount: money(o.min_total, lang) }));
      const roomOnly = kinds.length === 1 && kinds[0] === 'room';
      const f = (iso: string) => fmtDay(iso, lang);
      if (o.starts_on && o.ends_on) cond.push(roomOnly ? t(lang, 'shop.offers.arrivals', { from: f(o.starts_on), to: f(o.ends_on) }) : t(lang, 'shop.offers.window', { from: f(o.starts_on), to: f(o.ends_on) }));
      else if (o.ends_on) cond.push(t(lang, 'shop.offers.until', { to: f(o.ends_on) }));
      else if (o.starts_on) cond.push(t(lang, 'shop.offers.from', { from: f(o.starts_on) }));
      return {
        id: o.id,
        name: offerName(o, lang),
        value: o.type === 'percent' ? t(lang, 'shop.offers.percent', { n: o.value }) : t(lang, 'shop.offers.fixed', { amount: money(o.value, lang) }),
        conditions: cond,
        kinds,
      };
    });
}

function fmtDay(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[lang][m - 1]} ${y}`;
}
