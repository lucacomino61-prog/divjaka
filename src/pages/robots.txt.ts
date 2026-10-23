import type { APIRoute } from 'astro';
import { robots } from '../lib/feed';
import { originDocCache, siteOrigin } from '../lib/urls';
import { cached } from '../lib/cache';

/** GET /robots.txt — allow all, keep /admin and /api out, point at the sitemap. Built at most every 10 s per origin. */
export const GET: APIRoute = ({ url, request }) => {
  const origin = siteOrigin(url, request);
  return new Response(cached(`robots|${origin}`, () => robots(origin)), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': originDocCache(3600) },
  });
};
