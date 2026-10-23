import type { APIRoute } from 'astro';
import { E, handle, json, validate, zLang } from '../../../../lib/http';
import { findPublished } from '../../../../lib/catalog';
import { roomMonth, roomNights } from '../../../../lib/availability';
import { quote, zQuoteItem, MAX_NIGHTS } from '../../../../lib/pricing';
import { MONTH_RE, isDate, tirane, daysBetween } from '../../../../lib/time';
import { cached } from '../../../../lib/cache';

const QtyGuests = zQuoteItem.pick({ qty: true, guests: true });

/**
 * GET /api/availability/room/:slug?from=YYYY-MM-DD&to=YYYY-MM-DD[&qty&guests&lang]
 *   → { from, to, nights:[{night, price, left}], left, quote }   (quote = pricing.ts result for qty rooms)
 * GET /api/availability/room/:slug?month=YYYY-MM
 *   → { month, units, capacity, min_nights, days:[{date, price, left, status:'past'|'open'|'full'|'closed'}] }
 */
export const GET: APIRoute = handle(async ({ params, url }) => {
  const p = findPublished(String(params.slug ?? ''));
  if (!p || p.kind !== 'room') throw E.notFound('Dhoma nuk u gjet.', 'Room not found.');
  const sp = url.searchParams;
  const lang = zLang.parse(sp.get('lang') ?? 'sq');
  const from = sp.get('from');
  const to = sp.get('to');
  if (from || to) {
    if (!isDate(from) || !isDate(to) || to <= from || daysBetween(from, to) > MAX_NIGHTS) {
      throw E.bad('Datat nuk janë të sakta.', 'Dates are not valid.');
    }
    // Same rules as a cart line (zQuoteItem): whole numbers 1–99; anything else is a 400.
    const nums = validate(QtyGuests, { qty: sp.get('qty') ?? undefined, guests: sp.get('guests') || undefined });
    const qty = Math.min(20, nums.qty);
    const guests = nums.guests;
    const nights = roomNights(p, from, to).map((n) => ({ night: n.night, price: n.price, left: n.left }));
    const q = quote({ lang, items: [{ key: p.slug, slug: p.slug, kind: 'room', qty, from, to, guests }] });
    return json({ from, to, nights, left: Math.min(...nights.map((n) => n.left)), quote: { line: q.lines[0], total: q.total, eur_rate: q.eur_rate } });
  }
  const month = sp.get('month') ?? tirane().date.slice(0, 7);
  if (!MONTH_RE.test(month)) throw E.bad('Muaji nuk është i saktë.', 'Month is not valid.');
  const days = cached(`room-month|${p.id}|${month}`, () => roomMonth(p, month));
  return json({ month, units: p.units, capacity: p.capacity, min_nights: Number(p.options.min_nights ?? 1), days });
});
