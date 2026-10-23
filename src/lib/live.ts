/**
 * Live conditions for GET /api/live (PLAN §6, client contract in the T1 brief).
 * Server-side fetch of Open-Meteo forecast + marine + air quality, cached 10 minutes in
 * memory; on failure the last good copy is returned with stale:true (or nulls if none).
 * Data: Open-Meteo.com, CC BY 4.0 (attribution in the payload).
 *
 * Coordinates: the hotel (see COORDS). Marine point 40.99 N, 19.44 E (open sea off the Divjakë
 * coast; Open-Meteo snaps it to the 40.958 N, 19.458 E sea cell — checked 2026-10-23).
 * research/live.json {lat, lon, marine_lat, marine_lon} overrides them when present.
 */
import fs from 'node:fs';
import path from 'node:path';
import { roomsLeftTonight, roomsVerified, sessionsToday } from './availability';
import { hhmm, minutesOf, tirane } from './time';
import { cached } from './cache';

export interface LivePayload {
  updated_at: string; stale: boolean;
  weather: { temp: number; feels: number; code: number; label_sq: string; label_en: string; wind_kmh: number; wind_dir: number; gust_kmh: number; humidity: number; uv: number | null; is_day: boolean } | null;
  marine: { sea_temp: number | null; wave_m: number | null } | null;
  air: { aqi: number | null; pm25: number | null } | null;
  sun: { sunrise: string; sunset: string; golden_start: string } | null;
  daily: { date: string; code: number; tmax: number; tmin: number; wind_max: number; precip_prob: number | null }[];
  season_now: { month: number; items: { key: string; sq: string; en: string; source_url: string }[] };
  /** rooms_verified: true only when every published room type was saved by the owner (demo = 0); until then rooms_left is a demo figure and must not be shown. */
  availability_today: { rooms_left: number | null; rooms_verified: boolean; sessions: { slug: string; name_sq: string; name_en: string; starts_at: string; left: number }[] };
  attribution: { sq: string; en: string; url: string };
}

// Hotel Pelikan, Divjakë beach: 40.972262 N, 19.479574 E (research/business.json, high
// confidence: Booking.com + AlbaniaVisit + Google Maps). Weather and air are read there.
const COORDS = { lat: 40.97226, lon: 19.47957, marine_lat: 40.99, marine_lon: 19.44 };
const TTL = 10 * 60 * 1000;

/** WMO weather interpretation codes (Open-Meteo docs) — Albanian + English labels. */
export const WMO: Record<number, { sq: string; en: string }> = {
  0: { sq: 'Qiell i kthjellët', en: 'Clear sky' },
  1: { sq: 'Kryesisht i kthjellët', en: 'Mainly clear' },
  2: { sq: 'Pjesërisht me re', en: 'Partly cloudy' },
  3: { sq: 'Vranët', en: 'Overcast' },
  45: { sq: 'Mjegull', en: 'Fog' },
  48: { sq: 'Mjegull me brymë', en: 'Depositing rime fog' },
  51: { sq: 'Shi i imët i lehtë', en: 'Light drizzle' },
  53: { sq: 'Shi i imët', en: 'Drizzle' },
  55: { sq: 'Shi i imët i dendur', en: 'Dense drizzle' },
  56: { sq: 'Shi i imët që ngrin', en: 'Light freezing drizzle' },
  57: { sq: 'Shi i imët i dendur që ngrin', en: 'Dense freezing drizzle' },
  61: { sq: 'Shi i lehtë', en: 'Slight rain' },
  63: { sq: 'Shi', en: 'Moderate rain' },
  65: { sq: 'Shi i fortë', en: 'Heavy rain' },
  66: { sq: 'Shi i lehtë që ngrin', en: 'Light freezing rain' },
  67: { sq: 'Shi i fortë që ngrin', en: 'Heavy freezing rain' },
  71: { sq: 'Borë e lehtë', en: 'Slight snow' },
  73: { sq: 'Borë', en: 'Moderate snow' },
  75: { sq: 'Borë e dendur', en: 'Heavy snow' },
  77: { sq: 'Kokrriza bore', en: 'Snow grains' },
  80: { sq: 'Rrebeshe të lehta shiu', en: 'Slight rain showers' },
  81: { sq: 'Rrebeshe shiu', en: 'Moderate rain showers' },
  82: { sq: 'Rrebeshe të forta shiu', en: 'Violent rain showers' },
  85: { sq: 'Rrebeshe të lehta bore', en: 'Slight snow showers' },
  86: { sq: 'Rrebeshe të forta bore', en: 'Heavy snow showers' },
  95: { sq: 'Stuhi me bubullima', en: 'Thunderstorm' },
  96: { sq: 'Stuhi me breshër të lehtë', en: 'Thunderstorm with slight hail' },
  99: { sq: 'Stuhi me breshër të fortë', en: 'Thunderstorm with heavy hail' },
};

