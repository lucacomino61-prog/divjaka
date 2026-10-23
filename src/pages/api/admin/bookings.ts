import type { APIRoute } from 'astro';
import { E, handle, json } from '../../../lib/http';
import { requireAdmin } from '../../../lib/auth';
import { listProducts } from '../../../lib/db/repo/products';
import { roomNights } from '../../../lib/availability';
import { listSessions } from '../../../lib/db/repo/sessions';
import { all } from '../../../lib/db/index';
import { DATE_RE, addDays, daysBetween, tirane } from '../../../lib/time';

/**
 * GET /api/admin/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD(exclusive, default +14 days)
 * → { from, to,
 *     rooms:[{id, slug, name_sq, units, nights:[{night, booked, closed, left, price}], stays:[{code, order_id, name, from, to, rooms, guests, status, payment_status}]}],
 *     sessions:[{id, slug, name_sq, starts_at, capacity, booked, status, guests:[{code, order_id, name, people, phone, status}]}] }
 */
export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  const sp = url.searchParams;
  const from = DATE_RE.test(sp.get('from') ?? '') ? sp.get('from')! : tirane().date;
  const to = DATE_RE.test(sp.get('to') ?? '') ? sp.get('to')! : addDays(from, 14);
  if (to <= from || daysBetween(from, to) > 120) throw E.bad('Periudha duhet të jetë 1–120 ditë.', 'The range must be 1–120 days.');

  const rooms = listProducts({ kind: 'room', status: 'any' }).filter((p) => p.status !== 'archived').map((p) => {
    const stays = all<{ code: string; order_id: number; name: string; phone: string | null; from: string; to: string; rooms: number; guests: number | null; status: string; payment_status: string }>(
      `SELECT o.code, o.id AS order_id, o.name, o.phone, i.date_from AS "from", i.date_to AS "to", i.qty AS rooms, i.guests, o.status, o.payment_status
       FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE i.product_id = ? AND i.kind = 'room' AND o.status != 'cancelled' AND i.date_from < ? AND i.date_to > ? ORDER BY i.date_from`,
      p.id, to, from,
    );
    return {
      id: p.id, slug: p.slug, name_sq: p.name_sq, name_en: p.name_en, units: p.units,
      nights: roomNights(p, from, to).map((n) => ({ night: n.night, booked: n.booked, closed: n.closed_units, left: n.left, price: n.price })),
      stays,
    };
  });

  const sess = listSessions({ from: `${from}T00:00`, to: `${to}T00:00` }).filter((s) => s.status !== 'cancelled' || s.booked > 0);
  const ids = sess.map((s) => s.id);
  const guests = ids.length
    ? all<{ session_id: number; code: string; order_id: number; name: string; phone: string | null; people: number; status: string }>(
        `SELECT i.session_id, o.code, o.id AS order_id, o.name, o.phone, COALESCE(i.guests, i.qty) AS people, o.status FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE i.session_id IN (${ids.map(() => '?').join(',')}) AND o.status != 'cancelled' ORDER BY o.created_at`,
        ...ids,
      )
    : [];
  const names = new Map(listProducts({ kind: 'experience', status: 'any' }).map((p) => [p.id, p]));
  const sessions = sess.map((s) => ({
    id: s.id, slug: names.get(s.product_id)?.slug, name_sq: names.get(s.product_id)?.name_sq, starts_at: s.starts_at,
    capacity: s.capacity, booked: s.booked, status: s.status, note: s.note, guests: guests.filter((g) => g.session_id === s.id),
  }));
  return json({ from, to, rooms, sessions });
});
