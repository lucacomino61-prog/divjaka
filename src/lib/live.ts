/**
 * Live conditions for GET /api/live (PLAN §6). T7 rework, 2026-10-23 — research/live.md "Decision".
 *
 * Providers (each one named in `sources[]` with its licence, so every reading is attributable):
 *   weather  MET Norway Locationforecast 2.0 (api.met.no) — free INCLUDING commercial use
 *            ("Is this API free, even for commercial use? Yes!", docs.api.met.no/doc/FAQ),
 *            CC BY 4.0 / NLOD 2.0, credit "Data from MET Norway". Terms followed here: an
 *            identifying User-Agent with a contact (LIVE_CONTACT env, else settings → seo.site_url /
 *            business.email, else a placeholder listed in NEEDS_VERIFICATION.md), coordinates
 *            truncated to 4 decimals, no new request before `Expires`, If-Modified-Since with the
 *            last `Last-Modified` (a 304 keeps the cached copy).
 *   sea      NASA JPL MUR SST v4.1 (0.01°, daily analysis, ~1 day behind) through NOAA
 *            CoastWatch ERDDAP — "may be used and redistributed for free" (PO.DAAC policy),
 *            acknowledgement "These data were provided by JPL under support by NASA MEaSUREs
 *            program." The reading is the Adriatic ~3 km off the beach, dated (never "the lagoon").
 *   air,     Open-Meteo's COMMERCIAL customer endpoints, only when OPEN_METEO_API_KEY is set
 *   waves,   (the free Open-Meteo tier is non-commercial, research/live.md). Without the key these
 *   UV       fields are null and every UI hides them. UV from MET is the clear-sky index only
 *            (`uv_clear_sky`), shown with that wording.
 *   sun      computed here (USNO solar position + NOAA hour angle, research/live.md §5), no
 *            network: sunrise/sunset (−0.833°), golden hour (sun below +6°), civil twilight (−6°).
 *            Checked against MET Sunrise 3.0 within a minute (2026-10-23, 10-25, 2027-03-28, 06-21).
 *
 * Contract: the shape the clients already read is kept (weather.{temp,feels,code,label_*,wind_*,
 * humidity,uv,is_day}, marine.sea_temp, sun.{sunrise,sunset,golden_start}, daily[], attribution);
 * new fields are additions. `weather.code` is a WMO-equivalent of the MET symbol (for icons);
 * `weather.symbol` is MET's own code. Cached in memory; stale-while-revalidate; a copy older than
 * 90 minutes is served with stale:true (clients then hide "now" readings).
 */
import fs from 'node:fs';
import path from 'node:path';
import { roomsLeftTonight, roomsVerified, sessionsToday } from './availability';
import { tirane } from './time';
import { cached } from './cache';
import { getSetting } from './db/repo/settings';

export interface LiveSource { key: 'weather' | 'sea' | 'air' | 'sun'; sq: string; en: string; url: string; license: string; license_url: string }

export interface LiveWeather {
  temp: number; feels: number; code: number; symbol: string; label_sq: string; label_en: string;
  wind_kmh: number; wind_dir: number; gust_kmh: number | null; humidity: number;
  cloud: number | null; precip_mm: number | null; pressure_hpa: number | null;
  /** Actual UV index — only from the commercial Open-Meteo feed; null otherwise. */
  uv: number | null;
  /** MET's UV index for a clear sky at this hour (an upper bound, label it so). */
  uv_clear_sky: number | null;
  is_day: boolean;
  /** UTC instant the reading is valid for (the forecast hour). */
  valid_at: string;
}
export interface LiveDay {
  date: string; code: number; symbol: string; label_sq: string; label_en: string;
  tmax: number; tmin: number; wind_max: number; precip_mm: number | null; precip_prob: number | null;
  sunrise: string | null; sunset: string | null;
}
export interface LiveHour { at: string; time: string; temp: number; code: number; symbol: string; wind_kmh: number; wind_dir: number; precip_mm: number | null }
export interface SunInfo {
  sunrise: string; sunset: string;
  /** evening golden hour: the sun drops below +6° (… until sunset) */
  golden_start: string;
  /** morning golden hour: sunrise … the sun climbs past +6° */
  golden_morning_end: string;
  civil_dawn: string; civil_dusk: string; day_length_min: number;
}

