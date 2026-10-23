import type { APIRoute } from 'astro';
import { E, handle, json, readJson } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { getCategory, updateCategory, deleteCategory } from '../../../../lib/db/repo/misc';
import { zCategory } from '../../../../lib/admin-schemas';

const Patch = zCategory.omit({ id: true }).partial();

/** PATCH /api/admin/categories/:id { name_sq?, name_en?, sort? } → { item } */
export const PATCH: APIRoute = handle(async ({ locals, params, request }) => {
  requireAdmin(locals);
  const id = String(params.id ?? '');
  if (!getCategory(id)) throw E.notFound();
  updateCategory(id, await readJson(request, Patch));
  return json({ item: getCategory(id) });
});
export const PUT = PATCH;

/** DELETE /api/admin/categories/:id — products keep existing with category NULL. */
export const DELETE: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  if (!deleteCategory(String(params.id ?? ''))) throw E.notFound();
  return json({ ok: true });
});