function readResearch<T>(file: string): T | null {
  try {
    const p = path.join(process.cwd(), 'research', file);
    const st = fs.statSync(p);
    const c = researchCache.get(p);
    if (c && c.mtime === st.mtimeMs) return c.data as T;
    const data = JSON.parse(fs.readFileSync(p, 'utf8')) as T;
    researchCache.set(p, { mtime: st.mtimeMs, data });
    return data;
  } catch {
    return null;
  }
}
const researchCache = new Map<string, { mtime: number; data: unknown }>();

/** research/weathercodes.json overrides the built-in table: {"0":{sq,en}} or [{code,sq,en}]. */
export function wmoLabel(code: number): { sq: string; en: string } {
  const r = readResearch<unknown>('weathercodes.json');
  if (r) {
    const list = Array.isArray(r) ? r : Array.isArray((r as { codes?: unknown[] }).codes) ? (r as { codes: unknown[] }).codes : null;
    if (list) {
      const hit = (list as { code: number; sq?: string; en?: string; label_sq?: string; label_en?: string }[]).find((x) => Number(x.code) === code);
      if (hit && (hit.sq || hit.label_sq)) return { sq: (hit.sq ?? hit.label_sq)!, en: (hit.en ?? hit.label_en ?? WMO[code]?.en ?? '')! };
    } else {
      const hit = (r as Record<string, { sq?: string; en?: string }>)[String(code)];
      if (hit?.sq) return { sq: hit.sq, en: hit.en ?? WMO[code]?.en ?? '' };
    }
  }
  return WMO[code] ?? { sq: '—', en: '—' };
}

interface SeasonItem { key?: string; id?: string; type?: string; months?: number[]; sq?: string; en?: string; text_sq?: string; text_en?: string; source_url?: string; source?: string | { url?: string }; verified?: boolean; confidence?: string; date?: string }
interface SeasonFile { months?: { month: number; items: SeasonItem[] }[]; items?: SeasonItem[] }

const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/**
 * Date of a dated event: `date` ('YYYY-MM-DD') when research gives one, else the "(2026: 10 October)"
 * form used in research/seasons.json texts. undefined = no date (recurring); null = unreadable.
 */
