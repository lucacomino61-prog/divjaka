/**
 * Security helpers: same-origin checks for state-changing requests, in-memory rate limits,
 * client address behind a proxy, response security headers (CSP with build-time hashes of
 * the inline scripts authored in .astro files: src/lib/csp.ts).
 *
 * Proxy contract (README → Deployment): TLS terminates at the reverse proxy, which APPENDS the
 * client address to X-Forwarded-For (or overwrites a header named in CLIENT_IP_HEADER, e.g.
 * X-Real-IP or CF-Connecting-IP) and sets X-Forwarded-Proto. Set TRUST_PROXY=1 there.
 */
import { E } from './http';
import { configuredOrigin } from './urls';

const trustProxy = () => process.env.TRUST_PROXY === '1';

/**
 * Origins a same-origin request may carry: the request's own origin (scheme from
 * X-Forwarded-Proto behind a trusted proxy, else the URL's; host from X-Forwarded-Host behind a
 * trusted proxy, else the Host header) and the configured public origin (settings.seo.site_url).
 * Astro's url.origin is also accepted: in production it is http://localhost:PORT, which a
 * browser only sends when it really is on that origin.
 */
export function expectedOrigins(request: Request, url: URL): Set<string> {
  const h = request.headers;
  const out = new Set<string>([url.origin]);
  const fwdProto = trustProxy() ? h.get('x-forwarded-proto')?.split(',')[0].trim().toLowerCase() : null;
  const proto = fwdProto === 'https' || fwdProto === 'http' ? fwdProto : url.protocol.replace(':', '');
  const fwdHost = trustProxy() ? h.get('x-forwarded-host')?.split(',')[0].trim() : null;
  const host = fwdHost || h.get('host');
  if (host && /^[a-z0-9.[\]:-]+$/i.test(host)) out.add(`${proto}://${host.toLowerCase()}`);
  try {
    const conf = configuredOrigin();
    if (conf) out.add(new URL(conf).origin);
  } catch { /* DB not ready */ }
  return out;
}

/**
 * Same-origin check for mutations.
 *  - Sec-Fetch-Site present: must be exactly 'same-origin'.
 *  - Absent (older browsers, server-to-server tests): Origin must be present and its FULL origin
 *    (scheme, host and port) must be one of expectedOrigins(). Origin 'null' never passes.
 */
export function isSameOrigin(request: Request, url: URL): boolean {
  const sfs = request.headers.get('sec-fetch-site');
  if (sfs) return sfs === 'same-origin';
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return false;
  try {
    return expectedOrigins(request, url).has(new URL(origin).origin.toLowerCase());
  } catch {
    return false;
  }
}

export function assertSameOrigin(request: Request, url: URL): void {
  if (!isSameOrigin(request, url)) throw E.crossSite();
}

const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];

/**
 * Replacement for Astro's built-in security.checkOrigin (switched off in astro.config.mjs, because
 * it compares against url.origin, which is http://localhost:PORT in production, and answers in
 * text/plain). Same scope as Astro's: unsafe methods with a body a cross-site HTML form can send.
 * Requests without Sec-Fetch-Site and without Origin pass (non-browser clients), as in Astro.
 */
export function isForbiddenCrossSiteForm(request: Request, url: URL): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return false;
  const ct = (request.headers.get('content-type') || '').toLowerCase();
  if (ct && !FORM_TYPES.some((t) => ct.includes(t))) return false;
  const sfs = request.headers.get('sec-fetch-site');
  if (sfs) return !(sfs === 'same-origin' || sfs === 'none');
  const origin = request.headers.get('origin');
  if (!origin) return false;
  if (origin === 'null') return true;
  try {
    return !expectedOrigins(request, url).has(new URL(origin).origin.toLowerCase());
  } catch {
    return true;
  }
}

/**
 * Fixed-window limiter keyed by bucket + client. RATE_LIMIT_FACTOR (env, default 1) multiplies
 * every limit — only for test servers that replay many checkouts from one address.
 * Memory: expired windows are dropped by a timer every minute; past MAX_KEYS live keys the
 * oldest are evicted (a Map keeps insertion order), so an address-rotating client costs O(1)
 * per request, never a full scan.
 */
