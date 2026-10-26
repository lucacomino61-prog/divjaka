import type { APIRoute } from 'astro';
import { handle, json } from '../../lib/http';
import { getLive } from '../../lib/live';

/**
 * GET /api/live → live conditions + today's availability (src/lib/live.ts): weather from MET Norway
 * (cached until MET's Expires, at least 10 min), sea from NASA JPL MUR via NOAA ERDDAP, sun computed
 * locally, air/waves/UV only with OPEN_METEO_API_KEY (commercial endpoints). Every provider is in
 * `sources[]` with its licence.
 */
export const GET: APIRoute = handle(async () => {
  const data = await getLive();
  return json(data, { cache: 'public, max-age=60' });
});
