import type { APIRoute } from 'astro';
import { handle, idParam, json, readJson } from '../../../../../lib/http';
import { reauthenticate, requireOwner, resetAccountPassword } from '../../../../../lib/auth';
import { zAccountPassword } from '../../../../../lib/admin-schemas';
import { clientIp } from '../../../../../lib/security';

/**
 * POST /api/admin/users/:id/password { password (12–200), current_password } → { ok }.
 * Owner only; sets another account's password (the owner hands it over in person) and ends
 * that account's sessions and remembered browsers. current_password is the owner's own,
 * checked by reauthenticate(). 409 own_account for the owner's own account (Settings → Your
 * password asks for the current one: POST /api/admin/password).
 */
export const POST: APIRoute = handle(async (ctx) => {
  const owner = requireOwner(ctx.locals);
  const id = idParam(ctx.params.id);
  const b = await readJson(ctx.request, zAccountPassword, 2048);
  const ip = clientIp(ctx);
  reauthenticate(owner, b.current_password, ip, 'account_password_reset');
  resetAccountPassword(owner, id, b.password, ip);
  return json({ ok: true });
});
