/** zod schemas for admin API bodies. */
import { z } from 'zod';
import { DATE_RE, DATETIME_RE, daysBetween, wallTimeExists } from './time';
import { E } from './http';
import { get } from './db/index';

/** A bundle holds no rooms or seats until dates are agreed with the hotel, so it needs a stock cap. */
/**
 * 400 naming the field when a product points at a category or bundle item that does not exist
 * (SQLite would refuse it with a foreign-key error, answered as 500 server_error).
 */
export function checkProductRefs(b: { category?: string | null; bundle_items?: { product_id: number }[] | null }, selfId?: number): void {
  const fields: { path: string; message: string }[] = [];
  if (b.category && !get('SELECT 1 FROM categories WHERE id = ?', b.category)) fields.push({ path: 'category', message: 'unknown_category' });
  (b.bundle_items ?? []).forEach((it, i) => {
    if (it.product_id === selfId || !get("SELECT 1 FROM products WHERE id = ? AND kind != 'bundle'", it.product_id)) fields.push({ path: `bundle_items.${i}.product_id`, message: 'unknown_product' });
  });
  if (fields.length) {
    throw E.bad(
      fields[0].path === 'category' ? 'Kjo kategori nuk ekziston.' : 'Një artikull i paketës nuk ekziston.',
      fields[0].path === 'category' ? 'This category does not exist.' : 'A bundle item does not exist.',
      { fields },
    );
  }
}

export const BUNDLE_STOCK = () =>
  E.bad('Paketa ka nevojë për një sasi (stok): ajo nuk rezervon dhoma apo vende derisa të caktohen datat.', 'A bundle needs a stock quantity: it holds no rooms or seats until dates are agreed.', { fields: [{ path: 'stock', message: 'required_for_bundle' }] });

// Admin text ends up in XML feeds, CSV exports and JSON-LD: control characters (Word's manual
// line break U+000B, NUL …) are refused. One-line fields refuse line breaks too; long text
// keeps TAB/LF/CR.
// eslint-disable-next-line no-control-regex
const CTRL_LINE = /[\x00-\x1f\x7f-\x9f\u2028\u2029\uFFFE\uFFFF]/;
// eslint-disable-next-line no-control-regex
const CTRL_TEXT = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\uFFFE\uFFFF]/;
const str = (max: number) => z.string().trim().max(max).refine((s) => !CTRL_LINE.test(s), 'control_characters');
const text = (max: number) => z.string().trim().max(max).refine((s) => !CTRL_TEXT.test(s), 'control_characters');
const optStr = (max: number) => str(max).nullable().optional();
const optText = (max: number) => text(max).nullable().optional();
const date = z.string().regex(DATE_RE, 'YYYY-MM-DD');
const intMin0 = z.coerce.number().int().min(0);

export const zImage = z.object({
  slug: str(160).optional(),
  src: z.string().regex(/^\/media\/\d{4}\/[a-f0-9]{8,32}(-(480|960|1600|orig)\.(webp|jpg|png|avif))?$/).optional(),
  alt_sq: str(300).optional(),
  alt_en: str(300).optional(),
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
}).refine((i) => !!(i.slug || i.src), { message: 'slug or src required' });

export const zProduct = z.object({
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase-with-dashes'),
  kind: z.enum(['room', 'experience', 'bundle', 'gift', 'goods']),
  category: optStr(40),
  name_sq: str(200).min(1),
  name_en: str(200).min(1),
  summary_sq: optText(1000), summary_en: optText(1000),
  body_sq: optText(20000), body_en: optText(20000),
  includes_sq: z.array(str(200)).max(30).optional(), includes_en: z.array(str(200)).max(30).optional(),
  price: intMin0.max(100_000_000),
  compare_at: intMin0.nullable().optional(),
  stock: intMin0.nullable().optional(),
  units: intMin0.max(500).nullable().optional(),
  capacity: intMin0.max(1000).nullable().optional(),
  duration_min: intMin0.max(100_000).nullable().optional(),
  poi: optStr(80),
  tags: z.array(str(30)).max(20).optional(),
  seasons: z.array(z.number().int().min(1).max(12)).max(12).optional(),
  images: z.array(zImage).max(20).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  featured: z.boolean().optional(),
  sort: z.coerce.number().int().optional(),
  bundle_items: z.array(z.object({ product_id: z.number().int().positive(), qty: z.number().int().min(1).max(99) })).max(20).optional(),
});
/**
 * options.amount_presets (T6 fix round 3, 2026-10-26): the gift card's suggested amounts. At most
 * 8 whole amounts inside the card's own limits (the same defaults as shop-data giftLimits():
 * 1000 / 200000 / 100) and on its step counted from the minimum; anything else → 400 with the field.
 * `options` is the product's whole options object after the save (PATCH replaces it).
 */
