/**
 * Middleware (T1): locals.lang / locals.admin / locals.https, admin guard, same-origin checks
 * (admin mutations; cross-site form posts everywhere — this replaces Astro's security.checkOrigin,
 * switched off in astro.config.mjs because it compares against http://localhost:PORT in
 * production and answers in text/plain), per-address limits for public API reads, JSON errors
 * for every /api/* response (unknown routes included), a per-address ceiling for server-rendered
 * pages, security headers and (production) gzip on every text response.
 * The CSP's script hashes are fixed at build time (src/lib/csp.ts), so responses are streamed
 * untouched; in dev the CSP is relaxed for Vite.
 */
import './lib/dotenv';
import { defineMiddleware } from 'astro:middleware';
import { sessionUser } from './lib/auth';
import { errorResponse, E, ApiError } from './lib/http';
import { baseSecurityHeaders, buildCsp, clientIp, isForbiddenCrossSiteForm, isSameOrigin, rateLimit } from './lib/security';
import { scriptHashes } from './lib/csp';
import { startSweeper, sweepExpired } from './lib/orders';
import { startRetention } from './lib/retention';
import { httpsSite, warnUnconfiguredOrigin } from './lib/urls';

const DEV = import.meta.env.DEV;

startSweeper();
startRetention();
if (!DEV) warnUnconfiguredOrigin();

/**
 * Public API reads per address (IPv6 per /64) and minute. Albanian mobile carriers put many
 * phones behind one address (CGNAT) and every page makes several reads, so the ceiling is high;
 * the cheap, cached feeds (/api/live, /api/config) are not counted at all.
 */
const READ_PER_MIN = 1200;
const UNCOUNTED_READS = new Set(['/api/live', '/api/live/', '/api/config', '/api/config/']);
/**
 * Server-rendered pages per address and minute (GET/HEAD, outside /admin and /api). A page costs
 * 15–35 ms of synchronous work (SQLite + render) on the one thread that also runs checkout, so
 * one address must not be able to stall the site. Generous for CGNAT (many phones, one address);
 * a last line of defence only — the proxy's own limit (README → Deployment) comes first.
 */
const PAGES_PER_MIN = 600;
/** Served by the adapter in production (never reach here) or cheap: not counted as pages. */
const UNCOUNTED_PAGE = /^\/(?:_astro|fonts|photos|media|@[\w-]+|node_modules|src)\/|\.(?:js|css|map|svg|png|jpe?g|webp|avif|woff2?|ico|txt|xml|json|webmanifest)$/;

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { url, request, cookies, locals } = ctx;
  const p = url.pathname;
  locals.lang = p === '/en' || p.startsWith('/en/') ? 'en' : 'sq';
  locals.https = url.protocol === 'https:' || (process.env.TRUST_PROXY === '1' && request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https');
  locals.admin = null;

  const isAdminPage = p === '/admin' || p.startsWith('/admin/');
  const isAdminApi = p.startsWith('/api/admin/') || p === '/api/admin';
  const isApi = p === '/api' || p.startsWith('/api/');
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);

  let res: Response;
  try {
    if (isForbiddenCrossSiteForm(request, url)) {
      res = isApi ? errorResponse(E.crossSite()) : new Response('Cross-site form submissions are not allowed.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      return secure(res, p, locals.https, url, request);
    }
    // The work behind public reads is synchronous SQLite, so a flood would stall checkout.
    if (isApi && !isAdminApi && !mutating && !UNCOUNTED_READS.has(p)) rateLimit('api-read', clientIp(ctx), READ_PER_MIN, 60_000);
    if (!isApi && !isAdminPage && !mutating && !UNCOUNTED_PAGE.test(p)) {
      try {
        rateLimit('page', clientIp(ctx), PAGES_PER_MIN, 60_000);
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        const retry = String((e.extra?.retry_after as number | undefined) ?? 60);
        res = new Response(locals.lang === 'en' ? 'Too many requests. Try again shortly.' : 'Shumë kërkesa. Provoni pas pak.', {
          status: 429, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': retry, 'Cache-Control': 'no-store' },
        });
        return secure(res, p, locals.https, url, request);
      }
    }

    if (isAdminPage || isAdminApi) {
      try {
        locals.admin = sessionUser(cookies, locals.https);
      } catch (e) {
        console.error('[auth]', e);
      }
      const loginPage = p === '/admin/login' || p === '/admin/login/';
      const openApi = p === '/api/admin/login' || p === '/api/admin/login/';
      if (isAdminApi && mutating && !isSameOrigin(request, url)) {
        res = errorResponse(E.crossSite());
      } else if (isAdminApi && !openApi && !locals.admin) {
        res = errorResponse(E.unauthorized());
      } else if (isAdminPage && !loginPage && !locals.admin) {
        const nextPath = p + url.search;
        res = new Response(null, { status: 303, headers: { Location: `/admin/login/?next=${encodeURIComponent(nextPath)}`, 'Cache-Control': 'no-store' } });
      } else {
        if (locals.admin && isAdminPage) {
          try { sweepExpired(); } catch (e) { console.error('[sweep]', e); }
        }
        res = await next();
      }
    } else {
      res = await next();
    }
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    res = errorResponse(e);
  }

  // PLAN §6: every API answer is JSON. An unknown /api route (Astro renders the HTML 404 page)
  // or a method the route does not export becomes the JSON error shape.
  if (isApi && !(res.headers.get('content-type') || '').includes('application/json')) {
    if (res.status === 404) res = errorResponse(E.notFound());
    else if (res.status === 405) res = errorResponse(new ApiError(405, 'method_not_allowed', 'Metodë e palejuar.', 'Method not allowed.'));
  }

  return secure(res, p, locals.https, url, request);
});

