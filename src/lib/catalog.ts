/**
 * Catalogue payloads for /api/catalog and /api/product/:slug — and for SSR pages: views can
 * call productCard()/productDetail()/catalog() directly instead of fetching the API.
 */
import { listCategories, listProducts, getProductBySlug, bundleItems, pname, psummary, primaryImage, type Kind, type Product } from './db/repo/products';
import { automaticOffers, type Offer } from './db/repo/offers';
import { availabilitySummary, nextSessions, type SessionInfo } from './availability';
import { inScope, inWindow, offerName, saving } from './offers';
import { productUrl, type Lang } from './urls';
import { fold, tokens } from './text';
import { today } from './time';
import { getSetting } from './db/repo/settings';

export interface OfferBadge { name: string; type: 'percent' | 'fixed'; value: number; starts_on: string | null; ends_on: string | null; min_nights: number | null; min_total: number | null }

export interface ProductCard {
  id: number; slug: string; kind: Kind; category: string | null; name: string; summary: string;
  price: number; compare_at: number | null; sale_price: number | null; image: string | null; images: Product['images'];
  url: string; tags: string[]; seasons: number[]; duration_min: number | null; capacity: number | null; units: number | null; poi: string | null;
  featured: boolean; demo: boolean; left: number | null; next: string | null; offers: OfferBadge[];
}

function badges(p: Product, offers: Offer[], lang: Lang): OfferBadge[] {
  const d = today();
  return offers
    .filter((o) => inScope(o, p) && (!o.ends_on || o.ends_on >= d))
    .map((o) => ({ name: offerName(o, lang), type: o.type, value: o.value, starts_on: o.starts_on, ends_on: o.ends_on, min_nights: o.min_nights, min_total: o.min_total }));
}

/** Sale price shown on cards: an automatic offer with no conditions, valid today, not for rooms/experiences (date-dependent). */
function salePrice(p: Product, offers: Offer[]): number | null {
  if (p.kind === 'room' || p.kind === 'experience') return null;
  let best = 0;
  for (const o of offers) {
    if (!inScope(o, p) || !inWindow(o, today()) || o.min_nights || o.min_total) continue;
    best = Math.max(best, saving(o, p.price));
  }
  return best > 0 ? p.price - best : null;
}

export function productCard(p: Product, lang: Lang, offers: Offer[] = automaticOffers()): ProductCard {
  const av = availabilitySummary(p);
  const b = badges(p, offers, lang);
  return {
    id: p.id, slug: p.slug, kind: p.kind, category: p.category, name: pname(p, lang), summary: psummary(p, lang),
    price: p.price, compare_at: p.compare_at && p.compare_at > p.price ? p.compare_at : null, sale_price: salePrice(p, offers),
    image: primaryImage(p), images: p.images, url: productUrl(p.kind, p.slug, lang), tags: p.tags, seasons: p.seasons,
    duration_min: p.duration_min, capacity: p.capacity, units: p.units, poi: p.poi, featured: p.featured, demo: p.demo,
    left: av.left, next: av.next, offers: b,
  };
}

export interface ProductDetail extends ProductCard {
  body: string; includes: string[]; options: Record<string, unknown>;
  bundle: { slug: string; name: string; kind: Kind; qty: number; url: string }[];
  sessions: SessionInfo[];
  alternate: { sq: string; en: string };
  eur_rate: number;
}

export function productDetail(p: Product, lang: Lang): ProductDetail {
  return {
    ...productCard(p, lang),
    body: (lang === 'en' ? p.body_en : p.body_sq) ?? '',
    includes: lang === 'en' ? p.includes_en : p.includes_sq,
    options: p.options,
    bundle: p.kind === 'bundle' ? bundleItems(p.id).map((b) => ({ slug: b.slug, name: lang === 'en' ? b.name_en : b.name_sq, kind: b.kind, qty: b.qty, url: productUrl(b.kind, b.slug, lang) })) : [],
    sessions: p.kind === 'experience' ? nextSessions(p.id, 12) : [],
    alternate: { sq: productUrl(p.kind, p.slug, 'sq'), en: productUrl(p.kind, p.slug, 'en') },
    eur_rate: getSetting('currency').eur_rate,
  };
}

export function findPublished(slug: string): Product | undefined {
  const p = getProductBySlug(slug);
  return p && p.status === 'published' ? p : undefined;
}

export type Sort = 'featured' | 'price' | '-price' | 'name' | 'new';

export function catalog(o: { lang: Lang; kind?: Kind; category?: string; tag?: string; q?: string; sort?: Sort; slugs?: string[]; featured?: boolean; limit?: number }): { items: ProductCard[]; total: number; categories: { id: string; name: string; count: number }[] } {
  let list = listProducts({ kind: o.kind, category: o.category, tag: o.tag, slugs: o.slugs, featured: o.featured });
  if (o.q) {
    const qt = tokens(o.q);
    if (qt.length) {
      list = list.filter((p) => {
        const hay = fold(`${p.name_sq} ${p.name_en} ${p.summary_sq ?? ''} ${p.summary_en ?? ''} ${p.tags.join(' ')}`);
        return qt.every((t) => hay.includes(t));
      });
    }
  }
  const name = (p: Product) => pname(p, o.lang);
  switch (o.sort) {
    case 'price': list.sort((a, b) => a.price - b.price); break;
    case '-price': list.sort((a, b) => b.price - a.price); break;
    case 'name': list.sort((a, b) => name(a).localeCompare(name(b), o.lang)); break;
    case 'new': list.sort((a, b) => b.created_at.localeCompare(a.created_at)); break;
    default: list.sort((a, b) => Number(b.featured) - Number(a.featured) || a.sort - b.sort || a.id - b.id);
  }
  if (o.slugs?.length) list.sort((a, b) => o.slugs!.indexOf(a.slug) - o.slugs!.indexOf(b.slug));
  const total = list.length;
  const offers = automaticOffers();
  const items = (o.limit ? list.slice(0, o.limit) : list).map((p) => productCard(p, o.lang, offers));
  const all = listProducts();
  const categories = listCategories().map((c) => ({ id: c.id, name: o.lang === 'en' ? c.name_en : c.name_sq, count: all.filter((p) => p.category === c.id).length }));
  return { items, total, categories };
}
