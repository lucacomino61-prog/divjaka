/**
 * Orders: create (one transaction: re-quote, hold inventory, write everything), cancel
 * (release), mark paid / failed, sweep of expired holds, public order view.
 *
 * Inventory holds
 *   room        room_nights.booked += rooms for each night (trigger aborts above units − closed)
 *   experience  sessions.booked += people (CHECK booked <= capacity aborts)
 *   tracked stock (goods/bundle/gift with stock NOT NULL)  products.stock −= qty (CHECK stock >= 0)
 * Every hold and release writes inventory_log (delta < 0 = taken, > 0 = given back).
 *
 * Holds expire (orders.hold_until, swept every few minutes and on checkout/admin loads):
 *   card   unpaid after settings.payments.card_hold_minutes (30)
 *   bank   unpaid and not confirmed by staff after bank_hold_hours (72)
 *   hotel  not confirmed by staff after hotel_hold_hours (24)
 * Staff confirming an order (status 'confirmed'/'completed') or a payment ends the hold; staff
 * putting an order (back) to 'pending' by hand makes it a staff hold (orders.staff_hold = 1):
 * never swept, not counted as unconfirmed.
 *
 * "Unconfirmed" (UNCONFIRMED) = status 'pending', payment unpaid/failed, staff_hold 0 — an
 * anonymous online order nobody has verified yet — or a TEST-paid order (proves nothing).
 * "Long hold" (LONG_HOLD) = unconfirmed and paid at the hotel, by bank or by TEST card: the
 * free way to hold inventory for a day or three. A real card order holds 30 minutes only.
 * Abuse limits (anonymous checkout costs nothing; NOTHING sitewide ever refuses everybody):
 *   - per room type and night / per session / per tracked product: long holds may take at most
 *     unconfirmed_share (50 %) of the units / capacity / stock (at least 1) — the rest stays
 *     bookable by card and by staff; at most max_units_per_unconfirmed_order units of a product;
 *   - the short hold (short_hold_hours, 2 h) instead of 24/72 h for long holds that are long or
 *     far ahead, placed past the address group's hourly share, during a sitewide surge (unless
 *     small and near-term), or by a person with open orders placed from another address;
 *     orders.review records why, for staff;
 *   - per person: max_open_orders_per_email waiting orders per NORMALISED e-mail (lower case,
 *     +tag and Gmail dots removed) or phone (last 9 digits), refused only from the same address group;
 *   - per order: rooms × nights, people per session line, session lines, people (pricing.ts);
 *   - per address group (IPv4 /24, IPv6 /48): room-nights, seats, units per day and hour
 *     (api/checkout.ts).
 */
import crypto from 'node:crypto';
import { all, get, run, tx, isConstraintError, toJson } from './db/index';
import { ApiError, E } from './http';
import { quote, type QuoteItem, type QuoteResult, type PricedLine } from './pricing';
import { confirmOrderConsent, upsertCustomer } from './db/repo/customers';
import { getOrder, orderByCode, orderItems, type Order, type OrderItem, type PaymentMethod } from './db/repo/orders';
import { getSetting } from './db/repo/settings';
import { getProduct, pname, primaryImage, type Kind } from './db/repo/products';
import { ensureNight } from './db/repo/rooms';
import { cardMode, paymentAvailability } from './payments/mode';
import { nights as nightList, nowIso, dayOf, addDays, today } from './time';
import { productUrl, type Lang } from './urls';
import { rateFactor } from './security';

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // no 0 O 1 I L

export function newOrderCode(): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.randomBytes(5);
    let s = 'DV-';
    for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
    if (!get('SELECT 1 FROM orders WHERE code = ?', s)) return s;
  }
  throw new Error('could not allocate an order code');
}

export const newAccessToken = () => crypto.randomBytes(32).toString('base64url');

