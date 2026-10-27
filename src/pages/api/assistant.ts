import type { APIRoute } from 'astro';
import { handle, json, readJson } from '../../lib/http';
import { answer, zAssistantBody } from '../../lib/assistant/index';
import { clientIp, rateLimit } from '../../lib/security';
import { sessionUser } from '../../lib/auth';

/**
 * POST /api/assistant { lang, message, context?: {path, product, interests, cart, history, sid}, contact?: {name, email, phone, question} }
 * → { reply, chips, links:[{label,url}], products:[…], intent, handoff, dates? }
 * Limits: 30 messages a minute per address; 5 contact hand-offs per 10 minutes; Claude calls
 * have their own daily / hourly caps (src/lib/assistant/claude.ts).
 */
export const POST: APIRoute = handle(async (ctx) => {
  const ip = clientIp(ctx);
  rateLimit('assistant', ip, 30, 60_000);
  const body = await readJson(ctx.request, zAssistantBody, 16 * 1024);
  if (body.contact) rateLimit('assistant-contact', ip, 5, 10 * 60_000);
  // The admin's test box (T6) marks its questions; only honoured for a signed-in admin session.
  // The middleware resolves locals.admin for /admin and /api/admin only, so read the session here.
  let noTrack = false;
  if (ctx.request.headers.get('x-dv-admin-test') === '1') {
    try { noTrack = !!(ctx.locals.admin ?? sessionUser(ctx.cookies, ctx.locals.https)); } catch { noTrack = false; }
  }
  return json(await answer(body, { ua: ctx.request.headers.get('user-agent'), ip, noTrack }));
});
