/**
 * THE single price authority (PLAN §6). Every displayed total and every order total comes
 * from quote(). Nothing else in the code base multiplies prices.
 *
 * Line rules
 *   room        qty = rooms; from/to = arrival/departure ('YYYY-MM-DD', to exclusive);
 *               guests = people in total (<= capacity × qty). Price = Σ nightly price × qty,
 *               nightly price = newest room_rates row covering the night, else products.price.
 *   experience  session_id required; people = guests ?? qty (the line echoes qty = guests = people).
 *               Price = products.price × people.
 *   goods, bundle  products.price × qty; stock checked when tracked.
 *   gift        amount (custom value, within options.amount_min..amount_max, multiple of
 *               options.amount_step) or products.price, × qty.
 * Totals
 *   subtotal = Σ line_total of lines WITHOUT a problem (line_total is after automatic offers)
 *   discount = promo code discount; total = subtotal − discount.
 *   Lines with a `problem` stay in the response (so the UI can explain) but count for nothing,
 *   and checkout refuses a cart that still has one.
 */
import { z } from 'zod';
import { getProductBySlug, pname, primaryImage, type Kind, type Product } from './db/repo/products';
import { automaticOffers, offerByCode, type Offer } from './db/repo/offers';
import { getSetting } from './db/repo/settings';
import { roomNights, sessionBookable, seatsLeft, type NightInfo } from './availability';
import { getSession, type Session } from './db/repo/sessions';
import { autoOfferApplies, inScope, inWindow, offerName, saving } from './offers';
import { productUrl, type Lang } from './urls';
import { addDays, daysBetween, isDate, today } from './time';
import { number } from '../i18n/format';

export const MAX_NIGHTS = 30;

/**
 * A whole number: a JSON integer or a string of digits ("3"). Nothing else is coerced —
 * true, [5], "1e1", " 2", 2.5 are refused (z.coerce would turn them into 1, 5, 10, 2).
 */
export const zInt = (min: number, max: number) =>
  z.union([z.number().int(), z.string().regex(/^\d{1,9}$/).transform(Number)]).pipe(z.number().int().min(min).max(max));

export const zQuoteItem = z.object({
  key: z.string().max(120).default(''),
  slug: z.string().min(1).max(120),
  kind: z.enum(['room', 'experience', 'bundle', 'gift', 'goods']),
  qty: zInt(1, 99).default(1),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  session_id: zInt(1, 2_000_000_000).optional(),
  guests: zInt(1, 99).optional(),
  amount: zInt(0, 10_000_000).optional(),
});
export type QuoteItem = z.infer<typeof zQuoteItem>;

export const zQuoteBody = z.object({
  lang: z.enum(['sq', 'en']).default('sq'),
  items: z.array(zQuoteItem).max(40),
  promo: z.string().trim().max(40).optional().nullable(),
});

export interface Problem { code: string; message: string }

export interface QuoteLine {
  key: string; slug: string; kind: Kind; name: string; image: string | null; url: string;
  unit_price: number; qty: number; nights?: number; guests?: number;
  date_from?: string; date_to?: string; starts_at?: string; session_id?: number;
  line_total: number; compare_total?: number; offer?: { name: string; saving: number };
  problem?: Problem;
}

export interface Quote {
  lines: QuoteLine[]; subtotal: number; discount: number;
  promo?: { code: string; valid: boolean; message: string };
  total: number; currency: 'ALL'; eur_rate: number;
}

/** What orders.ts needs to hold inventory and write order_items. */
export interface PricedLine {
  line: QuoteLine;
  product: Product | null;
  base: number;
  nightInfo?: NightInfo[];
  session?: Session;
  seats?: number;
  amount?: number;
  offerId?: number;
  promoShare: number;
}

export interface QuoteResult extends Quote { priced: PricedLine[]; promoOffer?: Offer }