export function tokenMatches(order: Pick<Order, 'access_token'>, token: string | null | undefined): boolean {
  if (!token) return false;
  const a = Buffer.from(order.access_token);
  const b = Buffer.from(String(token));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** E-mail as one person: lower case, '+tag' dropped, dots dropped for Gmail (they are ignored there). */
export function emailKey(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  local = local.split('+')[0] || local;
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

/** Phone as one person: its last 9 digits (Albanian mobile numbers are 9 digits after +355 / 0). */
export function phoneKey(phone: string | null | undefined): string | null {
  const d = String(phone ?? '').replace(/\D/g, '');
  return d.length >= 7 ? d.slice(-9) : null;
}

/**
 * SQL condition for an unconfirmed online order (alias o): waiting for payment or staff, or a
 * TEST-paid order (the simulator lets anyone "pay", so it proves nothing — it stays counted and
 * is released by the sweep like an unpaid one).
 */
export const UNCONFIRMED = "o.demo = 0 AND o.staff_hold = 0 AND ((o.status = 'pending' AND o.payment_status IN ('unpaid','failed')) OR (o.test = 1 AND o.status != 'cancelled'))";
/**
 * Unconfirmed orders with a LONG hold — pay at hotel (24 h), bank transfer (72 h), TEST card —
 * the ones the share caps and the surge count limit. A real card order holds for 30 minutes and
 * is then paid (proof) or released, so it is never share-capped: the half that unconfirmed
 * long holds may not take stays bookable by card and by staff.
 */
export const LONG_HOLD = `${UNCONFIRMED} AND (o.payment_method != 'card' OR o.test = 1)`;

const HOLD_CAP = () =>
  E.conflict('hold_cap',
    'Për këto data shumica e vendeve janë të mbajtura nga rezervime që presin konfirmim. Paguani me kartë për ta siguruar menjëherë, zgjidhni data të tjera ose kontaktoni hotelin.',
    'For these dates most places are held by bookings waiting for confirmation. Pay by card to secure it now, choose other dates or contact the hotel.');

const shareOf = () => Math.min(1, Math.max(0.1, Number(getSetting('inventory').unconfirmed_share ?? 0.5)));

/**
 * Per room type and night, unconfirmed long holds may cover at most share × units (at least 1).
 * Runs inside the createOrder transaction, before the new order's rows are written.
 */
function assertUnconfirmedShare(priced: PricedLine[]): void {
  const share = shareOf();
  const want = new Map<string, number>(); // `${productId}|${night}` → rooms this order wants
  const products = new Map<number, number>(); // product id → units
  const ranges = new Map<number, { from: string; to: string }>();
  for (const pl of priced) {
    const p = pl.product;
    if (!p || p.kind !== 'room' || !pl.nightInfo) continue;
    products.set(p.id, p.units ?? 0);
    for (const n of pl.nightInfo) want.set(`${p.id}|${n.night}`, (want.get(`${p.id}|${n.night}`) ?? 0) + pl.line.qty);
    const r = ranges.get(p.id);
    const f = pl.line.date_from!, t = pl.line.date_to!;
    ranges.set(p.id, { from: !r || f < r.from ? f : r.from, to: !r || t > r.to ? t : r.to });
  }
  for (const [pid, units] of products) {
    const cap = Math.max(1, Math.floor(units * share));
    const { from, to } = ranges.get(pid)!;
    const held = new Map<string, number>();
    for (const row of all<{ qty: number; date_from: string; date_to: string }>(
      `SELECT i.qty, i.date_from, i.date_to FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE i.product_id = ? AND i.kind = 'room' AND i.date_from < ? AND i.date_to > ? AND ${LONG_HOLD}`,
      pid, to, from,
    )) {
      const a = row.date_from > from ? row.date_from : from;
      const b = row.date_to < to ? row.date_to : to;
      for (const night of nightList(a, b)) held.set(night, (held.get(night) ?? 0) + row.qty);
    }
    for (const [k, n] of want) {
      const [id, night] = k.split('|');
      if (Number(id) !== pid) continue;
      if ((held.get(night) ?? 0) + n > cap) throw HOLD_CAP();
    }
  }
}

/** Per experience session, unconfirmed long holds may take at most share × capacity seats (at least 1). */
function assertSeatShare(priced: PricedLine[]): void {
  const share = shareOf();
  const want = new Map<number, { people: number; capacity: number }>();
  for (const pl of priced) {
    if (pl.product?.kind !== 'experience' || !pl.session) continue;
    const w = want.get(pl.session.id) ?? { people: 0, capacity: pl.session.capacity };
    w.people += pl.seats ?? 0;
    want.set(pl.session.id, w);
  }
  for (const [sid, w] of want) {
    const held = Number(get<{ n: number }>(
      `SELECT COALESCE(SUM(COALESCE(i.guests, i.qty)), 0) AS n FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE i.session_id = ? AND i.kind = 'experience' AND ${LONG_HOLD}`, sid,
    )?.n ?? 0);
    if (held + w.people > Math.max(1, Math.floor(w.capacity * share))) throw HOLD_CAP();
  }
}

/**
 * Stock-tracked goods / bundles / gift cards: an unconfirmed long-hold order takes at most
 * max_units_per_unconfirmed_order units of one product, and all of them together at most
 * share × (stock left + what they already hold), at least 1.
 */
function assertStockShare(priced: PricedLine[]): void {
  const share = shareOf();
  const perOrder = getSetting('inventory').max_units_per_unconfirmed_order || 5;
  const want = new Map<number, { units: number; stock: number }>();
  for (const pl of priced) {
    const p = pl.product;
    if (!p || p.kind === 'room' || p.kind === 'experience' || p.stock === null) continue;
    const w = want.get(p.id) ?? { units: 0, stock: p.stock };
    w.units += pl.line.qty;
    want.set(p.id, w);
  }
  for (const [pid, w] of want) {
    if (w.units > perOrder) {
      throw E.conflict('hold_cap_units',
        `Pa pagesë paraprake mund të rezervoni deri në ${perOrder} copë nga një artikull. Paguani me kartë ose kontaktoni hotelin për më shumë.`,
        `Without paying now you can reserve up to ${perOrder} of one item. Pay by card or contact the hotel for more.`, { max: perOrder });
    }
    const held = Number(get<{ n: number }>(
      `SELECT COALESCE(SUM(CAST(json_extract(i.meta, '$.held_stock') AS INTEGER)), 0) AS n FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE i.product_id = ? AND i.kind NOT IN ('room','experience') AND ${LONG_HOLD}`, pid,
    )?.n ?? 0);
    if (held + w.units > Math.max(1, Math.floor((w.stock + held) * share))) throw HOLD_CAP();
  }
}

/** Room-nights a priced cart asks for. */
export function roomNightsOf(priced: Pick<PricedLine, 'product' | 'nightInfo' | 'line'>[]): number {
  return priced.reduce((s, pl) => s + (pl.product?.kind === 'room' && pl.nightInfo ? pl.nightInfo.length * pl.line.qty : 0), 0);
}

/** What a priced cart takes from inventory: room-nights, experience seats, units of tracked stock. */
export interface Demand { roomNights: number; seats: number; units: number }

export function demandOf(priced: Pick<PricedLine, 'product' | 'nightInfo' | 'line' | 'seats'>[]): Demand {
  let seats = 0, units = 0;
  for (const pl of priced) {
    const p = pl.product;
    if (!p) continue;
    if (p.kind === 'experience') seats += pl.seats ?? pl.line.qty;
    else if (p.kind !== 'room' && p.stock !== null) units += pl.line.qty;
  }
  return { roomNights: roomNightsOf(priced), seats, units };
}

/** What unconfirmed long-hold orders created since `sinceIso` took (dashboard surge alert, surge mode). */
export function heldSince(sinceIso: string): Demand & { orders: number } {
  const r = get<{ orders: number; rn: number; seats: number; units: number }>(
    `SELECT COUNT(DISTINCT o.id) AS orders,
            COALESCE(SUM(CASE WHEN i.kind = 'room' THEN i.qty * (julianday(i.date_to) - julianday(i.date_from)) END), 0) AS rn,
            COALESCE(SUM(CASE WHEN i.kind = 'experience' THEN COALESCE(i.guests, i.qty) END), 0) AS seats,
            COALESCE(SUM(CAST(json_extract(i.meta, '$.held_stock') AS INTEGER)), 0) AS units
       FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
      WHERE o.created_at >= ? AND ${LONG_HOLD}`, sinceIso,
  );
  return { orders: Number(r?.orders ?? 0), roomNights: Math.round(Number(r?.rn ?? 0)), seats: Number(r?.seats ?? 0), units: Number(r?.units ?? 0) };
}

/** Sitewide surge thresholds (settings.inventory, × RATE_LIMIT_FACTOR on test servers). */
export function surgeLimits(): Demand {
  const inv = getSetting('inventory');
  const f = rateFactor();
  return {
    roomNights: (inv.max_unconfirmed_room_nights_per_hour || 60) * f,
    seats: (inv.max_unconfirmed_seats_per_hour || 60) * f,
    units: (inv.max_unconfirmed_units_per_hour || 20) * f,
  };
}

/** True while new unconfirmed long holds in the last hour have reached a sitewide surge threshold. */
export function surgeNow(): boolean {
  const lim = surgeLimits();
  const h = heldSince(new Date(Date.now() - 3600_000).toISOString());
  return h.roomNights >= lim.roomNights || h.seats >= lim.seats || h.units >= lim.units;
}

/** A small near-term booking (≤ 3 room-nights, ≤ 4 people, ≤ 2 units, all within 30 days): never shortened for a surge. */
function isSmall(priced: PricedLine[], d: Demand): boolean {
  if (d.roomNights > 3 || d.seats > 4 || d.units > 2) return false;
  const horizon = addDays(today(), 30);
  return priced.every((pl) => {
    const date = pl.line.kind === 'room' ? pl.line.date_from : pl.line.kind === 'experience' ? pl.line.starts_at?.slice(0, 10) : null;
    return !date || date <= horizon;
  });
}

/** A long or far-ahead stay / experience (gets the short hold while unconfirmed). */
function isFarOrLong(priced: PricedLine[]): boolean {
  const inv = getSetting('inventory');
  const far = addDays(today(), inv.far_stay_days || 60);
  return priced.some((pl) => {
    if (pl.line.kind === 'room') return (pl.line.nights ?? 0) > (inv.far_stay_nights || 7) || (pl.line.date_from ?? '') > far;
    if (pl.line.kind === 'experience') return (pl.line.starts_at?.slice(0, 10) ?? '') > far;
    return false;
  });
}

export interface CheckoutInput {
  lang: Lang;
  items: QuoteItem[];
  promo?: string | null;
  customer: { name: string; email: string; phone?: string | null; country?: string | null };
  payment_method: PaymentMethod;
  notes?: string | null;
  marketing_consent?: boolean;
  source?: string | null;
  /**
   * api/checkout.ts: the client's address-group budgets, called inside the transaction with what
   * this order takes. Throws 429 when a daily budget would be passed; returns overShare = the
   * group is past its hourly share of unconfirmed holds (a long-hold order then gets the short hold).
   */
  client?: (d: Demand, longHold: boolean) => { overShare: boolean };
  /** Orders this person (e-mail or phone key) placed from this address group in the last 24 h. */
  personHere?: number;
  /** seed only */
  demo?: boolean;
  at?: string;
  skipPaymentCheck?: boolean;
}

const SOLD_OUT = (lang_sq = 'Dikush tjetër sapo rezervoi të fundit. Ndryshoni datat ose sasinë.', lang_en = 'Someone else just booked the last one. Change the dates or quantity.') =>
  E.conflict('sold_out', lang_sq, lang_en);

const PROMO_USED_UP = () =>
  E.conflict('promo_used', 'Kodi promocional ka arritur kufirin e përdorimeve.', 'The promo code has reached its usage limit.');

function logInv(e: { product_id?: number | null; session_id?: number | null; night?: string | null; delta: number; reason: string; order_id?: number | null; admin_id?: number | null; ts?: string }) {
  run(
    'INSERT INTO inventory_log (product_id, session_id, night, delta, reason, order_id, admin_id, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    e.product_id ?? null, e.session_id ?? null, e.night ?? null, e.delta, e.reason, e.order_id ?? null, e.admin_id ?? null, e.ts ?? nowIso(),
  );
}

/** Take inventory for one order item. Throws ApiError(409) when it is gone. */
function hold(it: { product_id: number | null; kind: string; qty: number; date_from: string | null; date_to: string | null; session_id: number | null; guests: number | null }, orderId: number, reason: string, ts: string): { stock?: number } {
  if (!it.product_id) return {};
  const p = getProduct(it.product_id);
  if (!p) return {};
  try {
    if (it.kind === 'room' && it.date_from && it.date_to) {
      for (const night of nightList(it.date_from, it.date_to)) {
        ensureNight(p.id, night);
        run('UPDATE room_nights SET booked = booked + ? WHERE product_id = ? AND night = ?', it.qty, p.id, night);
        logInv({ product_id: p.id, night, delta: -it.qty, reason, order_id: orderId, ts });
      }
      return {};
    }
    if (it.kind === 'experience' && it.session_id) {
      const people = it.guests ?? it.qty;
      const r = run("UPDATE sessions SET booked = booked + ? WHERE id = ? AND status = 'open' AND booked + ? <= capacity", people, it.session_id, people);
      if (!r.changes) throw SOLD_OUT();
      logInv({ product_id: p.id, session_id: it.session_id, delta: -people, reason, order_id: orderId, ts });
      return {};
    }
    if (p.stock !== null) {
      const r = run('UPDATE products SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL AND stock >= ?', it.qty, p.id, it.qty);
      if (!r.changes) throw SOLD_OUT('Ky artikull sapo mbaroi.', 'This item just sold out.');
      logInv({ product_id: p.id, delta: -it.qty, reason, order_id: orderId, ts });
      return { stock: it.qty };
    }
    return {};
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (isConstraintError(e)) throw SOLD_OUT();
    throw e;
  }
}

function release(it: OrderItem, orderId: number, reason: string, adminId: number | null): void {
  if (!it.product_id) return;
  const ts = nowIso();
  if (it.kind === 'room' && it.date_from && it.date_to) {
    for (const night of nightList(it.date_from, it.date_to)) {
      run('UPDATE room_nights SET booked = MAX(0, booked - ?) WHERE product_id = ? AND night = ?', it.qty, it.product_id, night);
      logInv({ product_id: it.product_id, night, delta: it.qty, reason, order_id: orderId, admin_id: adminId, ts });
    }
    return;
  }
  if (it.kind === 'experience' && it.session_id) {
    const people = it.guests ?? it.qty;
    run('UPDATE sessions SET booked = MAX(0, booked - ?) WHERE id = ?', people, it.session_id);
    logInv({ product_id: it.product_id, session_id: it.session_id, delta: people, reason, order_id: orderId, admin_id: adminId, ts });
    return;
  }
  const held = Number((it.meta as { held_stock?: number }).held_stock ?? 0);
  if (held > 0) {
    run('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL', held, it.product_id);
    logInv({ product_id: it.product_id, delta: held, reason, order_id: orderId, admin_id: adminId, ts });
  }
}

/** Count one use of a promo code; refuses (409) past max_uses. A deleted code counts nothing. */
function takePromoUse(code: string): void {
  const r = run('UPDATE offers SET used = used + 1 WHERE code = ? COLLATE NOCASE AND (max_uses IS NULL OR used < max_uses)', code);
  if (!r.changes && get('SELECT 1 FROM offers WHERE code = ? COLLATE NOCASE', code)) throw PROMO_USED_UP();
}

/** Hold the inventory of a cancelled order again (re-open / late payment). Throws 409 when gone. */
function reinstate(o: Order, ts: string): void {
  for (const it of orderItems(o.id)) {
    const h = hold(it, o.id, 'reinstate', ts);
    if (h.stock) run("UPDATE order_items SET meta = json_set(meta, '$.held_stock', ?) WHERE id = ?", h.stock, it.id);
  }
  if (o.promo_code) takePromoUse(o.promo_code);
}

/**
 * When an unpaid order releases its hold (UTC ISO), or null for no automatic release. `short`:
 * the order got the short hold (settings.inventory.short_hold_hours) — never longer than the
 * method's own hold.
 */
function holdUntil(method: PaymentMethod, at: string, short = false): string | null {
  const p = getSetting('payments');
  let ms = method === 'card' ? (p.card_hold_minutes || 30) * 60_000 : (method === 'bank' ? p.bank_hold_hours : p.hotel_hold_hours) * 3600_000;
  if (short) {
    const s = (getSetting('inventory').short_hold_hours || 2) * 3600_000;
    ms = ms > 0 ? Math.min(ms, s) : s;
  }
  return ms > 0 ? new Date(Date.parse(at) + ms).toISOString() : null;
}

/** 400 for a method the hotel does not offer; 503 for card when it cannot run here (no POK keys / test not allowed). */
function assertPaymentMethod(method: PaymentMethod): void {
  const configured = getSetting('payments').methods[method];
  const avail = paymentAvailability();
  if (configured && avail[method]) return;
  if (method === 'card' && configured) {
    throw E.unavailable('Pagesa me kartë nuk është e disponueshme tani. Zgjidhni një mënyrë tjetër pagese.', 'Card payment is not available right now. Please choose another payment method.');
  }
  throw E.bad('Kjo mënyrë pagese nuk ofrohet.', 'This payment method is not offered.');
}

export interface CreatedOrder { order: Order; quote: QuoteResult }

let surgeWarnedAt = 0;

/**
 * Create an order in ONE transaction. Throws ApiError on any problem; nothing is written then.
 *
 * Abuse rules for anonymous orders (see the header): nothing sitewide ever refuses everybody.
 *  - per person: max_open_orders_per_email waiting orders per e-mail / phone key. Refused (429)
 *    only when this address group placed them (personHere); a match from elsewhere — someone
 *    who typed a guest's phone or e-mail — only gives the new order the short hold and a review flag.
 *  - per address group: daily budgets (429) and hourly shares (short hold) — input.client.
 *  - long holds (hotel / bank / TEST card): share caps per room night, session and product (409
 *    hold_cap / hold_cap_units); the short hold for long or far-ahead stays, during a sitewide
 *    surge (unless small and near-term) and past the group's hourly share. orders.review lists why.
 */
export function createOrder(input: CheckoutInput): CreatedOrder {
  const lang: Lang = input.lang === 'en' ? 'en' : 'sq';
  if (!input.skipPaymentCheck) assertPaymentMethod(input.payment_method);
  if (!input.items.length) throw E.bad('Shporta është bosh.', 'Your cart is empty.');
  const email = input.customer.email.trim().toLowerCase();
  const eKey = emailKey(email);
  const pKey = phoneKey(input.customer.phone);
  const longHold = input.payment_method !== 'card' || cardMode() === 'test';

  return tx(() => {
    const inv = getSetting('inventory');
    const review: string[] = [];
    if (!input.demo) {
      const cap = inv.max_open_orders_per_email || 3;
      const open = Number(get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM orders o WHERE (o.email_key = ? OR (? IS NOT NULL AND o.phone_key = ?)) AND ${UNCONFIRMED}`, eKey, pKey, pKey,
      )?.n ?? 0);
      if (open >= cap) {
        if ((input.personHere ?? cap) >= cap) {
          throw new ApiError(429, 'too_many_open_orders',
            'Keni tashmë disa rezervime që presin konfirmim. Kontaktoni hotelin ose prisni konfirmimin e tyre.',
            'You already have several bookings waiting for confirmation. Please contact the hotel or wait until they are confirmed.');
        }
        review.push('person_open_orders');
      }
    }
    const q = quote({ lang, items: input.items, promo: input.promo });
    const bad = q.lines.filter((l) => l.problem);
    if (bad.length) {
      throw E.conflict('cart_problem', 'Disa artikuj në shportë kanë ndryshuar. Kontrolloni shportën.', 'Some items in your cart changed. Please review your cart.', { lines: bad.map((l) => ({ key: l.key, problem: l.problem })) });
    }
    if (input.promo && q.promo && !q.promo.valid) {
      throw E.conflict('promo_invalid', q.promo.message, q.promo.message, { promo: q.promo });
    }
    if (!input.demo) {
      const demand = demandOf(q.priced);
      const c = input.client?.(demand, longHold);
      if (longHold) {
        assertUnconfirmedShare(q.priced);
        assertSeatShare(q.priced);
        assertStockShare(q.priced);
        if (c?.overShare) review.push('address_share');
        if (isFarOrLong(q.priced)) review.push('far_or_long');
        if (!isSmall(q.priced, demand) && surgeNow()) {
          review.push('surge');
          if (Date.now() - surgeWarnedAt > 10 * 60_000) {
            surgeWarnedAt = Date.now();
            console.warn('[orders] surge of unconfirmed holds in the last hour: new non-small pay-at-hotel / bank orders get the short hold');
          }
        }
      }
    }
    const at = input.at ?? nowIso();
    const customerId = upsertCustomer({
      email, name: input.customer.name, phone: input.customer.phone, country: input.customer.country,
      lang, marketing_consent: !!input.marketing_consent, trusted: !!input.demo, demo: input.demo, at,
    });
    const code = newOrderCode();
    const token = newAccessToken();
    const provider = input.payment_method === 'card' ? cardMode() : null;
    const isTest = provider === 'test' ? 1 : 0;
    const shortHold = review.length > 0;
    const orderId = run(
      `INSERT INTO orders (code, access_token, customer_id, email, email_key, name, phone, phone_key, country, lang, status, payment_method, payment_status, payment_provider,
        subtotal, discount, total, promo_code, notes, source, demo, test, marketing_consent, hold_until, review, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'unpaid', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code, token, customerId, email, eKey, input.customer.name.trim(), input.customer.phone || null, pKey, input.customer.country || null,
      lang, input.payment_method, provider, q.subtotal, q.discount, q.total, q.promo?.valid ? q.promo.code : null, input.notes || null,
      input.source || null, input.demo ? 1 : 0, isTest, input.marketing_consent ? 1 : 0,
      input.demo ? null : holdUntil(input.payment_method, at, shortHold), review.length ? review.join(',') : null, at, at,
    ).id;

    for (const pl of q.priced) writeItem(pl, orderId, at);

    if (q.promoOffer?.code) takePromoUse(q.promoOffer.code);

    // No sid: an order (a named guest) is never linked to a browsing trail. The funnel's order
    // and paid steps are counted from the orders table (stats.ts).
    run(
      'INSERT INTO events (ts, day, type, path, lang, value, utm_source, device, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      at, dayOf(at), 'order', null, lang, isTest ? 0 : q.total, input.source || null, null, toJson({ method: input.payment_method, ...(isTest ? { test: true } : {}) }),
    );
    return { order: getOrder(orderId)!, quote: q };
  });
}

function writeItem(pl: PricedLine, orderId: number, ts: string) {
  const l = pl.line;
  const meta: Record<string, unknown> = { slug: l.slug };
  if (l.nights) meta.nights = l.nights;
  if (l.starts_at) meta.starts_at = l.starts_at;
  if (l.offer) meta.offer = l.offer;
  if (pl.promoShare) meta.promo_share = pl.promoShare;
  if (pl.amount) meta.amount = pl.amount;
  if (pl.nightInfo) meta.night_prices = pl.nightInfo.map((n) => n.price);
  const row = {
    product_id: pl.product?.id ?? null, kind: l.kind, qty: l.qty,
    date_from: l.kind === 'room' ? l.date_from ?? null : l.kind === 'experience' ? l.starts_at?.slice(0, 10) ?? null : null,
    date_to: l.kind === 'room' ? l.date_to ?? null : null,
    session_id: l.session_id ?? null, guests: l.guests ?? null,
  };
  const held = hold(row, orderId, 'order', ts);
  if (held.stock) meta.held_stock = held.stock;
  run(
    `INSERT INTO order_items (order_id, product_id, kind, name, unit_price, qty, line_total, date_from, date_to, session_id, guests, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    orderId, row.product_id, l.kind, l.name, l.unit_price, l.qty, l.line_total, row.date_from, row.date_to, row.session_id, row.guests, toJson(meta),
  );
}

let sweptAt = 0;

/**
 * Release unpaid, unconfirmed orders whose hold expired (orders.hold_until; migration 003 gave
 * the pre-002 card orders theirs). Staff holds (staff_hold = 1, hold_until NULL) are never
 * touched. Throttled to once a minute unless forced.
 */
export function sweepExpired(force = false): number {
  if (!force && Date.now() - sweptAt < 60_000) return 0;
  sweptAt = Date.now();
  const now = nowIso();
  // Unpaid, unconfirmed orders — and TEST-paid ones (the simulator proves nothing).
  const stale = all<{ id: number; payment_method: PaymentMethod; payment_status: string }>(
    `SELECT id, payment_method, payment_status FROM orders o WHERE ${UNCONFIRMED} AND o.hold_until IS NOT NULL AND o.hold_until < ?`,
    now,
  );
  for (const o of stale) {
    cancelOrder(o.id, { reason: 'sweep', paymentStatus: o.payment_method === 'card' && o.payment_status !== 'paid' ? 'failed' : undefined });
  }
  return stale.length;
}

/** Background sweep every 5 minutes (one timer per process; replaced on dev reloads). */
export function startSweeper(): void {
  const G = globalThis as unknown as { __dvSweeper?: ReturnType<typeof setInterval> };
  if (G.__dvSweeper) clearInterval(G.__dvSweeper);
  G.__dvSweeper = setInterval(() => {
    try { sweepExpired(true); } catch (e) { console.error('[sweep]', e); }
  }, 5 * 60_000);
  G.__dvSweeper.unref?.();
}

/** Cancel and release everything the order holds. Idempotent. */
export function cancelOrder(orderId: number, opts: { reason?: string; adminId?: number | null; paymentStatus?: Order['payment_status'] } = {}): Order | undefined {
  return tx(() => {
    const o = getOrder(orderId);
    if (!o) return undefined;
    if (o.status === 'cancelled') return o;
    for (const it of orderItems(orderId)) release(it, orderId, opts.reason ?? 'cancel', opts.adminId ?? null);
    if (o.promo_code) run('UPDATE offers SET used = MAX(0, used - 1) WHERE code = ? COLLATE NOCASE', o.promo_code);
    const now = nowIso();
    run(
      "UPDATE orders SET status = 'cancelled', cancelled_at = ?, updated_at = ?, payment_status = COALESCE(?, payment_status) WHERE id = ?",
      now, now, opts.paymentStatus ?? null, orderId,
    );
    return getOrder(orderId);
  });
}

/**
 * Mark an order paid. ONLY server-side code calls this (test simulator POST, POK re-read,
 * admin PATCH). If the order was swept meanwhile, try to take the inventory (and the promo use)
 * back; if that fails the order stays cancelled with payment_status 'paid' so staff can refund.
 * TEST orders (orders.test = 1) are marked paid but never counted as money ('paid' event skipped).
 */
export function markPaid(orderId: number, ref: string | null, opts: { adminId?: number | null } = {}): Order | undefined {
  return tx(() => {
    const o = getOrder(orderId);
    if (!o) return undefined;
    if (o.payment_status === 'paid') return o;
    const now = nowIso();
    // A TEST payment proves nothing: the order keeps a hold (hotel_hold_hours, or the short hold
    // it was given) and the sweep releases it like an unpaid one.
    const keep = o.test ? testPaidHold(o, now) : null;
    if (o.status === 'cancelled') {
      try {
        tx(() => reinstate(o, now));
        run("UPDATE orders SET status = 'confirmed', cancelled_at = NULL, hold_until = ? WHERE id = ?", keep, orderId);
      } catch {
        run("UPDATE orders SET notes = TRIM(COALESCE(notes, '') || ' [Paguar pas anulimit: rimbursoni ose rivendosni manualisht]') WHERE id = ?", orderId);
      }
    } else if (o.status === 'pending') {
      run("UPDATE orders SET status = 'confirmed', hold_until = ? WHERE id = ?", keep, orderId);
    }
    run("UPDATE orders SET payment_status = 'paid', paid_at = ?, payment_ref = COALESCE(?, payment_ref), updated_at = ? WHERE id = ?", now, ref, now, orderId);
    // A real payment (card captured, or staff recording money received) is the proof that the
    // guest stands behind this checkout, so the marketing box ticked on it now counts.
    // TEST payments prove nothing.
    if (!o.test) confirmOrderConsent(o, now);
    if (!o.test) {
      run(
        'INSERT INTO events (ts, day, type, lang, value, utm_source, meta) VALUES (?, ?, ?, ?, ?, ?, ?)',
        now, dayOf(now), 'paid', o.lang, o.total, o.source, toJson({ method: o.payment_method, admin: opts.adminId ?? null }),
      );
    }
    return getOrder(orderId);
  });
}

function testPaidHold(o: Order, now: string): string {
  const hours = o.review ? getSetting('inventory').short_hold_hours || 2 : getSetting('payments').hotel_hold_hours || 24;
  return new Date(Date.parse(now) + hours * 3600_000).toISOString();
}

export function markPaymentFailed(orderId: number): Order | undefined {
  run("UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ? AND payment_status = 'unpaid'", nowIso(), orderId);
  return getOrder(orderId);
}

/**
 * Admin status/payment changes. Cancelling releases inventory; re-opening a cancelled order
 * holds it again and counts its promo code again (409 when either is gone). Any status set by
 * staff ends the automatic hold: the order becomes a staff hold (never swept, not counted as
 * unconfirmed). Confirming does NOT copy the marketing consent — staff confirm bookings without
 * proving who owns the e-mail; `confirm_consent: true` does that explicitly (after staff checked
 * with the guest), and a payment does it automatically (markPaid).
 */
export function adminUpdateOrder(orderId: number, patch: { status?: Order['status']; payment_status?: Order['payment_status']; notes?: string | null; payment_ref?: string | null; confirm_consent?: boolean }, adminId: number): Order | undefined {
  const o = getOrder(orderId);
  if (!o) return undefined;
  if (patch.status === 'cancelled' && o.status !== 'cancelled') cancelOrder(orderId, { reason: 'cancel', adminId });
  else if (patch.status && patch.status !== 'cancelled') {
    const now = nowIso();
    tx(() => {
      if (o.status === 'cancelled') reinstate(o, now);
      // Staff now manage this order by hand: no automatic release any more.
      run('UPDATE orders SET status = ?, cancelled_at = NULL, hold_until = NULL, staff_hold = 1, updated_at = ? WHERE id = ?', patch.status!, now, orderId);
    });
  }
  if (patch.confirm_consent) confirmOrderConsent(o, nowIso());
  if (patch.payment_status === 'paid' && o.payment_status !== 'paid') markPaid(orderId, patch.payment_ref ?? null, { adminId });
  else if (patch.payment_status && patch.payment_status !== o.payment_status) {
    run('UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?', patch.payment_status, nowIso(), orderId);
  }
  if (patch.notes !== undefined) run('UPDATE orders SET notes = ?, updated_at = ? WHERE id = ?', patch.notes, nowIso(), orderId);
  if (patch.payment_ref !== undefined && patch.payment_status !== 'paid') run('UPDATE orders SET payment_ref = ? WHERE id = ?', patch.payment_ref, orderId);
  return getOrder(orderId);
}

export interface OrderViewLine {
  name: string; kind: Kind | string; slug: string | null; url: string | null; image: string | null;
  unit_price: number; qty: number; line_total: number; nights?: number; guests?: number | null;
  date_from?: string | null; date_to?: string | null; starts_at?: string | null; offer?: unknown;
}

export interface OrderView {
  code: string; status: Order['status']; payment_method: PaymentMethod; payment_status: Order['payment_status']; payment_provider: string | null;
  name: string; email: string; phone: string | null; lang: string; created_at: string; paid_at: string | null; cancelled_at: string | null;
  /** Unpaid/unconfirmed orders are released automatically at this instant (UTC ISO); null = no automatic release. */
  hold_until: string | null;
  subtotal: number; discount: number; total: number; promo_code: string | null; currency: 'ALL'; eur_rate: number;
  lines: OrderViewLine[];
  payment: { method: PaymentMethod; instructions?: { iban: string; bank_name: string; beneficiary: string; swift: string; reference: string; amount: number }; pay_url?: string; test?: boolean };
}

/** Public view of an order (only after the access token was checked). */
export function orderView(o: Order, lang: Lang): OrderView {
  const pay = getSetting('payments');
  const items = orderItems(o.id).map((it): OrderViewLine => {
    const p = it.product_id ? getProduct(it.product_id) : undefined;
    const m = it.meta as { nights?: number; starts_at?: string; offer?: unknown; slug?: string };
    return {
      name: p ? pname(p, lang) : it.name, kind: it.kind, slug: p?.slug ?? m.slug ?? null,
      url: p ? productUrl(p.kind, p.slug, lang) : null, image: p ? primaryImage(p) : null,
      unit_price: it.unit_price, qty: it.qty, line_total: it.line_total, nights: m.nights, guests: it.guests,
      date_from: it.date_from, date_to: it.date_to, starts_at: m.starts_at ?? null, offer: m.offer,
    };
  });
  const payment: OrderView['payment'] = { method: o.payment_method };
  if (o.test) payment.test = true;
  if (o.payment_method === 'bank') {
    payment.instructions = { iban: pay.iban, bank_name: pay.bank_name, beneficiary: pay.beneficiary, swift: pay.swift, reference: o.code, amount: o.total };
  }
  if (o.payment_method === 'card' && o.payment_status !== 'paid' && o.status === 'pending') {
    if (o.payment_provider === 'test' && cardMode() === 'test') payment.pay_url = `/api/pay/test/${o.code}?t=${encodeURIComponent(o.access_token)}`;
  }
  return {
    code: o.code, status: o.status, payment_method: o.payment_method, payment_status: o.payment_status, payment_provider: o.payment_provider,
    name: o.name, email: o.email, phone: o.phone, lang: o.lang, created_at: o.created_at, paid_at: o.paid_at, cancelled_at: o.cancelled_at,
    hold_until: o.status === 'pending' && o.payment_status !== 'paid' ? o.hold_until : null,
    subtotal: o.subtotal, discount: o.discount, total: o.total, promo_code: o.promo_code, currency: 'ALL', eur_rate: getSetting('currency').eur_rate,
    lines: items, payment,
  };
}

export { orderByCode, getOrder };
