/**
 * Data for /eksperienca/[slug]/ (T4): the published experience, its catalogue number (its place
 * in the lineup ordered by distance from the hotel, as on the index) and the other experiences.
 * null → the route shell answers 404.
 */
import type { Lang } from '../i18n/routes';
import { findPublished } from '../lib/catalog';
import { listProducts, type Product } from '../lib/db/repo/products';
import { fromHotelKm } from '../components/chart/geo';

export interface ExperienceData { product: Product; n: string; lineup: Product[] }

export function lineup(): Product[] {
  return listProducts({ kind: 'experience' })
    .map((p) => ({ p, km: p.poi ? fromHotelKm(p.poi) ?? 99 : 99 }))
    .sort((a, b) => a.km - b.km || a.p.sort - b.p.sort)
    .map((x) => x.p);
}

export async function load(params: Record<string, string>, _lang: Lang): Promise<ExperienceData | null> {
  const v = params.slug ?? '';
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/i.test(v)) return null;
  const p = findPublished(v);
  if (!p || p.kind !== 'experience') return null;
  const all = lineup();
  const i = all.findIndex((x) => x.id === p.id);
  return { product: p, n: String(i + 1).padStart(3, '0'), lineup: all };
}