export function checkGiftPresets(options: Record<string, unknown> | undefined): void {
  const v = options?.amount_presets;
  if (v === undefined || v === null) return;
  const lim = (k: string, d: number) => { const n = Number(options?.[k] ?? d); return Number.isFinite(n) ? n : d; };
  const min = lim('amount_min', 1000), max = lim('amount_max', 200000), step = Math.max(1, lim('amount_step', 100));
  const ok = Array.isArray(v) && v.length <= 8
    && v.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max && (x - min) % step === 0);
  if (!ok) {
    throw E.bad(
      `Shumat e propozuara: deri në 8 shuma të plota midis ${min} dhe ${max} lekë, me hap ${step} lekë.`,
      `Suggested amounts: up to 8 whole amounts between ${min} and ${max} lek, on the ${step} lek step.`,
      { fields: [{ path: 'options.amount_presets', message: 'invalid_presets' }] },
    );
  }
}

/** verify_demo (T6, 2026-10-26): the owner ticks "these values are real"; only then is the DEMO flag cleared. */
export const zProductPatch = zProduct.partial().extend({ verify_demo: z.boolean().optional() });

export const zSession = z.object({
  product_id: z.number().int().positive(),
  // A time inside the spring-forward gap (e.g. 2027-03-28T02:30) does not exist in Divjakë.
  starts_at: z.string().regex(DATETIME_RE, 'YYYY-MM-DDTHH:MM').refine(wallTimeExists, 'time_does_not_exist_in_europe_tirane'),
  capacity: intMin0.max(1000),
  status: z.enum(['open', 'closed', 'cancelled']).optional(),
  note: optStr(500),
});
export const zSessionPatch = zSession.omit({ product_id: true }).partial();

export const zGenerate = z.object({
  product_id: z.number().int().positive(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).min(1).max(12),
  from: date,
  to: date,
  capacity: intMin0.max(1000).optional(),
  note: optStr(500),
}).refine((g) => g.to >= g.from && daysBetween(g.from, g.to) <= 400, { message: 'to >= from, at most 400 days', path: ['to'] });

export const zRateBase = z.object({
  product_id: z.number().int().positive(),
  date_from: date,
  date_to: date,
  price: intMin0.max(100_000_000),
  note: optStr(200),
});
export const zRate = zRateBase.refine((r) => r.date_to >= r.date_from && daysBetween(r.date_from, r.date_to) <= 1100, { message: 'date_to >= date_from, at most 1100 days', path: ['date_to'] });

export const zNights = z.object({
  product_id: z.number().int().positive(),
  from: date,
  to: date, // exclusive
  closed: z.union([intMin0.max(500), z.literal('all')]),
}).refine((r) => r.to > r.from && daysBetween(r.from, r.to) <= 400, { message: 'to > from, at most 400 nights', path: ['to'] });

export const zOfferBase = z.object({
  name_sq: optStr(200), name_en: optStr(200),
  type: z.enum(['percent', 'fixed']),
  value: intMin0.max(100_000_000),
  scope: z.object({ kinds: z.array(z.string()).optional(), categories: z.array(z.string()).optional(), products: z.array(z.union([z.string(), z.number()])).optional() }).optional(),
  min_nights: intMin0.nullable().optional(),
  min_total: intMin0.nullable().optional(),
  starts_on: date.nullable().optional(),
  ends_on: date.nullable().optional(),
  // Promo codes: at least 8 characters, so they cannot be guessed (empty / null = automatic offer).
  code: z.string().trim().max(40).regex(/^([A-Za-z0-9_-]{8,40})?$/, 'at least 8 letters, digits, - or _').nullable().optional(),
  max_uses: intMin0.nullable().optional(),
  active: z.boolean().optional(),
});
export const zOffer = zOfferBase.refine((o) => o.type !== 'percent' || o.value <= 100, { message: 'percent <= 100', path: ['value'] });

export const zFaq = z.object({
  q_sq: optStr(500), q_en: optStr(500), a_sq: optText(5000), a_en: optText(5000),
  keywords: optStr(1000),
  // A link is a same-site path (/…, not //host) or an https URL: nothing else (javascript:, data:, http:) reaches the public assistant.
  links: z.array(z.object({ key: str(40).optional(), url: str(300).refine((u) => /^\/(?![/\\])/.test(u) || /^https:\/\/[^\s/]+/i.test(u), 'url_must_be_path_or_https').optional(), params: z.record(z.string(), z.string()).optional(), label_sq: str(120).optional(), label_en: str(120).optional() })).max(6).optional(),
  sort: z.coerce.number().int().optional(),
  active: z.boolean().optional(),
});

export const zCategory = z.object({ id: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/), name_sq: str(120).min(1), name_en: str(120).min(1), sort: z.coerce.number().int().optional() });

export const zOrderPatch = z.object({
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled']).optional(),
  payment_status: z.enum(['unpaid', 'paid', 'refunded', 'failed']).optional(),
  notes: optText(4000),
  payment_ref: optStr(200),
  /** Copy the marketing consent ticked on this order to the customer (staff checked it with the guest). */
  confirm_consent: z.literal(true).optional(),
  /** Staff saw the "time slot cancelled" warning and confirm/complete/mark paid anyway (else 409 session_cancelled). */
  force: z.literal(true).optional(),
});

export const zCustomerPatch = z.object({ name: optStr(120), phone: optStr(40), country: optStr(60), notes: optText(4000), marketing_consent: z.boolean().optional() });
export const zMessagePatch = z.object({ status: z.enum(['new', 'read', 'done']) });