export interface LivePayload {
  updated_at: string; stale: boolean;
  weather: LiveWeather | null;
  marine: { sea_temp: number | null; wave_m: number | null; sea_date: string | null } | null;
  air: { aqi: number | null; pm25: number | null } | null;
  sun: SunInfo | null;
  daily: LiveDay[];
  hourly: LiveHour[];
  season_now: { month: number; items: { key: string; sq: string; en: string; source_url: string }[] };
  /** rooms_verified: true only when every published room type was saved by the owner (demo = 0); until then rooms_left is null. */
  availability_today: { rooms_left: number | null; rooms_verified: boolean; sessions: { slug: string; name_sq: string; name_en: string; starts_at: string; left: number }[] };
  /** The weather provider's credit (kept as one object for older clients); every provider in `sources`. */
  attribution: { sq: string; en: string; url: string };
  sources: LiveSource[];
  provider: { weather: 'met-norway'; sea: 'nasa-jpl-mur' | null; air: 'open-meteo' | null };
}

// Hotel Pelikan, Divjakë beach: 40.972262 N, 19.479574 E (research/business.json, high confidence).
// MET asks for at most 4 decimals. Sea point: the MUR cell ~3 km west of the beach (open sea,
// checked 2026-10-23: 40.96–40.97 N × 19.43–19.44 E all return a sea value).
const COORDS = { lat: 40.9722, lon: 19.4795, sea_lat: [40.96, 40.97] as [number, number], sea_lon: [19.43, 19.44] as [number, number] };

/* ------------------------------------------------------------------ research files */

const researchCache = new Map<string, { mtime: number; data: unknown }>();
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

/* ------------------------------------------------------------------ labels */

/** WMO codes (Open-Meteo docs) — kept for the commercial Open-Meteo path and older callers. */
export const WMO: Record<number, { sq: string; en: string }> = {
  0: { sq: 'Qiell i kthjellët', en: 'Clear sky' }, 1: { sq: 'Kryesisht i kthjellët', en: 'Mainly clear' },
  2: { sq: 'Pjesërisht me re', en: 'Partly cloudy' }, 3: { sq: 'Qiell i vrenjtur', en: 'Overcast' },
  45: { sq: 'Mjegull', en: 'Fog' }, 48: { sq: 'Mjegull me brymë', en: 'Depositing rime fog' },
  61: { sq: 'Shi i dobët', en: 'Slight rain' }, 63: { sq: 'Shi mesatar', en: 'Moderate rain' }, 65: { sq: 'Shi i fortë', en: 'Heavy rain' },
  71: { sq: 'Borë e dobët', en: 'Slight snow' }, 73: { sq: 'Borë mesatare', en: 'Moderate snow' }, 75: { sq: 'Borë e dendur', en: 'Heavy snow' },
  80: { sq: 'Shi i dobët herë pas here', en: 'Slight rain showers' }, 81: { sq: 'Shi mesatar herë pas here', en: 'Moderate rain showers' },
  82: { sq: 'Rrebeshe të fuqishme shiu', en: 'Violent rain showers' }, 95: { sq: 'Shtrëngatë', en: 'Thunderstorm' }, 97: { sq: 'Shtrëngatë e fortë', en: 'Heavy thunderstorm' },
};

/** research/weathercodes.json (native-checked labels) overrides the table above. */
export function wmoLabel(code: number): { sq: string; en: string } {
  const r = readResearch<Record<string, { sq?: string; en?: string }>>('weathercodes.json');
  const hit = r?.[String(code)];
  if (hit?.sq && hit.en) return { sq: hit.sq, en: hit.en };
  return WMO[code] ?? { sq: '—', en: '—' };
}

/**
 * MET Norway symbol codes (github.com/metno/weathericons): base + optional _day/_night/
 * _polartwilight. Labels are composed from intensity × kind × showers × thunder, in the same
 * wording research/live.md V3 checked for Albanian forecasts ("herë pas here" for showers,
 * "shtrëngatë" for thunder, "shi me borë" for sleet).
 */
