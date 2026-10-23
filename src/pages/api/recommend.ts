import type { APIRoute } from 'astro';
import { z } from 'zod';
import { handle, json, query, validate } from '../../lib/http';
import { recommend } from '../../lib/recommend';

const list = z.string().max(2000).optional().transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 30) : []));
const Q = z.object({
  lang: z.enum(['sq', 'en']).catch('sq'),
  interests: list,
  viewed: list,
  cart: list,
  exclude: list,
  kinds: list,
  limit: z.coerce.number().int().min(1).max(24).catch(6),
});

/** GET /api/recommend?lang&interests=a,b&viewed=s1,s2&cart=s3&exclude=s4&kinds=experience,goods&limit=6 → { items } */
export const GET: APIRoute = handle(async ({ url }) => {
  const q = validate(Q, query(url));
  const kinds = q.kinds.filter((k): k is 'room' | 'experience' | 'bundle' | 'gift' | 'goods' => ['room', 'experience', 'bundle', 'gift', 'goods'].includes(k));
  const items = recommend({ lang: q.lang, interests: q.interests, viewed: q.viewed, cart: q.cart, exclude: q.exclude, kinds, limit: q.limit });
  return json({ items: items.map(({ score: _s, ...rest }) => rest) });
});
