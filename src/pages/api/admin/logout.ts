import type { APIRoute } from 'astro';
import { handle, json } from '../../../lib/http';
import { destroySession } from '../../../lib/auth';

/** POST /api/admin/logout → { ok } and the cookie is cleared. */
export const POST: APIRoute = handle(async (ctx) => {
  destroySession(ctx.cookies, ctx.locals.https);
  return json({ ok: true });
});
