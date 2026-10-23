import type { APIRoute } from 'astro';
import { z } from 'zod';
import { handle, json, readJson } from '../../../lib/http';
import { changePassword, createSession, reauthenticate, rememberDevice, requireAdmin } from '../../../lib/auth';
import { audit } from '../../../lib/audit';
import { clientIp } from '../../../lib/security';

const Body = z.object({ current: z.string().min(1).max(200), next: z.string().min(12).max(200) });

/**
 * POST /api/admin/password { current, next (≥ 12 chars) } → signs out every session and forgets
 * every remembered browser, then opens a new session on this one. Any admin (owner or staff)
 * may change their OWN password; it never touches another account.
 * The current password is checked through reauthenticate() (src/lib/auth.ts): 5 checks per user
 * and 10 per address in 15 minutes (429), failures audited, 5 wrong in a row end every session
 * of the user (401).
 */
export const POST: APIRoute = handle(async (ctx) => {
  const user = requireAdmin(ctx.locals);
  const b = await readJson(ctx.request, Body, 2048);
  const ip = clientIp(ctx);
  reauthenticate(user, b.current, ip, 'password_change');
  changePassword(user.id, b.current, b.next);
  createSession(user.id, ctx.cookies, ctx.locals.https);
  rememberDevice(user.id, ctx.cookies, ctx.locals.https);
  audit('password_change', { adminId: user.id, ip });
  return json({ ok: true });
});