const SKY: Record<string, { sq: string; en: string; code: number }> = {
  clearsky: { sq: 'Qiell i kthjellët', en: 'Clear sky', code: 0 },
  fair: { sq: 'Kryesisht i kthjellët', en: 'Fair', code: 1 },
  partlycloudy: { sq: 'Pjesërisht me re', en: 'Partly cloudy', code: 2 },
  cloudy: { sq: 'Qiell i vrenjtur', en: 'Cloudy', code: 3 },
  fog: { sq: 'Mjegull', en: 'Fog', code: 45 },
};
const KIND: Record<string, { sq: string; en: string; code: [number, number, number]; fem?: boolean }> = {
  rain: { sq: 'Shi', en: 'rain', code: [61, 63, 65] },
  sleet: { sq: 'Shi me borë', en: 'sleet', code: [61, 63, 65] },
  snow: { sq: 'Borë', en: 'snow', code: [71, 73, 75], fem: true },
};
export function metSymbol(symbol: string): { sq: string; en: string; code: number; night: boolean } {
  const night = /_night$/.test(symbol);
  const base = symbol.replace(/_(day|night|polartwilight)$/, '');
  if (SKY[base]) return { ...SKY[base], night };
  // MET's own typos (lightssleetshowersandthunder, lightssnowshowersandthunder) normalised
  const m = /^(light|heavy)?s?(rain|sleet|snow)(showers)?(andthunder)?$/.exec(base);
  if (!m) return { sq: '—', en: '—', code: 3, night };
  const [, inten, kind, showers, thunder] = m;
  const k = KIND[kind];
  const lvl = inten === 'light' ? 0 : inten === 'heavy' ? 2 : 1;
  let sq = k.sq;
  if (lvl === 0) sq += k.fem ? ' e dobët' : ' i dobët';
  if (lvl === 2) sq += k.fem ? ' e dendur' : ' i fortë';
  if (showers) sq += ' herë pas here';
  if (thunder) sq += ' me shtrëngatë';
  const en = `${lvl === 0 ? 'Light ' : lvl === 2 ? 'Heavy ' : ''}${k.en}${showers ? ' showers' : ''}${thunder ? ' and thunder' : ''}`;
  const code = thunder ? (lvl === 2 ? 97 : 95) : showers && kind === 'rain' ? [80, 81, 82][lvl] : k.code[lvl];
  return { sq, en: en.charAt(0).toUpperCase() + en.slice(1), code, night };
}
/** Rank for picking a day's symbol: precipitation and thunder beat cloud. */
const symbolRank = (s: string) => {
  const b = s.replace(/_(day|night|polartwilight)$/, '');
  if (/thunder/.test(b)) return 9;
  if (/heavy/.test(b)) return 8;
  if (/rain|sleet|snow/.test(b)) return /light/.test(b) ? 6 : 7;
  return ({ fog: 4, cloudy: 3, partlycloudy: 2, fair: 1, clearsky: 0 } as Record<string, number>)[b] ?? 3;
};

/* ------------------------------------------------------------------ the sun */

const RAD = Math.PI / 180;
const tzParts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tirane', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hm = (d: Date | null) => (d ? tzParts.format(d) : '');

/**
 * UTC instant when the sun's centre is at altitude `h`° on a date (morning or evening), or null
 * when it never gets there. USNO approximate solar coordinates + NOAA hour-angle formula, two
 * passes (research/live.md §5).
 */
