/**
 * Route map — the single source of localized URLs (PLAN §4).
 * Albanian lives at the root, English under /en/. Every pattern ends with a slash.
 * Params are written [name] and filled by path().
 */
export type Lang = 'sq' | 'en';
export const LANGS: readonly Lang[] = ['sq', 'en'] as const;
export const DEFAULT_LANG: Lang = 'sq';

export const ROUTES = {
  home: { sq: '/', en: '/en/' },
  stay: { sq: '/qendrimi/', en: '/en/stay/' },
  room: { sq: '/qendrimi/[slug]/', en: '/en/stay/[slug]/' },
  experiences: { sq: '/eksperienca/', en: '/en/experiences/' },
  experience: { sq: '/eksperienca/[slug]/', en: '/en/experiences/[slug]/' },
  shop: { sq: '/dyqani/', en: '/en/shop/' },
  product: { sq: '/dyqani/[slug]/', en: '/en/shop/[slug]/' },
  cart: { sq: '/shporta/', en: '/en/cart/' },
  checkout: { sq: '/arka/', en: '/en/checkout/' },
  order: { sq: '/porosia/[code]/', en: '/en/order/[code]/' },
  account: { sq: '/rezervimet/', en: '/en/bookings/' },
  itinerary: { sq: '/itinerari/', en: '/en/itinerary/' },
  heritage: { sq: '/trashegimia/', en: '/en/heritage/' },
  article: { sq: '/trashegimia/[slug]/', en: '/en/heritage/[slug]/' },
  now: { sq: '/tani/', en: '/en/now/' },
  contact: { sq: '/kontakt/', en: '/en/contact/' },
  privacy: { sq: '/privatesia/', en: '/en/privacy/' },
  terms: { sq: '/kushtet/', en: '/en/terms/' },
  credits: { sq: '/kreditet/', en: '/en/credits/' },
} as const satisfies Record<string, Record<Lang, string>>;

export type RouteKey = keyof typeof ROUTES;

/**
 * Task pages (DESIGN: two poster scales): their h1 poster is capped by --poster-max-task so the
 * form, the list or the reading starts on the first screen. SectionHead reads this; views never
 * set a cap of their own. Every other page is editorial (--poster-max).
 */
export const TASK_ROUTES: ReadonlySet<RouteKey> = new Set<RouteKey>(['shop', 'product', 'cart', 'checkout', 'order', 'account', 'article']);
export type RouteParams = Record<string, string | number>;

const PARAM_RE = /\[([a-z]+)\]/g;

/** Localized path for a route key. Missing params throw (a broken link is a bug). */
export function path(key: RouteKey, lang: Lang = DEFAULT_LANG, params: RouteParams = {}): string {
  const pattern = ROUTES[key]?.[lang];
  if (!pattern) throw new Error(`Unknown route ${String(key)}/${lang}`);
  return pattern.replace(PARAM_RE, (_, name: string) => {
    const v = params[name];
    if (v === undefined || v === null || v === '') throw new Error(`Route ${key} needs param "${name}"`);
    return encodeURIComponent(String(v));
  });
}

/** Absolute URL helper (site origin passed in, e.g. Astro.site). */
export function url(origin: string | URL, key: RouteKey, lang: Lang = DEFAULT_LANG, params: RouteParams = {}): string {
  return new URL(path(key, lang, params), origin).href;
}

export function langFromPath(pathname: string): Lang {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'sq';
}

interface Compiled { key: RouteKey; lang: Lang; re: RegExp; names: string[] }
const COMPILED: Compiled[] = [];
for (const key of Object.keys(ROUTES) as RouteKey[]) {
  for (const lang of LANGS) {
    const pattern = ROUTES[key][lang];
    const names: string[] = [];
    const src = pattern
      .replace(/[.*+?^${}()|\\]/g, '\\$&')
      .replace(/\\?\[([a-z]+)\\?\]/g, (_, n: string) => { names.push(n); return '([^/]+)'; })
      .replace(/\/$/, '/?');
    COMPILED.push({ key, lang, re: new RegExp(`^${src}$`), names });
  }
}

export interface Match { lang: Lang; key: RouteKey; params: Record<string, string>; other: string }

/** Match a pathname against the table. null when it is not a public route. */
export function match(pathname: string): Match | null {
  const p = pathname.split(/[?#]/)[0] || '/';
  for (const c of COMPILED) {
    const m = c.re.exec(p);
    if (!m) continue;
    const params: Record<string, string> = {};
    c.names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
    const otherLang: Lang = c.lang === 'sq' ? 'en' : 'sq';
    return { lang: c.lang, key: c.key, params, other: path(c.key, otherLang, params) };
  }
  return null;
}

/**
 * The twin of a pathname in the other language. Unknown paths fall back to the other
 * language's home, so the switch never leads to a 404.
 */
export function twin(pathname: string): Match & { known: boolean } {
  const m = match(pathname);
  if (m) return { ...m, known: true };
  const lang = langFromPath(pathname);
  return { lang, key: 'home', params: {}, other: path('home', lang === 'sq' ? 'en' : 'sq'), known: false };
}

/** Both language versions of a route (for hreflang). */
export function alternates(key: RouteKey, params: RouteParams = {}): Record<Lang, string> {
  return { sq: path(key, 'sq', params), en: path(key, 'en', params) };
}