/** Order confirmation and booking lookup pages (both languages). */
const PRIVATE_PAGE = /^\/(?:porosia|rezervimet|en\/order|en\/bookings)(?:\/|$)/;
/** APIs that answer with an order (token-checked). */
const PRIVATE_API = /^\/api\/(?:order|pay|lookup|checkout)(?:\/|$)/;

/** Text responses worth compressing (SSR pages, JSON, XML feeds, CSV, robots.txt). */
const COMPRESSIBLE = /^(?:text\/(?:html|plain|xml|csv|css|javascript)|application\/(?:json|xml|rss\+xml|atom\+xml|ld\+json|manifest\+json|javascript)|image\/svg\+xml)\b/i;

/**
 * gzip for server-rendered text in production when the client accepts it and nothing upstream
 * compressed it yet. The reverse proxy should compress too (README → Deployment: it also covers
 * the static files the adapter serves); a proxy leaves an already encoded body alone.
 */
function compress(res: Response, request?: Request): Response {
  if (DEV || !request || !res.body || request.method === 'HEAD' || res.status === 204 || res.status === 304) return res;
  if (res.headers.has('Content-Encoding') || !COMPRESSIBLE.test(res.headers.get('content-type') || '')) return res;
  if (!/\bgzip\b/i.test(request.headers.get('accept-encoding') || '')) return res;
  const headers = new Headers(res.headers);
  headers.set('Content-Encoding', 'gzip');
  headers.delete('Content-Length');
  headers.append('Vary', 'Accept-Encoding');
  return new Response(res.body.pipeThrough(new CompressionStream('gzip')), { status: res.status, statusText: res.statusText, headers });
}

async function secure(res: Response, p: string, https: boolean, url?: URL, request?: Request): Promise<Response> {
  const out = compress(new Response(res.body, { status: res.status, statusText: res.statusText, headers: new Headers(res.headers) }), request);
  const isHtml = (res.headers.get('content-type') || '').includes('text/html');
  // HSTS / upgrade-insecure-requests: on https requests, and in production whenever the
  // configured public origin is https (TLS ends at the proxy, which may not say so).
  const tls = https || (!DEV && httpsSite());
  if (isHtml) out.headers.set('Content-Security-Policy', DEV ? buildCsp({ dev: true, https: tls }) : buildCsp({ dev: false, scriptHashes: await scriptHashes(), https: tls }));
  baseSecurityHeaders(out.headers, tls);
  if (p.startsWith('/admin') || p.startsWith('/api/')) {
    out.headers.set('X-Robots-Tag', 'noindex, nofollow');
    if (p.startsWith('/admin') && !out.headers.has('Cache-Control')) out.headers.set('Cache-Control', 'no-store');
  }
  // Pages and APIs that carry a guest's order (bearer token in ?t=, or a booking list): never
  // stored by any cache, and the URL never leaks as a referrer.
  if (PRIVATE_PAGE.test(p) || PRIVATE_API.test(p) || (p.startsWith('/api/') && url?.searchParams.has('t'))) {
    out.headers.set('Cache-Control', 'private, no-store');
    out.headers.set('Referrer-Policy', 'no-referrer');
    // A personal lookup / order page is never a search result (it is also left out of the sitemap).
    out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return out;
}
