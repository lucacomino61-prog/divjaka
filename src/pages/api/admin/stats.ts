import type { APIRoute } from 'astro';
import { E, handle, json } from '../../../lib/http';
import { requireAdmin } from '../../../lib/auth';
import { stats } from '../../../lib/stats';
import { sweepExpired } from '../../../lib/orders';
import { DATE_RE, addDays, daysBetween, tirane } from '../../../lib/time';

/** GET /api/admin/stats?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive; default the last 30 days) → dashboard payload (src/lib/stats.ts). */
export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  try { sweepExpired(); } catch (e) { console.error('[sweep]', e); }
  const sp = url.searchParams;
  const to = DATE_RE.test(sp.get('to') ?? '') ? sp.get('to')! : tirane().date;
  const from = DATE_RE.test(sp.get('from') ?? '') ? sp.get('from')! : addDays(to, -29);
  if (to < from || daysBetween(from, to) > 731) throw E.bad('Periudha nuk është e vlefshme (maks. 2 vjet).', 'Invalid range (max 2 years).');
  return json(stats(from, to));
});