function eventDate(x: SeasonItem): string | null | undefined {
  if (typeof x.date === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : null;
  const m = /\((\d{4}):\s*(\d{1,2})\s+([A-Za-z]+)\)/.exec(x.text_en ?? x.en ?? '');
  if (!m) return undefined;
  const mi = MONTHS_EN.indexOf(m[3].toLowerCase());
  if (mi < 0) return null;
  return `${m[1]}-${String(mi + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/**
 * "What's in season now" from research/seasons.json. Only sourced items that count as verified:
 * `verified: true`, or confidence 'high', or 'medium' for anything that is not a dated event
 * (research marks medium/low events as not confirmed as annual). Low confidence never shows.
 */
export function seasonItems(month: number): LivePayload['season_now']['items'] {
  const r = readResearch<SeasonItem[] | SeasonFile>('seasons.json');
  let list: SeasonItem[] = [];
  if (Array.isArray(r)) list = r.filter((x) => Array.isArray(x.months) && x.months.includes(month));
  else if (r?.months) {
    const m = r.months.find((x) => Number(x.month) === month);
    list = (m?.items ?? []).map((x, i) => ({ ...x, key: x.key ?? x.id ?? `${x.type ?? 'item'}-${month}-${i + 1}` }));
  } else if (r?.items) list = r.items.filter((x) => Array.isArray(x.months) && x.months.includes(month));
  const ok = (x: SeasonItem) => x.verified === true || x.confidence === 'high' || (x.confidence === 'medium' && x.type !== 'event');
  const now = tirane().date;
  // A dated event shows until its day, and only for the year it names (a date given for
  // another year says nothing reliable about this one).
  const current = (x: SeasonItem) => {
    if (x.type !== 'event') return true;
    const d = eventDate(x);
    if (d === undefined) return true; // undated recurring event
    return d !== null && d.slice(0, 4) === now.slice(0, 4) && d >= now;
  };
  return list
    .filter(ok)
    .filter(current)
    .map((x) => ({
      key: String(x.key ?? x.id ?? ''),
      sq: String(x.sq ?? x.text_sq ?? ''),
      en: String(x.en ?? x.text_en ?? ''),
      source_url: String(x.source_url ?? (typeof x.source === 'string' ? x.source : x.source?.url) ?? ''),
    }))
    .filter((x) => x.sq && x.en && x.source_url);
}

function coords() {
  const r = readResearch<Partial<typeof COORDS>>('live.json');
  return { ...COORDS, ...(r && typeof r.lat === 'number' ? r : {}) };
}

const API_TIMEOUT = 3500;
/** After the forecast answers, marine / air get this much longer before the reply goes out without them. */
const SIDE_GRACE = 250;
/** A served copy older than this is flagged stale:true. */
const STALE_AFTER = 30 * 60 * 1000;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT), headers: { 'User-Agent': 'divjaka-platform/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Settled value, null on failure, undefined when it is still running after `ms`. */
function settleWithin<T>(p: Promise<T>, ms: number): Promise<{ v: T | null } | undefined> {
  return Promise.race([p.then((v) => ({ v }), () => ({ v: null })), sleep(ms).then(() => undefined)]);
}

interface Remote { at: number; updated_at: string; weather: LivePayload['weather']; marine: LivePayload['marine']; air: LivePayload['air']; sun: LivePayload['sun']; daily: LivePayload['daily'] }

const G = globalThis as unknown as { __dvLive?: { last?: Remote; inflight?: Promise<Remote | null>; failedAt?: number } };
const state = G.__dvLive ?? (G.__dvLive = {});

const r1 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
const ri = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null);

async function fetchRemote(): Promise<Remote> {
  const c = coords();
  const tz = 'timezone=Europe%2FTirane';
  const fUrl = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,uv_index,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_probability_max,sunrise,sunset&forecast_days=7&wind_speed_unit=kmh&${tz}`;
  const mUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${c.marine_lat}&longitude=${c.marine_lon}&current=sea_surface_temperature,wave_height&${tz}`;
  const aUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${c.lat}&longitude=${c.lon}&current=european_aqi,pm2_5&${tz}`;
  const marineP = getJson(mUrl).then((j) => j.current ?? {});
  const airP = getJson(aUrl).then((j) => j.current ?? {});
  marineP.catch(() => {});
  airP.catch(() => {});
  const fc = await getJson(fUrl);
  // Marine and air are extras: answer without them if they are still out, and patch the cached
  // copy when they arrive.
  const [mS, aS] = await Promise.all([settleWithin(marineP, SIDE_GRACE), settleWithin(airP, SIDE_GRACE)]);
  const cur = fc.current ?? {};
  const code = Number(cur.weather_code ?? 0);
  const label = wmoLabel(code);
  const d = fc.daily ?? {};
  const daily: LivePayload['daily'] = (d.time ?? []).map((date: string, i: number) => ({
    date, code: Number(d.weather_code?.[i] ?? 0), tmax: r1(d.temperature_2m_max?.[i]) ?? 0, tmin: r1(d.temperature_2m_min?.[i]) ?? 0,
    wind_max: r1(d.wind_speed_10m_max?.[i]) ?? 0, precip_prob: ri(d.precipitation_probability_max?.[i]),
  }));
  const sunrise = typeof d.sunrise?.[0] === 'string' ? d.sunrise[0].slice(11, 16) : null;
  const sunset = typeof d.sunset?.[0] === 'string' ? d.sunset[0].slice(11, 16) : null;
  const toMarine = (mc: any): LivePayload['marine'] => (mc ? { sea_temp: r1(mc.sea_surface_temperature), wave_m: r1(mc.wave_height) } : null);
  const toAir = (ac: any): LivePayload['air'] => (ac ? { aqi: ri(ac.european_aqi), pm25: r1(ac.pm2_5) } : null);
  const mc = mS?.v ?? null;
  const ac = aS?.v ?? null;
  const out: Remote = {
    at: Date.now(),
    updated_at: new Date().toISOString(),
    weather: {
      temp: r1(cur.temperature_2m) ?? 0, feels: r1(cur.apparent_temperature) ?? 0, code, label_sq: label.sq, label_en: label.en,
      wind_kmh: r1(cur.wind_speed_10m) ?? 0, wind_dir: ri(cur.wind_direction_10m) ?? 0, gust_kmh: r1(cur.wind_gusts_10m) ?? 0,
      humidity: ri(cur.relative_humidity_2m) ?? 0, uv: r1(cur.uv_index), is_day: cur.is_day === 1,
    },
    marine: toMarine(mc),
    air: toAir(ac),
    // Golden hour start: the hour before sunset (photographers' convention).
    sun: sunrise && sunset ? { sunrise, sunset, golden_start: hhmm(minutesOf(sunset) - 60) } : null,
    daily,
  };
  if (mS === undefined) marineP.then((v) => { out.marine = toMarine(v); }, () => {});
  if (aS === undefined) airP.then((v) => { out.air = toAir(v); }, () => {});
  return out;
}

/**
 * Cached Open-Meteo data, stale-while-revalidate: a visitor never waits for a refresh when an
 * older copy exists (it is returned at once and refreshed in the background). Only the very
 * first request after a start waits, for at most the forecast's timeout.
 */
async function remote(): Promise<{ data: Remote | null; stale: boolean }> {
  const now = Date.now();
  const last = state.last;
  if (last && now - last.at < TTL) return { data: last, stale: false };
  const canTry = !state.failedAt || now - state.failedAt >= 60_000; // after a failure, retry once a minute
  if (canTry) refresh();
  if (last) return { data: last, stale: now - last.at > STALE_AFTER };
  if (!state.inflight) return { data: null, stale: true };
  const r = await state.inflight;
  return r ? { data: r, stale: false } : { data: state.last ?? null, stale: true };
}

function refresh(): void {
  if (!state.inflight) {
    state.inflight = fetchRemote()
      .then((r) => {
        // Marine / air are separate APIs: if one of them failed this time, keep the last good
        // reading for up to 3 hours rather than blanking it.
        const prev = state.last;
        if (prev && Date.now() - prev.at < 3 * 3600_000) {
          if (!r.marine && prev.marine) r.marine = prev.marine;
          if (!r.air && prev.air) r.air = prev.air;
        }
        state.last = r;
        state.failedAt = undefined;
        return r;
      })
      .catch((e) => { console.warn('[live] open-meteo failed:', (e as Error)?.message ?? e); state.failedAt = Date.now(); return null; })
      .finally(() => { state.inflight = undefined; });
  }
}

export async function getLive(): Promise<LivePayload> {
  const { data, stale } = await remote();
  const month = tirane().month;
  let availability: LivePayload['availability_today'] = { rooms_left: null, rooms_verified: false, sessions: [] };
  try {
    // Cached ≤ 10 s and only while the DB is unchanged (src/lib/cache.ts): /api/live is not
    // rate-limited, so a flood must not run these queries per request. rooms_left is null until
    // the owner verified the room types (a demo figure must never reach a client).
    availability = cached('live-availability', () => {
      const verified = roomsVerified();
      return { rooms_left: verified ? roomsLeftTonight() : null, rooms_verified: verified, sessions: sessionsToday() };
    });
  } catch (e) {
    console.error('[live] availability', e);
  }
  return {
    updated_at: data?.updated_at ?? new Date().toISOString(),
    stale: stale || !data,
    weather: data?.weather ?? null,
    marine: data?.marine ?? null,
    air: data?.air ?? null,
    sun: data?.sun ?? null,
    daily: data?.daily ?? [],
    season_now: { month, items: cached(`live-season|${month}`, () => seasonItems(month)) },
    availability_today: availability,
    attribution: { sq: 'Të dhënat e motit: Open-Meteo.com (CC BY 4.0)', en: 'Weather data by Open-Meteo.com (CC BY 4.0)', url: 'https://open-meteo.com/' },
  };
}

/** Test hook: forget the cache. */
export function resetLiveCache(): void {
  state.last = undefined;
  state.failedAt = undefined;
}