interface Bucket { n: number; until: number }
const G = globalThis as unknown as { __dvRate?: Map<string, Bucket>; __dvWarned?: Set<string>; __dvRatePrune?: ReturnType<typeof setInterval> };
const buckets = G.__dvRate ?? (G.__dvRate = new Map());
const warned = G.__dvWarned ?? (G.__dvWarned = new Set());
const MAX_KEYS = 50_000;

if (G.__dvRatePrune) clearInterval(G.__dvRatePrune);
G.__dvRatePrune = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.until <= now) buckets.delete(k);
}, 60_000);
G.__dvRatePrune.unref?.();

export const rateFactor = () => {
  const f = Number(process.env.RATE_LIMIT_FACTOR || 1);
  return Number.isFinite(f) && f >= 1 ? f : 1;
};

/** RATE_LIMIT_FACTOR is for test servers only; a production server with it set has weak limits. */
export const rateFactorWarning = (): boolean => rateFactor() > 1 && !import.meta.env.DEV;
if (rateFactorWarning()) {
  console.warn(`[security] RATE_LIMIT_FACTOR=${rateFactor()} multiplies every rate limit and abuse ceiling. Remove it from a production server (README → Deployment).`);
}

function bucketFor(key: string, windowMs: number, now: number): Bucket {
  let b = buckets.get(key);
  if (!b || b.until <= now) {
    if (b) buckets.delete(key);
    b = { n: 0, until: now + windowMs };
    buckets.set(key, b);
    if (buckets.size > MAX_KEYS) {
      let drop = Math.ceil(MAX_KEYS / 10);
      for (const k of buckets.keys()) { if (drop-- <= 0) break; if (k !== key) buckets.delete(k); }
    }
  }
  return b;
}

/** Count `cost` against the window; throws 429 once the total passes max. */
export function rateLimit(bucket: string, client: string, max: number, windowMs: number, cost = 1): void {
  const now = Date.now();
  const b = bucketFor(`${bucket}:${client}`, windowMs, now);
  b.n += cost;
  if (b.n > max * rateFactor()) throw E.rate(Math.ceil((b.until - now) / 1000));
}

/** Throws 429 when spending `cost` would pass max, WITHOUT spending (spend later with rateLimit). */
export function rateCheck(bucket: string, client: string, max: number, cost = 1): void {
  const now = Date.now();
  const b = buckets.get(`${bucket}:${client}`);
  if (b && b.until > now && b.n + cost > max * rateFactor()) throw E.rate(Math.ceil((b.until - now) / 1000));
}

/** Count without throwing (for checks that decide after the fact). */
export function rateCount(bucket: string, client: string): number {
  const b = buckets.get(`${bucket}:${client}`);
  return b && b.until > Date.now() ? b.n : 0;
}

export function resetRate(bucket: string, client: string): void {
  buckets.delete(`${bucket}:${client}`);
}

