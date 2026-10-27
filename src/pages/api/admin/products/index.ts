import type { APIRoute } from 'astro';
import { E, handle, json, readJson } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { listProducts, createProduct, getProduct, setBundleItems, getProductBySlug, type Kind, type Status } from '../../../../lib/db/repo/products';
import { zProduct } from '../../../../lib/admin-schemas';
import { tx } from '../../../../lib/db/index';
import { fold } from '../../../../lib/text';
import { BUNDLE_STOCK, checkGiftPresets, checkProductRefs } from '../../../../lib/admin-schemas';
import { audit } from '../../../../lib/audit';
import { clientIp } from '../../../../lib/security';

/** GET /api/admin/products?kind&status&q → { items } (all statuses unless status given; both languages). */
export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  const sp = url.searchParams;
  const kind = (sp.get('kind') || undefined) as Kind | undefined;
  const status = (sp.get('status') || 'any') as Status | 'any';
  let items = listProducts({ kind, status });
  const q = sp.get('q');
  if (q) {
    const f = fold(q);
    items = items.filter((p) => fold(`${p.slug} ${p.name_sq} ${p.name_en}`).includes(f));
  }
  return json({ items });
});

/**
 * POST /api/admin/products → 201 { item, forced_draft? } (owner-created rows are not demo).
 * Prices are the owner's: a product created by STAFF is always saved as a draft (forced_draft:
 * true when they asked for 'published'); only the owner publishes it (PATCH status). Audited.
 */
export const POST: APIRoute = handle(async (ctx) => {
  const { locals, request } = ctx;
  const admin = requireAdmin(locals);
  const b = await readJson(request, zProduct, 256 * 1024);
  const forcedDraft = admin.role !== 'owner' && (b.status ?? 'draft') !== 'draft';
  if (admin.role !== 'owner') b.status = 'draft';
  if (getProductBySlug(b.slug)) throw E.conflict('slug_taken', 'Ky slug ekziston.', 'This slug already exists.');
  if (b.kind === 'bundle' && (b.stock === null || b.stock === undefined)) throw BUNDLE_STOCK();
  checkGiftPresets(b.options as Record<string, unknown> | undefined);
  checkProductRefs(b);
  const { bundle_items, ...data } = b;
  const id = tx(() => {
    const newId = createProduct({ ...data, demo: false, status: data.status ?? 'draft' });
    if (bundle_items && data.kind === 'bundle') setBundleItems(newId, bundle_items);
    return newId;
  });
  const item = getProduct(id)!;
  audit('product_create', { adminId: admin.id, ip: clientIp(ctx), detail: { product_id: id, slug: item.slug, status: item.status, price: item.price, compare_at: item.compare_at, ...(forcedDraft ? { forced_draft: true } : {}) } });
  return json({ item, ...(forcedDraft ? { forced_draft: true } : {}) }, { status: 201 });
});
