import type { APIRoute } from 'astro';
import { handle, json, zLang } from '../../lib/http';
import { search } from '../../lib/search';
import { serverEvent } from '../../lib/analytics';
import { clientIp, rateLimit } from '../../lib/security';

/**
 * GET /api/search?q&lang[&track=1&sid=…] → { results:[{type:'product'|'article'|'faq'|'page', title, url, snippet}] }
 * With track=1 the search is logged as a 'search' event {q, n} (send it once per submitted
 * query, not per keystroke) — zero-result terms show up in the admin analytics.
 */
export const GET: APIRoute = handle(async (ctx) => {
  rateLimit('search', clientIp(ctx), 120, 60_000);
  const sp = ctx.url.searchParams;
  const q = (sp.get('q') ?? '').slice(0, 100);
  const lang = zLang.parse(sp.get('lang') ?? 'sq');
  const results = q.trim().length >= 2 ? search(q, lang, 20).map(({ score: _s, ...r }) => r) : [];
  if (sp.get('track') === '1' && q.trim().length >= 2) {
    const sid = (sp.get('sid') ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || null;
    serverEvent('search', { lang, sid, ip: clientIp(ctx), ua: ctx.request.headers.get('user-agent'), meta: { q: q.trim().toLowerCase().slice(0, 100), n: results.length } });
  }
  return json({ results }, { cache: 'no-cache' });
});
