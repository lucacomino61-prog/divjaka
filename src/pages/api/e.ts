import type { APIRoute } from 'astro';
import { readText } from '../../lib/http';
import { recordEvent, zEvent } from '../../lib/analytics';
import { clientIp, rateLimit } from '../../lib/security';

const MAX = 4 * 1024;
const BATCH = 10;
const PER_MINUTE = 120;
const noContent = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

/**
 * POST /api/e — analytics beacon (application/json or text/plain from sendBeacon).
 * Always 204 (invalid, oversized, rate-limited and bot hits are dropped silently).
 * Accepts one event or { batch: [events…] } (≤ 10). The body is read through a 4 KB cap that
 * stops reading as soon as it is passed (chunked uploads included).
 * Limits: 120 EVENTS (not requests) a minute per address (IPv6 per /64); per day: 400 per browsing tab,
 * settings.privacy.events_per_address_day per address group (then 1 in 20), own budgets for
 * search / assistant / vital events, and
 * day, settings.privacy.events_per_day for the whole site (src/lib/analytics.ts).
 */
export const POST: APIRoute = async (ctx) => {
  const ip = clientIp(ctx);
  try {
    rateLimit('e', ip, PER_MINUTE, 60_000, 0);
  } catch {
    return noContent();
  }
  let text = '';
  try {
    text = await readText(ctx.request, MAX);
  } catch {
    return noContent();
  }
  if (!text) return noContent();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return noContent();
  }
  const list = Array.isArray((raw as { batch?: unknown[] })?.batch) ? (raw as { batch: unknown[] }).batch.slice(0, BATCH) : [raw];
  // Every event in the batch is charged against the per-address budget; once it is spent the
  // rest of the batch is dropped.
  let allowed = 0;
  for (let i = 0; i < list.length; i++) {
    try { rateLimit('e', ip, PER_MINUTE, 60_000); allowed++; } catch { break; }
  }
  const ua = ctx.request.headers.get('user-agent');
  for (const item of list.slice(0, allowed)) {
    const r = zEvent.safeParse(item);
    if (!r.success) continue;
    try {
      recordEvent(r.data, { ua, host: ctx.url.host, ip });
    } catch (e) {
      console.error('[e]', e);
    }
  }
  return noContent();
};
