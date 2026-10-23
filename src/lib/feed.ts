/**
 * Product feed (/feed/products.xml, RSS 2.0 + Google Merchant g: namespace, also readable by
 * the Meta catalogue), sitemap (/sitemap.xml with hreflang alternates) and robots.txt.
 */
import { listProducts, psummary, pname, type Product } from './db/repo/products';
import { articleSlugs, articles } from './content';
import { absolute, path, productRouteKey, type Lang } from './urls';
import { nextSessions, roomNights } from './availability';
import { addDays, today } from './time';
import { ROUTES, type RouteKey } from '../i18n/routes';
import { getPhoto } from '../components/site/site-data';

// Characters XML 1.0 does not allow (C0 controls except TAB/LF/CR, lone surrogates, U+FFFE/FFFF).
// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** XML text/attribute escape; also drops characters XML 1.0 forbids (one U+000B would void the feed). */
export const esc = (s: unknown) =>
  String(s ?? '').replace(XML_INVALID, '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

const strip = (s: string) => s.replace(/[#*_`>\[\]]/g, '').replace(/\s+/g, ' ').trim();

type Img = Product['images'][number];

/**
 * Site path of a feed image, or null when there is no file to point at.
 *  - uploads (src '/media/<yyyy>/<id>'): the 1600 px WebP variant the admin upload stores;
 *  - photos.json slugs: the entry's own WebP file list (research/photos.json `files.webp`,
 *    read through T2's site-data), widest ≤ 1920 px — the pipeline writes 640/1280/1920(/2560).
 * Google Merchant accepts WebP; Meta's catalogue documents JPG/PNG (README → Feeds).
 */
export function imagePath(im: Img | undefined): string | null {
  if (!im) return null;
  if (im.src) return /\.\w+$/.test(im.src) ? im.src : `${im.src}-1600.webp`;
  if (im.slug) {
    const ph = getPhoto(im.slug);
    if (!ph) return null;
    const widths = ph.widths.filter((w) => w <= 1920).sort((a, b) => b - a);
    for (const w of widths) {
      const src = ph.srcFor(w, 'webp') ?? ph.srcFor(w, 'jpg');
      if (src) return src;
    }
    return null;
  }
  return null;
}

/** Absolute URL of a product's first image (null = the product is left out of the feed). */
export function imageAbs(origin: string, p: Product): string | null {
  const path = imagePath(p.images[0]);
  return path ? absolute(origin, path) : null;
}

/**
 * Feed availability. Goods/bundles/gifts: stock. Rooms: free on at least one night in the next
 * 90 days (one query for the whole window). Experiences: a bookable upcoming session.
 */
function availability(p: Product): 'in_stock' | 'out_of_stock' {
  if (p.kind === 'room') {
    const from = today();
    return roomNights(p, from, addDays(from, 90)).some((n) => n.left > 0) ? 'in_stock' : 'out_of_stock';
  }
  if (p.kind === 'experience') return nextSessions(p.id, 1).length ? 'in_stock' : 'out_of_stock';
  return p.stock === null || p.stock > 0 ? 'in_stock' : 'out_of_stock';
}

/** Google product category ids where one fits (Gift Cards & Certificates = 53). */
function googleCategory(p: Product): string | null {
  const opt = p.options.google_category;
  if (typeof opt === 'string' || typeof opt === 'number') return String(opt);
  if (p.kind === 'gift') return '53';
  return null;
}

/**
 * Google Merchant / Meta catalogue feed. Items without an image are left out (both platforms
 * reject an item without g:image_link), so the feed is empty until products have photos.
 */
export function productFeed(origin: string, lang: Lang = 'sq'): string {
  const items = listProducts().filter((p) => imageAbs(origin, p)).map((p) => {
    const link = absolute(origin, path(productRouteKey(p.kind), lang, { slug: p.slug }));
    const img = imageAbs(origin, p)!;
    const desc = strip(psummary(p, lang) || (lang === 'en' ? p.body_en : p.body_sq) || pname(p, lang)).slice(0, 4900);
    const gcat = googleCategory(p);
    const sale = p.compare_at && p.compare_at > p.price;
    return [
      '    <item>',
      `      <g:id>${esc(p.slug)}</g:id>`,
      `      <title>${esc(pname(p, lang).slice(0, 150))}</title>`,
      `      <g:title>${esc(pname(p, lang).slice(0, 150))}</g:title>`,
      `      <description>${esc(desc)}</description>`,
      `      <g:description>${esc(desc)}</g:description>`,
      `      <link>${esc(link)}</link>`,
      `      <g:link>${esc(link)}</g:link>`,
      `      <g:image_link>${esc(img)}</g:image_link>`,
      ...p.images.slice(1, 10).map((im) => {
        const ip = imagePath(im);
        return ip ? `      <g:additional_image_link>${esc(absolute(origin, ip))}</g:additional_image_link>` : '';
      }),
      `      <g:price>${sale ? p.compare_at : p.price} ALL</g:price>`,
      sale ? `      <g:sale_price>${p.price} ALL</g:sale_price>` : '',
      `      <g:availability>${availability(p)}</g:availability>`,
      '      <g:condition>new</g:condition>',
      '      <g:brand>Hotel Pelikan</g:brand>',
      '      <g:identifier_exists>no</g:identifier_exists>',
      gcat ? `      <g:google_product_category>${esc(gcat)}</g:google_product_category>` : '',
      `      <g:product_type>${esc(p.kind)}${p.category ? ' &gt; ' + esc(p.category) : ''}</g:product_type>`,
      `      <guid isPermaLink="false">${esc(p.slug)}</guid>`,
      '    </item>',
    ].filter(Boolean).join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    `    <title>${esc(lang === 'en' ? 'Hotel Pelikan, Divjakë — catalogue' : 'Hotel Pelikan, Divjakë — katalogu')}</title>`,
    `    <link>${esc(absolute(origin, path('shop', lang)))}</link>`,
    `    <description>${esc(lang === 'en' ? 'Rooms, experiences, bundles, gift cards and local products' : 'Dhoma, eksperienca, paketa, karta dhuratë dhe produkte vendase')}</description>`,
    `    <language>${lang}</language>`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

/** Static public routes that belong in the sitemap (no cart/checkout/order/account). */
const STATIC_KEYS: RouteKey[] = ['home', 'stay', 'experiences', 'shop', 'itinerary', 'heritage', 'now', 'contact', 'privacy', 'terms', 'credits'];

function urlEntry(origin: string, key: RouteKey, params: Record<string, string>, lastmod?: string | null, langs: Lang[] = ['sq', 'en']): string {
  const alts = langs.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${esc(absolute(origin, path(key, l, params)))}"/>`);
  const xd = `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(absolute(origin, path(key, langs.includes('sq') ? 'sq' : langs[0], params)))}"/>`;
  return langs
    .map((l) => ['  <url>', `    <loc>${esc(absolute(origin, path(key, l, params)))}</loc>`, lastmod ? `    <lastmod>${esc(lastmod.slice(0, 10))}</lastmod>` : '', ...(langs.length > 1 ? [...alts, xd] : []), '  </url>'].filter(Boolean).join('\n'))
    .join('\n');
}

export function sitemap(origin: string): string {
  const entries: string[] = [];
  for (const key of STATIC_KEYS) if (ROUTES[key]) entries.push(urlEntry(origin, key, {}));
  for (const p of listProducts()) entries.push(urlEntry(origin, productRouteKey(p.kind), { slug: p.slug }, p.updated_at));
  const docs = articles();
  for (const slug of articleSlugs()) {
    const langs = (['sq', 'en'] as Lang[]).filter((l) => docs.some((d) => d.slug === slug && d.lang === l));
    const updated = docs.find((d) => d.slug === slug && d.updated)?.updated ?? null;
    entries.push(urlEntry(origin, 'article', { slug }, updated, langs.length ? langs : ['sq']));
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

export function robots(origin: string): string {
  return ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', '', `Sitemap: ${absolute(origin, '/sitemap.xml')}`, ''].join('\n');
}
