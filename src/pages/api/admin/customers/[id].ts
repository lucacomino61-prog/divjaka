import type { APIRoute } from 'astro';
import { E, handle, json, readJson, idParam } from '../../../../lib/http';
import { requireAdmin, requireOwner } from '../../../../lib/auth';
import { eraseCustomer, getCustomer, updateCustomer } from '../../../../lib/db/repo/customers';
import { all, tx } from '../../../../lib/db/index';
import { zCustomerPatch } from '../../../../lib/admin-schemas';
import { audit } from '../../../../lib/audit';
import { clientIp } from '../../../../lib/security';

/** GET /api/admin/customers/:id → { customer, orders } */
export const GET: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  const c = getCustomer(idParam(params.id));
  if (!c) throw E.notFound();
  const orders = all('SELECT id, code, total, status, payment_status, payment_method, test, created_at FROM orders WHERE customer_id = ? ORDER BY created_at DESC', c.id);
  return json({ customer: c, orders });
});

/** PATCH /api/admin/customers/:id { name?, phone?, country?, notes?, marketing_consent? } → { customer } */
export const PATCH: APIRoute = handle(async ({ locals, params, request }) => {
  requireAdmin(locals);
  const id = idParam(params.id);
  if (!updateCustomer(id, await readJson(request, zCustomerPatch))) throw E.notFound();
  return json({ customer: getCustomer(id) });
});

/**
 * DELETE /api/admin/customers/:id (owner only) → { ok, orders, messages }
 * Erases the customer: the row and their messages are deleted; their orders keep totals, items
 * and dates (bookkeeping) but lose name, e-mail, phone, country and notes. Cannot be undone.
 */
export const DELETE: APIRoute = handle(async (ctx) => {
  const admin = requireOwner(ctx.locals);
  const id = idParam(ctx.params.id);
  const r = tx(() => eraseCustomer(id));
  if (!r) throw E.notFound();
  audit('customer_erase', { adminId: admin.id, ip: clientIp(ctx), detail: { customer_id: id, orders: r.orders, messages: r.messages } });
  return json({ ok: true, ...r });
});
