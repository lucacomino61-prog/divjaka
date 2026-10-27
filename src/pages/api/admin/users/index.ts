import type { APIRoute } from 'astro';
import { handle, json, readJson } from '../../../../lib/http';
import { addAccount, reauthenticate, requireOwner } from '../../../../lib/auth';
import { listAccounts } from '../../../../lib/db/repo/users';
import { zAccountCreate } from '../../../../lib/admin-schemas';
import { clientIp } from '../../../../lib/security';

/**
 * GET /api/admin/users → { items: [{ id, email, name, role, created_at, disabled_at, last_sign_in }] }
 * Owner only (403 for staff). Never returns password hashes.
 */
export const GET: APIRoute = handle(async ({ locals }) => {
  requireOwner(locals);
  return json({ items: listAccounts() });
});

/**
 * POST /api/admin/users { name, email, role: 'staff'|'owner', password (12–200), current_password }
 * → 201 { item }. Owner only. The site sends no e-mail: the owner hands the password over in
 * person. current_password is the owner's own password, checked by reauthenticate() (429 after 5
 * wrong per user / 10 per address in 15 min, 5 wrong in a row end the owner's sessions; correct
 * answers are not counted). 409 email_taken when the
 * e-mail (any case) already has an account.
 */
export const POST: APIRoute = handle(async (ctx) => {
  const owner = requireOwner(ctx.locals);
  const b = await readJson(ctx.request, zAccountCreate, 4096);
  const ip = clientIp(ctx);
  reauthenticate(owner, b.current_password, ip, 'account_create');
  const item = addAccount(owner, b, ip);
  return json({ item }, { status: 201 });
});
