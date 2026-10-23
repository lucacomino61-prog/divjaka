import type { APIRoute } from 'astro';
import { handle, json } from '../../lib/http';
import { publicConfig } from '../../lib/config';

/** GET /api/config → public settings: payment methods (+ card mode), EUR rate, business contact fields that are filled in, social links. */
export const GET: APIRoute = handle(async () => json(publicConfig(), { cache: 'no-cache' }));