const M = {
  unavailable: { sq: 'Ky produkt nuk është më në shitje.', en: 'This item is no longer for sale.' },
  dates: { sq: 'Zgjidhni datat e mbërritjes dhe largimit.', en: 'Choose arrival and departure dates.' },
  past: { sq: 'Data e mbërritjes ka kaluar.', en: 'The arrival date has passed.' },
  too_far: { sq: 'Rezervimet online pranohen deri në {n} ditë përpara. Për data më të largëta kontaktoni hotelin.', en: 'Online bookings open up to {n} days ahead. For later dates, please contact the hotel.' },
  group: { sq: 'Për më shumë se {n} netë-dhoma në një porosi, kontaktoni hotelin.', en: 'For more than {n} room-nights in one order, please contact the hotel.' },
  group_people: { sq: 'Online rezervohen deri në {n} persona për një orar. Për grupe më të mëdha, kontaktoni hotelin.', en: 'Online bookings take up to {n} people per time slot. For bigger groups, please contact the hotel.' },
  group_lines: { sq: 'Një porosi mund të ketë deri në {n} orare eksperiencash. Për më shumë, kontaktoni hotelin.', en: 'One order can hold up to {n} experience time slots. For more, please contact the hotel.' },
  group_total: { sq: 'Një porosi mund të ketë deri në {n} persona gjithsej në eksperienca. Për më shumë, kontaktoni hotelin.', en: 'One order can hold up to {n} people in experiences in total. For more, please contact the hotel.' },
  too_long: { sq: `Rezervimi online lejon deri në ${MAX_NIGHTS} netë.`, en: `Online bookings allow up to ${MAX_NIGHTS} nights.` },
  min_nights: { sq: 'Kjo dhomë kërkon të paktën {n} netë.', en: 'This room needs at least {n} nights.' },
  guests: { sq: 'Shumë persona për numrin e dhomave.', en: 'Too many guests for the number of rooms.' },
  rooms: { sq: 'Nuk ka aq dhoma të këtij lloji.', en: 'There are not that many rooms of this type.' },
  sold_out: { sq: 'Nuk ka vende të lira për këto data.', en: 'Nothing free for these dates.' },
  closed: { sq: 'Mbyllur për këto data.', en: 'Closed on these dates.' },
  session: { sq: 'Zgjidhni një datë dhe orë.', en: 'Choose a date and time.' },
  session_gone: { sq: 'Ky orar nuk është më i disponueshëm.', en: 'This time slot is no longer available.' },
  seats: { sq: 'Kanë mbetur vetëm {n} vende.', en: 'Only {n} places left.' },
  stock: { sq: 'Kanë mbetur vetëm {n} copë.', en: 'Only {n} left in stock.' },
  out_of_stock: { sq: 'Ka mbaruar.', en: 'Out of stock.' },
  amount: { sq: 'Vlera e kartës duhet të jetë nga {min} deri në {max} lekë, me hapa prej {step} lekësh.', en: 'Card value must be between {min} and {max} lek, in steps of {step} lek.' },
  // One message for every failed code: telling "does not exist" apart from "inactive / used up /
  // not for this cart" would let a guesser find real codes.
  promo_invalid: { sq: 'Ky kod nuk vlen për këtë porosi.', en: 'This code is not valid for this order.' },
  promo_ok: { sq: 'Kodi u aplikua.', en: 'Code applied.' },
} as const;

type MKey = keyof typeof M;
function msg(k: MKey, lang: Lang, vars: Record<string, string | number> = {}): string {
  return M[k][lang].replace(/\{(\w+)\}/g, (_, n: string) => String(vars[n] ?? ''));
}
const problem = (code: MKey, lang: Lang, vars?: Record<string, string | number>): Problem => ({ code, message: msg(code, lang, vars) });

