/**
 * First-party analytics ingest. No cookies, no IP stored, aggregate only.
 * The client (src/scripts/track.ts) sends POST /api/e with
 *   { type, path, lang, product?, value?, meta?, sid, ref?, utm? }
 * as application/json or text/plain (sendBeacon). The server derives the day
 * (Europe/Tirane), the device class from the User-Agent and keeps only the referrer domain.
 */
import { z } from 'zod';
import { all, get, run, toJson } from './db/index';
import { getSetting } from './db/repo/settings';
import { dayOf, nowIso } from './time';
import { addrGroup } from './security';

export const EVENT_TYPES = [
  'view', 'product_view', 'search', 'add_to_cart', 'remove_from_cart', 'checkout_start', 'order', 'paid',
  'assistant_q', 'assistant_miss', 'itinerary', 'share', 'vital', 'live_view',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Types a browser may send (order/paid are written by the server only). */
export const CLIENT_TYPES = EVENT_TYPES.filter((t) => t !== 'order' && t !== 'paid');

export const zEvent = z.object({
  type: z.enum(CLIENT_TYPES as unknown as [string, ...string[]]),
  path: z.string().max(300).optional(),
  lang: z.enum(['sq', 'en']).optional(),
  product: z.string().max(120).optional(),
  value: z.number().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  sid: z.string().min(4).max(64).regex(/^[A-Za-z0-9_-]+$/),
  ref: z.string().max(500).optional(),
  utm: z.object({ source: z.string().max(80).optional(), medium: z.string().max(80).optional(), campaign: z.string().max(120).optional() }).partial().optional(),
});
export type EventInput = z.infer<typeof zEvent>;

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|curl|wget|python-requests|httpclient|phantom|puppeteer|playwright|monitor|uptime/i;

export function isBot(ua: string | null, meta?: Record<string, unknown>): boolean {
  if (meta && (meta.wd === true || meta.wd === 1 || meta.wd === '1')) return true;
  if (!ua) return true;
  return BOT_RE.test(ua);
}

export function deviceOf(ua: string | null): 'mobile' | 'tablet' | 'desktop' {
  const s = ua || '';
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|Opera Mini/i.test(s)) return 'mobile';
  return 'desktop';
}

/** Referrer → bare domain; own host and empty → null. */
export function refDomain(ref: string | undefined, ownHost: string): string | null {
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '').toLowerCase();
    if (!h || h === ownHost.replace(/^www\./, '').split(':')[0]) return null;
    return h.slice(0, 120);
  } catch {
    return null;
  }
}

const ORDER_CODE = /DV-[23456789A-HJ-NP-Z]{5}/gi;

/**
 * Path without query string or hash (they may carry order tokens or e-mails), order codes
 * replaced by ':code' (so /porosia/DV-7K3Q9/ becomes /porosia/:code/), capped at 200 chars.
 * Only a same-site path is kept: it must start with a single '/' (so 'javascript:…',
 * 'https://…' and '//host' are dropped) and contain only URL path characters.
 */
export function cleanPath(p: string | undefined | null): string | null {
  if (!p || p[0] !== '/' || p[1] === '/' || p[1] === '\\') return null;
  try {
    const path = new URL(p, 'http://x').pathname.replace(ORDER_CODE, ':code').slice(0, 200);
    return /^\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/]*$/.test(path) ? path : null;
  } catch {
    return null;
  }
}

/**
 * utm_source / utm_medium / utm_campaign and orders.source: an identifier or nothing. Free text
 * (an e-mail address, a sentence, markup) is dropped, so no personal data and nothing an admin
 * screen would have to defuse ends up stored.
 */
const UTM_RE = /^[a-z0-9._~-]{1,60}$/;
export function cleanUtm(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toLowerCase();
  return UTM_RE.test(t) ? t : null;
}

/** Order / event source: a clean utm_source, else the referrer's domain, else null. */
export function cleanSource(utmSource: unknown, ref: string | null | undefined, ownHost: string): string | null {
  return cleanUtm(utmSource) ?? refDomain(ref ?? undefined, ownHost);
}

/**
 * Free text typed by visitors (search / assistant questions) with personal data removed:
 * e-mail addresses, URLs with credentials, phone numbers and any run of 7+ digits.
 */
export function redactText(s: string, max = 200): string {
  return s
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/\+?\d[\d\s().\-/]{5,}\d/g, (m) => (m.replace(/\D/g, '').length >= 7 ? '[number]' : m))
    .replace(ORDER_CODE, '[code]')
    .slice(0, max);
}

export const SID_RE = /^[A-Za-z0-9_-]{4,64}$/;
export const cleanSid = (sid: unknown): string | null => (typeof sid === 'string' && SID_RE.test(sid) ? sid : null);

