import type { APIRoute } from 'astro';
import { E, handle, json, readJson } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { createSession, listSessions, getSession, type SessionStatus } from '../../../../lib/db/repo/sessions';
import { getProduct } from '../../../../lib/db/repo/products';
import { zSession } from '../../../../lib/admin-schemas';
import { all } from '../../../../lib/db/index';
import { DATE_RE } from '../../../../lib/time';

/**
 * GET /api/admin/sessions?product_id&from=YYYY-MM-DD&to=YYYY-MM-DD(exclusive)&status
 *   → { items:[{…session, slug, name_sq, left, guests:[{code, name, people, status}]}] }
 */
export const GET: APIRoute = handle(async ({ locals, url }) => {
  requireAdmin(locals);
  const sp = url.searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  const items = listSessions({
    product_id: Number(sp.get('product_id')) || undefined,
    from: from && DATE_RE.test(from) ? `${from}T00:00` : undefined,
    to: to && DATE_RE.test(to) ? `${to}T00:00` : undefined,
    status: (sp.get('status') || undefined) as SessionStatus | undefined,
  }).slice(0, 2000);
  const ids = items.map((s) => s.id);
  const guests = ids.length
    ? all<{ session_id: number; code: string; name: string; people: number; status: string }>(
        `SELECT i.session_id, o.code, o.name, COALESCE(i.guests, i.qty) AS people, o.status FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE i.session_id IN (${ids.map(() => '?').join(',')}) AND o.status != 'cancelled' ORDER BY o.created_at`,
        ...ids,
      )
    : [];
  const prods = new Map<number, { slug: string; name_sq: string }>();
  for (const s of items) if (!prods.has(s.product_id)) { const p = getProduct(s.product_id); if (p) prods.set(p.id, { slug: p.slug, name_sq: p.name_sq }); }
  return json({
    items: items.map((s) => ({ ...s, ...prods.get(s.product_id), left: Math.max(0, s.capacity - s.booked), guests: guests.filter((g) => g.session_id === s.id) })),
  });
});

/** POST /api/admin/sessions { product_id, starts_at 'YYYY-MM-DDTHH:MM', capacity, status?, note? } → 201 { item } */
export const POST: APIRoute = handle(async ({ locals, request }) => {
  requireAdmin(locals);
  const b = await readJson(request, zSession);
  const p = getProduct(b.product_id);
  if (!p || p.kind !== 'experience') throw E.bad('Produkti nuk është eksperiencë.', 'The product is not an experience.');
  const id = createSession(b);
  if (!id) throw E.conflict('exists', 'Ky orar ekziston tashmë.', 'This time slot already exists.');
  return json({ item: getSession(id) }, { status: 201 });
});