function priceLine(item: QuoteItem, lang: Lang): PricedLine {
  const p = getProductBySlug(item.slug);
  const key = item.key || `${item.slug}:${item.from ?? ''}:${item.to ?? ''}:${item.session_id ?? ''}:${item.amount ?? ''}`;
  if (!p || p.status !== 'published') {
    return {
      line: { key, slug: item.slug, kind: item.kind, name: p ? pname(p, lang) : item.slug, image: p ? primaryImage(p) : null, url: p ? productUrl(p.kind, p.slug, lang) : '', unit_price: 0, qty: item.qty, line_total: 0, problem: problem('unavailable', lang) },
      product: p ?? null, base: 0, promoShare: 0,
    };
  }
  const line: QuoteLine = { key, slug: p.slug, kind: p.kind, name: pname(p, lang), image: primaryImage(p), url: productUrl(p.kind, p.slug, lang), unit_price: p.price, qty: item.qty, line_total: 0 };
  const out: PricedLine = { line, product: p, base: 0, promoShare: 0 };

  if (p.kind === 'room') {
    const units = p.units ?? 0;
    line.guests = item.guests ?? item.qty;
    if (!isDate(item.from) || !isDate(item.to) || item.to <= item.from) { line.problem = problem('dates', lang); return out; }
    line.date_from = item.from; line.date_to = item.to;
    const n = daysBetween(item.from, item.to);
    line.nights = n;
    if (item.from < today()) { line.problem = problem('past', lang); return out; }
    if (n > MAX_NIGHTS) { line.problem = problem('too_long', lang); return out; }
    const horizon = getSetting('inventory').booking_horizon_days || 548;
    if (item.from > addDays(today(), horizon)) { line.problem = problem('too_far', lang, { n: horizon }); return out; }
    const info = roomNights(p, item.from, item.to);
    out.nightInfo = info;
    const sumNights = info.reduce((s, x) => s + x.price, 0);
    line.unit_price = Math.round(sumNights / n);
    out.base = sumNights * item.qty;
    line.line_total = out.base;
    if (p.compare_at && p.compare_at > p.price) line.compare_total = p.compare_at * n * item.qty;
    const minN = Number(p.options.min_nights ?? 0);
    if (minN > 1 && n < minN) { line.problem = problem('min_nights', lang, { n: minN }); return out; }
    if (item.qty > units) { line.problem = problem('rooms', lang); return out; }
    if (p.capacity && line.guests > p.capacity * item.qty) { line.problem = problem('guests', lang); return out; }
    if (info.some((x) => x.closed)) { line.problem = problem('closed', lang); return out; }
    const left = Math.min(...info.map((x) => x.left));
    if (left < item.qty) { line.problem = problem('sold_out', lang); return out; }
    return out;
  }

  if (p.kind === 'experience') {
    const people = item.guests ?? item.qty;
    line.qty = people; line.guests = people;
    out.seats = people;
    out.base = p.price * people;
    line.line_total = out.base;
    if (p.compare_at && p.compare_at > p.price) line.compare_total = p.compare_at * people;
    if (!item.session_id) { line.problem = problem('session', lang); return out; }
    const s = getSession(item.session_id);
    if (!s || s.product_id !== p.id) { line.problem = problem('session_gone', lang); return out; }
    out.session = s;
    line.session_id = s.id; line.starts_at = s.starts_at; line.date_from = s.starts_at.slice(0, 10);
    if (!sessionBookable(s)) { line.problem = problem('session_gone', lang); return out; }
    const maxLine = getSetting('inventory').max_people_per_session_line || 10;
    if (people > maxLine) { line.problem = problem('group_people', lang, { n: maxLine }); return out; }
    const left = seatsLeft(s);
    if (left < people) { line.problem = problem('seats', lang, { n: left }); return out; }
    return out;
  }

  // goods, bundle, gift
  let unit = p.price;
  if (p.kind === 'gift' && item.amount !== undefined) {
    const min = Number(p.options.amount_min ?? 1000);
    const max = Number(p.options.amount_max ?? 200000);
    const step = Math.max(1, Number(p.options.amount_step ?? 100));
    if (item.amount < min || item.amount > max || item.amount % step !== 0) {
      line.unit_price = item.amount; line.line_total = 0;
      line.problem = problem('amount', lang, { min: number(min, lang), max: number(max, lang), step: number(step, lang) });
      return out;
    }
    unit = item.amount;
    out.amount = item.amount;
  }
  line.unit_price = unit;
  out.base = unit * item.qty;
  line.line_total = out.base;
  if (p.compare_at && p.compare_at > unit) line.compare_total = p.compare_at * item.qty;
  if (p.stock !== null) {
    if (p.stock <= 0) { line.problem = problem('out_of_stock', lang); return out; }
    if (p.stock < item.qty) { line.problem = problem('stock', lang, { n: p.stock }); return out; }
  }
  return out;
}

function serviceDate(pl: PricedLine): string {
  return pl.line.kind === 'room' ? pl.line.date_from ?? today() : pl.line.kind === 'experience' ? pl.line.starts_at?.slice(0, 10) ?? today() : today();
}

/**
 * Lines are checked one by one in priceLine(); this pass adds up what the WHOLE cart asks for —
 * rooms per night, seats per session, units of stock, rooms × nights per order, people per
 * session (max_people_per_session_line), experience time slots (max_session_lines_per_order) and
 * people in experiences (max_people_per_order) — and flags the line that tips it over, so the
 * quote never promises what checkout would then refuse. Bigger groups contact the hotel.
 */