/** Meta keys kept per event type (anything else is dropped); strings are redacted. */
const META_KEYS: Record<string, string[]> = {
  vital: ['name', 'value', 'rating'],
  add_to_cart: ['kind', 'qty'],
  remove_from_cart: ['kind', 'qty'],
  search: ['q', 'n'],
  checkout_start: ['items', 'method', 'kind'],
  itinerary: ['days', 'interests', 'items', 'step', 'action'],
  share: ['channel', 'kind'],
  live_view: ['section', 'tab'],
  view: ['kind'],
  product_view: ['kind'],
  assistant_q: ['intent', 'hit', 'q', 'faq', 'score', 'from', 'to', 'interests'],
  assistant_miss: ['q'],
};

/** Short identifier-like values (kinds, dates, names of vitals); free text only under 'q'. */
const TOKEN_RE = /^[A-Za-z0-9 _.:-]{0,60}$/;
const cleanValue = (k: string, v: string, max: number): string | undefined =>
  k === 'q' ? redactText(v, max) : TOKEN_RE.test(v) && redactText(v, max) === v ? v : undefined;

/** Web Vitals ranges we accept (ms; CLS unitless). Anything outside is dropped. */
const VITAL_RANGE: Record<string, [number, number]> = { LCP: [0, 60000], INP: [0, 60000], FCP: [0, 60000], TTFB: [0, 60000], CLS: [0, 10] };

function cleanMeta(type: string, meta: Record<string, unknown> | undefined): string | null {
  if (!meta) return null;
  const allowed = META_KEYS[type] ?? [];
  const m: Record<string, unknown> = {};
  for (const k of allowed) {
    const v = meta[k];
    if (typeof v === 'string') { const c = cleanValue(k, v, k === 'q' ? 200 : 60); if (c !== undefined) m[k] = c; }
    else if (typeof v === 'number' && Number.isFinite(v)) m[k] = v;
    else if (typeof v === 'boolean' || v === null) m[k] = v;
    else if (Array.isArray(v)) m[k] = v.slice(0, 20).map((x) => (typeof x === 'string' ? cleanValue('', x, 40) ?? null : typeof x === 'number' && Number.isFinite(x) ? x : null));
  }
  if (type === 'vital') {
    const name = String(m.name ?? '');
    const range = VITAL_RANGE[name];
    if (!range || typeof m.value !== 'number' || m.value < range[0] || m.value > range[1]) return null;
  }
  const s = JSON.stringify(m);
  return s === '{}' ? null : s.length > 1500 ? s.slice(0, 1500) : s;
}

/**
 * Volume ceilings (the events table lives in the same SQLite file as orders, so it must never be
 * able to fill the disk), all per day (Europe/Tirane) and in memory (the totals are re-counted
 * from the table once per day and process):
 *  - settings.privacy.events_per_day for the whole site, for the ordinary types (view,
 *    product_view, add_to_cart, …);
 *  - settings.privacy.events_per_address_day per address group (IPv4 /24, IPv6 /48): past it,
 *    1 event in 20 is still kept (up to twice the budget), so a busy shared address (a mobile carrier) is thinned, not
 *    silenced, and a flood from rotating IPv6 /64s counts as one group;
 *  - PRIORITY types (search, assistant_q, assistant_miss, vital: few, and the ones the dashboard
 *    cannot rebuild) have their own sitewide budget and PRIORITY_PER_GROUP per group, and never
 *    count against the ordinary ceiling — a flood of views cannot wipe them out;
 *  - SID_PER_DAY per browsing tab.
 * Above them new events are dropped silently. Per-address per-minute limits are in api/e.ts.
 */
export const SID_PER_DAY = 400;
export const PRIORITY: Record<string, number> = { search: 3000, assistant_q: 3000, assistant_miss: 1000, vital: 5000 };
export const PRIORITY_PER_GROUP = 100;
const SAMPLE_OVER_BUDGET = 20;

interface DayState { day: string; total: number; sids: Map<string, number>; groups: Map<string, number>; types: Map<string, number> }
const EV = globalThis as unknown as { __dvEvDay?: DayState };

function dayState(): DayState {
  const day = dayOf(nowIso());
  let st = EV.__dvEvDay;
  if (!st || st.day !== day) {
    const types = new Map<string, number>();
    let total = 0;
    for (const r of all<{ type: string; n: number }>('SELECT type, COUNT(*) AS n FROM events WHERE day = ? GROUP BY type', day)) {
      if (r.type in PRIORITY) types.set(r.type, Number(r.n));
      else if (r.type !== 'order' && r.type !== 'paid') total += Number(r.n);
    }
    st = EV.__dvEvDay = { day, total, sids: new Map(), groups: new Map(), types };
  }
  return st;
}

