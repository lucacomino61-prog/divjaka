import type { APIRoute } from 'astro';
import { handle, json, readJson } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { listFaq, createFaq, getFaq } from '../../../../lib/db/repo/misc';
import { zFaq } from '../../../../lib/admin-schemas';

/** GET /api/admin/faq → { items } */
export const GET: APIRoute = handle(async ({ locals }) => {
  requireAdmin(locals);
  return json({ items: listFaq() });
});

/** POST /api/admin/faq { q_sq, q_en, a_sq, a_en, keywords, links, sort, active } → 201 { item } */
export const POST: APIRoute = handle(async ({ locals, request }) => {
  requireAdmin(locals);
  const b = await readJson(request, zFaq);
  return json({ item: getFaq(createFaq(b)) }, { status: 201 });
});
