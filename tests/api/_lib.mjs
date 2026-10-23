/**
 * Helpers for the API tests (node:test). Run against a running server:
 *   API_URL=http://127.0.0.1:3810 npm run test:api
 * Admin credentials come from .env (ADMIN_EMAIL / ADMIN_PASSWORD, written by scripts/seed.mjs);
 * they are never printed. Test data: products with slugs 'apitest-…' (archived afterwards),
 * orders from api-test@example.com (cancelled afterwards).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = (process.env.API_URL || 'http://127.0.0.1:3810').replace(/\/$/, '');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function env() {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2];
    }
  } catch { /* none */ }
  return { ...out, ...process.env };
}

export const SAME = { Origin: BASE, 'Sec-Fetch-Site': 'same-origin' };

export async function call(method, p, { body, headers = {}, cookie, raw = false } = {}) {
  const h = { ...headers };
  if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
  if (cookie) h.Cookie = cookie;
  const res = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), redirect: 'manual' });
  if (raw) return res;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

export async function adminCookie() {
  const e = env();
  if (!e.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD missing in .env — run npm run db:seed first');
  const res = await fetch(BASE + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...SAME },
    body: JSON.stringify({ email: e.ADMIN_EMAIL || 'admin@divjaka.local', password: e.ADMIN_PASSWORD }),
  });
  if (res.status !== 200) throw new Error('admin login failed: ' + res.status);
  const set = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')];
  const c = set.find((x) => x && x.startsWith('dv_admin='));
  return c.split(';')[0];
}

export const admin = (cookie) => ({
  get: (p) => call('GET', p, { cookie, headers: SAME }),
  post: (p, body) => call('POST', p, { cookie, body, headers: SAME }),
  patch: (p, body) => call('PATCH', p, { cookie, body, headers: SAME }),
  del: (p) => call('DELETE', p, { cookie, headers: SAME }),
});

export function tiraneToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tirane', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const rand = () => Math.random().toString(36).slice(2, 8);

export const customer = { name: 'API Test', email: 'api-test@example.com', phone: '+355 600000000', country: 'AL' };

/**
 * Each checkout is its own person: the server caps waiting orders per NORMALISED e-mail
 * (+tags and Gmail dots do not count) and per phone number (3), so both are random here.
 */
export const randomPerson = () => ({ ...customer, email: `api-test-${rand()}${rand()}@example.com`, phone: `+355 6${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}` });

export function checkout(items, extra = {}) {
  return call('POST', '/api/checkout', {
    headers: { Origin: BASE },
    body: { lang: 'sq', items, customer: randomPerson(), payment_method: 'hotel', terms_accepted: true, ...extra },
  });
}

/** Create a published test product through the admin API; returns the product row. */
export async function makeProduct(a, p) {
  const r = await a.post('/api/admin/products', { status: 'published', name_sq: 'Test API', name_en: 'API test', ...p });
  if (r.status !== 201) throw new Error('create product failed ' + r.status + ' ' + JSON.stringify(r.data));
  return r.data.item;
}

/** Minimal XML well-formedness check (tags balanced and properly nested, one root). */
export function wellFormed(xml) {
  const body = xml.replace(/<\?xml[^>]*\?>/, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  let roots = 0;
  const re = /<\/?([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let m;
  let last = 0;
  while ((m = re.exec(body))) {
    const between = body.slice(last, m.index);
    if (/[<>]/.test(between)) return `stray markup near: ${between.slice(0, 60)}`;
    if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/i.test(between)) return `bad entity near: ${between.slice(0, 60)}`;
    last = re.lastIndex;
    const [tag, name, , selfClose] = m;
    if (tag.startsWith('</')) {
      if (stack.pop() !== name) return `mismatched </${name}>`;
    } else if (!selfClose) {
      if (!stack.length) roots++;
      stack.push(name);
    } else if (!stack.length) roots++;
  }
  if (stack.length) return `unclosed <${stack.at(-1)}>`;
  if (roots !== 1) return `expected one root, found ${roots}`;
  return null;
}
