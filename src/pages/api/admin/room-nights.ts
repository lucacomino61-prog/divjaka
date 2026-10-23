import type { APIRoute } from 'astro';
import { E, handle, json, readJson } from '../../../lib/http';
import { requireAdmin } from '../../../lib/auth';
import { getProduct } from '../../../lib/db/repo/products';
import { ensureNight } from '../../../lib/db/repo/rooms';
import { roomNights } from '../../../lib/availability';
import { zNights } from '../../../lib/admin-schemas';
import { get, run, tx } from '../../../lib/db/index';
import { logInventory } from '../../../lib/db/repo/misc';
import { DATE_RE, addDays, daysBetween, nights, tirane } from '../../../lib/time';

/** GET /api/admin/room-nights?product_id&from&to(exclusive) → { units, nights:[{night, price, left, booked, closed}] } */
export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  const sp = url.searchParams;
  const p = getProduct(Number(sp.get('product_id')));
  if (!p || p.kind !== 'room') throw E.bad('Zgjidhni një dhomë.', 'Choose a room.');
  const from = DATE_RE.test(sp.get('from') ?? '') ? sp.get('from')! : tirane().date;
  const to = DATE_RE.test(sp.get('to') ?? '') ? sp.get('to')! : addDays(from, 30);
  if (to <= from || daysBetween(from, to) > 400) throw E.bad();
  const list = roomNights(p, from, to).map((n) => ({ night: n.night, price: n.price, left: n.left, booked: n.booked, closed: n.closed_units }));
  return json({ units: p.units, nights: list });
});

/**
 * POST /api/admin/room-nights { product_id, from, to (exclusive), closed: n | 'all' | 0 }
 * Sets how many units are closed on each night. Booked rooms are never closed: on nights where
 * bookings prevent the full closure, as many units as possible are closed and the night is
 * listed in `partially`.
 */
export const POST: APIRoute = handle(async ({ locals, request }) => {
  const admin = requireAdmin(locals);
  const b = await readJson(request, zNights);
  const p = getProduct(b.product_id);
  if (!p || p.kind !== 'room') throw E.bad('Zgjidhni një dhomë.', 'Choose a room.');
  if (daysBetween(b.from, b.to) > 400) throw E.bad();
  const units = p.units ?? 0;
  const want = b.closed === 'all' ? units : Math.min(units, b.closed);
  const conflicts: string[] = [];
  tx(() => {
    for (const night of nights(b.from, b.to)) {
      ensureNight(p.id, night);
      const row = get<{ booked: number; closed: number }>('SELECT booked, closed FROM room_nights WHERE product_id = ? AND night = ?', p.id, night)!;
      const value = Math.min(want, Math.max(0, units - row.booked));
      if (value < want) conflicts.push(night);
      if (value !== row.closed) {
        run('UPDATE room_nights SET closed = ? WHERE product_id = ? AND night = ?', value, p.id, night);
        logInventory({ product_id: p.id, night, delta: row.closed - value, reason: value > row.closed ? 'admin_close' : 'admin_open', admin_id: admin.id });
      }
    }
  });
  return json({ ok: true, closed: want, partially: conflicts });
});
