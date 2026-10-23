import type { APIRoute } from 'astro';
import { handle, json, limitParam } from '../../../lib/http';
import { requireAdmin } from '../../../lib/auth';
import { inventoryLog } from '../../../lib/db/repo/misc';

/** GET /api/admin/inventory?product_id&order_id&limit → { items } — the inventory log (delta < 0 = taken, > 0 = released/added). */
export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  const sp = url.searchParams;
  return json({ items: inventoryLog({ product_id: Number(sp.get('product_id')) || undefined, order_id: Number(sp.get('order_id')) || undefined, limit: limitParam(sp.get('limit'), 200, 1000) }) });
});
