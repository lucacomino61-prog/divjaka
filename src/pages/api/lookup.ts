import type { APIRoute } from 'astro';
import { z } from 'zod';
import { E, handle, json, readJson, zEmail } from '../../lib/http';
import { orderByCode } from '../../lib/orders';
import { orderPageUrl } from '../../lib/payments/index';
import { assertSameOrigin, clientIp, rateLimit } from '../../lib/security';

const Body = z.object({ code: z.string().trim().min(4).max(20), email: zEmail, lang: z.enum(['sq', 'en']).default('sq') });

/** POST /api/lookup { code, email, lang } → { code, token, url } — "find my booking" (code + e-mail). */
export const POST: APIRoute = handle(async (ctx) => {
  assertSameOrigin(ctx.request, ctx.url);
  rateLimit('lookup', clientIp(ctx), 10, 10 * 60_000);
  const b = await readJson(ctx.request, Body, 2048);
  const o = orderByCode(b.code.toUpperCase().replace(/^DV(?!-)/, 'DV-'));
  if (!o || o.email.toLowerCase() !== b.email.toLowerCase()) {
    throw E.notFound('Nuk gjetëm një rezervim me këtë kod dhe email.', 'No booking found with this code and e-mail.');
  }
  return json({ code: o.code, token: o.access_token, url: orderPageUrl(o, b.lang) });
});
