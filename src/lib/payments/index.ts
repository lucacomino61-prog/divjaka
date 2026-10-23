/**
 * Payment providers.
 *   hotel  pay on arrival: order pending / unpaid, nothing to do online.
 *   bank   transfer: order pending / unpaid; the order page shows IBAN etc. from settings.payments
 *          (offered only when IBAN and beneficiary are set: mode.ts).
 *   card   'test' → TEST simulator at /api/pay/test/:code (dev or ALLOW_TEST_PAYMENTS=1 only);
 *          'pok'  → POK hosted card form; paid only after re-reading POK.
 *          'off'  → card is not offered and checkout refuses it.
 * `paid` is only ever written server-side (orders.markPaid).
 */
import { getSetting } from '../db/repo/settings';
import { markPaid } from '../orders';
import { orderItems, type Order } from '../db/repo/orders';
import { pokCreateOrder, pokReadOrder, pokCaptured } from './pok';
import { run } from '../db/index';
import { isPublicOrigin, path, type Lang } from '../urls';
import { cardMode, paymentAvailability, type CardMode } from './mode';

export { cardMode, paymentAvailability, testPaymentsAllowed, bankConfigured, paymentWarnings, type CardMode } from './mode';

export type NextStep =
  | { type: 'order'; url: string }
  | { type: 'redirect'; url: string; test?: boolean }
  | { type: 'pok'; pok_order_id: string; url: string | null };

/** Localized order page URL with its access token. */
export function orderPageUrl(o: Pick<Order, 'code' | 'access_token'>, lang: Lang): string {
  return `${path('order', lang, { code: o.code })}?t=${encodeURIComponent(o.access_token)}`;
}

/** Methods the checkout may offer right now (kept for existing callers). */
export function paymentMethods(): { hotel: boolean; bank: boolean; card: boolean; card_mode: CardMode } {
  return paymentAvailability();
}

export async function startPayment(o: Order, origin: string, lang: Lang): Promise<NextStep> {
  if (o.payment_method !== 'card') return { type: 'order', url: orderPageUrl(o, lang) };
  if (o.payment_provider === 'test') {
    if (cardMode() !== 'test') throw new Error('test_payments_not_allowed');
    return { type: 'redirect', url: `/api/pay/test/${o.code}?t=${encodeURIComponent(o.access_token)}`, test: true };
  }
  if (o.payment_provider !== 'pok' || cardMode() !== 'pok') throw new Error('card_unavailable');
  // POK must be able to reach the webhook and send the customer back: a localhost or
  // placeholder origin would leave every card payment unconfirmed.
  if (!isPublicOrigin(origin)) throw new Error(`pok_needs_public_origin (${origin})`);
  const items = orderItems(o.id);
  const created = await pokCreateOrder({
    amount: o.total,
    ref: o.code,
    products: items.map((i) => ({ name: i.name, quantity: i.qty, price: i.qty ? Math.round(i.line_total / i.qty) : i.line_total })),
    webhookUrl: `${origin}/api/pay/pok/webhook`,
    redirectUrl: `${origin}${orderPageUrl(o, lang)}&pay=return`,
    failRedirectUrl: `${origin}${orderPageUrl(o, lang)}&pay=failed`,
    description: `Hotel Pelikan ${o.code}`,
    expiresAfterMinutes: getSetting('payments').card_hold_minutes || 30,
  });
  if (!created.ok) throw new Error('pok_create_failed');
  run('UPDATE orders SET payment_ref = ? WHERE id = ?', created.order.id, o.id);
  const url = (created.order.confirmUrl as string | undefined) ?? created.order._self?.confirmUrl ?? null;
  return { type: 'pok', pok_order_id: created.order.id, url };
}

/** Re-read a POK order and mark ours paid when POK says the money is captured. */
export async function syncPok(o: Order): Promise<Order> {
  if (o.payment_method !== 'card' || o.payment_provider !== 'pok' || o.payment_status === 'paid' || !o.payment_ref) return o;
  const remote = await pokReadOrder(o.payment_ref);
  if (!remote) return o;
  // The POK order must be OURS for THIS order (our code as merchantCustomReference, lek) and
  // fully captured; anything else is logged and ignored.
  const ref = String(remote.merchantCustomReference ?? '');
  const currency = String(remote.currencyCode ?? remote.currency ?? 'ALL').toUpperCase();
  if (ref !== o.code || currency !== 'ALL') {
    console.error(`[pok] order ${o.code}: POK order ${o.payment_ref} does not match (reference ${ref.slice(0, 40) || '-'}, currency ${currency.slice(0, 8)})`);
    return o;
  }
  if (pokCaptured(remote) >= o.total) return markPaid(o.id, o.payment_ref) ?? o;
  return o;
}
