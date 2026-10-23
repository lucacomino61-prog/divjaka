import type { APIRoute } from 'astro';
import { productFeed } from '../../lib/feed';
import { originDocCache, siteOrigin } from '../../lib/urls';
import { cached } from '../../lib/cache';

/**
 * GET /feed/products.xml[?lang=en] — RSS 2.0 + g: fields (Google Merchant Center, Meta catalogue).
 * Built at most every 10 s per origin and language (src/lib/cache.ts); no-store while site_url is unset.
 */
export const GET: APIRoute = ({ url, request }) => {
  const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'sq';
  const origin = siteOrigin(url, request);
  return new Response(cached(`feed|${origin}|${lang}`, () => productFeed(origin, lang)), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': originDocCache(900) },
  });
};
