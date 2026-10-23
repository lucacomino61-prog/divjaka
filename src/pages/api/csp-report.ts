import type { APIRoute } from 'astro';
import { readText } from '../../lib/http';
import { clientIp, rateLimit } from '../../lib/security';

const noContent = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

/**
 * POST /api/csp-report — browsers report CSP violations here (report-uri). Logged to the server
 * console (blocked URI / directive / source file only), never stored. Always 204.
 */
export const POST: APIRoute = async (ctx) => {
  try {
    rateLimit('csp-report', clientIp(ctx), 20, 60_000);
    const text = await readText(ctx.request, 8 * 1024);
    const r = (JSON.parse(text || '{}') as { 'csp-report'?: Record<string, unknown> })['csp-report'] ?? {};
    const pick = (k: string) => String(r[k] ?? '').slice(0, 200);
    console.warn('[csp] violation', JSON.stringify({ directive: pick('violated-directive'), blocked: pick('blocked-uri'), page: pick('document-uri').replace(/\?.*$/, ''), source: pick('source-file'), line: r['line-number'] ?? null }));
  } catch { /* oversized, malformed or rate-limited: ignore */ }
  return noContent();
};