const bump = (m: Map<string, number>, k: string) => {
  if (m.size > 200_000) m.clear();
  m.set(k, (m.get(k) ?? 0) + 1);
};

/** Whether one more event of this type from this tab / address may be stored (and count it). */
export function admitEvent(sid: string | null | undefined, type: string = 'view', ip?: string | null): boolean {
  const st = dayState();
  const group = ip ? addrGroup(ip) : null;
  if (sid && (st.sids.get(sid) ?? 0) >= SID_PER_DAY) return false;
  if (type in PRIORITY) {
    if ((st.types.get(type) ?? 0) >= PRIORITY[type]) return false;
    if (group) {
      const gk = `${type}|${group}`;
      if ((st.groups.get(gk) ?? 0) >= PRIORITY_PER_GROUP) return false;
      bump(st.groups, gk);
    }
    bump(st.types, type);
  } else {
    const cap = getSetting('privacy').events_per_day || 30000;
    if (st.total >= cap) {
      if (st.total === cap) console.warn(`[analytics] daily event ceiling (${cap}) reached; dropping ordinary events until tomorrow (search, assistant and vitals keep their own budget)`);
      st.total++;
      return false;
    }
    if (group) {
      // Counts STORED events: past the budget 1 in 20 is kept, and never more than twice the
      // budget per group and day (so it takes many address groups to reach the sitewide ceiling).
      const n = st.groups.get(group) ?? 0;
      const budget = getSetting('privacy').events_per_address_day || 2000;
      if (n >= 2 * budget) return false;
      if (n >= budget && Math.random() * SAMPLE_OVER_BUDGET >= 1) return false;
      bump(st.groups, group);
    }
    st.total++;
  }
  if (sid) bump(st.sids, sid);
  return true;
}

/** Store one event. Returns false when it was dropped (bot / invalid vital / over a ceiling). */
export function recordEvent(e: EventInput, ctx: { ua: string | null; host: string; ip?: string | null }): boolean {
  if (isBot(ctx.ua, e.meta)) return false;
  if (e.type === 'vital' && cleanMeta(e.type, e.meta) === null) return false;
  if (!admitEvent(e.sid, e.type, ctx.ip)) return false;
  const meta = cleanMeta(e.type, e.meta);
  if (e.type === 'vital' && meta === null) return false;
  let value = e.value === undefined || !Number.isFinite(e.value) ? null : Math.round(e.value);
  if (e.type === 'vital') {
    // track.ts already sends value = ms (LCP/INP) or CLS × 1000; clamp to the same ranges.
    const name = (JSON.parse(meta!) as { name: string }).name;
    const [lo, hi] = VITAL_RANGE[name];
    const max = name === 'CLS' ? hi * 1000 : hi;
    if (value === null || value < lo || value > max) return false;
  } else if (value !== null && Math.abs(value) > 100_000_000) value = null;
  const productId = e.product ? get<{ id: number }>('SELECT id FROM products WHERE slug = ?', e.product)?.id ?? null : null;
  const ts = nowIso();
  run(
    `INSERT INTO events (ts, day, type, path, lang, product_id, value, sid, ref, utm_source, utm_medium, utm_campaign, device, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ts, dayOf(ts), e.type, cleanPath(e.path), e.lang ?? null, productId, value, e.sid,
    refDomain(e.ref, ctx.host), cleanUtm(e.utm?.source), cleanUtm(e.utm?.medium), cleanUtm(e.utm?.campaign),
    deviceOf(ctx.ua), meta,
  );
  return true;
}

/**
 * Server-side event (search, assistant). Same privacy rules as the beacon: path cleaned, sid
 * validated, meta filtered per type with free text redacted.
 */
export function serverEvent(type: EventType, data: { lang?: string; path?: string | null; sid?: string | null; product_id?: number | null; value?: number | null; meta?: Record<string, unknown>; ua?: string | null; ip?: string | null }): void {
  if (data.ua !== undefined && isBot(data.ua ?? null)) return;
  if (!admitEvent(cleanSid(data.sid), type, data.ip)) return;
  const ts = nowIso();
  run(
    'INSERT INTO events (ts, day, type, path, lang, product_id, value, sid, device, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ts, dayOf(ts), type, cleanPath(data.path), data.lang === 'en' ? 'en' : data.lang ? 'sq' : null, data.product_id ?? null, data.value ?? null, cleanSid(data.sid),
    data.ua !== undefined ? deviceOf(data.ua ?? null) : null, cleanMeta(type, data.meta),
  );
}
