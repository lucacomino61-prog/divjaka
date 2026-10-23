import type { APIRoute } from 'astro';
import { handle, json, limitParam, offsetParam } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { listCustomers } from '../../../../lib/db/repo/customers';

/** GET /api/admin/customers?q&consent=1&limit&offset → { items:[…customer, orders, revenue, first_order, last_order], total } */
export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  const sp = url.searchParams;
  return json(listCustomers({
    q: sp.get('q')?.slice(0, 100) || undefined,
    consent: sp.get('consent') === '1',
    limit: limitParam(sp.get('limit'), 50, 500),
    offset: offsetParam(sp.get('offset')),
  }));
});
