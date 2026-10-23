import type { APIRoute } from 'astro';
import { handle, json } from '../../lib/http';
import { getLive } from '../../lib/live';

/** GET /api/live → live conditions (Open-Meteo, cached 10 min) + today's availability. */
export const GET: APIRoute = handle(async () => {
  const data = await getLive();
  return json(data, { cache: 'public, max-age=60' });
});
