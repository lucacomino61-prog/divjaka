import type { APIRoute } from 'astro';
import { E, handle, json, readJson, idParam } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { setMessageStatus } from '../../../../lib/db/repo/misc';
import { zMessagePatch } from '../../../../lib/admin-schemas';
import { get } from '../../../../lib/db/index';

/** PATCH /api/admin/messages/:id { status:'new'|'read'|'done' } → { item } */
export const PATCH: APIRoute = handle(async ({ locals, params, request }) => {
  requireAdmin(locals);
  const id = idParam(params.id);
  const b = await readJson(request, zMessagePatch);
  if (!setMessageStatus(id, b.status)) throw E.notFound();
  return json({ item: get('SELECT * FROM messages WHERE id = ?', id) });
});
