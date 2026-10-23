import type { APIRoute } from 'astro';
import { ApiError, json, readText } from '../../../../lib/http';
import { get } from '../../../../lib/db/index';
import { getOrder, orderByCode } from '../../../../lib/orders';
import { syncPok } from '../../../../lib/payments/index';
import { pokConfigured } from '../../../../lib/payments/pok';
import { clientIp, rateLimit } from '../../../../lib/security';
import type { Order } from '../../../../lib/db/repo/orders';

/**
 * POST /api/pay/pok/webhook — POK's notification. The body is NEVER trusted: we only use it to
 * find which of our orders it is about, then re-read the order from POK with our own keys
 * (syncPok) and mark it paid only if POK reports capturedAmount ≥ our total.
 * Always answers 200 so POK does not hammer retries for orders we do not know.
 */
export const POST: APIRoute = async (ctx) => {
  const { request } = ctx;
  if (!pokConfigured()) return json({ ok: false }, { status: 404 });
  // Each call makes us re-read an order from POK: cap it per address.
  try { rateLimit('pok-webhook', clientIp(ctx), 60, 60_000); } catch { return json({ ok: false }, { status: 429 }); }
  let body: any = null;
  try {
    const text = await readText(request, 64 * 1024);
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    return json({ ok: false }, { status: e instanceof ApiError ? e.status : 400 });
  }
  const d = body?.data?.sdkOrder ?? body?.data ?? body ?? {};
  const ref = typeof d.merchantCustomReference === 'string' ? d.merchantCustomReference : null;
  const pokId = typeof d.id === 'string' ? d.id : typeof body?.sdkOrderId === 'string' ? body.sdkOrderId : null;
  let o: Order | undefined;
  if (ref) o = orderByCode(ref);
  if (!o && pokId) {
    const row = get<{ id: number }>("SELECT id FROM orders WHERE payment_ref = ? AND payment_provider = 'pok'", pokId);
    if (row) o = getOrder(row.id);
  }
  if (!o) return json({ ok: true, known: false });
  const after = await syncPok(o);
  return json({ ok: true, paid: after.payment_status === 'paid' });
};
