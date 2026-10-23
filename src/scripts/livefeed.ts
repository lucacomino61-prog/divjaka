/**
 * livefeed.ts — one shared read of GET /api/live per page (cached 5 min in sessionStorage so
 * page changes don't refetch). Returns null when the endpoint is missing, failing or stale —
 * callers then hide live readings (never show old numbers as current).
 */
export interface Live {
  updated_at: string; stale: boolean;
  weather: { temp: number; feels: number; code: number; label_sq: string; label_en: string; wind_kmh: number; wind_dir: number; gust_kmh: number; humidity: number; uv: number | null; is_day: boolean } | null;
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
let pending: Promise<Live | null> | null = null;

function fromCache(): Live | null {
  try {
    const raw = sessionStorage.getItem(CACHE);
    if (!raw) return null;
    const { at, data } = JSON.parse(raw);
    return Date.now() - at < TTL ? (data as Live) : null;
  } catch { return null; }
}

export function getLive(opts: { fresh?: boolean } = {}): Promise<Live | null> {
  if (!opts.fresh) {
    const c = fromCache();
    if (c) return Promise.resolve(c);
    if (pending) return pending;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  pending = fetch('/api/live', { signal: ctl.signal, headers: { accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: Live | null) => {
      if (!data || typeof data !== 'object' || !('updated_at' in data)) return null;
      try { sessionStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), data })); } catch { /* ignore */ }
      return data;
    })
    .catch(() => null)
    .finally(() => clearTimeout(timer));
  return pending;
}

/** Usable for "now" readings: present and not stale. */
export function isFresh(l: Live | null): l is Live {
  return !!l && !l.stale && !!l.weather;
}
