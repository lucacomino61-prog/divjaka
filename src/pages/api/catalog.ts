import type { APIRoute } from 'astro';
import { z } from 'zod';
import { handle, json, query, validate } from '../../lib/http';
import { catalog } from '../../lib/catalog';
import { cached } from '../../lib/cache';

const Q = z.object({
  lang: z.enum(['sq', 'en']).catch('sq'),
  kind: z.enum(['room', 'experience', 'bundle', 'gift', 'goods']).optional().catch(undefined),
  category: z.string().max(40).optional(),
  tag: z.string().max(30).optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(['featured', 'price', '-price', 'name', 'new']).optional().catch(undefined),
  ids: z.string().max(2000).optional(),
  featured: z.enum(['1', 'true']).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(200).optional().catch(undefined),
});

/** GET /api/catalog?lang&kind&category&tag&q&sort&ids=slug1,slug2&featured=1&limit */
export const GET: APIRoute = handle(async ({ url }) => {
  const q = validate(Q, query(url));
  // Server cache (10 s, dropped on any DB write) + a short browser/proxy cache: the data is public.
  const data = cached(`catalog|${JSON.stringify(q)}`, () => catalog({
    lang: q.lang, kind: q.kind, category: q.category, tag: q.tag, q: q.q, sort: q.sort,
    slugs: q.ids ? q.ids.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100) : undefined,
    featured: !!q.featured, limit: q.limit,
  }));
  return json(data, { cache: 'public, max-age=15' });
});
