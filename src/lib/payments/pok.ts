/**
 * POK adapter (scaffold, active only when POK_KEY_ID, POK_KEY_SECRET and POK_MERCHANT_ID exist).
 * Port of LC/elixir-3d/server/pok.mjs — the reference that runs in production there.
 *
 * Flow: server creates the POK sdk-order (amount in whole lek, merchantCustomReference = our
 * order code) → the browser pays in POK's hosted card form (3-D Secure) → POK calls our
 * webhook → we RE-READ the order from POK with our secret and only mark paid when
 * capturedAmount covers the total. The webhook body is never trusted; neither is a return URL.
 * Keys live in env only and never reach the browser or a response.
 */
const PROD = 'https://api.pokpay.io';
const STAGING = 'https://api-staging.pokpay.io';

export const pokConfigured = (): boolean =>
  !!(process.env.POK_KEY_ID && process.env.POK_KEY_SECRET && process.env.POK_MERCHANT_ID);

const base = () => (String(process.env.POK_ENV || 'production').toLowerCase() === 'staging' ? STAGING : PROD);

let token: string | null = null;
let tokenUntil = 0;

async function call(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 503, data: { message: String((e as Error)?.message || e) } };
  }
}

async function login(force = false): Promise<string | null> {
  if (!pokConfigured()) return null;
  if (!force && token && Date.now() < tokenUntil) return token;
  const r = await call(`${base()}/auth/sdk/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyId: String(process.env.POK_KEY_ID).trim(), keySecret: String(process.env.POK_KEY_SECRET).trim() }),
  });
  const d = r.ok && r.data && typeof r.data === 'object' ? r.data.data ?? {} : {};
  if (!d.accessToken) {
    // Only POK's message, never the body (it could echo the secret).
    console.error('[pok] login failed', r.status, typeof r.data?.message === 'string' ? r.data.message.slice(0, 200) : '');
    return null;
  }
  token = d.accessToken;
  tokenUntil = Date.now() + Math.max(0, (Number(d.expiresIn) || 600000) - 60000);
  return token;
}

export interface PokOrder { id: string; amount?: number | string; capturedAmount?: number | string; confirmUrl?: string; _self?: { confirmUrl?: string }; [k: string]: unknown }

export async function pokCreateOrder(o: {
  amount: number; ref: string; products: { name: string; quantity: number; price: number }[];
  webhookUrl: string; redirectUrl: string; failRedirectUrl: string; description?: string; expiresAfterMinutes?: number;
}): Promise<{ ok: true; order: PokOrder } | { ok: false; status: number }> {
  const t = await login();
  if (!t) return { ok: false, status: 503 };
  const body = {
    amount: String(Math.round(o.amount)),
    currencyCode: 'ALL',
    autoCapture: true,
    products: o.products.map((p) => ({ name: p.name.slice(0, 120), quantity: p.quantity, price: p.price })),
    merchantCustomReference: o.ref,
    webhookUrl: o.webhookUrl,
    redirectUrl: o.redirectUrl,
    failRedirectUrl: o.failRedirectUrl,
    description: (o.description || o.ref).slice(0, 200),
    expiresAfterMinutes: o.expiresAfterMinutes ?? 30,
  };
  const r = await call(`${base()}/merchants/${encodeURIComponent(String(process.env.POK_MERCHANT_ID))}/sdk-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
    body: JSON.stringify(body),
  });
  const order = r.data?.data?.sdkOrder ?? r.data?.data ?? null;
  if (!r.ok || !order?.id) return { ok: false, status: r.status };
  return { ok: true, order };
}

/** The only source we trust for "paid". */
export async function pokReadOrder(id: string): Promise<PokOrder | null> {
  const t = await login();
  if (!t) return null;
  const r = await call(`${base()}/sdk-orders/${encodeURIComponent(id)}`, { headers: { Authorization: 'Bearer ' + t } });
  if (!r.ok) return null;
  return r.data?.data?.sdkOrder ?? r.data?.data ?? null;
}

export const pokCaptured = (o: PokOrder | null): number => Number(o?.capturedAmount ?? 0) || 0;
