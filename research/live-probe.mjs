#!/usr/bin/env node
// Divjakë real-time panel probe. Node 18+ (written and run on Node 24), no dependencies.
//   node research/live-probe.mjs          -> fetch every endpoint, print a compact summary
//   node research/live-probe.mjs --save   -> also write each response to research/live-samples/probe-*.json
// Exit code 1 when any Open-Meteo endpoint fails (the panel's core data).
// Sources for every URL, parameter and convention used here: research/live.md.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAVE = process.argv.includes('--save');
const TZ = 'Europe/Tirane';
const ORIGIN = 'https://divjaka.example'; // any foreign origin: proves the API answers cross-origin requests

// Coordinates verified 2026-10-23 (see live.md, "Coordinates").
const POINTS = {
  town: { lat: 40.9956, lon: 19.5331, name: 'Divjakë town (OSM relation 1251476)' },
  beach: { lat: 40.9716, lon: 19.4775, name: 'Divjaka beach (OSM node 7875214285), ~200 m from Hotel Pelikan' },
};
const P = POINTS.beach;
const tz = encodeURIComponent(TZ);

const CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,sunrise,sunset,daylight_duration,moonrise,moonset,moon_phase';

// timeformat=unixtime on purpose: with ISO output Open-Meteo applies ONE fixed UTC offset to the
// whole range and ignores DST changes (documented), so ISO sunrise/sunset are 1 h off after a switch.
const ENDPOINTS = {
  forecast: `https://api.open-meteo.com/v1/forecast?latitude=${P.lat}&longitude=${P.lon}&current=${CURRENT}&daily=${DAILY}&timezone=${tz}&timeformat=unixtime&forecast_days=7&wind_speed_unit=kmh`,
  marine: `https://marine-api.open-meteo.com/v1/marine?latitude=${P.lat}&longitude=${P.lon}&current=wave_height,wave_direction,wave_period,sea_surface_temperature&daily=wave_height_max,wave_direction_dominant,wave_period_max&hourly=sea_level_height_msl&timezone=${tz}&timeformat=unixtime&forecast_days=7`,
  air: `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${P.lat}&longitude=${P.lon}&current=european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,grass_pollen,olive_pollen,ragweed_pollen&timezone=${tz}&timeformat=unixtime`,
  inat: 'https://api.inaturalist.org/v1/observations?place_id=173571&iconic_taxa=Aves&quality_grade=research&order_by=observed_on&order=desc&per_page=5&locale=sq',
};
const CORE = ['forecast', 'marine', 'air'];
// Saved samples keep only the fields the panel would use (the raw iNaturalist reply is ~400 KB of observer profiles).
const SLIM = {
  inat: (b) => ({
    total_results: b.total_results,
    results: b.results.map((o) => ({
      observed_on: o.observed_on, uri: o.uri, license_code: o.license_code,
      taxon: o.taxon && { id: o.taxon.id, name: o.taxon.name, preferred_common_name: o.taxon.preferred_common_name },
      photo: o.photos?.[0] && { url: o.photos[0].url, license_code: o.photos[0].license_code, attribution: o.photos[0].attribution },
    })),
  }),
};

