/**
 * Product route loader (T5). /dyqani/<slug>/ shows goods, gift cards and bundles.
 * A room or an experience slug answers a 301 to its own page (T4) — the route shell turns
 * `{ redirect }` into Astro.redirect(…, 301). Unknown, draft or archived slugs → null → 404.
 */
import type { Lang } from '../i18n/routes';
import { productUrl } from '../lib/urls';
import { productDetail, type ProductDetail } from '../lib/catalog';
import { getProductBySlug, type Product } from '../lib/db/repo/products';

export type ProductPageData =
  | { redirect: string }
  | { product: Product; detail: ProductDetail };

export async function load(params: Record<string, string>, lang: Lang): Promise<ProductPageData | null> {
  const slug = params.slug ?? '';
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/i.test(slug)) return null;
  const p = getProductBySlug(slug.toLowerCase());
  if (!p || p.status !== 'published') return null;
  if (p.kind === 'room' || p.kind === 'experience') return { redirect: productUrl(p.kind, p.slug, lang) };
  if (p.slug !== slug) return { redirect: productUrl(p.kind, p.slug, lang) };
  return { product: p, detail: productDetail(p, lang) };
}
