import type { APIRoute } from 'astro';
import { E, ApiError, errorResponse, readText } from '../../../../lib/http';
import { orderByCode, tokenMatches, markPaid, markPaymentFailed, orderView } from '../../../../lib/orders';
import { cardMode, orderPageUrl } from '../../../../lib/payments/index';
import { clientIp, isSameOrigin, rateLimit } from '../../../../lib/security';
import { money } from '../../../../i18n/format';
import { esc } from '../../../../lib/feed';
import type { Lang } from '../../../../lib/urls';

/**
 * TEST card payment simulator. It exists only while card mode is 'test' — settings.payments.mode
 * 'test' AND test payments allowed on this server (dev, or ALLOW_TEST_PAYMENTS=1; never by
 * default in a production build) — and only for orders created as TEST (orders.test = 1,
 * payment_provider 'test'). GET shows a page clearly labelled TEST; its form POSTs back here and
 * the SERVER marks the order paid (or failed), then redirects (303) to the order page. TEST
 * payments get payment_ref TEST-… and are never counted as money in the stats.
 * No card data is asked for or accepted.
 */
function load(code: string, token: string | null) {
  if (cardMode() !== 'test') throw E.notFound();
  const o = orderByCode(code);
  if (!o || !tokenMatches(o, token) || o.payment_method !== 'card' || o.payment_provider !== 'test' || !o.test) throw E.notFound('Porosia nuk u gjet.', 'Order not found.');
  return o;
}

const T = {
  sq: { title: 'Pagesë PROVË', badge: 'MËNYRË PROVE — asnjë para nuk lëviz', lead: 'Kjo faqe imiton pagesën me kartë derisa hoteli të ketë kontratë me një ofrues pagesash. Nuk kërkohen të dhëna karte.', order: 'Porosia', total: 'Totali', pay: 'Paguaj (PROVË)', fail: 'Simulo dështim', paid: 'Kjo porosi është paguar tashmë.', back: 'Kthehu te porosia', expired: 'Kjo porosi nuk pret më pagesë.' },
  en: { title: 'TEST payment', badge: 'TEST MODE — no money moves', lead: 'This page simulates a card payment until the hotel has a contract with a payment provider. No card details are asked for.', order: 'Order', total: 'Total', pay: 'Pay (TEST)', fail: 'Simulate a failure', paid: 'This order is already paid.', back: 'Back to the order', expired: 'This order is no longer waiting for payment.' },
};

export const GET: APIRoute = async (ctx) => {
  try {
    const token = ctx.url.searchParams.get('t');
    const o = load(String(ctx.params.code ?? ''), token);
    const lang: Lang = o.lang === 'en' ? 'en' : 'sq';
    const t = T[lang];
    const v = orderView(o, lang);
    const back = orderPageUrl(o, lang);
    const open = o.payment_status !== 'paid' && o.status === 'pending';
    const html = `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(t.title)} · ${esc(o.code)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<style>@view-transition{navigation:auto}@media (prefers-reduced-motion:reduce){@view-transition{navigation:none}}</style>
<style>
:root{--ink:#14211f;--salt:#f3efe6;--pouch:#a83c15;color-scheme:light}
*{box-sizing:border-box}body{margin:0;background:var(--salt);color:var(--ink);font:16px/1.5 system-ui,sans-serif;padding:16px}
main{max-width:520px;margin:8vh auto;border:1px solid var(--ink);padding:24px;background:#fff}
.badge{display:inline-block;border:2px solid var(--pouch);color:var(--pouch);font:600 12px/1 ui-monospace,monospace;letter-spacing:.06em;padding:8px 10px;text-transform:uppercase}
h1{font-size:28px;margin:16px 0 8px}dl{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;font-family:ui-monospace,monospace}dt{opacity:.7}
form{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}button,a.btn{min-height:44px;padding:0 20px;border-radius:99px;border:1px solid var(--ink);font:inherit;cursor:pointer;background:transparent;color:var(--ink);text-decoration:none;display:inline-flex;align-items:center}
button[value=paid]{background:var(--ink);color:var(--salt)}button:focus-visible,a:focus-visible{outline:2px solid var(--pouch);outline-offset:2px}
</style></head><body><main>
<span class="badge">${esc(t.badge)}</span>
<h1>${esc(t.title)}</h1>
<p>${esc(t.lead)}</p>
<dl><dt>${esc(t.order)}</dt><dd>${esc(o.code)}</dd><dt>${esc(t.total)}</dt><dd>${esc(money(v.total, lang))}</dd></dl>
${open
  ? `<form method="post" action="/api/pay/test/${esc(o.code)}"><input type="hidden" name="t" value="${esc(token)}"><button type="submit" name="outcome" value="paid">${esc(t.pay)}</button><button type="submit" name="outcome" value="failed">${esc(t.fail)}</button></form>`
  : `<p>${esc(o.payment_status === 'paid' ? t.paid : t.expired)}</p><p><a class="btn" href="${esc(back)}">${esc(t.back)}</a></p>`}
</main></body></html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    throw e;
  }
};

export const POST: APIRoute = async (ctx) => {
  try {
    if (!isSameOrigin(ctx.request, ctx.url)) throw E.crossSite();
    rateLimit('pay-test', clientIp(ctx), 30, 60_000);
    const form = new URLSearchParams(await readText(ctx.request, 2048));
    const token = String(form.get('t') ?? '');
    const outcome = String(form.get('outcome') ?? '');
    const o = load(String(ctx.params.code ?? ''), token);
    if (o.status === 'pending' && o.payment_status !== 'paid') {
      if (outcome === 'paid') markPaid(o.id, `TEST-${Date.now().toString(36).toUpperCase()}`);
      else markPaymentFailed(o.id);
    }
    const lang: Lang = o.lang === 'en' ? 'en' : 'sq';
    const dest = `${orderPageUrl(o, lang)}&pay=${outcome === 'paid' ? 'ok' : 'failed'}`;
    return new Response(null, { status: 303, headers: { Location: dest, 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    throw e;
  }
};
