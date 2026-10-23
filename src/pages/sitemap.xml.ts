import type { APIRoute } from 'astro';
import { sitemap } from '../lib/feed';
import { originDocCache, siteOrigin } from '../lib/urls';
import { cached } from '../lib/cache';

/**
 * GET /sitemap.xml — both languages, xhtml:link hreflang alternates (+ x-default → sq).
 * Built at most every 10 s per origin (src/lib/cache.ts); no-store while site_url is unset.
 */
export const GET: APIRoute = ({ url, request }) => {
  const origin = siteOrigin(url, request);
  return new Response(cached(`sitemap|${origin}`, () => sitemap(origin)), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': originDocCache(3600) },
  });
};