export function sunEvent(date: string, lat: number, lon: number, h: number, morning: boolean): Date | null {
  const [y, m, d] = date.split('-').map(Number);
  const day0 = Date.UTC(y, m - 1, d);
  let t = 720;
  for (let pass = 0; pass < 3; pass++) {
    const D = day0 / 86400000 + 2440587.5 + t / 1440 - 2451545.0;
    const g = (357.529 + 0.98560028 * D) * RAD;
    const q = (((280.459 + 0.98564736 * D) % 360) + 360) % 360;
    const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
    const e = (23.439 - 0.00000036 * D) * RAD;
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    let ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD / 15;
    ra = ((ra % 24) + 24) % 24;
    let eqt = q / 15 - ra;
    eqt = (((eqt + 12) % 24) + 24) % 24 - 12;
    const phi = lat * RAD;
    const cosH = (Math.sin(h * RAD) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (Math.abs(cosH) > 1) return null;
    const H = Math.acos(cosH) / RAD;
    t = morning ? 720 - 4 * (lon + H) - eqt * 60 : 720 - 4 * (lon - H) - eqt * 60;
  }
  return new Date(day0 + t * 60000);
}

/** Sun times for a local date at the hotel (Europe/Tirane wall clock, DST-safe). */
export function sunTimes(date: string, lat = COORDS.lat, lon = COORDS.lon): SunInfo | null {
  const rise = sunEvent(date, lat, lon, -0.833, true);
  const set = sunEvent(date, lat, lon, -0.833, false);
  if (!rise || !set) return null;
  const g6m = sunEvent(date, lat, lon, 6, true);
  const g6e = sunEvent(date, lat, lon, 6, false);
  const dawn = sunEvent(date, lat, lon, -6, true);
  const dusk = sunEvent(date, lat, lon, -6, false);
  return {
    sunrise: hm(rise), sunset: hm(set), golden_start: hm(g6e), golden_morning_end: hm(g6m),
    civil_dawn: hm(dawn), civil_dusk: hm(dusk), day_length_min: Math.round((set.getTime() - rise.getTime()) / 60000),
  };
}

/* ------------------------------------------------------------------ season items */

interface SeasonItem { key?: string; id?: string; type?: string; months?: number[]; sq?: string; en?: string; text_sq?: string; text_en?: string; source_url?: string; source?: string | { url?: string }; verified?: boolean; confidence?: string; date?: string }
interface SeasonFile { months?: { month: number; items: SeasonItem[] }[]; items?: SeasonItem[] }
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function eventDate(x: SeasonItem): string | null | undefined {
  if (typeof x.date === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : null;
  const m = /\((\d{4}):\s*(\d{1,2})\s+([A-Za-z]+)\)/.exec(x.text_en ?? x.en ?? '');
  if (!m) return undefined;
  const mi = MONTHS_EN.indexOf(m[3].toLowerCase());
  if (mi < 0) return null;
  return `${m[1]}-${String(mi + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/**
 * "What's in season now" from research/seasons.json: `verified: true` items (or high / medium
 * confidence); a dated event only until its day and only for the year it names.
 */
export function seasonItems(month: number): LivePayload['season_now']['items'] {
  const r = readResearch<SeasonItem[] | SeasonFile>('seasons.json');
  let list: SeasonItem[] = [];
  if (Array.isArray(r)) list = r.filter((x) => Array.isArray(x.months) && x.months.includes(month));
  else if (r?.months) {
    const m = r.months.find((x) => Number(x.month) === month);
    list = (m?.items ?? []).map((x, i) => ({ ...x, key: x.key ?? x.id ?? `${x.type ?? 'item'}-${month}-${i + 1}` }));
  } else if (r?.items) list = r.items.filter((x) => Array.isArray(x.months) && x.months.includes(month));
  // verified = the cited source states the item as worded (low-confidence items are worded as
  // what the source says, e.g. "travel-guide advice"); unverified only when high/medium
  const ok = (x: SeasonItem) => x.verified === true || x.confidence === 'high' || (x.confidence === 'medium' && x.type !== 'event');
  const now = tirane().date;
  const current = (x: SeasonItem) => {
    if (x.type !== 'event') return true;
    const d = eventDate(x);
    if (d === undefined) return true;
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

/* ------------------------------------------------------------------ fetching */

const API_TIMEOUT = 4000;
const MET_MIN_TTL = 10 * 60 * 1000;   // never more often than every 10 minutes
const MET_MAX_TTL = 60 * 60 * 1000;   // and at least hourly, whatever Expires says
const SEA_TTL = 6 * 3600 * 1000;      // MUR is a daily analysis
const SEA_KEEP = 3 * 86400 * 1000;    // a failed refresh keeps the last analysis up to 3 days
const OM_TTL = 30 * 60 * 1000;
const STALE_AFTER = 90 * 60 * 1000;   // weather older than this is "stale" for clients

const r1 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : null);
const ri = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null);

/** Identifying User-Agent (MET terms): app + site + contact. */
function userAgent(): string {
  let site = '';
  let mail = process.env.LIVE_CONTACT ?? '';
  try {
    site = getSetting('seo').site_url ?? '';
    const b = getSetting('business');
    if (!mail && b.email && !(b.placeholders ?? []).includes('email')) mail = b.email;
  } catch { /* no DB: placeholder below */ }
  return `DivjakaSmartTourism/1.0 (+${site || 'https://divjaka.example'}${mail ? `; ${mail}` : '; contact: see NEEDS_VERIFICATION'})`;
}

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<{ status: number; data: any; headers: Headers }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT), headers: { 'User-Agent': userAgent(), Accept: 'application/json', ...headers } });
  if (res.status === 304) return { status: 304, data: null, headers: res.headers };
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.split('?')[0]}`);
  return { status: res.status, data: await res.json(), headers: res.headers };
}

interface Weather { at: number; checkedAt: number; expires: number; lastModified: string | null; current: LiveWeather; daily: LiveDay[]; hourly: LiveHour[] }
interface Sea { at: number; temp: number; date: string }
interface OmExtra { at: number; aqi: number | null; pm25: number | null; wave_m: number | null; uv: number | null; sea_temp: number | null }

const G = globalThis as unknown as { __dvLive2?: { metRaw?: unknown; met?: Weather; sea?: Sea; om?: OmExtra; inflight?: Record<string, Promise<unknown> | undefined>; failedAt?: Record<string, number> } };
const state = G.__dvLive2 ?? (G.__dvLive2 = {});
state.inflight ??= {};
state.failedAt ??= {};

const localDate = (iso: string) => tirane(new Date(iso)).date;
const localTime = (iso: string) => tirane(new Date(iso)).time;

/** MET Locationforecast "complete" → current reading, next 24 hours, 7 local days. */
export function parseMet(json: any, now = Date.now()): Omit<Weather, 'at' | 'checkedAt' | 'expires' | 'lastModified'> | null {
  const ts: any[] = json?.properties?.timeseries ?? [];
  if (!ts.length) return null;
  // the entry for the current hour (the last one that has started), else the first
  let ci = 0;
  for (let i = 0; i < ts.length; i++) { if (Date.parse(ts[i].time) <= now) ci = i; else break; }
  const c = ts[ci];
  const det = c.data?.instant?.details ?? {};
  const sym: string = c.data?.next_1_hours?.summary?.symbol_code ?? c.data?.next_6_hours?.summary?.symbol_code ?? 'cloudy';
  const lab = metSymbol(sym);
  const today = tirane(new Date(now)).date;
  const sunToday = sunTimes(today);
  const nowLocal = tirane(new Date(now)).time;
  const isDay = sunToday ? nowLocal >= sunToday.sunrise && nowLocal < sunToday.sunset : !lab.night;
  const current: LiveWeather = {
    temp: r1(det.air_temperature) ?? 0,
    feels: r1(det.apparent_air_temperature) ?? r1(det.air_temperature) ?? 0,
    code: lab.code, symbol: sym, label_sq: lab.sq, label_en: lab.en,
    wind_kmh: r1((det.wind_speed ?? 0) * 3.6) ?? 0,
    wind_dir: ri(det.wind_from_direction) ?? 0,
    gust_kmh: typeof det.wind_speed_of_gust === 'number' ? r1(det.wind_speed_of_gust * 3.6) : null,
    humidity: ri(det.relative_humidity) ?? 0,
    cloud: ri(det.cloud_area_fraction),
    precip_mm: r1(c.data?.next_1_hours?.details?.precipitation_amount),
    pressure_hpa: ri(det.air_pressure_at_sea_level),
    uv: null,
    uv_clear_sky: r1(det.ultraviolet_index_clear_sky),
    is_day: isDay,
    valid_at: new Date(c.time).toISOString(),
  };
  const hourly: LiveHour[] = ts.slice(ci, ci + 25)
    .filter((t) => t.data?.next_1_hours)
    .slice(0, 24)
    .map((t) => {
      const d = t.data.instant.details;
      const s = t.data.next_1_hours.summary.symbol_code as string;
      return { at: new Date(t.time).toISOString(), time: localTime(t.time), temp: r1(d.air_temperature) ?? 0, code: metSymbol(s).code, symbol: s, wind_kmh: r1((d.wind_speed ?? 0) * 3.6) ?? 0, wind_dir: ri(d.wind_from_direction) ?? 0, precip_mm: r1(t.data.next_1_hours.details?.precipitation_amount) };
    });

  // days (Europe/Tirane): extremes from instant temps and 6-hour max/min; precipitation from
  // 1-hour amounts where the series is hourly, 6-hour amounts where it is 6-hourly
  const days = new Map<string, { tmax: number; tmin: number; wind: number; precip: number; havePrecip: boolean; sym: string; symRank: number; symHour: number }>();
  for (let i = ci; i < ts.length; i++) {
    const t = ts[i];
    const date = localDate(t.time);
    const d = t.data?.instant?.details ?? {};
    const e = days.get(date) ?? { tmax: -Infinity, tmin: Infinity, wind: 0, precip: 0, havePrecip: false, sym: '', symRank: -1, symHour: -99 };
    if (typeof d.air_temperature === 'number') { e.tmax = Math.max(e.tmax, d.air_temperature); e.tmin = Math.min(e.tmin, d.air_temperature); }
    const n6 = t.data?.next_6_hours;
    if (typeof n6?.details?.air_temperature_max === 'number') e.tmax = Math.max(e.tmax, n6.details.air_temperature_max);
    if (typeof n6?.details?.air_temperature_min === 'number') e.tmin = Math.min(e.tmin, n6.details.air_temperature_min);
    if (typeof d.wind_speed === 'number') e.wind = Math.max(e.wind, d.wind_speed * 3.6);
    const next = ts[i + 1];
    const gapH = next ? (Date.parse(next.time) - Date.parse(t.time)) / 3600000 : 1;
    const amt = gapH >= 6 && n6 ? n6.details?.precipitation_amount : t.data?.next_1_hours?.details?.precipitation_amount;
    if (typeof amt === 'number') { e.precip += amt; e.havePrecip = true; }
    // the day's symbol: the "worst" 6-hour symbol of the daytime periods (06–18 local)
    const hour = Number(localTime(t.time).slice(0, 2));
    const s6: string | undefined = n6?.summary?.symbol_code;
    if (s6 && hour >= 5 && hour <= 13) {
      const rk = symbolRank(s6);
      if (rk > e.symRank) { e.sym = s6; e.symRank = rk; e.symHour = hour; }
    } else if (!e.sym && (s6 || t.data?.next_1_hours?.summary?.symbol_code)) {
      e.sym = s6 ?? t.data.next_1_hours.summary.symbol_code;
    }
    days.set(date, e);
  }
  const daily: LiveDay[] = [...days.entries()]
    .filter(([, e]) => Number.isFinite(e.tmax) && e.sym)
    .slice(0, 7)
    .map(([date, e]) => {
      const l = metSymbol(e.sym);
      const s = sunTimes(date);
      return {
        date, code: l.code, symbol: e.sym.replace(/_(night|polartwilight)$/, '_day'), label_sq: l.sq, label_en: l.en,
        tmax: r1(e.tmax) ?? 0, tmin: r1(e.tmin) ?? 0, wind_max: r1(e.wind) ?? 0,
        precip_mm: e.havePrecip ? r1(e.precip) : null, precip_prob: null,
        sunrise: s?.sunrise ?? null, sunset: s?.sunset ?? null,
      };
    });
  return { current, daily, hourly };
}

async function refreshMet(): Promise<void> {
  const prev = state.met;
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${COORDS.lat.toFixed(4)}&lon=${COORDS.lon.toFixed(4)}`;
  const r = await fetchJson(url, prev?.lastModified ? { 'If-Modified-Since': prev.lastModified } : {});
  const exp = Date.parse(r.headers.get('expires') ?? '');
  const expires = Math.min(Date.now() + MET_MAX_TTL, Math.max(Date.now() + MET_MIN_TTL, Number.isFinite(exp) ? exp : 0));
  if (r.status === 304 && prev) {
    // unchanged upstream: re-derive "now" from the cached series on the next parse
    state.met = { ...prev, checkedAt: Date.now(), expires };
    return;
  }
  const parsed = parseMet(r.data);
  if (!parsed) throw new Error('MET: empty timeseries');
  state.met = { ...parsed, at: Date.now(), checkedAt: Date.now(), expires, lastModified: r.headers.get('last-modified') };
  state.metRaw = r.data;
}

async function refreshSea(): Promise<void> {
  const [la0, la1] = COORDS.sea_lat;
  const [lo0, lo1] = COORDS.sea_lon;
  const url = `https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41.json?analysed_sst%5B(last)%5D%5B(${la0}):(${la1})%5D%5B(${lo0}):(${lo1})%5D`;
  const r = await fetchJson(url);
  const rows: [string, number, number, number | null][] = r.data?.table?.rows ?? [];
  const vals = rows.map((x) => x[3]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > -2 && v < 40);
  if (!vals.length) throw new Error('MUR: no sea value');
  const temp = vals.reduce((a, b) => a + b, 0) / vals.length;
  state.sea = { at: Date.now(), temp: Math.round(temp * 10) / 10, date: String(rows[0][0]).slice(0, 10) };
}

/** Commercial Open-Meteo (only with OPEN_METEO_API_KEY): air quality, waves, actual UV. */
async function refreshOm(): Promise<void> {
  const key = process.env.OPEN_METEO_API_KEY;
  if (!key) return;
  const q = `latitude=${COORDS.lat}&longitude=${COORDS.lon}&timezone=Europe%2FTirane&apikey=${encodeURIComponent(key)}`;
  const [air, sea, fc] = await Promise.allSettled([
    fetchJson(`https://customer-air-quality-api.open-meteo.com/v1/air-quality?${q}&current=european_aqi,pm2_5`),
    fetchJson(`https://customer-marine-api.open-meteo.com/v1/marine?${q}&cell_selection=sea&current=wave_height,sea_surface_temperature`),
    fetchJson(`https://customer-api.open-meteo.com/v1/forecast?${q}&current=uv_index`),
  ]);
  const a = air.status === 'fulfilled' ? air.value.data?.current ?? {} : {};
  const m = sea.status === 'fulfilled' ? sea.value.data?.current ?? {} : {};
  const f = fc.status === 'fulfilled' ? fc.value.data?.current ?? {} : {};
  if (air.status === 'rejected' && sea.status === 'rejected' && fc.status === 'rejected') throw new Error('open-meteo (commercial): all failed');
  state.om = { at: Date.now(), aqi: ri(a.european_aqi), pm25: r1(a.pm2_5), wave_m: r1(m.wave_height), sea_temp: r1(m.sea_surface_temperature), uv: r1(f.uv_index) };
}

