/**
 * Data for /qendrimi/[slug]/ (T4): the published room type and its catalogue number
 * (its place among the published rooms, "01"…). null → the route shell answers 404.
 */
import type { Lang } from '../i18n/routes';
import { findPublished } from '../lib/catalog';
import { listProducts, type Product } from '../lib/db/repo/products';

export interface RoomData { product: Product; n: string; rooms: Product[] }

export async function load(params: Record<string, string>, _lang: Lang): Promise<RoomData | null> {
  const v = params.slug ?? '';
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/i.test(v)) return null;
  const p = findPublished(v);
  if (!p || p.kind !== 'room') return null;
  const rooms = listProducts({ kind: 'room' });
  const i = rooms.findIndex((r) => r.id === p.id);
  return { product: p, n: String(i + 1).padStart(2, '0'), rooms };
}
