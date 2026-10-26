import type { APIRoute } from 'astro';
import { z } from 'zod';
import { handle, json, readJson } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { all } from '../../../../lib/db/index';
import { cancelOrder, UNCONFIRMED } from '../../../../lib/orders';
import { audit } from '../../../../lib/audit';
import { clientIp } from '../../../../lib/security';

const Body = z.object({
  /** Orders created in the last N minutes (15 min – 24 h). */
  minutes: z.number().int().min(15).max(24 * 60).default(60),
  /** Only these payment methods (default: pay at hotel and bank transfer, the free holds). */
  methods: z.array(z.enum(['hotel', 'bank', 'card'])).min(1).max(3).default(['hotel', 'bank']),
  /** true = only count, cancel nothing (the button shows "N orders will be cancelled"). */
  dry_run: z.boolean().default(false),
  /** The codes the dry run listed and the owner approved (T6 sends them): only those are cancelled,
   *  and only while still unconfirmed, so an order that arrived after the dry run is never touched. */
  codes: z.array(z.string().regex(/^DV-[A-Z0-9]{3,12}$/)).min(1).max(2000).optional(),
});

/**
 * POST /api/admin/orders/cancel-unconfirmed { minutes?, methods?, dry_run?, codes? } → { count, codes, requested }
 * One click for a flood of fake bookings: cancels every UNCONFIRMED online order (not paid, not
 * confirmed or touched by staff; TEST-paid included) created in the last `minutes`, releasing
 * its rooms, seats and stock. Real guests among them are NOT told — check the list (dry_run)
 * first. Audited (orders_mass_cancel).
 */
export const POST: APIRoute = handle(async (ctx) => {
  const admin = requireAdmin(ctx.locals);
  const b = await readJson(ctx.request, Body, 40_000); // room for up to 2 000 approved codes
  const since = new Date(Date.now() - b.minutes * 60_000).toISOString();
  const approved = b.codes && !b.dry_run ? [...new Set(b.codes)] : null;
  const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');
  const rows = approved
    ? all<{ id: number; code: string }>(
      `SELECT o.id, o.code FROM orders o WHERE o.code IN (${marks(approved.length)}) AND o.payment_method IN (${marks(b.methods.length)}) AND ${UNCONFIRMED}
       ORDER BY o.id`,
      ...approved, ...b.methods,
    )
    : all<{ id: number; code: string }>(
      `SELECT o.id, o.code FROM orders o WHERE o.created_at >= ? AND o.payment_method IN (${marks(b.methods.length)}) AND ${UNCONFIRMED}
       ORDER BY o.id LIMIT 2000`,
      since, ...b.methods,
    );
  if (!b.dry_run) {
    for (const r of rows) cancelOrder(r.id, { reason: 'mass_cancel', adminId: admin.id });
    audit('orders_mass_cancel', { adminId: admin.id, ip: clientIp(ctx), detail: { minutes: b.minutes, methods: b.methods, count: rows.length, requested: b.codes?.length ?? null } });
  }
  return json({ count: rows.length, codes: rows.map((r) => r.code), dry_run: b.dry_run, requested: b.codes?.length ?? rows.length });
});
