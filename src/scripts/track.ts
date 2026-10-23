/**
 * track.ts — first-party analytics beacon (POST /api/e, PLAN §5/§8). No cookies, no
 * fingerprinting: a random tab id in sessionStorage 'dv-sid'. The server derives the day
 * (Europe/Tirane), the device class from the UA and only the referrer's domain, and drops bots
 * (navigator.webdriver travels as meta.wd).
 *
 *   track('add_to_cart', { product: 'slug', value: 6500 })
 *
 * Types: view, product_view, search, add_to_cart, remove_from_cart, checkout_start, order,
 * paid, assistant_q, assistant_miss, itinerary, share, vital, live_view.
 */
export type EventType =
  | 'view' | 'product_view' | 'search' | 'add_to_cart' | 'remove_from_cart' | 'checkout_start'
  | 'order' | 'paid' | 'assistant_q' | 'assistant_miss' | 'itinerary' | 'share' | 'vital' | 'live_view';

export interface TrackData { product?: string; value?: number; meta?: Record<string, unknown> }

const ENDPOINT = '/api/e';

export function sid(): string {
  try {
    let id = sessionStorage.getItem('dv-sid');
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 20);
      sessionStorage.setItem('dv-sid', id);
    }
    return id;
  } catch { return 'nostore'; }
}

function utm() {
  const q = new URLSearchParams(location.search);
  const source = q.get('utm_source'), medium = q.get('utm_medium'), campaign = q.get('utm_campaign');
  if (!source && !medium && !campaign) return undefined;
  return { source: source ?? '', medium: medium ?? '', campaign: campaign ?? '' };
}

function lang(): 'sq' | 'en' { return document.documentElement.lang === 'en' ? 'en' : 'sq'; }

export function track(type: EventType, data: TrackData = {}) {
  if (document.documentElement.dataset.track === 'off') return;
  const body: Record<string, unknown> = {
    type,
    path: location.pathname,
    lang: lang(),
    sid: sid(),
    ...(data.product ? { product: data.product } : {}),
    ...(typeof data.value === 'number' && Number.isFinite(data.value) ? { value: Math.round(data.value) } : {}),
    meta: { ...(data.meta ?? {}), ...(navigator.webdriver ? { wd: true } : {}) },
  };
  if (document.referrer && !document.referrer.startsWith(location.origin)) body.ref = document.referrer;
  const u = utm();
  if (u) body.utm = u;
  const json = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.(ENDPOINT, new Blob([json], { type: 'text/plain' }))) return;
  } catch { /* fall through */ }
  fetch(ENDPOINT, { method: 'POST', body: json, headers: { 'content-type': 'text/plain' }, keepalive: true }).catch(() => {});
}

/* ---------- Web Vitals (LCP, CLS, INP) from PerformanceObserver, sent once when the page hides ---------- */

function rate(name: string, v: number): 'good' | 'needs-improvement' | 'poor' {
  const t: Record<string, [number, number]> = { LCP: [2500, 4000], CLS: [0.1, 0.25], INP: [200, 500] };
  const [g, p] = t[name];
  return v <= g ? 'good' : v <= p ? 'needs-improvement' : 'poor';
}

export function observeVitals() {
  if (typeof PerformanceObserver === 'undefined') return;
  let lcp = 0, cls = 0, inp = 0;
  let winValue = 0, winFirst = 0, winLast = 0;
  const supported = PerformanceObserver.supportedEntryTypes ?? [];
  const obs = (type: string, cb: (list: PerformanceObserverEntryList) => void, opts: Record<string, unknown> = {}) => {
    if (!supported.includes(type)) return;
    try { new PerformanceObserver(cb).observe({ type, buffered: true, ...opts } as PerformanceObserverInit); } catch { /* old browser */ }
  };
  obs('largest-contentful-paint', (l) => { const e = l.getEntries().at(-1); if (e) lcp = e.startTime; });
  obs('layout-shift', (l) => {
    for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
      if (e.hadRecentInput) continue;
      if (winValue && e.startTime - winLast < 1000 && e.startTime - winFirst < 5000) { winValue += e.value; }
      else { winValue = e.value; winFirst = e.startTime; }
      winLast = e.startTime;
      cls = Math.max(cls, winValue);
    }
  });
  obs('event', (l) => {
    for (const e of l.getEntries() as (PerformanceEntry & { interactionId?: number })[]) {
      if (e.interactionId) inp = Math.max(inp, e.duration);
    }
  }, { durationThreshold: 40 });
  let sent = false;
  const send = () => {
    if (sent || document.visibilityState !== 'hidden') return;
    sent = true;
    const report = (name: 'LCP' | 'CLS' | 'INP', value: number) =>
      track('vital', { value: name === 'CLS' ? Math.round(value * 1000) : Math.round(value), meta: { name, value: name === 'CLS' ? +value.toFixed(4) : Math.round(value), rating: rate(name, value) } });
    if (lcp) report('LCP', lcp);
    report('CLS', cls);
    if (inp) report('INP', inp);
  };
  document.addEventListener('visibilitychange', send);
  window.addEventListener('pagehide', () => { if (document.visibilityState !== 'hidden') return; send(); });
}
