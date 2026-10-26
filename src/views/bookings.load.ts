/**
 * Bookings route loader (T5) — /rezervimet/ · /en/bookings/.
 * The "find my booking" form without JavaScript POSTs to the page. A match answers 303 to the
 * order's own token URL (the same URL /api/lookup returns), so a reload never re-posts the form
 * (no resend prompt, no second lookup slot spent); a miss re-renders the form with the message
 * and what the guest typed. Rate-limited like /api/lookup (bucket 'lookup', 10 per 10 min).
 * In Astro 7 a child component cannot change the status once the page streams, so the route
 * shell returns the redirect (same pattern as order.load.ts).
 */
import type { Lang } from '../i18n/routes';
import { orderByCode } from '../lib/orders';
import { orderPageUrl } from '../lib/payments/index';
import { clientIp, rateLimit } from '../lib/security';
import { t } from '../i18n/ui';

export interface BookingsPageData { typedCode: string; typedEmail: string; errCode: string; errEmail: string; errForm: string }
export type BookingsLoad = BookingsPageData | { redirect: string };

const EMPTY: BookingsPageData = { typedCode: '', typedEmail: '', errCode: '', errEmail: '', errForm: '' };

export async function load(lang: Lang, ctx: { request: Request; clientAddress?: string }): Promise<BookingsLoad> {
  if (ctx.request.method !== 'POST') return EMPTY;
  const d: BookingsPageData = { ...EMPTY };
  try {
    const form = await ctx.request.formData();
    d.typedCode = String(form.get('code') ?? '').trim().slice(0, 24);
    d.typedEmail = String(form.get('email') ?? '').trim().slice(0, 200);
    const code = d.typedCode.toUpperCase().replace(/\s+/g, '').replace(/^DV(?!-)/, 'DV-');
    if (!/^DV-[A-Z0-9]{4,12}$/.test(code)) d.errCode = t(lang, 'account.err.code');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.typedEmail)) d.errEmail = t(lang, 'account.err.email');
    if (d.errCode || d.errEmail) return d;
    rateLimit('lookup', clientIp({ clientAddress: ctx.clientAddress, request: ctx.request }), 10, 10 * 60_000);
    const o = orderByCode(code);
    if (o && o.email.toLowerCase() === d.typedEmail.toLowerCase()) return { redirect: orderPageUrl(o, lang) };
    d.errForm = t(lang, 'account.err.notfound');
  } catch {
    d.errForm = t(lang, 'account.err.rate');
  }
  return d;
}
