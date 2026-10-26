/**
 * Server helpers for the admin pages (T6). Read-only use of T1's lib (repo functions, stats,
 * the /api/admin/me handler) so the admin never drifts from the API; every mutation goes
 * through /api/admin/* from the browser.
 */
import type { AstroGlobal } from 'astro';
import { t, type Lang } from '../../i18n/ui';
import { money, number, formatDate, tirane as tiraneParts } from '../../i18n/format';
import { readResearch, photos, type PhotoEntry } from '../site/site-data';
import { photoSrc } from '../site/photo-url';

export const LANG_COOKIE = 'dv_admin_lang';

/** Admin language: cookie `dv_admin_lang` (mirrors localStorage `dv-admin-lang`), Albanian by default. */
export function adminLang(Astro: AstroGlobal): Lang {
  return Astro.cookies.get(LANG_COOKIE)?.value === 'en' ? 'en' : 'sq';
}

export type Tr = (key: string, vars?: Record<string, string | number>) => string;
export const tr = (lang: Lang): Tr => (key, vars) => t(lang, key, vars);

/** Whole lek, sq "6 500 lekë" / en "ALL 6,500". */
export const lek = (n: number | null | undefined, lang: Lang) => (n == null ? '—' : money(n, lang));
export const num = (n: number | null | undefined, lang: Lang, d = 0) => (n == null ? '—' : number(n, lang, d));

/** A UTC ISO instant → Tirane "23 tet · 14:05" (short) or "23 tetor 2026, 14:05". */
export function when(iso: string | null | undefined, lang: Lang, style: 'short' | 'medium' = 'short'): string {
  if (!iso) return '—';
  const p = tiraneParts(iso);
  return style === 'short' ? `${formatDate(p.iso, lang, 'short')} · ${p.time}` : `${formatDate(p.iso, lang, 'medium')}, ${p.time}`;
}

/** Local wall-clock 'YYYY-MM-DDTHH:MM' (session starts) → "23 tet · 09:30". */
export function wall(dt: string, lang: Lang): string {
  return `${formatDate(dt.slice(0, 10), lang, 'short')} · ${dt.slice(11, 16)}`;
}

export const today = () => tiraneParts().iso;

/** Pagination numbers for a list. */
export function pageOf(total: number, offset: number, limit: number) {
  return { from: total ? offset + 1 : 0, to: Math.min(total, offset + limit), total, prev: offset > 0 ? Math.max(0, offset - limit) : null, next: offset + limit < total ? offset + limit : null };
}

/** URL with one query param changed (null removes it). */
export function withParam(url: URL, changes: Record<string, string | number | null | undefined>): string {
  const u = new URL(url.pathname + url.search, 'http://x');
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === undefined || v === '') u.searchParams.delete(k);
    else u.searchParams.set(k, String(v));
  }
  const s = u.searchParams.toString();
  return u.pathname + (s ? `?${s}` : '');
}

/** Date range from ?from&to or ?r=7|30|90|month (default 30 days ending today). */
export function rangeOf(url: URL): { from: string; to: string; preset: string } {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const sp = url.searchParams;
  const end = today();
  const add = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const f = sp.get('from'), to = sp.get('to');
  if (f && to && re.test(f) && re.test(to) && f <= to) return { from: f, to, preset: 'custom' };
  const r = sp.get('r') ?? '30';
  if (r === 'month') return { from: `${end.slice(0, 8)}01`, to: end, preset: 'month' };
  const n = r === '7' ? 7 : r === '90' ? 90 : 30;
  return { from: add(end, -(n - 1)), to: end, preset: String(n) };
}

/* ---------- research: POIs and photos ---------- */

export interface Poi { id: string; name_sq: string; name_en: string; confidence: string; flag: '' | 'destroyed' | 'closed' | 'low' }
export function pois(): Poi[] {
  const g = readResearch<{ pois?: Record<string, unknown>[] }>('geo.json');
  return (g?.pois ?? []).map((p) => {
    const id = String(p.id);
    const notes = `${p.notes ?? ''} ${p.status ?? ''}`.toLowerCase();
    const flag: Poi['flag'] = id === 'pelican-tower' || /destroy/.test(notes) ? 'destroyed' : id === 'pelican-island' ? 'closed' : p.confidence === 'low' ? 'low' : '';
    return { id, name_sq: String(p.name_sq ?? id), name_en: String(p.name_en ?? p.name_sq ?? id), confidence: String(p.confidence ?? ''), flag };
  });
}

export interface LibPhoto { slug: string; thumb: string; alt_sq: string; alt_en: string; place: string; verified: boolean; credit: string; w: number; h: number }
export function photoLibrary(lang: Lang): LibPhoto[] {
  return photos().filter((p: PhotoEntry) => p.widths.length).map((p) => ({
    slug: p.slug,
    thumb: photoSrc(p.slug, 640, 'webp'),
    alt_sq: p.caption.sq || p.alt.sq,
    alt_en: p.caption.en || p.alt.en,
    place: lang === 'en' ? p.place.en : p.place.sq,
    verified: p.location_verified,
    credit: p.credit,
    w: p.width, h: p.height,
  }));
}

/** Thumbnail URL for a product image entry ({slug} from photos.json or {src} upload). */
export function imageThumb(img: { slug?: string; src?: string }): string | null {
  if (img.src) return /\.(webp|jpg|png|avif)$/.test(img.src) ? img.src : `${img.src}-480.webp`;
  if (img.slug) return photoSrc(img.slug, 640, 'webp');
  return null;
}

export const TAGS = ['birds', 'nature', 'beach', 'culture', 'food', 'active', 'family', 'couple', 'slow', 'rainy'];

/** Call an API GET handler in-process with the page's locals (same code path as the API). */
export async function callApi<T>(handler: (ctx: never) => Promise<Response> | Response, Astro: AstroGlobal, url?: string, params: Record<string, string> = {}): Promise<T | null> {
  const ctx = { locals: Astro.locals, url: new URL(url ?? Astro.url.href, Astro.url), params, request: Astro.request, cookies: Astro.cookies } as unknown as never;
  const res = await handler(ctx);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export interface MeEnv {
  card_mode: string; pok_configured: boolean; test_payments: boolean; claude: boolean; site_url: string | null; warnings: string[];
  pending_last_hour: number; held_last_hour: { orders: number; roomNights: number; seats: number; units: number };
  payment_details_changed_at: string | null; login_ceiling_hit_at: string | null;
}

/** Where each env warning sends the owner. */
export const WARN_LINK: Record<string, string> = {
  site_url_missing: '/admin/cilesimet/#seo',
  bank_without_iban: '/admin/cilesimet/#pagesat',
  card_live_without_pok: '/admin/cilesimet/#pagesat',
  card_test_mode_hidden: '/admin/cilesimet/#pagesat',
  test_payments_enabled: '/admin/cilesimet/#pagesat',
  pending_surge: '/admin/porosite/?status=pending#flood',
  payment_details_changed: '/admin/cilesimet/#pagesat',
};

export const ORDER_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'] as const;
export const PAY_STATUSES = ['unpaid', 'paid', 'refunded', 'failed'] as const;
export const PAY_METHODS = ['hotel', 'bank', 'card'] as const;
export const KINDS = ['room', 'experience', 'bundle', 'gift', 'goods'] as const;
