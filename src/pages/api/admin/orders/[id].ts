import type { APIRoute } from 'astro';
import { E, handle, json, readJson } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { getOrder, orderByCode, orderItems, type Order } from '../../../../lib/db/repo/orders';
import { adminUpdateOrder } from '../../../../lib/orders';
import { getCustomer } from '../../../../lib/db/repo/customers';
import { inventoryLog } from '../../../../lib/db/repo/misc';
import { zOrderPatch } from '../../../../lib/admin-schemas';

/** :id may be the numeric id or the order code (DV-XXXXX). */
function load(raw: unknown): Order {
  const s = String(raw ?? '');
  const o = /^\d+$/.test(s) ? getOrder(Number(s)) : orderByCode(s);
  if (!o) throw E.notFound('Porosia nuk u gjet.', 'Order not found.');
  return o;
}

/** Admin view of an order: no access token, no browsing id; consent_pending flags a box ticked at checkout that is not yet the customer's consent. */
function view(o: Order) {
  const { access_token: _t, sid: _s, email_key: _e, phone_key: _p, ...order } = o;
  const customer = o.customer_id ? getCustomer(o.customer_id) : null;
  return { order: { ...order, consent_pending: !!o.marketing_consent && !o.test && !!customer && !customer.marketing_consent }, customer };
}

/** GET /api/admin/orders/:id → { order (+consent_pending), items, customer, log } */
export const GET: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  const o = load(params.id);
  const v = view(o);
  return json({ order: v.order, items: orderItems(o.id), customer: v.customer, log: inventoryLog({ order_id: o.id, limit: 100 }) });
});

/**
 * PATCH /api/admin/orders/:id { status?, payment_status?, notes?, payment_ref?, confirm_consent? }
 * status 'cancelled' releases rooms/seats/stock; re-opening a cancelled order takes them again
 * (409 sold_out if they are gone); any status set here makes the order a staff hold (no automatic
 * release); payment_status 'paid' stamps paid_at and confirms the marketing consent ticked on the
 * order; confirm_consent: true confirms it without a payment (after checking with the guest).
 * Confirming/completing or marking paid an order on a cancelled time slot → 409 session_cancelled
 * ({ field: 'force' }) unless the body carries force: true.
 */
export const PATCH: APIRoute = handle(async ({ locals, params, request }) => {
  const admin = requireAdmin(locals);
  const o = load(params.id);
  const b = await readJson(request, zOrderPatch);
  const after = adminUpdateOrder(o.id, b, admin.id)!;
  return json({ order: view(after).order, items: orderItems(o.id) });
});