/** Run a refresh once at a time; after a failure, wait a minute before the next try. */
function kick(name: string, due: boolean, fn: () => Promise<void>): Promise<unknown> | undefined {
  const inflight = state.inflight!;
  const failed = state.failedAt!;
  if (!due) return inflight[name];
  if (failed[name] && Date.now() - failed[name] < 60_000) return inflight[name];
  if (!inflight[name]) {
    inflight[name] = fn()
      .then(() => { delete failed[name]; })
      .catch((e) => { console.warn(`[live] ${name}:`, (e as Error)?.message ?? e); failed[name] = Date.now(); })
      .finally(() => { inflight[name] = undefined; });
  }
  return inflight[name];
}

function refreshAll(): Promise<unknown>[] {
  const now = Date.now();
  return [
    kick('met', !state.met || now >= state.met.expires, refreshMet),
    kick('sea', !state.sea || now - state.sea.at >= SEA_TTL, refreshSea),
    kick('om', !!process.env.OPEN_METEO_API_KEY && (!state.om || now - state.om.at >= OM_TTL), refreshOm),
  ].filter(Boolean) as Promise<unknown>[];
}

const WEATHER_SRC: LiveSource = { key: 'weather', sq: 'Moti: MET Norway', en: 'Weather: MET Norway', url: 'https://api.met.no/', license: 'CC BY 4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/' };
const SEA_SRC: LiveSource = { key: 'sea', sq: 'Deti: NASA JPL MUR SST (NOAA ERDDAP)', en: 'Sea: NASA JPL MUR SST (NOAA ERDDAP)', url: 'https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1', license: 'PO.DAAC', license_url: 'https://podaac.jpl.nasa.gov/CitingPODAAC' };
const AIR_SRC: LiveSource = { key: 'air', sq: 'Ajri dhe valët: Open-Meteo.com (CAMS, DWD)', en: 'Air and waves: Open-Meteo.com (CAMS, DWD)', url: 'https://open-meteo.com/', license: 'CC BY 4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/' };
const SUN_SRC: LiveSource = { key: 'sun', sq: 'Dielli: llogaritur këtu (USNO/NOAA)', en: 'Sun: computed here (USNO/NOAA)', url: 'https://gml.noaa.gov/grad/solcalc/solareqns.PDF', license: 'public domain', license_url: 'https://gml.noaa.gov/grad/solcalc/' };

