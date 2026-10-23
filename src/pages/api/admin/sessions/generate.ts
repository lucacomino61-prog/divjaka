import type { APIRoute } from 'astro';
import { E, handle, json, readJson } from '../../../../lib/http';
import { requireAdmin } from '../../../../lib/auth';
import { createSession } from '../../../../lib/db/repo/sessions';
import { getProduct } from '../../../../lib/db/repo/products';
import { weeklySlots } from '../../../../lib/availability';
import { zGenerate } from '../../../../lib/admin-schemas';
import { tx } from '../../../../lib/db/index';
import { daysBetween, wallTimeExists } from '../../../../lib/time';

/**
 * POST /api/admin/sessions/generate { product_id, weekdays:[0=Sun…6], times:['09:00'], from, to (inclusive), capacity?, note? }
 * → { created, skipped } — existing slots (same product + time) are kept as they are; times that
 * do not exist on a daylight-saving day (02:00–02:59 on the last Sunday of March) are skipped.
 */
export const POST: APIRoute = handle(async ({ locals, request }) => {
  requireAdmin(locals);
  const b = await readJson(request, zGenerate);
  const p = getProduct(b.product_id);
  if (!p || p.kind !== 'experience') throw E.bad('Produkti nuk është eksperiencë.', 'The product is not an experience.');
  if (daysBetween(b.from, b.to) > 400) throw E.bad('Periudha është shumë e gjatë (maks. 400 ditë).', 'The period is too long (max 400 days).');
  const capacity = b.capacity ?? p.capacity ?? 10;
  // Times inside the spring-forward gap do not exist that day: they are skipped (counted in skipped).
  const slots = weeklySlots(b.weekdays, b.times, b.from, b.to);
  const real = slots.filter(wallTimeExists);
  const created = tx(() => real.reduce((n, starts_at) => n + (createSession({ product_id: p.id, starts_at, capacity, note: b.note ?? null }) ? 1 : 0), 0));
  return json({ created, skipped: slots.length - created });
});
