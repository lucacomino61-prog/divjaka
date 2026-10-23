/** Localized product URLs and absolute-URL helpers for the back end (route table: src/i18n/routes.ts). */
import { path, type Lang, type RouteKey, type RouteParams } from '../i18n/routes';
import type { Kind } from './db/repo/products';
import { getSetting } from './db/repo/settings';

export type { Lang };
export { path };

export function productRouteKey(kind: Kind): RouteKey {
  return kind === 'room' ? 'room' : kind === 'experience' ? 'experience' : 'product';
}

/** Localized public URL of a product page. */
export function productUrl(kind: Kind, slug: string, lang: Lang): string {
  return path(productRouteKey(kind), lang, { slug });
}

const PLACEHOLDER = /(^|\.)example(\.|$)|divjaka\.example/i;
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/i;
const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/** The public origin the owner configured: settings.seo.site_url, else a non-placeholder Astro `site`. */
export function configuredOrigin(): string | null {
  const fromSettings = (() => {
    try { return getSetting('seo').site_url; } catch { return ''; }
  })();
  if (fromSettings) return fromSettings.replace(/\/$/, '');
  const site = import.meta.env.SITE as string | undefined;
  if (site) {
    try {
      const u = new URL(site);
      if (!PLACEHOLDER.test(u.hostname) && !LOCAL.test(u.hostname)) return u.origin;
    } catch { /* bad site */ }
  }
  return null;
}

/** True when the configured public origin is https (production HSTS decision). */
export const httpsSite = () => (configuredOrigin() ?? '').startsWith('https://');

/** A usable public origin for third parties (POK callbacks): configured, not local, not a placeholder. */
export function isPublicOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return !LOCAL.test(u.hostname) && !PLACEHOLDER.test(u.hostname);
  } catch {
    return false;
  }
}

let warned = false;
/** Loud boot warning in production when absolute URLs have no real origin to use. */
export function warnUnconfiguredOrigin(): void {
  if (warned) return;
  warned = true;
  try {
    if (!configuredOrigin()) {
      console.warn('[urls] WARNING: no public site URL is configured (admin → Cilësimet → SEO → site_url, or `site` in astro.config.mjs). Sitemap, feed, robots and payment callbacks fall back to a placeholder or the proxy host; card payments through POK stay off until it is set.');
    }
  } catch { /* DB not ready */ }
}

/**
 * Site origin for absolute URLs (sitemap, feed, robots, canonical, POK callbacks):
 *   1. settings.seo.site_url, 2. Astro `site` unless it is a placeholder,
 *   3. dev: the request origin;
 *      production: X-Forwarded-Host/Proto when TRUST_PROXY=1, else the `site` placeholder —
 *      never http://localhost (Astro ignores the Host header without security.allowedDomains).
 */
export function siteOrigin(requestUrl?: URL | string, request?: Request): string {
  const conf = configuredOrigin();
  if (conf) return conf;
  if (import.meta.env.DEV && requestUrl) return new URL(String(requestUrl)).origin;
  if (request && process.env.TRUST_PROXY === '1') {
    const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim();
    const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'http' ? 'http' : 'https';
    if (host && HOST_RE.test(host)) return `${proto}://${host}`;
  }
  warnUnconfiguredOrigin();
  if (requestUrl) {
    const u = new URL(String(requestUrl));
    if (!LOCAL.test(u.hostname)) return u.origin;
  }
  const site = import.meta.env.SITE as string | undefined;
  return (site || 'https://divjaka.example').replace(/\/$/, '');
}

/**
 * Cache-Control for documents that carry absolute URLs built from siteOrigin() (sitemap, feed,
 * robots.txt). While site_url is not configured, the origin may come from X-Forwarded-Host —
 * which a client can send through a proxy that does not overwrite it — so the answer must not be
 * stored by any shared cache: no-store. Once site_url is set, the origin is fixed and public
 * caching is safe. (README → Deployment: nginx needs proxy_set_header X-Forwarded-Host $host.)
 */
export function originDocCache(maxAge: number): string {
  return configuredOrigin() ? `public, max-age=${maxAge}` : 'no-store';
}

export const absolute = (origin: string, p: string) => new URL(p, origin + '/').href;

export function routeAbs(origin: string, key: RouteKey, lang: Lang, params?: RouteParams): string {
  return absolute(origin, path(key, lang, params));
}