export function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[security] ${message}`);
}

/** True once a request arrived with X-Forwarded-For while TRUST_PROXY is unset (shown in /api/admin/me). */
export const proxyWarning = () => warned.has('xff-untrusted');

/**
 * Rate-limit key for an address: IPv4 as is; IPv4-mapped IPv6 as IPv4; IPv6 masked to its /64
 * (one subscriber line or server gets a whole /64, so per-address limits on full IPv6
 * addresses would be no limit at all).
 */
export function maskIp(raw: string): string {
  let ip = raw.trim().toLowerCase();
  if (ip.startsWith('[')) ip = ip.slice(1, ip.indexOf(']') > 0 ? ip.indexOf(']') : undefined);
  const zone = ip.indexOf('%');
  if (zone > 0) ip = ip.slice(0, zone);
  const mapped = /^(?:::|(?:0{1,4}:){5})ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) return mapped[1];
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(ip)) return ip.replace(/:\d+$/, '');
  if (!ip.includes(':')) return ip.slice(0, 64) || 'unknown';
  // Expand '::' to get the first four hextets.
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = ip.includes('::') && tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  if (full.length < 4 || full.some((x) => !/^[0-9a-f]{0,4}$/.test(x))) return ip.slice(0, 64);
  return full.slice(0, 4).map((x) => (x || '0').replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

/** Coarser address for the audit log (never the full address): IPv4 /24, IPv6 /48. */
export function auditIp(ip: string): string {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.replace(/\.\d+$/, '.0/24');
  if (ip.endsWith('::/64')) return ip.split(':').slice(0, 3).join(':') + '::/48';
  return ip.slice(0, 64);
}

/**
 * Address GROUP for budgets that a client could otherwise multiply by rotating addresses
 * (inventory holds, analytics volume, login ceiling): IPv4 /24, IPv6 /48 (a /64 per address
 * costs nothing; a /48 is what one site or customer is handed). Input: maskIp() output.
 */
export const addrGroup = (ip: string): string => auditIp(ip);

/**
 * Client address for rate limits (never stored), already masked (maskIp).
 *  - TRUST_PROXY=1 and CLIENT_IP_HEADER set (e.g. 'x-real-ip', 'cf-connecting-ip'): that header,
 *    which the proxy overwrites.
 *  - TRUST_PROXY=1: the X-Forwarded-For entry appended by OUR proxy — the rightmost one, or the
 *    TRUST_PROXY_HOPS-th from the right when several proxies append. Entries further left are
 *    written by the client and are never trusted.
 *  - otherwise: the socket address (Astro clientAddress).
 */
export function clientIp(ctx: { clientAddress?: string; request: Request }): string {
  const h = ctx.request.headers;
  if (trustProxy()) {
    const named = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
    if (named) {
      const v = h.get(named)?.trim();
      if (v) return maskIp(v.slice(0, 64));
    }
    const xff = h.get('x-forwarded-for');
    if (xff) {
      const list = xff.split(',').map((s) => s.trim()).filter(Boolean);
      const hops = Math.max(1, Math.floor(Number(process.env.TRUST_PROXY_HOPS || 1)) || 1);
      const pick = list[Math.max(0, list.length - hops)];
      if (pick) return maskIp(pick.slice(0, 64));
    }
  } else if (h.has('x-forwarded-for')) {
    warnOnce('xff-untrusted', 'requests carry X-Forwarded-For but TRUST_PROXY is not 1: every visitor shares the proxy address for rate limits. Set TRUST_PROXY=1 behind a reverse proxy (README → Deployment).');
  }
  try { return maskIp(ctx.clientAddress || 'unknown'); } catch { return 'unknown'; }
}

/**
 * Admin login throttle (src/pages/api/admin/login.ts).
 *  - per address: 20 tries a minute across e-mails.
 *  - per address + e-mail: 5 FAILURES a minute (a correct password is never what fills it, and
 *    a known device of that account skips this check; its failures still count).
 *  - per e-mail from everywhere: after 10 failures in 15 minutes, at most one try every 30 s for
 *    that account.
 *  - sitewide ceiling of 60 password checks a minute (each one is ~50–100 ms of scrypt on the
 *    event loop), of which one address group (IPv4 /24, IPv6 /48) may use 10 — refused BEFORE
 *    any hashing. Reaching it is audited (login_ceiling_hit, at most every 10 minutes) and shown
 *    on the dashboard for an hour (/api/admin/me warnings).
 *  - a request carrying a valid known-device cookie for that account (set at a previous
 *    successful sign-in, src/lib/auth.ts) skips the per-account lock and the sitewide ceiling, so
 *    a distributed guesser can slow strangers but never lock the owner out. It stays under the
 *    per-address limit. Recovery when locked out everywhere: README → Admin (seed --sync-admin).
 * Returns whether the attempt counted against the account (for loginResult).
 */
const failures = new Map<string, { n: number; since: number; last: number; logged: boolean }>();
const WINDOW = 15 * 60_000;
export const GLOBAL_LOGIN_PER_MIN = 60;
export const GROUP_LOGIN_PER_MIN = 10;
const LG = globalThis as unknown as { __dvLoginCeiling?: number; __dvLoginCeilingAudit?: boolean };

/** When the sitewide login ceiling was last hit (ms epoch), or 0. */
export const loginCeilingHitAt = (): number => LG.__dvLoginCeiling ?? 0;

/** True once per ceiling episode (≥ 10 minutes apart): the caller writes the audit row. */
export function takeLoginCeilingAudit(): boolean {
  if (!LG.__dvLoginCeilingAudit) return false;
  LG.__dvLoginCeilingAudit = false;
  return true;
}

export function loginGate(ip: string, email: string, knownDevice: boolean): { locked: boolean } {
  const e = email.trim().toLowerCase();
  rateLimit('login-ip', ip, 20, 60_000);
  if (knownDevice) return { locked: false };
  rateCheck('login', `${ip}|${e}`, 5);
  try {
    rateLimit('login-group', addrGroup(ip), GROUP_LOGIN_PER_MIN, 60_000);
    rateLimit('login-global', '*', GLOBAL_LOGIN_PER_MIN, 60_000);
  } catch (err) {
    if (rateCount('login-global', '*') > GLOBAL_LOGIN_PER_MIN * rateFactor()) {
      const now = Date.now();
      if (now - loginCeilingHitAt() > 10 * 60_000) {
        console.warn('[security] sitewide sign-in ceiling reached: new browsers get 429 for up to a minute; remembered browsers still sign in');
        LG.__dvLoginCeilingAudit = true;
      }
      LG.__dvLoginCeiling = now;
    }
    throw err;
  }
  const f = failures.get(e);
  const now = Date.now();
  if (f && now - f.since < WINDOW && f.n >= 10 * rateFactor()) {
    const wait = 30_000 - (now - f.last);
    if (wait > 0) throw E.rate(Math.ceil(wait / 1000));
    f.last = now;
    return { locked: true };
  }
  return { locked: false };
}

/**
 * Record the outcome: 'first_fail' for the first failure of a 15-minute window, 'lockout' the
 * moment the account reaches the threshold, else 'fail' (so the audit log gets two rows per
 * window, not one per guess).
 */
export function loginResult(ip: string, email: string, ok: boolean): 'ok' | 'first_fail' | 'fail' | 'lockout' {
  const e = email.trim().toLowerCase();
  if (ok) {
    failures.delete(e);
    resetRate('login', `${ip}|${e}`);
    return 'ok';
  }
  try { rateLimit('login', `${ip}|${e}`, 5, 60_000); } catch { /* counted; the next try is refused by loginGate */ }
  const now = Date.now();
  let f = failures.get(e);
  if (!f || now - f.since >= WINDOW) {
    f = { n: 1, since: now, last: now, logged: false };
    failures.set(e, f);
  } else { f.n++; f.last = now; }
  if (failures.size > 5000) for (const [k, v] of failures) if (now - v.since >= WINDOW) failures.delete(k);
  if (f.n >= 10 * rateFactor() && !f.logged) { f.logged = true; return 'lockout'; }
  return f.n === 1 ? 'first_fail' : 'fail';
}

const OPEN_METEO = 'https://api.open-meteo.com https://marine-api.open-meteo.com https://air-quality-api.open-meteo.com';

export function buildCsp(opts: { dev: boolean; scriptHashes?: string[]; https: boolean }): string {
  if (opts.dev) {
    // Vite HMR needs inline module scripts, eval-free websockets and blob workers.
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' ws: wss: ${OPEN_METEO}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');
  }
  return [
    "default-src 'self'",
    `script-src 'self' ${(opts.scriptHashes ?? []).join(' ')}`.trim(),
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${OPEN_METEO}`,
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    `form-action 'self'${process.env.POK_KEY_ID ? ' https://*.pokpay.io' : ''}`,
    "object-src 'none'",
    'report-uri /api/csp-report',
    ...(opts.https ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export function baseSecurityHeaders(h: Headers, https: boolean): void {
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  h.set('X-Frame-Options', 'DENY');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  if (https) h.set('Strict-Transport-Security', 'max-age=31536000');
}
