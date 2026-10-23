/**
 * site-data.ts — server-side data the chrome needs, read defensively so the chrome never
 * breaks a page: research JSON files (photos, geo), business settings and the EUR rate from
 * T1's settings repo, and the site origin. Server only (uses node:fs).
 */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PHOTO_WIDTHS } from './photo-url';

const ROOT = process.cwd();
const cache = new Map<string, { mtime: number; data: unknown }>();

/** research/<name> parsed as JSON (cached by mtime). null when missing or broken. */
export function readResearch<T = unknown>(name: string): T | null {
  const file = join(ROOT, 'research', name);
  try {
    const { mtimeMs } = statSync(file);
    const hit = cache.get(file);
    if (hit && hit.mtime === mtimeMs) return hit.data as T;
    const data = JSON.parse(readFileSync(file, 'utf8')) as T;
    cache.set(file, { mtime: mtimeMs, data });
    return data;
  } catch {
    return null;
  }
}

export function publicFileExists(urlPath: string): boolean {
  try { return existsSync(join(ROOT, 'public', decodeURIComponent(urlPath.replace(/^\//, '')))); } catch { return false; }
}

/* ---------------- photos ---------------- */

export interface PhotoEntry {
  slug: string;
  width: number; height: number;
  alt: { sq: string; en: string };
  caption: { sq: string; en: string };
  place: { sq: string; en: string };
  location_verified: boolean;
  lat: number | null; lon: number | null;
  credit: string; license: string; source_url: string; credit_url: string;
  lqip: string | null;           // data: URI or colour
  focal: string | null;          // CSS object-position
  srcFor: (w: number, fmt: 'avif' | 'webp' | 'jpg') => string | null;
  widths: number[];
  raw: Record<string, unknown>;
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bi = (r: Raw, base: string): { sq: string; en: string } => {
  const obj = r[base];
  if (obj && typeof obj === 'object') { const o = obj as Raw; return { sq: str(o.sq) || str(o.en), en: str(o.en) || str(o.sq) }; }
  const sq = str(r[`${base}_sq`]), en = str(r[`${base}_en`]);
  const plain = str(r[base]);
  return { sq: sq || plain || en, en: en || plain || sq };
};

function normalisePhoto(r: Raw): PhotoEntry | null {
  const slug = str(r.slug) || str(r.id);
  if (!slug) return null;
  // variants, as the photo pipeline writes them (research/photos.json):
  //   files: { avif: [{ path, width, height, bytes }], webp: [...] }
  // also accepted: [{ width, format, src }] and { avif: { 640: '/photos/..' } }. The table is
  // built once per photos.json mtime (readResearch caches), so rendering never touches the disk.
  const table = new Map<string, string>();
  const add = (fmt: string, w: number | null, src: string) => { if (fmt && w && src.startsWith('/')) table.set(`${fmt}:${w}`, src); };
  const variants = r.files ?? r.variants ?? r.sources;
  if (Array.isArray(variants)) {
    for (const v of variants as Raw[]) {
      const src = str(v.src) || str(v.path) || str(v.url);
      add(str(v.format) || str(v.fmt) || (src.split('.').pop() ?? ''), num(v.width) ?? num(v.w), src);
    }
  } else if (variants && typeof variants === 'object') {
    for (const [fmt, list] of Object.entries(variants as Raw)) {
      if (Array.isArray(list)) for (const v of list as Raw[]) add(fmt, num(v?.width) ?? num(v?.w), str(v?.path) || str(v?.src) || str(v?.url));
      else if (list && typeof list === 'object') for (const [w, src] of Object.entries(list as Raw)) add(fmt, Number(w), str(src));
    }
  }
  const declared = (Array.isArray(r.widths) ? (r.widths as unknown[]).map(Number).filter(Boolean) : []) as number[];
  // no file table (older manifests): probe the /photos/<slug>-<w>.<fmt> convention once, here
  if (!table.size) {
    for (const w of declared.length ? declared : [...PHOTO_WIDTHS]) for (const fmt of ['avif', 'webp', 'jpg'] as const) {
      const p = `/photos/${slug}-${w}.${fmt}`;
      if (publicFileExists(p)) table.set(`${fmt}:${w}`, p);
    }
  }
  const widths = [...new Set([...table.keys()].map((k) => Number(k.split(':')[1])))].sort((a, b) => a - b);
  const srcFor = (w: number, fmt: 'avif' | 'webp' | 'jpg') => table.get(`${fmt}:${w}`) ?? null;
  const localSrc = str(r.local) || str(r.file_public) || str(r.public_path);
  if (!widths.length && localSrc.startsWith('/') && publicFileExists(localSrc)) {
    const w = num(r.width) ?? 1600;
    widths.push(w);
    table.set(`${localSrc.split('.').pop()}:${w}`, localSrc);
  }
  const verified = r.location_verified === true;
  const caption = bi(r, 'caption');
  const altRaw = bi(r, 'alt');
  const placeRaw = bi(r, 'place');
  return {
    slug,
    width: num(r.width) ?? 1600,
    height: num(r.height) ?? 1067,
    // content images are never announced as decorative: alt_* → caption_* (pages may pass alt)
    alt: { sq: altRaw.sq || caption.sq, en: altRaw.en || caption.en },
    caption,
    // the place line only for a verified location: place_* when given, else the caption
    place: verified ? { sq: placeRaw.sq || caption.sq, en: placeRaw.en || caption.en } : { sq: '', en: '' },
    location_verified: verified,
    lat: num(r.lat), lon: num(r.lon) ?? num(r.lng),
    credit: str(r.credit) || str(r.author) || str(r.creator) || str(r.photographer),
    license: str(r.license) || str(r.licence),
    source_url: str(r.source_url) || str(r.source_page) || str(r.page_url) || str(r.url),
    credit_url: str(r.credit_url) || str(r.author_url),
    lqip: str(r.lqip) || str(r.placeholder) || str(r.blur) || str(r.dominant) || str(r.color) || null,
    focal: str(r.focal) || str(r.object_position) || null,
    srcFor,
    widths,
    raw: r,
  };
}

const normalised = new WeakMap<object, PhotoEntry[]>();
export function photos(): PhotoEntry[] {
  const data = readResearch<unknown>('photos.json');
  if (!data || typeof data !== 'object') return [];
  const hit = normalised.get(data);
  if (hit) return hit;
  const list = Array.isArray(data) ? data : ((data as Raw).photos ?? (data as Raw).items ?? []);
  const out = (Array.isArray(list) ? list : []).map((r) => normalisePhoto(r as Raw)).filter(Boolean) as PhotoEntry[];
  normalised.set(data, out); // readResearch returns the same object until photos.json changes
  return out;
}

export function getPhoto(slug: string | null | undefined): PhotoEntry | null {
  if (!slug) return null;
  return photos().find((p) => p.slug === slug) ?? null;
}

/** First photo matching any of the words (slug/tags/place), with real local files. */
export function findPhoto(words: string[]): PhotoEntry | null {
  const all = photos().filter((p) => p.widths.length);
  for (const w of words) {
    const re = new RegExp(w, 'i');
    const hit = all.find((p) => re.test(p.slug) || re.test(JSON.stringify(p.raw.tags ?? '')) || re.test(p.place.en) || re.test(p.place.sq));
    if (hit) return hit;
  }
  return null;
}

/* ---------------- settings from T1 (defensive) ---------------- */

export interface Business {
  name: string; address: string; address_sq?: string; address_en?: string; phone: string; email: string; whatsapp: string; viber: string;
  lat: number | null; lon: number | null; placeholders: string[];
}

export async function business(): Promise<Business> {
  const fallback: Business = { name: 'Hotel Pelikan', address: '', phone: '', email: '', whatsapp: '', viber: '', lat: null, lon: null, placeholders: ['address', 'phone', 'email', 'whatsapp', 'viber', 'lat', 'lon'] };
  try {
    const mod = await import('../../lib/db/repo/settings');
    const b = mod.getSetting('business') as unknown as Business;
    return { ...fallback, ...b, placeholders: Array.isArray(b.placeholders) ? b.placeholders : fallback.placeholders };
  } catch { return fallback; }
}
/** A business value that may be shown publicly (set and not flagged as a placeholder). */
export function confirmed(b: Business, field: keyof Business): string {
  const v = b[field];
  if (b.placeholders.includes(field as string)) return '';
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

export async function eurRate(): Promise<number> {
  try {
    const mod = await import('../../lib/db/repo/settings');
    const r = Number(mod.getSetting('currency').eur_rate);
    return Number.isFinite(r) && r > 0 ? r : 0;
  } catch { return 0; }
}

export async function social(): Promise<Record<string, string>> {
  try {
    const mod = await import('../../lib/db/repo/settings');
    const s = mod.getSetting('social') as Record<string, string>;
    return Object.fromEntries(Object.entries(s ?? {}).filter(([, v]) => typeof v === 'string' && /^https:\/\//.test(v)));
  } catch { return {}; }
}

/** Canonical origin: T1's siteOrigin() (settings.seo.site_url → Astro site → request). */
export async function siteOriginOf(url: URL, site?: URL): Promise<string> {
  try {
    const mod = await import('../../lib/urls');
    return mod.siteOrigin(url);
  } catch {
    if (site && !site.hostname.endsWith('.example')) return site.origin;
    return url.origin;
  }
}

/* ---------------- the hotel's position ---------------- */

export interface Spot { lat: number; lon: number; verified: boolean }

/**
 * Hotel Pelikan's position: business settings (when confirmed) → research/business.json
 * hotel.coordinates → research/geo.json hotel POI → DESIGN.md's working value (40°58′N 19°28′E).
 */
export async function hotelSpot(): Promise<Spot> {
  const b = await business();
  if (b.lat != null && b.lon != null && !b.placeholders.includes('lat')) return { lat: b.lat, lon: b.lon, verified: true };
  const biz = readResearch<Raw>('business.json');
  const c = (biz?.hotel as Raw | undefined)?.coordinates as Raw | undefined;
  if (c && num(c.lat) != null && (num(c.lng) ?? num(c.lon)) != null) {
    return { lat: num(c.lat)!, lon: (num(c.lng) ?? num(c.lon))!, verified: c.confidence === 'high' };
  }
  const geo = readResearch<Raw>('geo.json');
  const pois = (geo?.pois ?? geo?.points ?? []) as Raw[];
  if (Array.isArray(pois)) {
    const h = pois.find((p) => /hotel|pelikan/i.test(str(p.id) + str(p.name) + str(p.name_en)));
    const lat = h ? num(h.lat) : null, lon = h ? num(h.lon) ?? num(h.lng) : null;
    if (h && lat != null && lon != null) return { lat, lon, verified: h.verified === true };
  }
  return { lat: 40.9667, lon: 19.4667, verified: false };
}
