import type { APIRoute } from 'astro';
import { E, handle, json, readJson, idParam } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { getFaq, updateFaq, deleteFaq } from '../../../../lib/db/repo/misc';
import { zFaq } from '../../../../lib/admin-schemas';

/** PATCH /api/admin/faq/:id → { item } */
export const PATCH: APIRoute = handle(async ({ locals, params, request }) => {
  requireAdmin(locals);
  const id = idParam(params.id);
  if (!getFaq(id)) throw E.notFound();
  updateFaq(id, await readJson(request, zFaq.partial()));
  return json({ item: getFaq(id) });
});
export const PUT = PATCH;

/** DELETE /api/admin/faq/:id */
export const DELETE: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  if (!deleteFaq(idParam(params.id))) throw E.notFound();
  return json({ ok: true });
});
