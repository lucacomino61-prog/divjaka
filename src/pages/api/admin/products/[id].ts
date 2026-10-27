import type { APIRoute } from 'astro';
import { E, handle, json, readJson, idParam } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { getProduct, updateProduct, bundleItems, setBundleItems, getProductBySlug } from '../../../../lib/db/repo/products';
import { listRates } from '../../../../lib/db/repo/rooms';
import { nextSessions } from '../../../../lib/availability';
import { zProductPatch, BUNDLE_STOCK, checkGiftPresets, checkProductRefs } from '../../../../lib/admin-schemas';
import { tx, get, all } from '../../../../lib/db/index';
import { logInventory } from '../../../../lib/db/repo/misc';
import { audit } from '../../../../lib/audit';
import { clientIp } from '../../../../lib/security';
import { today } from '../../../../lib/time';

const load = (raw: unknown) => {
  const p = getProduct(idParam(raw));
  if (!p) throw E.notFound('Produkti nuk u gjet.', 'Product not found.');
  return p;
};

/** GET /api/admin/products/:id → { item, bundle, rates, sessions, orders } */
export const GET: APIRoute = handle(async ({ locals, params }) => {
  requireAdmin(locals);
  const p = load(params.id);
  const orders = Number(get<{ n: number }>("SELECT COUNT(DISTINCT order_id) AS n FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.product_id = ? AND o.status != 'cancelled'", p.id)?.n ?? 0);
  return json({
    item: p,
    bundle: p.kind === 'bundle' ? bundleItems(p.id) : [],
    rates: p.kind === 'room' ? listRates(p.id) : [],
    sessions: p.kind === 'experience' ? nextSessions(p.id, 20) : [],
    orders,
  });
});

/** options keys that change what a guest pays or must buy: owner-only, like price. */
// amount_presets (T6 fix round 3): the gift card's suggested amounts set the default a guest pays
const PRICE_OPTIONS = ['amount_min', 'amount_max', 'amount_step', 'amount_presets', 'min_nights'];

const OWNER_ONLY = () => E.forbidden('Vetëm pronari mund ta bëjë këtë (çmimet dhe publikimi).', 'Only the owner can do this (prices and publishing).');

/**
 * PUT/PATCH /api/admin/products/:id (partial) → { item }. The DEMO flag is cleared only when the
 * OWNER sends verify_demo: true ("price, units and capacity are real"); any other save keeps it, so
 * a staff edit or a reorder never turns invented demo values into "verified" ones (PLAN §2/§7).
 * Owner-only (403 for staff): price, compare_at, the price-affecting options (gift amount
 * min/max/step, suggested amounts, min_nights), publishing (status → 'published'), and taking a published product
 * off sale (status → draft/archived). Every one of these is audited.
 * A room's units can never go below what is already booked or closed on a night from today on:
 * 409 below_booked { nights:[{night, booked, closed}] } — close single nights instead
 * (POST /api/admin/room-nights), then lower the units once those nights are past.
 */
