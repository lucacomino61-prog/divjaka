import type { APIRoute } from 'astro';
import { z } from 'zod';
import { ApiError, handle, json, readJson, zEmail } from '../../../lib/http';
import { checkCredentials, createSession, isKnownDevice, rememberDevice } from '../../../lib/auth';
import { clientIp, loginGate, loginResult, takeLoginCeilingAudit } from '../../../lib/security';
import { audit } from '../../../lib/audit';
import { get } from '../../../lib/db/index';

const Body = z.object({ email: zEmail, password: z.string().min(1).max(200) });

/**
 * POST /api/admin/login { email, password } → { user } + dv_admin cookie (+ dv_device, the
 * known-device cookie that keeps this browser able to sign in while someone guesses passwords).
 * Throttle (src/lib/security.ts loginGate): 20 tries/min per address, 5 failures/min per
 * address+e-mail, 60 password checks/min sitewide (10 per address group), and after 10 failures
 * in 15 min one try per 30 s for that e-mail from anywhere — only the first applies to a known
 * device of that account. Hitting the sitewide ceiling is audited (login_ceiling_hit).
 * Locked out on every device? `node scripts/seed.mjs --sync-admin` on the server resets the
 * password from .env (README → Admin).
 */
export const POST: APIRoute = handle(async (ctx) => {
  const ip = clientIp(ctx);
  const b = await readJson(ctx.request, Body, 2048);
  const known = isKnownDevice(ctx.cookies, b.email);
  try {
    loginGate(ip, b.email, known);
  } catch (e) {
    if (takeLoginCeilingAudit()) audit('login_ceiling_hit', { ip });
    throw e;
  }
  const user = checkCredentials(b.email, b.password);
  const outcome = loginResult(ip, b.email, !!user);
  if (!user) {
    // Only failures against a real admin account are worth a row (sprayed unknown addresses are not).
    const target = get<{ id: number }>('SELECT id FROM admin_users WHERE email = ? COLLATE NOCASE', b.email.trim());
    if (target && outcome === 'lockout') audit('login_lockout', { adminId: target.id, ip });
    else if (target && outcome === 'first_fail') audit('login_fail', { adminId: target.id, ip, detail: { known_device: known } });
    throw new ApiError(401, 'bad_credentials', 'Email ose fjalëkalim i gabuar.', 'Wrong e-mail or password.');
  }
  createSession(user.id, ctx.cookies, ctx.locals.https);
  rememberDevice(user.id, ctx.cookies, ctx.locals.https);
  audit('login_ok', { adminId: user.id, ip, detail: { known_device: known } });
  return json({ user });
});
