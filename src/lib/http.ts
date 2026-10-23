/**
 * JSON responses and errors for every API route.
 * Error shape (PLAN §6): { error: { code, message_sq, message_en, fields? } }
 */
import { z, type ZodType } from 'zod';
import type { APIContext } from 'astro';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public message_sq: string,
    public message_en: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message_en);
  }
}

const NO_STORE = { 'Cache-Control': 'no-store' };

export function json(data: unknown, init: ResponseInit & { cache?: string } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', init.cache ?? NO_STORE['Cache-Control']);
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

export function errorResponse(e: ApiError): Response {
  return json(
    { error: { code: e.code, message_sq: e.message_sq, message_en: e.message_en, ...(e.extra ?? {}) } },
    { status: e.status },
  );
}

export const E = {
  bad: (msg_sq = 'Kërkesë e pavlefshme.', msg_en = 'Invalid request.', extra?: Record<string, unknown>) =>
    new ApiError(400, 'bad_request', msg_sq, msg_en, extra),
  notFound: (what_sq = 'Nuk u gjet.', what_en = 'Not found.') => new ApiError(404, 'not_found', what_sq, what_en),
  unauthorized: () => new ApiError(401, 'unauthorized', 'Duhet të hyni në llogari.', 'Sign-in required.'),
  forbidden: (msg_sq = 'Veprim i ndaluar.', msg_en = 'Forbidden.') => new ApiError(403, 'forbidden', msg_sq, msg_en),
  crossSite: () =>
    new ApiError(403, 'cross_site', 'Kërkesa nuk vjen nga ky sajt.', 'This request did not come from this site.'),
  rate: (retryAfter: number) =>
    new ApiError(429, 'rate_limited', 'Shumë kërkesa. Provoni pas pak.', 'Too many requests. Try again shortly.', { retry_after: retryAfter }),
  conflict: (code: string, msg_sq: string, msg_en: string, extra?: Record<string, unknown>) =>
    new ApiError(409, code, msg_sq, msg_en, extra),
  tooLarge: () => new ApiError(413, 'too_large', 'Të dhënat janë shumë të mëdha.', 'Payload too large.'),
  unavailable: (msg_sq = 'Shërbimi nuk është i disponueshëm tani.', msg_en = 'Service unavailable right now.') =>
    new ApiError(503, 'unavailable', msg_sq, msg_en),
};

/** Wrap a handler: ApiError → JSON error, anything else → 500 (logged, no details leaked). */
export function handle(fn: (ctx: APIContext) => Promise<Response> | Response) {
  return async (ctx: APIContext): Promise<Response> => {
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e);
      console.error('[api]', e);
      return errorResponse(new ApiError(500, 'server_error', 'Gabim në server. Provoni përsëri.', 'Server error. Please try again.'));
    }
  };
}

/**
 * Read a request body with a hard byte cap. Content-Length above the cap is refused before
 * reading; a chunked body (no length) is counted while it streams and the stream is cancelled
 * the moment it passes the cap, so an oversized body is never held in memory. Throws 413.
 */
export async function readCapped(request: Request, maxBytes: number): Promise<Buffer> {
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared.trim()) || Number(declared) > maxBytes)) throw E.tooLarge();
  const body = request.body;
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      n += value.byteLength;
      if (n > maxBytes) {
        reader.cancel().catch(() => {});
        throw E.tooLarge();
      }
      parts.push(value);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* cancelled */ }
  }
  return Buffer.concat(parts, n);
}

/** Capped body as UTF-8 text. */
export async function readText(request: Request, maxBytes: number): Promise<string> {
  return (await readCapped(request, maxBytes)).toString('utf8');
}

/** Read a JSON body with a byte cap, then validate with zod. */
export async function readJson<T>(request: Request, schema: ZodType<T>, maxBytes = 64 * 1024): Promise<T> {
  const text = await readText(request, maxBytes);
  let raw: unknown;
  try {
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw E.bad('JSON i pavlefshëm.', 'Invalid JSON.');
  }
  return validate(schema, raw);
}

export function validate<T>(schema: ZodType<T>, raw: unknown): T {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const fields = r.error.issues.slice(0, 20).map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw E.bad('Disa fusha nuk janë të sakta.', 'Some fields are not valid.', { fields });
  }
  return r.data;
}

/** Query string → plain object (first value of each key). */
export function query(url: URL): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of url.searchParams) if (!(k in o)) o[k] = v;
  return o;
}

export const zLang = z.enum(['sq', 'en']).catch('sq');

/** Trimmed e-mail (zod 4: z.email() after trimming). */
export const zEmail = z.string().trim().max(200).pipe(z.email());

/**
 * Single-line text from a visitor (names, phones, countries): trimmed, no control characters
 * (CR/LF/TAB included — they break CSV exports and e-mail headers).
 */
// eslint-disable-next-line no-control-regex
const CONTROL = new RegExp('[\x00-\x1f\x7f-\x9f' + String.fromCharCode(0x2028, 0x2029) + ']');
export const zLine = (max: number) => z.string().trim().max(max).refine((s) => !CONTROL.test(s), 'control_characters');

/** ?limit= → integer in [1, max] (default def); never 0 or negative (SQLite LIMIT -1 = no limit). */
export function limitParam(raw: string | null, def: number, max: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? Math.min(max, n) : def;
}

/** ?offset= → integer ≥ 0. */
export function offsetParam(raw: string | null): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000_000) : 0;
}

/** Numeric route param → positive integer, else 404. */
export function idParam(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw E.notFound();
  return n;
}
export const zId = z.coerce.number().int().positive();
