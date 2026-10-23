import type { APIRoute } from 'astro';
import { E, handle, json, readJson } from '../../../../lib/http';
import { requireAdmin, requireOwner } from '../../../../lib/auth';
import { audit } from '../../../../lib/audit';
import { listOffers, createOffer, getOffer, offerByCode } from '../../../../lib/db/repo/offers';
import { zOffer } from '../../../../lib/admin-schemas';

/** GET /api/admin/offers → { items } (automatic offers first, then promo codes). */
export const GET: APIRoute = handle(async ({ locals }) => {
  requireAdmin(locals);
  return json({ items: listOffers() });
});

/** POST /api/admin/offers (owner only; codes ≥ 8 characters) { name_sq, name_en, type, value, scope, min_nights, min_total, starts_on, ends_on, code?, max_uses, active } → 201 { item } */
export const POST: APIRoute = handle(async ({ locals, request }) => {
  const admin = requireOwner(locals);
  const b = await readJson(request, zOffer);
  if (b.code && offerByCode(b.code)) throw E.conflict('code_taken', 'Ky kod ekziston.', 'This code already exists.');
  const id = createOffer({
    name_sq: b.name_sq ?? null, name_en: b.name_en ?? null, type: b.type, value: b.value, scope: b.scope ?? {},
    min_nights: b.min_nights ?? null, min_total: b.min_total ?? null, starts_on: b.starts_on ?? null, ends_on: b.ends_on ?? null,
    code: b.code || null, max_uses: b.max_uses ?? null, active: b.active ?? true, demo: false,
  });
  audit('offer_create', { adminId: admin.id, detail: { id, type: b.type, value: b.value, code: b.code || null } });
  return json({ item: getOffer(id) }, { status: 201 });
});
