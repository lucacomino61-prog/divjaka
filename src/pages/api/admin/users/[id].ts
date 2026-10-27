import type { APIRoute } from 'astro';
import { handle, idParam, json, readJson } from '../../../../lib/http';
import { requireOwner, updateAccount } from '../../../../lib/auth';
import { zAccountPatch } from '../../../../lib/admin-schemas';
import { clientIp } from '../../../../lib/security';

/**
 * PATCH /api/admin/users/:id { name?, role?: 'staff'|'owner', active?: boolean } → { item }.
 * Owner only. Disabling or demoting ends that user's sessions and remembered browsers.
 * 409 own_account (your own account cannot be disabled or demoted), 409 last_owner (the only
 * active owner cannot be disabled or demoted), 404 when the account does not exist.
 */
export const PATCH: APIRoute = handle(async (ctx) => {
  const owner = requireOwner(ctx.locals);
  const id = idParam(ctx.params.id);
  const b = await readJson(ctx.request, zAccountPatch, 2048);
  return json({ item: updateAccount(owner, id, b, clientIp(ctx)) });
});