const save: APIRoute = handle(async (ctx) => {
  const { locals, params, request } = ctx;
  const admin = requireAdmin(locals);
  const p = load(params.id);
  const b = await readJson(request, zProductPatch, 256 * 1024);
  if (b.slug && b.slug !== p.slug && getProductBySlug(b.slug)) throw E.conflict('slug_taken', 'Ky slug ekziston.', 'This slug already exists.');
  if (b.kind && b.kind !== p.kind) throw E.bad('Lloji i produktit nuk mund të ndryshohet.', 'The product kind cannot be changed.');
  if (p.kind === 'bundle' && b.stock === null) throw BUNDLE_STOCK();
  if (b.options !== undefined) checkGiftPresets(b.options as Record<string, unknown>);
  checkProductRefs(b, p.id);
  const priceChange = (b.price !== undefined && b.price !== p.price) || (b.compare_at !== undefined && b.compare_at !== p.compare_at);
  const optChanged = b.options !== undefined
    ? PRICE_OPTIONS.filter((k) => JSON.stringify((b.options as Record<string, unknown>)[k]) !== JSON.stringify((p.options as Record<string, unknown>)[k]))
    : [];
  const statusChange = b.status !== undefined && b.status !== p.status && (b.status === 'published' || p.status === 'published');
  if ((priceChange || optChanged.length || statusChange || b.verify_demo) && admin.role !== 'owner') throw OWNER_ONLY();
  const { bundle_items, verify_demo, ...data } = b;
  tx(() => {
    if (p.kind === 'room' && data.units !== undefined && (data.units ?? 0) < (p.units ?? 0)) {
      const next = data.units ?? 0;
      const over = all<{ night: string; booked: number; closed: number }>(
        'SELECT night, booked, closed FROM room_nights WHERE product_id = ? AND night >= ? AND booked + closed > ? ORDER BY night LIMIT 60',
        p.id, today(), next,
      );
      if (over.length) {
        throw E.conflict('below_booked',
          `Ka ${over.length}${over.length === 60 ? '+' : ''} netë me më shumë dhoma të rezervuara ose të mbyllura se ${next}. Mbyllni netët e veçanta te „Netët e dhomave“ në vend të kësaj.`,
          `${over.length}${over.length === 60 ? '+' : ''} night(s) have more rooms booked or closed than ${next}. Close single nights under “Room nights” instead.`,
          { nights: over });
      }
    }
    updateProduct(p.id, verify_demo ? { ...data, demo: false } : data);
    if (bundle_items && p.kind === 'bundle') setBundleItems(p.id, bundle_items);
    if (data.stock !== undefined && data.stock !== p.stock) {
      logInventory({ product_id: p.id, delta: (data.stock ?? 0) - (p.stock ?? 0), reason: 'admin_stock', admin_id: admin.id });
    }
  });
  if (priceChange) audit('price_change', { adminId: admin.id, ip: clientIp(ctx), detail: { product_id: p.id, from: { price: p.price, compare_at: p.compare_at }, to: { price: b.price ?? p.price, compare_at: b.compare_at !== undefined ? b.compare_at : p.compare_at } } });
  if (optChanged.length) {
    const o = p.options as Record<string, unknown>, n = b.options as Record<string, unknown>;
    audit('price_options_change', { adminId: admin.id, ip: clientIp(ctx), detail: { product_id: p.id, keys: optChanged, from: Object.fromEntries(optChanged.map((k) => [k, o[k] ?? null])), to: Object.fromEntries(optChanged.map((k) => [k, n[k] ?? null])) } });
  }
  if (verify_demo && p.demo) audit('demo_verified', { adminId: admin.id, ip: clientIp(ctx), detail: { product_id: p.id } });
  if (b.status !== undefined && b.status !== p.status) audit('product_status', { adminId: admin.id, ip: clientIp(ctx), detail: { product_id: p.id, from: p.status, to: b.status } });
  if (p.kind === 'room' && data.units !== undefined && data.units !== p.units) audit('units_change', { adminId: admin.id, ip: clientIp(ctx), detail: { product_id: p.id, from: p.units, to: data.units } });
  return json({ item: getProduct(p.id) });
});
export const PUT = save;
export const PATCH = save;

/** DELETE /api/admin/products/:id → archives (orders keep their history). Archiving a published product is owner-only; audited. */
export const DELETE: APIRoute = handle(async (ctx) => {
  const admin = requireAdmin(ctx.locals);
  const p = load(ctx.params.id);
  if (p.status === 'published' && admin.role !== 'owner') throw OWNER_ONLY();
  updateProduct(p.id, { status: 'archived' });
  if (p.status !== 'archived') audit('product_status', { adminId: admin.id, ip: clientIp(ctx), detail: { product_id: p.id, from: p.status, to: 'archived' } });
  return json({ ok: true, item: getProduct(p.id) });
});
