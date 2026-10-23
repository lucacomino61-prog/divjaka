import type { APIRoute } from 'astro';
import { handle, json, limitParam, offsetParam } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { listOrders, type OrderStatus, type PaymentMethod, type PaymentStatus } from '../../../../lib/db/repo/orders';
import { sweepExpired } from '../../../../lib/orders';
import { DATE_RE, addDays } from '../../../../lib/time';
import { localMidnightUtc } from '../../../../lib/stats';

/**
 * GET /api/admin/orders?status&payment_status&payment_method&kind&q&from=YYYY-MM-DD&to=YYYY-MM-DD(inclusive)&limit&offset
 * → { items, total } (newest first)
 */
export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  try { sweepExpired(); } catch (e) { console.error('[sweep]', e); }
  const sp = url.searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  return json(listOrders({
    status: (sp.get('status') || undefined) as OrderStatus | undefined,
    payment_status: (sp.get('payment_status') || undefined) as PaymentStatus | undefined,
    payment_method: (sp.get('payment_method') || undefined) as PaymentMethod | undefined,
    kind: sp.get('kind') || undefined,
    q: sp.get('q')?.slice(0, 100) || undefined,
    from: from && DATE_RE.test(from) ? localMidnightUtc(from) : undefined,
    to: to && DATE_RE.test(to) ? localMidnightUtc(addDays(to, 1)) : undefined,
    limit: limitParam(sp.get('limit'), 50, 200),
    offset: offsetParam(sp.get('offset')),
  }));
});
