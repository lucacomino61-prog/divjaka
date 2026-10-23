import type { APIRoute } from 'astro';
import { E, handle, json, readJson, idParam } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { getSession, updateSession, deleteSession } from '../../../../lib/db/repo/sessions';
import { zSessionPatch } from '../../../../lib/admin-schemas';
import { logInventory } from '../../../../lib/db/repo/misc';
import { isConstraintError } from '../../../../lib/db/index';

/** PATCH /api/admin/sessions/:id { starts_at?, capacity?, status?, note? } — capacity can't go below seats already booked. */
export const PATCH: APIRoute = handle(async ({ locals, params, request }) => {
  const admin = requireAdmin(locals);
  const s = getSession(idParam(params.id));
  if (!s) throw E.notFound();
  const b = await readJson(request, zSessionPatch);
  if (b.capacity !== undefined && b.capacity < s.booked) {
    throw E.conflict('below_booked', `Janë rezervuar tashmë ${s.booked} vende.`, `${s.booked} places are already booked.`);
  }
  try {
    updateSession(s.id, b);
  } catch (e) {
    if (isConstraintError(e)) throw E.conflict('exists', 'Ky orar ekziston tashmë.', 'This time slot already exists.');
    throw e;
  }
  if (b.capacity !== undefined && b.capacity !== s.capacity) logInventory({ product_id: s.product_id, session_id: s.id, delta: b.capacity - s.capacity, reason: 'admin_capacity', admin_id: admin.id });
  return json({ item: getSession(s.id) });
});

/** DELETE /api/admin/sessions/:id — only when nobody booked; otherwise PATCH status:'cancelled' and cancel the orders. */
export const DELETE: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  const r = deleteSession(idParam(params.id));
  if (r === 'missing') throw E.notFound();
  if (r === 'has_bookings') throw E.conflict('has_bookings', 'Ky orar ka rezervime. Anulojeni në vend që ta fshini.', 'This time slot has bookings. Cancel it instead of deleting it.');
  return json({ ok: true });
});
