/**
 * Offer rules (used only by pricing.ts).
 *
 * Automatic offer (code NULL): applied per line, the single best saving wins.
 *   - window starts_on..ends_on (inclusive) is checked against the SERVICE date:
 *     room = arrival date, experience = session date, everything else = today.
 *   - min_nights: the offer applies to room lines only, with nights >= min_nights.
 *   - min_total: the cart's in-scope base total (before offers) must reach it.
 * Promo code: applied once to the cart after automatic offers, on in-scope lines.
 *   - window checked against today; max_uses against `used`; min_total against the
 *     in-scope subtotal after automatic offers; min_nights needs one room line long enough.
 * Scope: {kinds, categories, products (slug or id)}; an empty list means "any".
 */
import type { Offer } from './db/repo/offers';
import type { Product } from './db/repo/products';

export interface Scoped { product: Product; nights?: number; serviceDate: string }

export function inScope(o: Offer, p: Product): boolean {
  const s = o.scope || {};
  if (s.kinds?.length && !s.kinds.includes(p.kind)) return false;
  if (s.categories?.length && !(p.category && s.categories.includes(p.category))) return false;
  if (s.products?.length && !s.products.some((x) => x === p.slug || Number(x) === p.id)) return false;
  return true;
}

export function inWindow(o: Offer, date: string): boolean {
  if (o.starts_on && date < o.starts_on) return false;
  if (o.ends_on && date > o.ends_on) return false;
  return true;
}

export function saving(o: Offer, base: number): number {
  if (base <= 0) return 0;
  const s = o.type === 'percent' ? Math.round((base * Math.min(100, o.value)) / 100) : Math.min(o.value, base);
  return Math.max(0, s);
}

export function autoOfferApplies(o: Offer, line: Scoped, cartScopedBase: number): boolean {
  if (!o.active || o.code) return false;
  if (!inScope(o, line.product)) return false;
  if (!inWindow(o, line.serviceDate)) return false;
  if (o.min_nights) {
    if (line.product.kind !== 'room' || (line.nights ?? 0) < o.min_nights) return false;
  }
  if (o.min_total && cartScopedBase < o.min_total) return false;
  return true;
}

export const offerName = (o: Offer, lang: string) => (lang === 'en' ? o.name_en || o.name_sq : o.name_sq || o.name_en) || o.code || '';
