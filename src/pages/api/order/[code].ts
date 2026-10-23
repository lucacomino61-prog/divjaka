import type { APIRoute } from 'astro';
import { E, handle, json, zLang } from '../../../lib/http';
import { orderByCode, orderView, tokenMatches } from '../../../lib/orders';
import { syncPok } from '../../../lib/payments/index';
import { clientIp, rateLimit } from '../../../lib/security';

/** GET /api/order/:code?t=<access_token>&lang → order view (status, lines, payment instructions). */
export const GET: APIRoute = handle(async (ctx) => {
  rateLimit('order', clientIp(ctx), 60, 60_000);
  const code = String(ctx.params.code ?? '').toUpperCase();
  let o = orderByCode(code);
  if (!o || !tokenMatches(o, ctx.url.searchParams.get('t'))) throw E.notFound('Porosia nuk u gjet.', 'Order not found.');
  o = await syncPok(o);
  return json(orderView(o, zLang.parse(ctx.url.searchParams.get('lang') ?? o.lang)));
});
