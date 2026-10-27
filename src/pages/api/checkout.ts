import type { APIRoute } from 'astro';
import { z } from 'zod';
import { E, handle, json, readJson, zEmail, zLine } from '../../lib/http';
import { zQuoteItem } from '../../lib/pricing';
import { createOrder, orderView, orderForCheckout, sweepExpired, cancelOrder, demandOf, emailKey, phoneKey, type Demand } from '../../lib/orders';
import type { Order } from '../../lib/db/repo/orders';
import { orderPageUrl, startPayment } from '../../lib/payments/index';
import { addrGroup, assertSameOrigin, clientIp, rateCheck, rateCount, rateFactor, rateLimit } from '../../lib/security';
import { cleanSource } from '../../lib/analytics';
import { siteOrigin } from '../../lib/urls';
import { getSetting } from '../../lib/db/repo/settings';
import { promoGate, promoResult } from '../../lib/promo-limit';

const Body = z.object({
  lang: z.enum(['sq', 'en']).default('sq'),
  items: z.array(zQuoteItem).min(1).max(40),
  promo: z.string().trim().max(40).optional().nullable(),
  customer: z.object({
    name: zLine(120).pipe(z.string().min(2)),
    email: zEmail,
    phone: zLine(40).optional().nullable(),
    country: zLine(60).optional().nullable(),
  }),
  payment_method: z.enum(['hotel', 'bank', 'card']),
  notes: z.string().trim().max(2000).optional().nullable(),
  marketing_consent: z.boolean().optional().default(false),
  terms_accepted: z.literal(true),
  // Accepted for compatibility with the client; no longer stored with the order (privacy).
  sid: z.string().max(64).regex(/^[A-Za-z0-9_-]*$/).optional().nullable(),
  utm: z.object({ source: z.string().max(80).optional(), medium: z.string().max(80).optional(), campaign: z.string().max(120).optional() }).partial().optional().nullable(),
  ref: z.string().max(500).optional().nullable(),
  website: z.string().max(200).optional().nullable(), // honeypot: must stay empty
  // One id per checkout draft (the same on every retry): a repeat is answered with the order already made.
  checkout_id: z.string().regex(/^[A-Za-z0-9]{16,64}$/).optional().nullable().catch(null),
  // The draft's previous id after the guest edited it: its order, if a lost 201 made one, is cancelled (orders.ts cancelReplaced).
  replaces: z.string().regex(/^[A-Za-z0-9]{16,64}$/).optional().nullable().catch(null),
}).superRefine((b, ctx) => {
  // Pay at the hotel / by bank transfer: the hotel confirms these by phone.
  if (b.payment_method !== 'card' && !phoneKey(b.customer.phone)) {
    ctx.addIssue({ code: 'custom', path: ['customer', 'phone'], message: 'phone_required' });
  }
});

const DAY = 24 * 3600_000;
const HOUR = 3600_000;

/**
 * POST /api/checkout → 201 { code, token, next, order }
 * next: { type:'order', url } (hotel/bank) | { type:'redirect', url, test:true } (card TEST) | { type:'pok', pok_order_id, url }
 * customer.phone (≥ 7 digits) is required for 'hotel' and 'bank' (400 otherwise).
 * checkout_id (16–64 letters/digits, one per draft): a POST that repeats the id with the same e-mail
 * within 24 h, while that order is not cancelled, gets 201 with THAT order (header
 * X-DV-Replay: 1) — a 201 lost on a weak connection never creates and holds a second order.
 * replaces (same format): the draft's previous checkout_id after the guest edited the cart. The
 * order it made (lost 201) is cancelled when the new order is created — only when it has the same
 * e-mail key and is still pending, unpaid, not held or confirmed by staff and inside its hold;
 * otherwise `replaces` is ignored without a word.
 * Errors: 409 cart_problem {lines:[{key, problem}]}, 409 sold_out, 409 promo_invalid, 409 hold_cap
 * {lines:[{key, problem:{code:'hold_cap'}}]} (unconfirmed orders already hold half of these
 * nights / this session / this item — paying by card still works), 409 hold_cap_units {max, lines},
 * 400 bank_late {lines} (bank transfer for a stay or session that starts within bank_hold_hours),
 * 400 validation / method not offered, 503 card unavailable, 429 rate_limited / too_many_open_orders.
 * Limits per address (IPv6 per /64): 8 checkouts per 10 minutes, 30 per day. Per address GROUP
 * (IPv4 /24, IPv6 /48): settings.inventory.max_{room_nights,seats,units}_per_address_day (429),
 * and address_{room_nights,seats,units}_per_hour of unconfirmed pay-at-hotel / bank holds —
 * past that the order is accepted with the short hold (orders.ts).
 */
