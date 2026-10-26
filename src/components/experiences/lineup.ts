/**
 * experiences/lineup.ts — the experiences as the index and the "other experiences" strip show
 * them: ordered by straight-line distance from the hotel (research/geo.json), each with its
 * catalogue number, next open session and its real free places (sessions table; verified
 * schedules only), length, price
 * per person and the season hint for this month. Server side.
 */
import { productCard } from '../../lib/catalog';
import { automaticOffers } from '../../lib/db/repo/offers';
import type { Product } from '../../lib/db/repo/products';
import { fromHotelKm, kmLabel } from '../chart/geo';
import { duration, todayLocal } from '../booking/server';
import { hintFor, type Hint } from './seasons';
import { path, type Lang } from '../../i18n/routes';
import { lineup } from '../../views/experience.load';

export interface Line {
  p: Product; n: string; name: string; summary: string; url: string; km: number | null; kmText: string;
  length: string; next: string | null; left: number | null; hint: Hint | null; image: { slug?: string; alt?: string } | null;
}

export function lines(lang: Lang, list: Product[] = lineup()): Line[] {
  const offers = automaticOffers();
  const all = lineup();
  const month = Number(todayLocal().slice(5, 7));
  return list.map((p) => {
    const c = productCard(p, lang, offers);
    const km = p.poi ? fromHotelKm(p.poi) : null;
    const img = p.images[0];
    return {
      p, n: String(all.findIndex((x) => x.id === p.id) + 1).padStart(3, '0'), name: c.name, summary: c.summary,
      url: path('experience', lang, { slug: p.slug }), km, kmText: km == null ? '' : km < 0.1 ? '' : kmLabel(km, lang),
      length: duration(p.duration_min, lang), next: c.next,
      // free places only for a schedule the owner verified (demo = 0): a demo schedule's numbers
      // are not facts (PLAN §2, as on the home strip)
      left: c.next && !p.demo ? c.left : null, hint: hintFor(p, month),
      image: img ? { slug: img.slug, alt: lang === 'en' ? img.alt_en : img.alt_sq } : null,
    };
  });
}
