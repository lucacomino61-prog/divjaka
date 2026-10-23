import type { APIRoute } from 'astro';
import { E, handle, json, readJson, idParam } from '../../../../lib/http';
import { requireOwner } from '../../../../lib/auth';
import { audit } from '../../../../lib/audit';
import { getOffer, updateOffer, deleteOffer, offerByCode } from '../../../../lib/db/repo/offers';
import { zOfferBase } from '../../../../lib/admin-schemas';
import { clientIp } from '../../../../lib/security';

const Patch = zOfferBase.partial();

/** PATCH /api/admin/offers/:id (owner only) → { item }. Saving clears the DEMO flag. */
export const PATCH: APIRoute = handle(async (ctx) => {
  const { locals, params, request } = ctx;
  const admin = requireOwner(locals);
  const id = idParam(params.id);
  const cur = getOffer(id);
  if (!cur) throw E.notFound();
  const b = await readJson(request, Patch);
  const type = b.type ?? cur.type;
  const value = b.value ?? cur.value;
  if (type === 'percent' && value > 100) throw E.bad('Përqindja duhet të jetë ≤ 100.', 'Percent must be ≤ 100.');
  if (b.code) {
    const other = offerByCode(b.code);
    if (other && other.id !== id) throw E.conflict('code_taken', 'Ky kod ekziston.', 'This code already exists.');
  }
  updateOffer(id, { ...b, code: b.code === '' ? null : b.code, demo: false } as Parameters<typeof updateOffer>[1]);
  const after = getOffer(id) as unknown as Record<string, unknown>;
  const before = cur as unknown as Record<string, unknown>;
  const changes = Object.fromEntries(Object.keys(b)
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => [k, { from: before[k] ?? null, to: after[k] ?? null }]));
  audit('offer_update', { adminId: admin.id, ip: clientIp(ctx), detail: { id, code: after.code ?? null, active: after.active, changes } });
  return json({ item: getOffer(id) });
});
export const PUT = PATCH;

/** DELETE /api/admin/offers/:id */
export const DELETE: APIRoute = handle(async (ctx) => {
  const admin = requireOwner(ctx.locals);
  const id = idParam(ctx.params.id);
  const cur = getOffer(id);
  if (!cur || !deleteOffer(id)) throw E.notFound();
  audit('offer_delete', { adminId: admin.id, ip: clientIp(ctx), detail: { id, code: cur.code, type: cur.type, value: cur.value, active: cur.active } });
  return json({ ok: true });
});
