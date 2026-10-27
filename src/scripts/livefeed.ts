/**
 * livefeed.ts — one shared read of GET /api/live per page (cached 5 min in sessionStorage so
 * page changes don't refetch). Returns null when the endpoint is missing, failing or stale —
 * callers then hide live readings (never show old numbers as current).
 *
 * Cold start: while the server's first provider download is still on its way, /api/live answers
 * `loading: true` with no readings. That answer is never cached; the shared read asks again after
 * 4/5/6/8/10 s (bypassing the HTTP cache) and resolves with the first settled answer, so the
 * header temperature, the ticker and the home log fill in on the same tab without a reload.
 * A read that still ends loading (or failed) is dropped from `pending`, so a later getLive()
 * on the same page asks the server again instead of getting that answer back.
 */
export interface Live {
  /** null only while nothing was ever fetched (then weather is null too) */
  updated_at: string | null; stale: boolean;
  /** true while the first download is still on its way and nothing has failed yet */
  loading?: boolean;
  weather: { temp: number; feels: number; code: number; label_sq: string; label_en: string; wind_kmh: number; wind_dir: number; gust_kmh: number | null; humidity: number; uv: number | null; is_day: boolean } | null;
  marine: { sea_temp: number | null; wave_m: number | null } | null;
  air: { aqi: number | null; pm25: number | null } | null;
  sun: { sunrise: string; sunset: string; golden_start: string } | null;
  daily: Array<{ date: string; code: number; tmax: number; tmin: number; wind_max: number; precip_prob: number | null }>;
  season_now: { month: number; items: Array<{ key: string; sq: string; en: string; source_url: string }> };
  /** rooms_verified: true only when T1 says the unit counts are real (no demo rooms). */
  availability_today: { rooms_left: number | null; rooms_verified?: boolean; sessions: Array<{ slug: string; name_sq: string; name_en: string; starts_at: string; left: number }> };
  attribution: { sq: string; en: string; url: string };
}

const CACHE = 'dv-live';
const TTL = 5 * 60 * 1000;
/** re-ask delays while the server is still loading (same rhythm as /tani/'s scripts/live.ts) */
const RETRY_MS = [4000, 5000, 6000, 8000, 10000];
let pending: Promise<Live | null> | null = null;

function fromCache(): Live | null {
  try {
    const raw = sessionStorage.getItem(CACHE);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    if (!data || (data as Live).loading) return null;
    return Date.now() - at < TTL ? (data as Live) : null;
  } catch { return null; }
}

function fetchOnce(bypassHttpCache: boolean): Promise<Live | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  return fetch('/api/live', {
    signal: ctl.signal,
    headers: { accept: 'application/json' },
    // a re-ask must not get the loading answer back from the browser's HTTP cache (max-age=60)
    cache: bypassHttpCache ? 'no-store' : 'default',
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: Live | null) => (data && typeof data === 'object' && 'updated_at' in data ? data : null))
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function read(fresh: boolean): Promise<Live | null> {
  let data = await fetchOnce(fresh);
  for (const ms of RETRY_MS) {
    if (!data?.loading) break;
    await sleep(ms);
    data = await fetchOnce(true);
  }
  // a settled answer is shared across pages for 5 min; a loading one never is
  if (data && !data.loading) {
    try { sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), data })); } catch { /* ignore */ }
  }
  return data;
}

export function getLive(opts: { fresh?: boolean } = {}): Promise<Live | null> {
  if (!opts.fresh) {
    const c = fromCache();
    if (c) return Promise.resolve(c);
    if (pending) return pending;
  }
  const p = read(!!opts.fresh);
  pending = p;
  // a read that ends without a settled answer (still loading after every retry, or failed) is
  // not shared: the next getLive() on this page asks the server again
  p.then((data) => { if ((!data || data.loading) && pending === p) pending = null; });
  return p;
}

/** Usable for "now" readings: present, settled and not stale. */
export function isFresh(l: Live | null): l is Live & { updated_at: string; weather: NonNullable<Live['weather']> } {
  return !!l && !l.stale && !l.loading && !!l.weather && !!l.updated_at;
}
