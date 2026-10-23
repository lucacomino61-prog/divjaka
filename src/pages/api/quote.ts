import type { APIRoute } from 'astro';
import { handle, json, readJson } from '../../lib/http';
import { publicQuote, quote, zQuoteBody } from '../../lib/pricing';
import { clientIp, rateLimit } from '../../lib/security';
import { PROMO_TOO_MANY, promoBlocked, promoResult } from '../../lib/promo-limit';

/**
 * POST /api/quote { lang, items, promo } → server-priced cart (src/lib/pricing.ts).
 * A failed promo code counts against the address (10 per 10 minutes, src/lib/promo-limit.ts);
 * past that the code is reported invalid without being looked up.
 */
export const POST: APIRoute = handle(async (ctx) => {
  const ip = clientIp(ctx);
  rateLimit('quote', ip, 120, 60_000);
  const body = await readJson(ctx.request, zQuoteBody);
  const code = body.promo?.trim();
  if (code && promoBlocked(ip)) {
    const q = publicQuote(quote({ ...body, promo: null }));
    return json({ ...q, promo: { code: code.toUpperCase(), valid: false, message: PROMO_TOO_MANY[body.lang === 'en' ? 'en' : 'sq'] } });
  }
  const q = quote(body);
  if (code && q.promo) promoResult(ip, q.promo.valid);
  return json(publicQuote(q));
});