export const POST: APIRoute = handle(async (ctx) => {
  assertSameOrigin(ctx.request, ctx.url);
  const ip = clientIp(ctx);
  const group = addrGroup(ip);
  rateLimit('checkout', ip, 8, 10 * 60_000);
  rateLimit('checkout-day', ip, 30, DAY);
  const b = await readJson(ctx.request, Body, 32 * 1024);
  if (b.website) throw E.bad();
  try { sweepExpired(); } catch (e) { console.error('[sweep]', e); }

  // A resend of a draft that already became an order (synchronous from here to createOrder, so
  // two parallel resends cannot both miss it).
  const earlier = orderForCheckout(b.checkout_id, b.customer.email);
  if (earlier) return answer(earlier, ctx, b.lang, true);

  const promo = promoGate(ip, b.promo);
  const source = cleanSource(b.utm?.source, b.ref, ctx.url.host);
  const inv = getSetting('inventory');
  const daily: [keyof Demand, string, number][] = [
    ['roomNights', 'rn-day', inv.max_room_nights_per_address_day || 60],
    ['seats', 'seats-day', inv.max_seats_per_address_day || 40],
    ['units', 'units-day', inv.max_units_per_address_day || 20],
  ];
  const hourly: [keyof Demand, string, number][] = [
    ['roomNights', 'rn-hour', inv.address_room_nights_per_hour || 15],
    ['seats', 'seats-hour', inv.address_seats_per_hour || 20],
    ['units', 'units-hour', inv.address_units_per_hour || 5],
  ];
  const personKeys = [`e:${emailKey(b.customer.email)}`, ...(phoneKey(b.customer.phone) ? [`p:${phoneKey(b.customer.phone)}`] : [])];
  const personHere = Math.max(...personKeys.map((k) => rateCount('person', `${group}|${k}`)));
  let created;
  let wasLong = false;
  try {
    // createOrder is synchronous: the budget checks inside it and the spend right after it run
    // with no other request in between, and a refused order spends nothing.
    created = createOrder({
      lang: b.lang, items: b.items, promo, customer: b.customer, payment_method: b.payment_method,
      notes: b.notes, marketing_consent: b.marketing_consent, source, personHere, checkout_id: b.checkout_id, replaces: b.replaces,
      client: (d, longHold) => {
        wasLong = longHold;
        for (const [k, bucket, max] of daily) if (d[k]) rateCheck(bucket, group, max, d[k]);
        const overShare = longHold && hourly.some(([k, bucket, max]) => d[k] > 0 && rateCount(bucket, group) + d[k] > max * rateFactor());
        return { overShare };
      },
    });
  } catch (e) {
    if ((e as { code?: string })?.code === 'promo_invalid') promoResult(ip, false);
    throw e;
  }
  const d = demandOf(created.quote.priced);
  for (const [k, bucket, max] of daily) if (d[k]) try { rateLimit(bucket, group, max, DAY, d[k]); } catch { /* checked above */ }
  if (wasLong) for (const [k, bucket, max] of hourly) if (d[k]) try { rateLimit(bucket, group, max, HOUR, d[k]); } catch { /* only shortens holds */ }
  for (const k of personKeys) try { rateLimit('person', `${group}|${k}`, 1e9, DAY); } catch { /* counter only */ }
  return answer(created.order, ctx, b.lang, false);
});

/** 201 with the order and its next step (a new order, or the one an earlier POST of this draft made). */
async function answer(order: Order, ctx: Parameters<APIRoute>[0], lang: 'sq' | 'en', replay: boolean): Promise<Response> {
  let next;
  if (replay && order.payment_method === 'card' && (order.payment_status === 'paid' || order.status !== 'pending' || order.payment_provider === 'pok')) {
    // Already paid, or a POK payment was already opened for it: send the guest to the order page
    // (it re-reads POK), never open a second POK payment for the same order.
    next = { type: 'order' as const, url: orderPageUrl(order, lang) };
  } else {
    try {
      next = await startPayment(order, siteOrigin(ctx.url, ctx.request), lang);
    } catch (e) {
      console.error('[checkout] payment start failed', (e as Error)?.message ?? e);
      cancelOrder(order.id, { reason: 'payment_start_failed', paymentStatus: 'failed' });
      throw E.unavailable('Pagesa me kartë nuk u hap dot. Provoni një mënyrë tjetër pagese.', 'Card payment could not be opened. Please try another payment method.');
    }
  }
  return json({ code: order.code, token: order.access_token, next, order: orderView(order, lang) }, { status: 201, headers: replay ? { 'X-DV-Replay': '1' } : undefined });
}
