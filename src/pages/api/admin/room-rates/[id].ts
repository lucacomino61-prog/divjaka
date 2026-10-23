import type { APIRoute } from 'astro';
import { E, handle, json, readJson, idParam } from '../../../../lib/http';
import { requireOwner } from '../../../../lib/auth';
import { audit } from '../../../../lib/audit';
import { getRate, updateRate, deleteRate } from '../../../../lib/db/repo/rooms';
import { zRateBase } from '../../../../lib/admin-schemas';
import { clientIp } from '../../../../lib/security';

const Patch = zRateBase.partial();

/** PATCH /api/admin/room-rates/:id → { item } */
export const PATCH: APIRoute = handle(async (ctx) => {
  const admin = requireOwner(ctx.locals);
  const id = idParam(ctx.params.id);
  const cur = getRate(id);
  if (!cur) throw E.notFound();
  const b = await readJson(ctx.request, Patch);
  const next = { ...cur, ...b };
  if (next.date_to < next.date_from) throw E.bad('Data e mbarimit është para fillimit.', 'The end date is before the start date.');
  updateRate(id, b);
  // Audited after success, with what changed.
  audit('rate_change', {
    adminId: admin.id, ip: clientIp(ctx),
    detail: { op: 'update', id, product_id: cur.product_id, date_from: next.date_from, date_to: next.date_to, from: cur.price, to: next.price,
      ...(b.date_from !== undefined || b.date_to !== undefined ? { dates_from: [cur.date_from, cur.date_to] } : {}) },
  });
  return json({ item: getRate(id) });
});
export const PUT = PATCH;

/** DELETE /api/admin/room-rates/:id */
export const DELETE: APIRoute = handle(async (ctx) => {
  const admin = requireOwner(ctx.locals);
  const id = idParam(ctx.params.id);
  const cur = getRate(id);
  if (!cur || !deleteRate(id)) throw E.notFound();
  audit('rate_change', { adminId: admin.id, ip: clientIp(ctx), detail: { op: 'delete', id, product_id: cur.product_id, date_from: cur.date_from, date_to: cur.date_to, from: cur.price, to: null } });
  return json({ ok: true });
});
