/**
 * Order route loader (T5). The order itself is opened by Order.astro with the access token
 * (?t=…) or the guest's e-mail — so this loader answers the same for every well-formed code,
 * whether it exists or not (a 200 with the "open with your e-mail" form): the URL alone never
 * tells a stranger that an order code is real. Malformed codes → 404.
 *
 * The "open with your e-mail" form without JavaScript POSTs to the page itself. That is handled
 * HERE (the route shell passes the request): a matching e-mail answers 303 to the order's own
 * token URL (the same URL /api/lookup returns), so a reload never re-posts and the language switch
 * keeps working; a miss re-renders the form with the message and the typed e-mail. Rate-limited
 * like /api/lookup (bucket 'lookup', 10 per 10 min). In Astro 7 a child component cannot change
 * the status once the page streams, so the redirect has to come from the route shell.
 */
import type { Lang } from '../i18n/routes';
import { orderByCode } from '../lib/orders';
import { orderPageUrl } from '../lib/payments/index';
import { clientIp, rateLimit } from '../lib/security';
import { t } from '../i18n/ui';

export interface OrderPageData { code: string; lockedError?: string; typedEmail?: string }
export type OrderLoad = OrderPageData | { redirect: string };

export async function load(params: Record<string, string>, lang: Lang, ctx?: { request: Request; clientAddress?: string }): Promise<OrderLoad | null> {
  const code = (params.code ?? '').trim().toUpperCase();
  if (!/^DV-[A-Z0-9]{4,12}$/.test(code)) return null;
  if (!ctx || ctx.request.method !== 'POST') return { code };
  let typedEmail = '';
  try {
    rateLimit('lookup', clientIp({ clientAddress: ctx.clientAddress, request: ctx.request }), 10, 10 * 60_000);
    const form = await ctx.request.formData();
    typedEmail = String(form.get('email') ?? '').trim().slice(0, 200);
    const o = orderByCode(code);
    if (o && typedEmail && o.email.toLowerCase() === typedEmail.toLowerCase()) return { redirect: orderPageUrl(o, lang) };
    return { code, typedEmail, lockedError: t(lang, 'account.err.notfound') };
  } catch {
    return { code, typedEmail, lockedError: t(lang, 'account.err.rate') };
  }
}
