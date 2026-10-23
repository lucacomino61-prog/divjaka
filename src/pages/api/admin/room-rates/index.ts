import type { APIRoute } from 'astro';
import { E, handle, json, readJson } from '../../../../lib/http';
import { requireAdmin, requireOwner } from '../../../../lib/auth';
import { audit } from '../../../../lib/audit';
import { listRates, createRate, getRate } from '../../../../lib/db/repo/rooms';
import { getProduct } from '../../../../lib/db/repo/products';
import { zRate } from '../../../../lib/admin-schemas';
import { clientIp } from '../../../../lib/security';

/** GET /api/admin/room-rates?product_id → { items } (newest row wins where ranges overlap). */
export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  return json({ items: listRates(Number(url.searchParams.get('product_id')) || undefined) });
});

/** POST /api/admin/room-rates { product_id, date_from, date_to (inclusive), price, note? } → 201 { item } */
export const POST: APIRoute = handle(async (ctx) => {
  const admin = requireOwner(ctx.locals);
  const b = await readJson(ctx.request, zRate);
  const p = getProduct(b.product_id);
  if (!p || p.kind !== 'room') throw E.bad('Produkti nuk është dhomë.', 'The product is not a room.');
  const id = createRate({ ...b, note: b.note ?? null });
  audit('rate_change', { adminId: admin.id, ip: clientIp(ctx), detail: { op: 'create', id, product_id: p.id, date_from: b.date_from, date_to: b.date_to, from: null, to: b.price, base_price: p.price } });
  return json({ item: getRate(id) }, { status: 201 });
});