export async function getLive(): Promise<LivePayload> {
  const pending = refreshAll();
  // Only the very first request after a start waits (for at most the timeout); later ones get the
  // cached copy at once while the refresh runs in the background.
  if (!state.met && pending.length) await Promise.race([Promise.allSettled(pending), new Promise((r) => setTimeout(r, API_TIMEOUT + 200))]);
  const now = Date.now();
  // re-derive "now" from the cached series so the current hour advances between downloads
  let met = state.met;
  if (met && state.metRaw && now - met.checkedAt < MET_MAX_TTL * 2) {
    const p = parseMet(state.metRaw, now);
    if (p) met = { ...met, ...p };
  }
  const fresh = !!met && now - met.checkedAt < STALE_AFTER && now - Date.parse(met.current.valid_at) < 2 * 3600_000;
  const sea = state.sea && now - state.sea.at < SEA_KEEP ? state.sea : null;
  const om = state.om && now - state.om.at < 3 * 3600_000 ? state.om : null;
  const month = tirane().month;
  let availability: LivePayload['availability_today'] = { rooms_left: null, rooms_verified: false, sessions: [] };
  try {
    availability = cached('live-availability', () => {
      const verified = roomsVerified();
      return { rooms_left: verified ? roomsLeftTonight() : null, rooms_verified: verified, sessions: sessionsToday() };
    });
  } catch (e) {
    console.error('[live] availability', e);
  }
  const weather = met ? { ...met.current, uv: om?.uv ?? null } : null;
  const seaTemp = sea?.temp ?? om?.sea_temp ?? null;
  const sources: LiveSource[] = [WEATHER_SRC];
  if (sea) sources.push(SEA_SRC);
  if (om) sources.push(AIR_SRC);
  sources.push(SUN_SRC);
  return {
    updated_at: new Date(met?.checkedAt ?? now).toISOString(),
    stale: !fresh,
    weather,
    marine: seaTemp != null || om?.wave_m != null ? { sea_temp: seaTemp, wave_m: om?.wave_m ?? null, sea_date: sea?.date ?? null } : null,
    air: om && (om.aqi != null || om.pm25 != null) ? { aqi: om.aqi, pm25: om.pm25 } : null,
    sun: sunTimes(tirane().date),
    daily: met?.daily ?? [],
    hourly: met?.hourly ?? [],
    season_now: { month, items: cached(`live-season|${month}`, () => seasonItems(month)) },
    availability_today: availability,
    attribution: { sq: 'Të dhënat e motit: MET Norway (CC BY 4.0)', en: 'Weather data from MET Norway (CC BY 4.0)', url: 'https://api.met.no/' },
    sources,
    provider: { weather: 'met-norway', sea: sea ? 'nasa-jpl-mur' : null, air: om ? 'open-meteo' : null },
  };
}

/** Test hook: forget the cache. */
export function resetLiveCache(): void {
  state.met = undefined;
  state.sea = undefined;
  state.om = undefined;
  state.failedAt = {};
  state.metRaw = undefined;
}
