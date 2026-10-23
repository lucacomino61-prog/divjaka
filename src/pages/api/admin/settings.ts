import type { APIRoute } from 'astro';
import { z } from 'zod';
import { handle, json, readJson, validate } from '../../../lib/http';
import { reauthenticate, requireAdmin, requireOwner } from '../../../lib/auth';
import { getAllSettings, getSetting, setSetting, SETTING_KEYS, type SettingKey } from '../../../lib/db/repo/settings';
import { audit } from '../../../lib/audit';
import { clientIp } from '../../../lib/security';

const s = (n: number) => z.string().trim().max(n);

/**
 * Public origin: scheme + host (+ port), nothing else — it becomes the origin of the sitemap,
 * feed, canonical URLs and the POK webhook/redirect URLs. https only in a production build.
 */
const zOrigin = s(200).refine((v) => {
  if (!v) return true;
  try {
    const u = new URL(v);
    if (u.origin !== v.replace(/\/$/, '')) return false;
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && !!import.meta.env.DEV;
  } catch {
    return false;
  }
}, 'origin like https://example.al (https only)');

const SCHEMAS: Record<SettingKey, z.ZodType> = {
  business: z.object({
    name: s(120), legal_name: s(200), nipt: s(40), address: s(300), phone: s(40), email: s(200).refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'email'),
    whatsapp: s(40), viber: s(40), checkin: s(40), checkout: s(40), reception_hours: s(120),
    lat: z.number().min(-90).max(90).nullable(), lon: z.number().min(-180).max(180).nullable(), placeholders: z.array(s(40)).max(40),
  }).partial(),
  payments: z.object({
    methods: z.object({ hotel: z.boolean(), bank: z.boolean(), card: z.boolean() }).partial(),
    mode: z.enum(['test', 'live']),
    iban: s(40).refine((v) => !v || /^[A-Z]{2}\d{2}[A-Z0-9 ]{10,32}$/.test(v.toUpperCase()), 'iban'),
    bank_name: s(120), beneficiary: s(160), swift: s(20), card_hold_minutes: z.number().int().min(10).max(120),
    bank_hold_hours: z.number().int().min(0).max(24 * 14), hotel_hold_hours: z.number().int().min(0).max(24 * 14),
  }).partial(),
  currency: z.object({ eur_rate: z.number().positive().max(10000), eur_rate_date: s(20), eur_rate_source: s(300) }).partial(),
  social: z.record(z.string().max(30), s(300).refine((v) => !v || /^https:\/\//.test(v), 'https url')),
  assistant: z.object({ enabled: z.boolean(), handoff_email: s(200), use_claude: z.boolean(), daily_cap: z.number().int().min(0).max(100_000) }).partial(),
  seo: z.object({ site_url: zOrigin.transform((v) => v.replace(/\/$/, '')), default_image: s(300) }).partial(),
  inventory: z.object({
    low_stock: z.number().int().min(0).max(1000), booking_cutoff_hours: z.number().int().min(0).max(168),
    booking_horizon_days: z.number().int().min(30).max(1100), max_room_nights_per_order: z.number().int().min(1).max(500),
    max_open_orders_per_email: z.number().int().min(1).max(100),
    unconfirmed_share: z.number().min(0.1).max(1),
    max_unconfirmed_room_nights_per_hour: z.number().int().min(1).max(10_000),
    max_unconfirmed_seats_per_hour: z.number().int().min(1).max(10_000),
    max_unconfirmed_units_per_hour: z.number().int().min(1).max(10_000),
    address_room_nights_per_hour: z.number().int().min(1).max(10_000),
    address_seats_per_hour: z.number().int().min(1).max(10_000),
    address_units_per_hour: z.number().int().min(1).max(10_000),
    max_room_nights_per_address_day: z.number().int().min(1).max(10_000),
    max_seats_per_address_day: z.number().int().min(1).max(10_000),
    max_units_per_address_day: z.number().int().min(1).max(10_000),
    max_units_per_unconfirmed_order: z.number().int().min(1).max(1000),
    max_people_per_session_line: z.number().int().min(1).max(99),
    max_session_lines_per_order: z.number().int().min(1).max(40),
    max_people_per_order: z.number().int().min(1).max(500),
    short_hold_hours: z.number().int().min(1).max(72),
    far_stay_nights: z.number().int().min(1).max(60),
    far_stay_days: z.number().int().min(1).max(1100),
    pending_alert_per_hour: z.number().int().min(1).max(1000),
  }).partial(),
  privacy: z.object({
    events_days: z.number().int().min(30).max(3650),
    messages_days: z.number().int().min(0).max(3650),
    events_per_day: z.number().int().min(1000).max(5_000_000),
    events_per_address_day: z.number().int().min(100).max(5_000_000),
    orders_days: z.number().int().min(0).max(3650),
    inventory_log_days: z.number().int().min(0).max(3650),
  }).partial(),
};

/**
 * Payment fields whose change is the classic payment-diversion step: they need the owner's
 * password again (current_password in the body; reauthenticate() throttles and audits it),
 * are audited with the last 4 characters of the old and new IBAN, logged to the console and
 * shown as a dashboard warning for 7 days (/api/admin/me payment_details_changed).
 */
const PAYMENT_DETAILS = ['iban', 'beneficiary', 'bank_name', 'swift'];
/** Also need the password, though they are not diverted money: switching methods or test/live mode. */
const PAYMENT_GUARDED = [...PAYMENT_DETAILS, 'mode', 'methods'];

const last4 = (v: unknown) => (typeof v === 'string' && v ? `…${v.slice(-4)}` : '');

/** GET /api/admin/settings → { settings } (defaults merged in). */
export const GET: APIRoute = handle(async ({ locals }) => {
  requireAdmin(locals);
  return json({ settings: getAllSettings() });
});

/**
 * PUT /api/admin/settings { business?: {...}, payments?: {...}, …, current_password? } (owner
 * only) — each key is merged into the stored object. Saving a business field removes it from
 * business.placeholders. Changing payments.iban / beneficiary / bank_name / swift / mode /
 * methods needs current_password (400 password_required / bad_password, 429 after 5 tries in
 * 15 minutes, 401 and every session ended after 5 wrong in a row). Every save is audited.
 */
export const PUT: APIRoute = handle(async (ctx) => {
  const admin = requireOwner(ctx.locals);
  const body = await readJson(ctx.request, z.record(z.string(), z.unknown()), 64 * 1024);
  const ip = clientIp(ctx);
  const changed: string[] = [];
  let paymentDetails = false;
  let guarded = false;
  let ibanChange: { from: string; to: string } | null = null;
  // Validate everything first, so a bad key saves nothing.
  const updates: [SettingKey, Record<string, unknown>][] = [];
  for (const [key, raw] of Object.entries(body)) {
    if (!SETTING_KEYS.includes(key as SettingKey)) continue;
    updates.push([key as SettingKey, validate(SCHEMAS[key as SettingKey], raw) as Record<string, unknown>]);
  }
  const planned: [SettingKey, Record<string, unknown>][] = [];
  for (const [k, v] of updates) {
    const cur = getSetting(k) as unknown as Record<string, unknown>;
    let next: Record<string, unknown> = k === 'social' ? v : { ...cur, ...v };
    if (k === 'payments' && v.methods) next.methods = { ...(cur.methods as object), ...(v.methods as object) };
    if (k === 'payments' && typeof next.iban === 'string') next.iban = (next.iban as string).toUpperCase().replace(/\s+/g, '');
    if (k === 'business' && !('placeholders' in v)) {
      const filled = Object.keys(v).filter((f) => v[f] !== '' && v[f] !== null);
      next = { ...next, placeholders: ((cur.placeholders as string[]) ?? []).filter((f) => !filled.includes(f)) };
    }
    for (const f of Object.keys(next)) {
      if (JSON.stringify(next[f]) !== JSON.stringify(cur[f])) {
        changed.push(`${k}.${f}`);
        if (k === 'payments' && PAYMENT_DETAILS.includes(f)) paymentDetails = true;
        if (k === 'payments' && PAYMENT_GUARDED.includes(f)) guarded = true;
        if (k === 'payments' && f === 'iban') ibanChange = { from: last4(cur.iban), to: last4(next.iban) };
      }
    }
    planned.push([k, next]);
  }
  // Nothing is written before the password check.
  if (guarded) reauthenticate(admin, typeof body.current_password === 'string' ? body.current_password : null, ip, 'payment_settings');
  for (const [k, next] of planned) setSetting(k, next);
  if (changed.length) {
    audit('settings_change', { adminId: admin.id, ip, detail: { keys: changed.slice(0, 40), payment_details: paymentDetails, ...(ibanChange ? { iban: ibanChange } : {}) } });
  }
  if (paymentDetails) console.warn(`[security] payment details changed by admin ${admin.id}${ibanChange ? ` (IBAN ${ibanChange.from} -> ${ibanChange.to})` : ''}`);
  return json({ settings: getAllSettings() });
});
export const PATCH = PUT;
