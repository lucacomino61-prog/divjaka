import type { APIRoute } from 'astro';
import { E, handle, json, zLang } from '../../../lib/http';
import { findPublished, productDetail } from '../../../lib/catalog';

/** GET /api/product/:slug?lang */
export const GET: APIRoute = handle(async ({ params, url }) => {
  const p = findPublished(String(params.slug ?? ''));
  if (!p) throw E.notFound('Produkti nuk u gjet.', 'Product not found.');
  return json(productDetail(p, zLang.parse(url.searchParams.get('lang') ?? 'sq')), { cache: 'no-cache' });
});