// ---------- fetch with retry (the network here drops connections now and then) ----------
async function get(name, url, tries = 4) {
  let last;
  for (let i = 1; i <= tries; i++) {
    const t0 = performance.now();
    try {
      const res = await fetch(url, { headers: { Origin: ORIGIN, Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      const body = await res.json();
      const ms = Math.round(performance.now() - t0);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(body).slice(0, 160)}`);
      if (SAVE) {
        const dir = join(HERE, 'live-samples');
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, `probe-${name}.json`), JSON.stringify(SLIM[name] ? SLIM[name](body) : body, null, 2));
      }
      return { ok: true, body, ms, status: res.status, acao: res.headers.get('access-control-allow-origin'), tries: i };
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  const cause = last?.cause?.code || last?.cause?.message;
  return { ok: false, error: `${last?.message || last}${cause ? ` (${cause})` : ''}`, tries };
}

// ---------- formatting helpers ----------
const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const tzName = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, timeZoneName: 'short' });
const clock = (unix) => (unix == null ? '--:--' : hm.format(unix * 1000));
const zone = (unix) => tzName.formatToParts(unix * 1000).find((p) => p.type === 'timeZoneName')?.value;
// Daily "time" is local midnight under the FIXED offset, so read the calendar date with that same offset.
const dayLabel = (unix, offset) => new Date((unix + offset) * 1000).toISOString().slice(0, 10);

const COMPASS = {
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
  sq: ['V', 'VL', 'L', 'JL', 'J', 'JP', 'P', 'VP'], // Veri, Verilindje, Lindje, Juglindje, Jug, Jugperëndim, Perëndim, Veriperëndim
};
const compass = (deg, lang = 'en') => COMPASS[lang][Math.round(((deg % 360) + 360) % 360 / 45) % 8];

// European AQI bands, as defined in the Open-Meteo Air Quality docs (0-20 good ... >100 extremely poor).
// Albanian adjectives agree with "Cilësia e ajrit" (feminine).
const AQI = [
  [20, 'Good', 'E mirë'], [40, 'Fair', 'E pranueshme'], [60, 'Moderate', 'Mesatare'],
  [80, 'Poor', 'E dobët'], [100, 'Very poor', 'Shumë e dobët'], [Infinity, 'Extremely poor', 'Jashtëzakonisht e dobët'],
];
const aqiBand = (v) => AQI.find(([max]) => v <= max);

// WHO UV index bands (0-2, 3-7, 8+).
const uvBand = (v) => (v < 3 ? ['low (0-2)', 'i ulët'] : v < 8 ? ['seek shade at midday (3-7)', 'kërkoni hije në mesditë'] : ['avoid midday sun (8+)', 'shmangni diellin e mesditës']);

// Moon phase: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter (Open-Meteo daily moon_phase,
// same convention as SunCalc; checked against the 26 Oct 2026 05:11 full moon, which reads 0.509 that day).
// A named phase is shown only on the day it happens (within half a day = 0.5/29.53 of the exact value);
// snapping to the nearest eighth would call three days in a row "full moon".
const MOON = {
  0: ['New moon', 'Hënë e re'], 0.25: ['First quarter', 'Çereku i parë'], 0.5: ['Full moon', 'Hënë e plotë'], 0.75: ['Last quarter', 'Çereku i fundit'],
  wxc: ['Waxing crescent', 'Drapër në rritje'], wxg: ['Waxing gibbous', 'Hënë në rritje'], wng: ['Waning gibbous', 'Hënë në rënie'], wnc: ['Waning crescent', 'Drapër në rënie'],
};
function moonName(p) {
  const HALF_DAY = 0.5 / 29.53;
  for (const q of [0, 0.25, 0.5, 0.75, 1]) if (Math.abs(p - q) <= HALF_DAY) return MOON[q % 1];
  return MOON[p < 0.25 ? 'wxc' : p < 0.5 ? 'wxg' : p < 0.75 ? 'wng' : 'wnc'];
}

// ---------- Sun: USNO "Computing Approximate Solar Coordinates" (aa.usno.navy.mil/faq/sun_approx, ~1 arcmin)
// for declination + equation of time, then the NOAA rise/set hour-angle formula
// (gml.noaa.gov/grad/solcalc/solareqns.PDF) generalised to any altitude. NOAA's own short Fourier series for
// declination was tried first and ran ~0.37° (about a day) off in late Oct 2026 -> ~3 min too long a day.
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const norm = (x, m) => ((x % m) + m) % m;
function solar(utcMs) {
  const D = utcMs / 86400000 + 2440587.5 - 2451545.0; // days from J2000.0 (JD - 2451545.0)
  const g = rad(norm(357.529 + 0.98560028 * D, 360));
  const q = norm(280.459 + 0.98564736 * D, 360);
  const L = rad(q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));
  const e = rad(23.439 - 0.00000036 * D);
  const decl = Math.asin(Math.sin(e) * Math.sin(L)); // radians
  const ra = norm(deg(Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L))) / 15, 24); // hours
  let eqt = q / 15 - ra; // hours
  eqt = norm(eqt + 12, 24) - 12;
  return { decl, eqtime: eqt * 60 }; // eqtime in minutes
}
// Unix seconds when the sun's centre crosses altitude `alt` degrees on calendar date `ymd` (the local date),
// morning ('am') or evening ('pm'). alt = -0.833 is sunrise/sunset (refraction + solar semi-diameter).
function sunAt(ymd, lat, lon, alt, part) {
  const day0 = Date.parse(`${ymd}T00:00:00Z`);
  let when = day0 + (12 - lon / 15) * 3600e3; // first guess: local solar noon
  for (let pass = 0; pass < 2; pass++) { // second pass re-evaluates the sun at the event time itself
    const { eqtime, decl } = solar(when);
    const c = Math.cos(rad(90 - alt)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
    if (c < -1 || c > 1) return null; // the sun never reaches that altitude that day
    const ha = deg(Math.acos(c));
    when = day0 + (720 - 4 * (lon + (part === 'am' ? ha : -ha)) - eqtime) * 60e3;
  }
  return Math.round(when / 1000);
}

// ---------- run ----------
const codes = JSON.parse(await readFile(join(HERE, 'weathercodes.json'), 'utf8'));
const label = (c) => codes[String(c)] ?? { sq: `Kodi ${c}`, en: `Code ${c}`, icon: 'unknown' };

const t0 = performance.now();
const names = Object.keys(ENDPOINTS);
// One at a time: on this machine parallel connects time out far more often than sequential ones.
const results = {};
for (const n of names) results[n] = await get(n, ENDPOINTS[n], 5);
const out = [];
const line = (s = '') => out.push(s);

line(`Divjakë live probe  ${new Date().toISOString()}  point: ${P.name} (${P.lat}, ${P.lon})`);
line('endpoint  ok  status  ms    tries  access-control-allow-origin');
for (const n of names) {
  const r = results[n];
  line(`${n.padEnd(9)} ${r.ok ? 'yes' : 'NO '} ${String(r.status ?? '-').padEnd(7)} ${String(r.ms ?? '-').padEnd(5)} ${String(r.tries).padEnd(6)} ${r.ok ? r.acao : r.error}`);
}

const f = results.forecast;
if (f.ok) {
  const b = f.body, c = b.current, u = b.current_units, d = b.daily, off = b.utc_offset_seconds;
  const w = label(c.weather_code);
  line();
  line(`NOW ${clock(c.time)} ${zone(c.time)}  grid cell ${b.latitude},${b.longitude} elev ${b.elevation} m`);
  line(`  ${w.en} / ${w.sq}  [${c.is_day ? w.icon : w.iconNight ?? w.icon}]  ${c.temperature_2m}${u.temperature_2m} (feels ${c.apparent_temperature}${u.apparent_temperature})  RH ${c.relative_humidity_2m}%  cloud ${c.cloud_cover}%  precip ${c.precipitation} mm`);
  line(`  wind ${c.wind_speed_10m} km/h from ${compass(c.wind_direction_10m)}/${compass(c.wind_direction_10m, 'sq')} (${c.wind_direction_10m}°) gusts ${c.wind_gusts_10m} km/h  UV ${c.uv_index} -> ${uvBand(c.uv_index)[0]} / ${uvBand(c.uv_index)[1]}`);
  line('7-DAY  date        code               min/max °C  rain mm (prob)  wind/gust km/h  UVmax  sunrise sunset  moon');
  for (let i = 0; i < d.time.length; i++) {
    const m = moonName(d.moon_phase[i]);
    line(`  ${dayLabel(d.time[i], off)}  ${String(d.weather_code[i]).padStart(2)} ${label(d.weather_code[i]).en.padEnd(16)} ${String(d.temperature_2m_min[i]).padStart(4)}/${String(d.temperature_2m_max[i]).padEnd(5)}  ${String(d.precipitation_sum[i]).padStart(4)} (${String(d.precipitation_probability_max[i]).padStart(3)}%)    ${String(d.wind_speed_10m_max[i]).padStart(4)}/${String(d.wind_gusts_10m_max[i]).padEnd(5)}      ${String(d.uv_index_max[i]).padEnd(5)}  ${clock(d.sunrise[i])}   ${clock(d.sunset[i])} ${zone(d.sunset[i])}  ${m[0]} (${d.moon_phase[i]})`);
  }
  // Golden hour + cross-check of Open-Meteo sunrise/sunset against the NOAA equations.
  line('SUN    date        OM rise/set   calc rise/set  diff(min)  golden AM (rise→+6°) golden PM (+6°→sunset)  extended PM (→-6°)');
  for (let i = 0; i < d.time.length; i++) {
    const ymd = dayLabel(d.time[i], off);
    const nr = sunAt(ymd, P.lat, P.lon, -0.833, 'am'), ns = sunAt(ymd, P.lat, P.lon, -0.833, 'pm');
    const g6am = sunAt(ymd, P.lat, P.lon, 6, 'am'), g6pm = sunAt(ymd, P.lat, P.lon, 6, 'pm'), dusk = sunAt(ymd, P.lat, P.lon, -6, 'pm');
    const dr = ((nr - d.sunrise[i]) / 60).toFixed(1), ds = ((ns - d.sunset[i]) / 60).toFixed(1);
    line(`  ${ymd}  ${clock(d.sunrise[i])}/${clock(d.sunset[i])}   ${clock(nr)}/${clock(ns)}    ${dr}/${ds}    ${clock(d.sunrise[i])}-${clock(g6am)}        ${clock(g6pm)}-${clock(d.sunset[i])}            ${clock(g6pm)}-${clock(dusk)}`);
  }
}

const m = results.marine;
if (m.ok) {
  const b = m.body, c = b.current, d = b.daily, off = b.utc_offset_seconds;
  const sl = (b.hourly?.sea_level_height_msl ?? []).filter((x) => x != null);
  line();
  line(`SEA ${clock(c.time)}  grid cell ${b.latitude},${b.longitude}  water ${c.sea_surface_temperature} °C  waves ${c.wave_height} m, period ${c.wave_period} s, direction ${c.wave_direction}°`);
  line(`  wave max next days: ${d.time.map((t, i) => `${dayLabel(t, off).slice(5)} ${d.wave_height_max[i]} m`).join(' | ')}`);
  if (sl.length) line(`  modelled sea level (tide + surge) over 7 days: ${Math.min(...sl).toFixed(2)} .. ${Math.max(...sl).toFixed(2)} m (range ${(Math.max(...sl) - Math.min(...sl)).toFixed(2)} m)`);
}

const a = results.air;
if (a.ok) {
  const b = a.body, c = b.current, band = aqiBand(c.european_aqi);
  line();
  line(`AIR ${clock(c.time)}  grid cell ${b.latitude},${b.longitude}  European AQI ${c.european_aqi} -> ${band[1]} / ${band[2]}  PM2.5 ${c.pm2_5}  PM10 ${c.pm10}  NO2 ${c.nitrogen_dioxide}  O3 ${c.ozone} µg/m³`);
  line(`  pollen grains/m³: grass ${c.grass_pollen}  olive ${c.olive_pollen}  ragweed ${c.ragweed_pollen}`);
}

const n = results.inat;
if (n.ok) {
  line();
  line(`BIRDS iNaturalist place 173571 (Divjakë-Karavasta National Park): ${n.body.total_results} research-grade bird observations; latest:`);
  for (const o of n.body.results) {
    const t = o.taxon ?? {};
    const photo = o.photos?.[0];
    line(`  ${o.observed_on}  ${t.name}${t.preferred_common_name ? ` (${t.preferred_common_name})` : ''}  obs licence ${o.license_code ?? 'all rights reserved'}, photo ${photo ? photo.license_code ?? 'all rights reserved' : 'none'}  ${o.uri}`);
  }
}

line();
line(`done in ${Math.round(performance.now() - t0)} ms${SAVE ? ' (responses saved to research/live-samples/probe-*.json)' : ''}`);
console.log(out.join('\n'));
process.exitCode = CORE.every((k) => results[k].ok) ? 0 : 1;
