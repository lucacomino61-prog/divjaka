import type { APIRoute } from 'astro';
import { E, handle, json, readJson } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { listCategories } from '../../../../lib/db/repo/products';
import { createCategory, getCategory } from '../../../../lib/db/repo/misc';
import { zCategory } from '../../../../lib/admin-schemas';

/** GET /api/admin/categories → { items } */
export const GET: APIRoute = handle(async ({ locals }) => {
  requireAdmin(locals);
  return json({ items: listCategories() });
});

/** POST /api/admin/categories { id, name_sq, name_en, sort } → 201 { item } */
export const POST: APIRoute = handle(async ({ locals, request }) => {
  requireAdmin(locals);
  const b = await readJson(request, zCategory);
  if (getCategory(b.id)) throw E.conflict('exists', 'Kjo kategori ekziston.', 'This category already exists.');
  createCategory(b);
  return json({ item: getCategory(b.id) }, { status: 201 });
});
