import type { APIRoute } from 'astro';
import { E, handle, json } from '../../../../lib/http';
import { findPublished } from '../../../../lib/catalog';
import { sessionsMonth, nextSessions } from '../../../../lib/availability';
import { MONTH_RE, tirane } from '../../../../lib/time';
import { cached } from '../../../../lib/cache';

/**
 * GET /api/availability/experience/:slug?month=YYYY-MM
 *   → { month, price, sessions:[{id, starts_at, date, time, capacity, left, status:'open'|'full'|'closed'|'past'}], next:[…5 bookable] }
 */
export const GET: APIRoute = handle(async ({ params, url }) => {
  const p = findPublished(String(params.slug ?? ''));
  if (!p || p.kind !== 'experience') throw E.notFound('Eksperienca nuk u gjet.', 'Experience not found.');
  const month = url.searchParams.get('month') ?? tirane().date.slice(0, 7);
  if (!MONTH_RE.test(month)) throw E.bad('Muaji nuk është i saktë.', 'Month is not valid.');
  return json(cached(`exp-month|${p.id}|${month}`, () => ({ month, price: p.price, sessions: sessionsMonth(p, month), next: nextSessions(p.id, 5) })));
});