function checkCartDemand(priced: PricedLine[], lang: Lang): void {
  const roomNightsUsed = new Map<string, number>(); // `${productId}|${night}` → rooms
  const seatsUsed = new Map<number, number>(); // session id → people
  const stockUsed = new Map<number, number>(); // product id → units
  const inv = getSetting('inventory');
  const cap = inv.max_room_nights_per_order || 40;
  const maxSessions = inv.max_session_lines_per_order || 5;
  const maxPeople = inv.max_people_per_order || 30;
  let roomNightsTotal = 0;
  let peopleTotal = 0;
  for (const pl of priced) {
    const l = pl.line;
    const p = pl.product;
    if (l.problem || !p) continue;
    if (p.kind === 'room' && pl.nightInfo) {
      const want = l.qty;
      if (roomNightsTotal + want * pl.nightInfo.length > cap) { l.problem = problem('group', lang, { n: cap }); continue; }
      const short = pl.nightInfo.some((n) => n.left - (roomNightsUsed.get(`${p.id}|${n.night}`) ?? 0) < want);
      if (short) { l.problem = problem('sold_out', lang); continue; }
      for (const n of pl.nightInfo) roomNightsUsed.set(`${p.id}|${n.night}`, (roomNightsUsed.get(`${p.id}|${n.night}`) ?? 0) + want);
      roomNightsTotal += want * pl.nightInfo.length;
    } else if (p.kind === 'experience' && pl.session) {
      const used = seatsUsed.get(pl.session.id) ?? 0;
      const want = pl.seats ?? 0;
      if (!seatsUsed.has(pl.session.id) && seatsUsed.size >= maxSessions) { l.problem = problem('group_lines', lang, { n: maxSessions }); continue; }
      if (peopleTotal + want > maxPeople) { l.problem = problem('group_total', lang, { n: maxPeople }); continue; }
      const maxLine = inv.max_people_per_session_line || 10;
      if (used + want > maxLine) { l.problem = problem('group_people', lang, { n: maxLine }); continue; }
      const left = seatsLeft(pl.session) - used;
      if (left < want) { l.problem = problem('seats', lang, { n: Math.max(0, left) }); continue; }
      seatsUsed.set(pl.session.id, used + want);
      peopleTotal += want;
    } else if (p.stock !== null && p.kind !== 'room' && p.kind !== 'experience') {
      const used = stockUsed.get(p.id) ?? 0;
      const left = p.stock - used;
      if (left < l.qty) { l.problem = left <= 0 ? problem('out_of_stock', lang) : problem('stock', lang, { n: left }); continue; }
      stockUsed.set(p.id, used + l.qty);
    }
  }
}

/** Price a cart. Safe to call inside a transaction (synchronous, reads only). */
export function quote(input: { lang?: Lang; items: QuoteItem[]; promo?: string | null }): QuoteResult {
  const lang: Lang = input.lang === 'en' ? 'en' : 'sq';
  const priced = input.items.map((it) => priceLine(it, lang));
  checkCartDemand(priced, lang);
  const ok = priced.filter((x) => !x.line.problem && x.product);

  // Automatic offers: best single saving per line.
  const autos = automaticOffers();
  for (const pl of ok) {
    let best: { o: Offer; s: number } | null = null;
    for (const o of autos) {
      const scopedBase = ok.filter((x) => inScope(o, x.product!)).reduce((s, x) => s + x.base, 0);
      if (!autoOfferApplies(o, { product: pl.product!, nights: pl.line.nights, serviceDate: serviceDate(pl) }, scopedBase)) continue;
      const s = saving(o, pl.base);
      if (s > 0 && (!best || s > best.s)) best = { o, s };
    }
    if (best) {
      pl.line.line_total = pl.base - best.s;
      pl.line.compare_total = Math.max(pl.line.compare_total ?? 0, pl.base);
      pl.line.offer = { name: offerName(best.o, lang), saving: best.s };
      pl.offerId = best.o.id;
    }
  }

  const subtotal = ok.reduce((s, x) => s + x.line.line_total, 0);
  let discount = 0;
  let promo: Quote['promo'];
  let promoOffer: Offer | undefined;

  const code = input.promo?.trim();
  if (code) {
    const o = offerByCode(code);
    const fail = () => { promo = { code: code.toUpperCase(), valid: false, message: msg('promo_invalid', lang) }; };
    if (!o || !o.active || !inWindow(o, today()) || (o.max_uses !== null && o.used >= o.max_uses)) fail();
    else {
      const scoped = ok.filter((x) => inScope(o, x.product!));
      const scopedTotal = scoped.reduce((s, x) => s + x.line.line_total, 0);
      if (!scoped.length) fail();
      else if (o.min_total && scopedTotal < o.min_total) fail();
      else if (o.min_nights && !scoped.some((x) => x.line.kind === 'room' && (x.line.nights ?? 0) >= o.min_nights!)) fail();
      else {
        discount = saving(o, scopedTotal);
        promoOffer = o;
        promo = { code: o.code!, valid: true, message: msg('promo_ok', lang) };
        // Spread the discount over the scoped lines (for order_items.meta), remainder on the last.
        let left = discount;
        scoped.forEach((x, i) => {
          const share = i === scoped.length - 1 ? left : Math.floor((discount * x.line.line_total) / Math.max(1, scopedTotal));
          x.promoShare = share;
          left -= share;
        });
      }
    }
  }

  const eur = getSetting('currency').eur_rate || 100;
  return {
    lines: priced.map((x) => x.line),
    subtotal,
    discount,
    ...(promo ? { promo } : {}),
    total: Math.max(0, subtotal - discount),
    currency: 'ALL',
    eur_rate: eur,
    priced,
    promoOffer,
  };
}

/** Public shape (drops internal fields). */
export function publicQuote(q: QuoteResult): Quote {
  const { priced: _p, promoOffer: _o, ...rest } = q;
  return rest;
}

/** "From" price of a product for cards and feeds (cheapest upcoming nightly rate is not needed: base price). */
export function fromPrice(p: Pick<Product, 'price'>): number {
  return p.price;
}
