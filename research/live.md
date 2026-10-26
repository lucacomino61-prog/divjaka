# Real-time information panel: data sources (researched 2026-10-23)

Scope: keyless, free, browser-callable (CORS) APIs for the "informacione në kohë reale" part of the spec (SPEC.md, project goal).
Everything below was called or opened on 2026-10-23. Confidence: **H** = official source or two independent ones, **M** = one reputable source, **L** = unclear or conflicting.
Sources are listed as [S#] at the end.

> **Verified 2026-10-23 by an adversarial pass: see "## Verification" at the end.** Where it differs from the sections above (Albanian labels in §4, attribution link in §7, open questions in §10), the Verification section wins.

## 0. Bottom line

| Need | Use | Keyless | CORS | Licence for a hotel site | Conf. |
| --- | --- | --- | --- | --- | --- |
| Weather now + 7 days, UV, sunrise/sunset, moon | Open-Meteo Forecast `/v1/forecast` | yes | `*` (tested) | free tier is **non-commercial only**; a business site needs a paid plan ("API Standard" or higher) | H |
| Sea temperature, waves | Open-Meteo Marine `/v1/marine` | yes | `*` (tested) | same | H |
| Air quality (European AQI, PM2.5), pollen in season | Open-Meteo Air Quality `/v1/air-quality` (CAMS Europe) | yes | `*` (tested) | same, and credit CAMS | H |
| Recent bird sightings in the park | iNaturalist API v1 | yes | `*` (tested) | API usable; many observation photos are CC BY-NC or all rights reserved, so show names/dates and link out, don't reuse those photos | M |
| Bird sightings from eBird | eBird API 2.0 | **no**: key needed | n/a | **commercial use needs prior written permission** from the Cornell Lab | H |
| Tide | none needed | — | — | Adriatic tides are small; model shows ~0.3–0.46 m sea-level swing incl. weather; not a useful visitor metric | M |

**Commercial-use conclusion (H):** Open-Meteo's terms list "Commercial products or promotional activities" and "Websites or apps that have subscriptions or display advertisements" as commercial use, and say "You may only use the free API services for non-commercial purposes" [S1]. The Hotel Pelikan site promotes and sells the hotel's services, so it falls under commercial use. A paid subscription "grants a commercial use licence and an API key for the dedicated customer endpoint at customer-api.open-meteo.com" [S2]. The monthly prices sit in an embedded Stripe pricing table that I could not read (cross-origin iframe). **Open question for the owner: subscribe to the API Standard plan (1M calls/month) before launch. Price not verified.** The free tier is fine for development and prototyping ("Use the free tier for evaluation and prototyping" [S2]).

**Architecture (matches PLAN.md `GET /api/live`):** call Open-Meteo **from the server**, not from the visitor's browser: (1) the commercial `apikey` must stay secret; (2) one cached server call serves every visitor (rate limits apply "by IP addresses and application" [S1]); (3) visitors' IPs are not sent to a third party. Keep the free host while there is no key and switch hosts when `OPEN_METEO_API_KEY` is set: `api.` → `customer-api.`, `marine-api.` → `customer-marine-api.`, `air-quality-api.` → `customer-air-quality-api.`, plus `&apikey=…`. The docs say "The server URL requires the prefix customer-" [S4][S6]. The hostname pattern for the marine and air-quality hosts is inferred from that sentence, so check it once a key exists. **M**

## 1. Coordinates (verified)

| Point | Lat, Lon | Source | Conf. |
| --- | --- | --- | --- |
| Divjakë town | **40.9956, 19.5331** (OSM admin relation 1251476, addresstype town) | Nominatim/OSM [S7] | H (two sources) |
| Divjakë town | 40.9964, 19.5327 | Wikidata Q1945622 P625 [S8] | ↑ agrees within ~100 m |
| Divjaka beach | **40.9716, 19.4775** (OSM node 7875214285, tourism=attraction "Divjaka beach") | Nominatim/OSM [S7] | M |
| Hotel Pelikan | 40.9722, 19.4798 (OSM node 11021725056) | Nominatim/OSM [S7]; same as business.md (Booking 40.972262, 19.479574) | H |
| Karavasta Lagoon (centroid) | 40.9275, 19.4986 | Wikidata Q1729043 [S8] | M |
| Divjakë-Karavasta National Park | 40.9242, 19.4931 | Wikidata Q1231952 [S8] | M |

- The brief's "town ~40.997 N, 19.530 E" is about 300 m off. Use 40.9956, 19.5331.
- The brief's "beach/lagoon ~40.98 N, 19.47 E" is not a named place: Nominatim reverse-geocodes it to the country only. The beach is at 40.9716, 19.4775, about 1 km south of it and about 200 m from the hotel. The lagoon lies further south (~40.93 N).
- **Panel point: the beach (40.9716, 19.4775).** The hotel sits at the beach. The town point gives nearly the same values (sample: max 21.0 vs 19.8 °C today).
- Open-Meteo snaps each request to a model grid cell and returns that cell's coordinates. Beach request → forecast cell 41.0161, 19.4579 (elev 0 m; default `cell_selection=land`, which picks a land cell "with similar elevation" [S4]); marine cell 40.9583, 19.4583 (sea); air-quality cell 41.0, 19.5 (CAMS Europe 0.1° grid). `cell_selection=nearest` picks a sea cell 3 km SW instead (19.3 vs 19.9 °C at test time). Keep the default.
- **No lagoon water temperature exists.** The marine models (≈5–8 km grid [S5]) only cover the open sea. The SST shown is the Adriatic off the beach. Label it "Sea / Deti", never "Lagoon / Laguna".

## 2. Endpoints, exact URLs, response shapes

All URLs use the beach point. For production use `timeformat=unixtime`; see **§3 DST trap**.

### 2.1 Forecast — current + 7 days + sun/moon
```
https://api.open-meteo.com/v1/forecast?latitude=40.9716&longitude=19.4775
 &current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index
 &daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max,sunrise,sunset,daylight_duration,moonrise,moonset,moon_phase
 &timezone=Europe%2FTirane&timeformat=unixtime&forecast_days=7&wind_speed_unit=kmh
```
(Written on one line in `live-probe.mjs`.) Response:
```
{ latitude, longitude, elevation, generationtime_ms, utc_offset_seconds: 7200, timezone: "Europe/Tirane", timezone_abbreviation: "GMT+2",
  current_units: { temperature_2m: "°C", wind_speed_10m: "km/h", wind_direction_10m: "°", weather_code: "wmo code", uv_index: "", ... },
  current: { time: <unix>, interval: 900, temperature_2m: 19.9, apparent_temperature: 20.2, relative_humidity_2m: 72, is_day: 1,
             precipitation: 0, weather_code: 1, cloud_cover: 43, wind_speed_10m: 8, wind_direction_10m: 306, wind_gusts_10m: 19.4, uv_index: 4.3 },
  daily_units: { ..., sunrise: "unixtime", daylight_duration: "s", moon_phase: "fraction" },
  daily: { time: [7 × unix], weather_code: [...], temperature_2m_max: [...], ..., sunrise: [...], sunset: [...],
           daylight_duration: [...], moonrise: [...], moonset: [...], moon_phase: [0.401, 0.436, ...] } }
```
- `current` is 15-minutely (`interval: 900`). `uv_index` works in `current` (tested).
- `wind_direction_10m`: Open-Meteo returns degrees. The probe labels it as the direction the wind blows **from**, the usual meteorological convention. I did not find that sentence on the docs page. **M**
- The docs list daily `moonrise`, `moonset` and `moon_phase` [S4]. All three returned data. Their definitions are not in the docs table, so the phase convention was checked in §5. **M→H**
- Samples: `live-samples/probe-forecast.json` (unixtime), `forecast-beach.json`, `forecast-town.json` (ISO, with `.headers.txt`), `forecast-moon-unixtime.json`.

### 2.2 Marine — sea temperature, waves (+ sea level)
```
https://marine-api.open-meteo.com/v1/marine?latitude=40.9716&longitude=19.4775
 &current=wave_height,wave_direction,wave_period,sea_surface_temperature
 &daily=wave_height_max,wave_direction_dominant,wave_period_max
 &hourly=sea_level_height_msl
 &timezone=Europe%2FTirane&timeformat=unixtime&forecast_days=7
```
Response: `current {time, interval: 900, wave_height (m), wave_direction (°), wave_period (s), sea_surface_temperature (°C)}`, `daily {time, wave_height_max, wave_direction_dominant, wave_period_max}`, `hourly {time, sea_level_height_msl}`. Today: water 21 °C, waves 0.24 m / 3.9 s; daily max 0.24–0.64 m.
- The marine API's default `cell_selection` is `sea` [S5], so the beach coordinate works as is.
- Data sources per docs [S5]: Météo-France MFWAM (0.08°, 3-hourly, every 12 h), Météo-France SST (0.08°, 6-hourly, every 24 h), ECMWF WAM (9 km), DWD EWAM (Europe 0.05°), NCEP GFS Wave, and others.
- Docs warning, quoted: "Accuracy at coastal areas is limited. This is not suitable for coastal navigation and does not replace your nautical almanac." [S5]. Show sea data as indicative.
- I did not find on the docs page whether `wave_direction` means "coming from" or "going to". **Show it as an arrow only after checking.** The panel can do without it.
- Samples: `probe-marine.json`, `marine-beach.json` (+headers), `marine-sealevel-beach.json`.

### 2.3 Air quality — European AQI, PM2.5 (+ pollen)
```
https://air-quality-api.open-meteo.com/v1/air-quality?latitude=40.9716&longitude=19.4775
 &current=european_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,grass_pollen,olive_pollen,ragweed_pollen
 &timezone=Europe%2FTirane&timeformat=unixtime
```
Response: `current {time, interval: 3600, european_aqi (EAQI), pm2_5, pm10, nitrogen_dioxide, ozone (µg/m³), *_pollen (grains/m³)}`. Today: EAQI 27–30 (Fair), PM2.5 4.3–5.7.
- Source: CAMS European Air Quality Forecast, 0.1° (~11 km), hourly, updated every 24 h with a 4-day forecast. The default `domains=auto` combines it with CAMS Global (0.4°) [S6]. Albania gets the 0.1° European grid (cell 41.0, 19.5). **H**
- European AQI bands (docs, quoted): "0-20 (good), 20-40 (fair), 40-60 (moderate), 60-80 (poor), 80-100 (very poor) and exceeds 100 for extremely poor conditions"; `european_aqi` "returns the maximum of all individual indices" [S6]. **H**
- Pollen is "Only available in Europe during pollen season with 4 days forecast" [S6]. It returned 0 for all six types in late October. Hide the pollen row when every value is 0 or null.
- Air-quality `uv_index` (3.1) differed from the forecast `uv_index` (4.1) at the same moment, because they come from different models. **Take UV from the forecast endpoint only.**
- Samples: `probe-air.json`, `airquality-beach.json` (+headers), `airquality-pollen.json`.

### 2.4 CORS result (H)
- `curl -D` with `Origin: https://divjaka.example` got these headers back on all three hosts: `access-control-allow-origin: *`, `access-control-allow-methods: GET, POST, OPTIONS`, `access-control-allow-headers: accept, authorization, content-type, origin, …`, `access-control-max-age: 600` (saved in `live-samples/*.headers.txt`).
- Real browser test: from a page at `https://example.com`, `fetch()` of the forecast, marine, air-quality and iNaturalist URLs returned 200 with readable bodies, so CORS passes. eBird without a key returned **403**.
- `live-probe.mjs` (Node fetch with an `Origin` header) prints `access-control-allow-origin: *` for all four.

### 2.5 Rate limits and call budget
- Free tier: "Less than 10'000 API calls per day, 5'000 per hour and 600 per minute"; 300,000/month [S1][S2].
- Paid tiers: API Standard 1M calls/month, Professional 5M, Enterprise 50M+. No per-minute, hourly or daily limit on paid plans [S2].
- Call weighting [S2]: "Requests for data covering more than 10 weather variables or extending over a period of more than 2 weeks for a single location are considered multiple API calls". Fractional counts apply, for example 15 variables = 1.5 calls.
- The forecast URL above asks for 26 variables, so it counts as about 2.6 calls; the marine and air-quality URLs count as 1 each. With a 10-minute server cache (PLAN.md): 144 refreshes × 4.6 ≈ **660 calls/day ≈ 20k/month**. That fits the free tier and is far under API Standard. Air quality only changes hourly, so a 60-minute cache on that endpoint gives about 18k/month. Network note: from this machine, connects to all API hosts sometimes timed out (about 20 s, then OK on retry). Production code needs a timeout, retries, and stale-while-error. PLAN.md already plans `stale:true`.

## 3. DST trap (H, important)

The docs, verbatim [S4][S6]: "The requested timezone's UTC offset at request time is returned as utc_offset_seconds and used for ISO 8601 timestamps and daily boundaries throughout the response. Daylight saving time (DST) changes within the requested range are ignored. For DST-aware local times, request timeformat=unixtime and convert using the returned timezone in your application."

Albania leaves summer time on **Sun 25 Oct 2026** [S9]. In the ISO sample taken on 23 Oct, sunrise for 25 Oct reads `07:04`; the real local time is **06:04 CET**. The unixtime response formatted with `Intl.DateTimeFormat(…, {timeZone: 'Europe/Tirane'})` gives the right 06:04. The same problem returns on the last Sunday of March.

**Rule:** always request `timeformat=unixtime` and format with `timeZone: 'Europe/Tirane'`. The calendar date of a daily row is `new Date((time + utc_offset_seconds) * 1000).toISOString().slice(0, 10)`. Formatting `daily.time` directly in Europe/Tirane gives the **previous** day (23:00) once DST has ended inside the range.

## 4. Weather codes → `weathercodes.json`

Source table: the "WMO Weather interpretation codes (WW)" table and JSON mapping on the Open-Meteo docs [S4]. It has 29 codes (0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 97, 99). It now includes **97 "Heavy thunderstorm"**, and the docs note that 96/99 come only from models with an explicit hail forecast [S4].
- `en` labels are Open-Meteo's own.
- `sq` labels were written by this agent in standard Albanian: drizzle = "shi i imët", showers = "rrebeshe", thunderstorm = "stuhi me bubullima", rime = "brymë", freezing = "që ngrin". **Have a native speaker check them before launch (M).**
- `icon` is a generic icon key: clear, mostly-clear, partly-cloudy, overcast, fog, drizzle, freezing-drizzle, rain-light, rain, rain-heavy, freezing-rain, snow-light, snow, snow-heavy, snow-grains, showers-light, showers, showers-heavy, snow-showers, thunderstorm, thunderstorm-hail.
- Codes 0–2 also carry `iconNight`, used when `current.is_day = 0`.

## 5. Sun, moon, golden hour

- **Sunrise/sunset from Open-Meteo is correct (H).** For 23–29 Oct, Open-Meteo matches timeanddate's Durrës table (the nearest city timeanddate covers; it has no page for Divjakë, Lushnjë or Fier) within 1 minute [S9]. Example, 23 Oct: OM 07:02/17:49 vs Durrës 07:02/17:49; 25 Oct: OM 06:04/16:47 CET vs Durrës 06:05/16:46. Since Durrës lies further north, its day is slightly shorter, which fits. OM also matches the independent calculation below within 0.2 min on every day (probe output).
- **Moon phase (H):** `moon_phase` 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter, the same as SunCalc [S12]. Check: the full moon on 26 Oct 2026 at 05:11 Tirana time [S10] reads 0.509 on 26 Oct and 0.472 on 25 Oct. The value seems to be evaluated around local noon (inference). Naming rule used in the probe: give a named phase only on the day it happens (|phase − q| ≤ 0.5/29.53), otherwise waxing/waning crescent or gibbous. Snapping to the nearest eighth would label three days in a row "full".
  - Albanian names (agent-written; native check): Hënë e re, Drapër në rritje, Çereku i parë, Hënë në rritje, Hënë e plotë, Hënë në rënie, Çereku i fundit, Drapër në rënie.
- **Golden hour: definitions conflict (L on the definition, H on the maths):**
  - timeanddate: warm light "most likely occurs when the Sun is between 6 degrees below and 6 degrees above the horizon" [S11].
  - SunCalc: `goldenHour` "evening golden hour starts" at +6°; `goldenHourEnd` "morning golden hour … ends" at +6°; sunrise/sunset at −0.833° [S12].
  - **Recommendation:** show golden hour as **+6° → sunset** in the evening and **sunrise → +6°** in the morning, the photographers' SunCalc convention. Optionally extend it to civil dusk (−6°).
- **Formula** (any altitude *h*; −0.833° = sunrise/sunset, +6° = golden-hour edge, −6° = civil dusk):
  1. Sun position, USNO [S14], with D = JD − 2451545.0:
     g = 357.529 + 0.98560028 D
     q = 280.459 + 0.98564736 D
     L = q + 1.915 sin g + 0.020 sin 2g
     e = 23.439 − 0.00000036 D
     δ = asin(sin e · sin L)
     RA = atan2(cos e · sin L, cos L)/15 h
     EqT = q/15 − RA (hours; × 60 for minutes)
  2. Hour angle, NOAA [S13] generalised: cos H = cos(90° − h) / (cos φ · cos δ) − tan φ · tan δ. If |cos H| > 1, the sun never reaches *h* that day.
  3. Event time UTC (minutes after 00:00 UTC) [S13]: morning = 720 − 4·(λ + H) − EqT; evening = 720 − 4·(λ − H) − EqT, with λ = longitude in °E. Run a second pass that evaluates δ and EqT at the first-pass time.
  4. Example output (beach, 23 Oct): golden AM 07:02–07:40, golden PM 17:12–17:49, extended to 18:18.
  - NOAA's own short Fourier series for δ (in the same PDF [S13]) was tried first. It ran about 0.37° (≈1 day) off for late October 2026 and gave days ~3 min too long, so the probe uses the USNO sun position. Implementation: `sunAt()` in `live-probe.mjs`. **SunCalc** (BSD 2-clause per its LICENSE file, `npm i suncalc`, no dependencies, "matches the accuracy and conventions of timeanddate.com" per its README [S12]) is a drop-in alternative.

## 6. Other "genuinely real-time" candidates

- **iNaturalist (keyless, CORS `*`, M):**
  - `https://api.inaturalist.org/v1/observations?place_id=173571&iconic_taxa=Aves&quality_grade=research&order_by=observed_on&order=desc&per_page=5&locale=sq`
  - Place 173571 = "Divjakë-Karavasta National Park" (the API returns 4 park-related places: 69410 "Divjake-Karavasta", 173571, 181245, 174158).
  - 2,028 research-grade bird observations. The latest are from 29 Sep and 15 Sep 2026: Alcedo atthis, Circus aeruginosus, Calidris alpina, Phoenicopterus roseus. Some species carry Albanian common names with `locale=sq` (e.g. "Flamingo rozë").
  - Recent, not real time: weeks of lag.
  - Docs: throttle "max of 100 requests per minute … keep it to 60 … and to keep under 10,000 requests per day"; "The API is intended to support application development, not data scraping"; photos on `static.inaturalist.org` "do not have open licenses" [S16].
  - Licences in the sample: CC BY, CC BY-NC, and none (all rights reserved).
  - Use: a "latest sightings in the park" list with species name, date and a link to the observation. Show photos only when the licence is cc0/cc-by/cc-by-sa, with attribution.
  - iNaturalist's Terms of Service page sits behind a Cloudflare challenge and was not read. **Open question: does a hotel site displaying this count as allowed use under the ToS? (L)**
- **eBird (excluded, H):** "All APIs (with few exceptions) will require a key"; commercial use is barred "without prior written permission", where commercial means "any use by, on behalf of, or to inform or assist the activities of, a commercial entity"; attribution "eBird.org" is required [S15]. The keyless call returned 403. To use it, the hotel would have to email ebird@cornell.edu for permission and get a key.
- **Tides (not worth a widget, M):** Wikipedia: Adriatic tidal movement "is normally slight, usually remaining below 30 centimetres" [S17]. The Open-Meteo `sea_level_height_msl` at the beach cell ranges −0.64 … −0.18 m over 7 days, with daily swings of 0.29–0.39 m. That figure includes surge and inverse barometer, and the model is "computed at 0.08° (~8 km)" with coastal accuracy limited [S5]. No tide amplitude specific to the Albanian coast was found (web search). Whether a real-time Albanian tide gauge exists was not established: the IOC sea-level station list lookup failed or came back empty (L).
- **UV advice (H):** WHO uses three bands: 0–2 "You can safely enjoy being outside!", 3–7 seek shade at midday and use shirt, sunscreen and hat, 8+ avoid being outside during midday hours [S18]. The probe's sq/en short labels are agent-written (native check).
- **Pollen:** see §2.3. Seasonal, Europe-only, from the same endpoint.
- **Rejected as not useful or not verifiable for a lagoon visitor:** lagoon water temperature (no model data), lightning or earthquake feeds (off-topic for the brief).

## 7. Attribution text (put next to the panel)

- Required by Open-Meteo, licence page example [S3]: `<a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>`. Open-Meteo data is CC BY 4.0, which "mandates giving appropriate credit and indicating any modifications" [S2].
- Air quality: "All users of Open-Meteo data must provide a clear attribution to CAMS ENSEMBLE data provider as well as a reference to Open-Meteo" [S6].
- Marine: the docs' citation reads "Generated using ICON Wave forecast from the German Weather Service DWD. All users of Open-Meteo data must provide a clear attribution to DWD as well as a reference to Open-Meteo" [S5].
- Suggested footer line (sq / en):
  - SQ: `Të dhënat e motit: <a href="https://open-meteo.com/">Open-Meteo.com</a> (CC BY 4.0) · Cilësia e ajrit: Copernicus Atmosphere Monitoring Service (CAMS) · Deti: DWD / Météo-France · Vrojtimet e shpendëve: iNaturalist`
  - EN: `Weather data by <a href="https://open-meteo.com/">Open-Meteo.com</a> (CC BY 4.0) · Air quality: Copernicus Atmosphere Monitoring Service (CAMS) · Sea: DWD / Météo-France · Bird sightings: iNaturalist`
  - Add "values rounded" if the panel rounds, since CC BY asks to indicate modifications.

## 8. Probe

- `research/live-probe.mjs` (Node 24, no dependencies). `node research/live-probe.mjs [--save]`.
- It fetches the 4 endpoints one at a time with retries and a 20 s timeout, then prints the ACAO header, current conditions in sq/en, the 7-day table with moon, the sunrise/sunset cross-check with golden hour, sea, air and the latest birds.
- `--save` writes `live-samples/probe-*.json`; the iNaturalist sample is slimmed to the fields used.
- Last run 2026-10-23 10:40 UTC: all 4 OK, exit 0.

## 9. Conflicts recorded

1. Golden-hour definition: timeanddate −6°…+6° vs SunCalc +6°…sunset. The recommendation is in §5.
2. UV index: forecast 4.1–4.3 vs air-quality endpoint 3.1 at the same hour (different models). Use the forecast value.
3. Brief coordinates vs verified: town 40.997, 19.530 → 40.9956, 19.5331; beach 40.98, 19.47 → 40.9716, 19.4775.
4. NOAA short-series sun position vs USNO/Open-Meteo: ~3 min day-length error in late October. Use USNO or SunCalc.

## 10. Open questions

- Owner: subscribe to Open-Meteo API Standard (commercial licence) before going live? Price not readable (Stripe iframe); check https://open-meteo.com/en/pricing.
- Confirm the customer hostnames for the marine and air-quality hosts once a key exists (`customer-marine-api…`, `customer-air-quality-api…` are inferred).
- iNaturalist Terms of Service (Cloudflare-blocked) for display on a commercial site.
- `wave_direction` convention (from/to) is not stated where I looked.
- Native-speaker check of the Albanian strings in `weathercodes.json`, the AQI/UV/moon labels in the probe, and the footer line.

## Sources (all opened 2026-10-23)

- [S1] Open-Meteo Terms — https://open-meteo.com/en/terms
- [S2] Open-Meteo Pricing (plans, call counting, attribution FAQ) — https://open-meteo.com/en/pricing
- [S3] Open-Meteo Licence — https://open-meteo.com/en/licence
- [S4] Open-Meteo Forecast API docs (WMO table, timezone/DST, cell_selection, apikey) — https://open-meteo.com/en/docs
- [S5] Open-Meteo Marine API docs — https://open-meteo.com/en/docs/marine-weather-api
- [S6] Open-Meteo Air Quality API docs — https://open-meteo.com/en/docs/air-quality-api
- [S7] OSM Nominatim — https://nominatim.openstreetmap.org/search?q=Divjak%C3%AB%2C+Albania&format=jsonv2 · https://nominatim.openstreetmap.org/search?q=Divjake%20beach&format=jsonv2 · https://nominatim.openstreetmap.org/search?q=Hotel%20Pelikan%20Divjake&format=jsonv2
- [S8] Wikidata Q1945622 (Divjakë), Q1729043 (Karavasta Lagoon), Q1231952 (National Park) — https://www.wikidata.org/wiki/Q1945622 · https://www.wikidata.org/wiki/Q1729043 · https://www.wikidata.org/wiki/Q1231952
- [S9] timeanddate, Durrës sunrise/sunset Oct 2026 — https://www.timeanddate.com/sun/albania/durres?month=10&year=2026
- [S10] timeanddate, moon phases 2026 Tirana — https://www.timeanddate.com/moon/phases/albania/tirana?year=2026
- [S11] timeanddate, golden hour — https://www.timeanddate.com/astronomy/golden-hour.html
- [S12] SunCalc README and source (sun angles, moon phase convention) — https://github.com/mourner/suncalc (raw README.md, index.js)
- [S13] NOAA GML, General Solar Position Calculations — https://gml.noaa.gov/grad/solcalc/solareqns.PDF
- [S14] USNO, Computing Approximate Solar Coordinates — https://aa.usno.navy.mil/faq/sun_approx
- [S15] eBird API Terms of Use — https://www.birds.cornell.edu/home/ebird-api-terms-of-use/
- [S16] iNaturalist API v1 docs (terms/throttle text in swagger description) — https://api.inaturalist.org/v1/docs/ · https://api.inaturalist.org/v1/swagger.json
- [S17] Wikipedia, Adriatic Sea (tides) — https://en.wikipedia.org/wiki/Adriatic_Sea
- [S18] WHO, Radiation: the ultraviolet (UV) index — https://www.who.int/news-room/questions-and-answers/item/radiation-the-ultraviolet-(uv)-index

## Verification

Adversarial re-check, 2026-10-23, 11:30–12:00 UTC. Everything below was re-run or re-opened in this pass, not copied from the sections above.

### V1. Endpoints answer now, with the documented shape and CORS (H)

- `node research/live-probe.mjs`, run unsandboxed at 11:33 and 11:59 UTC: all 4 endpoints returned 200 on the first try and the probe exited 0. `access-control-allow-origin: *` on all four.
- Separate shape check (a throw-away script, not kept in the project):
  - Every key listed in §2 is present in `current`, `daily` and `hourly`, and every value is a number.
  - `current.interval` is 900 for forecast and marine, 3600 for air quality.
  - All `daily` arrays have 7 entries and no nulls.
  - Units match §2: `time: "unixtime"`, `moon_phase: "fraction"`, `daylight_duration: "s"`, `european_aqi: "EAQI"`, pollen `"grains/m³"`.
  - `timezone: "Europe/Tirane"`, `utc_offset_seconds: 7200`, `timezone_abbreviation: "GMT+2"`.
  - Grid cells match §1: forecast 41.016144, 19.457863; marine 40.958336, 19.458344; air 41, 19.5.
- **New finding:** marine `hourly.sea_level_height_msl` returns 168 rows, but the last 22 (from 29 Oct 00:00 UTC) are `null`. The sea-level model covers about 6 days, not 7. The probe already filters nulls; the site code must do the same.
- iNaturalist returned `total_results` 2028; the newest observation is 2026-09-29 (*Alcedo atthis*). `GET /v1/places/173571` returns "Divjakë-Karavasta National Park".
- **CORS:**
  - GET with an `Origin` header: `*` on all four hosts.
  - Preflight OPTIONS (`Access-Control-Request-Method: GET`, `-Headers: content-type`): 200 on all four. The Open-Meteo hosts return methods `GET, POST, OPTIONS` and max-age 600. iNaturalist returns `GET, POST, OPTIONS, PUT, DELETE` and no max-age.
  - Real browser: from `https://example.com` in the Browser pane, `fetch()` of all four URLs returned 200 with readable JSON. The forecast `current` had 13 keys including `time` and `interval`, marine 6, air 10; iNaturalist `total_results` was 2028.
- **DST trap (§3) re-tested, confirmed:**
  - The ISO request gives sunrise `2026-10-25T07:04`. The unixtime request formatted with Intl in Europe/Tirane gives 06:04 CET.
  - Formatting `daily.time` directly in Europe/Tirane shows 23:00 of the previous day from 26 Oct onward.
  - Extra detail: daily boundaries use the fixed request-time offset (docs quote in §3). After the switch, each daily max, min and precipitation figure therefore covers 23:00–23:00 CET. The one-hour shift is negligible for display. It disappears once the server cache refreshes after 25 Oct, when the offset becomes 3600.
- **Moon (§5) confirmed:** timeanddate's Tirana 2026 table lists new moon 10 Oct 17:50, first quarter 18 Oct 18:12, full moon **26 Oct 05:11** and last quarter 1 Nov 21:28. It opened in the Browser pane after WebFetch got 403. `moon_phase` reads 0.509 on 26 Oct, which fits a value computed around local noon (6.8 h after full ≈ +3.5° of elongation ≈ +0.0096).

### V2. Open-Meteo terms and commercial use: re-read, conclusion stands (H)

- **Terms [S1]**, quoted verbatim from the live page:
  - "You may only use the free API services for non-commercial purposes."
  - "Non-commercial use is defined as elaborated by creative commons."
  - Commercial examples: "Websites or apps that have subscriptions or display advertisements.", "Commercial products or promotional activities.", "Undisclosed research at commercial entities."
  - Non-commercial example: "Private or non-profit websites or apps that do not have subscriptions or advertising."
  - A hotel website that promotes the hotel and sells its services is commercial use. **§0 is correct: the production site needs a paid plan.**
- **Free-tier limits** confirmed: "Less than 10'000 API calls per day, 5'000 per hour and 600 per minute"; 300.000 per month; "Rate limits are applied by IP addresses and application."
- **Pricing [S2]**, confirmed verbatim:
  - "A subscription grants a commercial use licence"
  - "The customer endpoint is customer-api.open-meteo.com; requests include &apikey=abc123."
  - "Use the free tier for evaluation and prototyping."
  - "The customer API runs on dedicated servers, has no daily rate limit, and includes a commercial use licence."
  - The comparison table shows Unlimited minutely, hourly and daily calls on all paid plans. The call-counting rule ("more than 10 weather variables … fractional counts") is unchanged, so the §2.5 budget of about 4.6 calls per refresh and about 20k per month still holds.
- **Price read: closes §10 open question 1. M, single source rendered in a third-party iframe.**
  - The Stripe pricing table rendered in the Browser pane, monthly toggle, read twice in two tabs: **API Standard €29 per month** ("Commercial use license and 1 million monthly API calls for the Open-Meteo API"); **API Professional €99 per month** (5M calls).
  - The Standard card lists "Commercial use license", "Forecast API" and "Air Quality, Marine, Flood, Elevation, Geocoding API". **All three Open-Meteo endpoints used here are covered by API Standard.**
  - Not checked: VAT or tax, the yearly price (the toggle click was refused inside the scaled iframe), and whether Stripe changes the currency for other visitors. Re-check at checkout.
- **Licence [S3]: correction to §7.**
  - The page says "You must give appropriate credit, provide a link to the licence, and indicate if changes were made." and "You must include a link next to any location Open-Meteo data are displayed".
  - The drafted footer lines name "CC BY 4.0" but do not link it. Link it to `https://creativecommons.org/licenses/by/4.0/` in both languages.
  - Put the credit **next to the live panel**, not only in the site footer.
- **Forecast docs [S4]:**
  - The WMO table has 29 codes, including 97 "Heavy thunderstorm".
  - Footnote: codes 96 and 99 come only from models with an explicit hail forecast (DWD ICON, UKMO); "All other models derive thunderstorms from instability parameters and report codes 95 and 97."
  - The `en` strings in `weathercodes.json` match the docs' JSON mapping exactly (29/29, scripted diff).
  - The DST paragraph is present verbatim.
  - "The server URL requires the prefix customer-" appears on the forecast, marine and air-quality pages alike. The exact marine and air-quality customer hostnames remain unconfirmed.
- **Marine docs [S5]: closes §10 open question 4 (H, official).**
  - Quote: "Wave directions are always reported as the direction the waves come from. 0° = From north towards south". So `wave_direction` uses the same "from" convention as wind; an arrow showing travel points to direction + 180°.
  - Ocean currents use the opposite convention ("Direction following the flow of the current"); they are not used here.
  - The marine page contradicts itself on `cell_selection`: the parameter table says the default is `sea`, but the description repeats the forecast page's "The default land finds a suitable grid-cell on land…".
  - The live response is a sea cell (40.958336, 19.458344), so the API behaves as `sea`. Adding `&cell_selection=sea` explicitly to the marine URL removes the doubt (M).
  - DWD citation sentence confirmed verbatim. Navigation warning confirmed.
- **Air-quality docs [S6]:** the AQI bands, "returns the maximum of all individual indices", the pollen sentence and the CAMS attribution sentence are all present verbatim.

### V3. Albanian weather labels in `weathercodes.json`: corrected

Sources:
- [S19] the standard Albanian dictionary (Fjalor i gjuhës shqipe) as served by fjalorshqip.com: site search plus its `/api/stem-index/<stem>.json` files.
- [S20] the national forecast centre's "Buletini mbi rreziqet natyrore" PDFs on geo.edu.al: official Albanian forecast wording.
- [S21] Wiktionary, "rrebesh".

| Code | Before | After | Why |
| --- | --- | --- | --- |
| 51 / 53 / 55 | Shi i imët, i dobët / , mesatar / , i dendur | Shi i imët i dobët / Shi i imët mesatar / Shi i imët i dendur | the comma made it read like a catalogue entry; now it is one phrase |
| 56 / 57 | Shi i imët që ngrin, i dobët / , i dendur | Shi i imët i dobët që ngrin / Shi i imët i dendur që ngrin | same |
| 66 / 67 | Shi që ngrin, i dobët / , i fortë | Shi i dobët që ngrin / Shi i fortë që ngrin | same |
| 80 | Rrebeshe të lehta shiu | Shi i dobët herë pas here | **rrebesh** = "Shi i fortë me furtunë që bie për një kohë të shkurtër" [S19]; a "light rrebesh" contradicts itself |
| 81 | Rrebeshe shiu | Shi mesatar herë pas here | same; *i herëpashershëm* = "Që ndodh … kohë pas kohe, që përsëritet herë pas here" [S19] |
| 85 / 86 | Rrebeshe të lehta / të forta bore | Borë e dobët / e dendur herë pas here | rrebesh is by definition rain [S19] |
| 95 | Stuhi me bubullima | Shtrëngatë | **stuhi** = "Erë e vrullshme dhe e shpejtë, që mund të shoqërohet me shi ose me borë …; furtunë", i.e. a windstorm; **shtrëngatë** = "Shi i rrëmbyer, me erë të furishme, me shkreptima e me bubullima, që fillon menjëherë e zakonisht nuk zgjat shumë", i.e. a thunderstorm [S19]. The forecast centre uses "Shtrëngata" for this ("Reshjet priten të shoqërohen me shtrëngata") [S20]. |
| 96 | Stuhi me bubullima dhe breshër të lehtë | Shtrëngatë me breshër të imët | same; the dictionary glosses fine hail as "Breshër i hollë" (under *breshërimë*) [S19]. "I imët" carries the same sense of small grains. |
| 97 | Stuhi e fortë me bubullima | Shtrëngatë e fortë | same |
| 99 | Stuhi me bubullima dhe breshër të fortë | Shtrëngatë me breshër të fortë | same |

- **Kept, and confirmed:**
  - "Qiell i kthjellët" and "Qiell i vrenjtur": the dictionary's own example is "Qiell i vrenjtur", with "i kthjellët" as its opposite [S19].
  - "Pjesërisht me re" and "Kryesisht i kthjellët".
  - "Mjegull".
  - "Mjegull me brymë": *brymë* is the ice layer formed "nga ngrirja e vesës ose e mjegullës" [S19], which is exactly rime fog.
  - "Shi i imët" for drizzle: *imët* = "Që përbëhet nga kokrriza shumë të vogla" [S19].
  - "Kokrriza bore".
  - "Rrebeshe të fuqishme shiu" (82), which fits the rrebesh definition.
  - The intensity words *i dobët / mesatar*: the forecast centre grades rain as "të dobëta / mesatare / intensive" [S20], so they are kept for rain and snow alike. *i fortë / i dendur* is kept for heavy.
- **Do not use "krupë"** for graupel: in the standard dictionary it means nausea ("Shtysë për të vjellë") [S19].
- *borë* vs *dëborë*: the forecast centre writes the formal "dëborë" ("në formë dëbore") [S20]. *Borë* is also standard and more common, so it is kept.
- The other Albanian strings (moon phases, AQI bands, UV advice, compass V/VL/L/JL/J/JP/P/VP, footer) were read and left unchanged. The compass abbreviations are correct.
- Confidence **M**: dictionary plus official usage, with the wording chosen by this agent. A native speaker should still glance at the 29 labels before launch.
- The probe was re-run after the edit: the JSON parses and the labels print (exit 0).

### V4. Still unverified

- **iNaturalist Terms of Use: L.** `https://www.inaturalist.org/pages/terms` shows a Cloudflare challenge in the Browser pane (not bypassed), and `https://www.inaturalist.org/terms` returns 403 to curl and WebFetch.
  - A web-search summary (not opened, so not a source) mentions a "commercial purpose" restriction in the terms.
  - Treat the bird-sightings list as **conditional**. Ship it only after someone reads the terms in a normal browser or iNaturalist staff confirm that a hotel site may display the data.
- The customer hostnames for marine and air quality (`customer-marine-api.`, `customer-air-quality-api.`) are still inferred.
- Price details: VAT, yearly price, and currency for other visitors.
- `wind_direction_10m` "from" convention: still not stated on the docs page (M, standard meteorological convention).
- Native-speaker review of all `sq` strings.
- **Commercial-licence timing:** the free tier is allowed only for "evaluation and prototyping". The site must not go public on the free host; switch hosts and add the key first.

Sources added in this pass:
- [S19] Fjalor Shqip (Fjalor i gjuhës shqipe) — https://fjalorshqip.com/ (search; https://fjalorshqip.com/api/stem-index/rre.json, …/her.json, …/stu.json, …/sht.json, …/vre.json, …/bry.json, …/ime.json, …/bre.json, …/kru.json, …/res.json)
- [S20] Qendra Kombëtare për Parashikimin dhe Monitorimin e Rreziqeve Natyrore, Instituti i Gjeoshkencave (IGJEO), "Buletini mbi rreziqet natyrore" (e.g. Nr. 39/2026, 08-02-2026) — https://www.geo.edu.al/rc/doc/RREZIQET_NATYRORE_2026_02_08_8620.pdf · https://geo.edu.al/rc/doc/RREZIQET_NATYRORE_2024_10_10_7398.pdf · https://geo.edu.al/rc/doc/RREZIQET_NATYRORE_2024_12_20_7592.pdf · https://geo.edu.al/rc/doc/RREZIQET_NATYRORE_2024_03_22_6875.pdf
- [S21] Wiktionary, rrebesh — https://en.wiktionary.org/wiki/rrebesh
- Re-opened in this pass: [S1] [S2] (plus the Stripe table rendered in the Browser pane) [S3] [S4] [S5] [S6] [S10] [S16 places endpoint `https://api.inaturalist.org/v1/places/173571`]

## Decision (T7, 2026-10-23)

**Fix round 2026-10-26:** the MET cache now follows `Expires` exactly (no new request before it, never sooner than 10 min; only when the header is missing does the server pick 60 min), and the downloaded series is parsed once per clock hour and download instead of on every `/api/live` request. When fresh data is missing, `/tani/` and the assistant say so instead of showing old numbers; the sun and the season are computed locally even when the weather call times out.

The production site is commercial (it sells the hotel's services), so the free Open-Meteo host is no longer used. `src/lib/live.ts` now has one provider per reading:

| Reading | Provider | Licence / terms (opened 2026-10-23) | Notes |
| --- | --- | --- | --- |
| Temperature, feels-like, wind (speed, from-direction), humidity, cloud, precipitation, pressure, symbol, next 24 h, 7 days | **MET Norway Locationforecast 2.0** `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=40.9722&lon=19.4795` | FAQ: "Is this API free, even for commercial use?" — "Yes!"; "This includes paid-for apps or services" ([docs.api.met.no/doc/FAQ](https://docs.api.met.no/doc/FAQ)). Data under NLOD 2.0 and CC BY 4.0; credit "Data from MET Norway" ([api.met.no/doc/License](https://api.met.no/doc/License)). Terms of service: identifying User-Agent with contact, ≤ 4 decimals in coordinates (5+ → 403), no repeat before `Expires`, `If-Modified-Since` with the last `Last-Modified`, > 20 req/s per application needs an agreement ([api.met.no/doc/TermsOfService](https://api.met.no/doc/TermsOfService)). | Checked live: 200, `Expires` ~30 min ahead, CORS `*`; hourly steps for ~60 h then 6-hourly to ~9.5 days. No gusts and no precipitation probability for this point (those fields are Nordic-only), so `gust_kmh`/`precip_prob` are null and the UI hides them. UV is only `ultraviolet_index_clear_sky` → served as `uv_clear_sky` and labelled "UV with a clear sky"; `uv` (actual) stays null unless the commercial Open-Meteo key is set. MET symbol codes are mapped to sq/en labels in `metSymbol()` (same wording as V3 above) and to a WMO-equivalent `code` for icons. |
| Sea surface temperature | **NASA JPL MUR SST v4.1** (0.01°, daily analysis) via NOAA CoastWatch ERDDAP `jplMURSST41`, cells 40.96–40.97 N × 19.43–19.44 E (open sea ~3 km off the beach) | ERDDAP dataset licence: "These data are available free of charge under the JPL PO.DAAC data policy. The data may be used and redistributed for free but is not intended for legal use"; acknowledgement "These data were provided by JPL under support by NASA MEaSUREs program." | Latency ≈ 1 day (on 23 Oct the last analysis was 22 Oct 09:00 UTC: 21.4–21.5 °C). The payload carries `marine.sea_date`; the UI prints "sea · satellite analysis of {date}". Cached 6 h, last value kept up to 3 days. |
| Air quality (EAQI, PM2.5), waves, actual UV | **Open-Meteo commercial** customer endpoints, only when `OPEN_METEO_API_KEY` is set | API Standard €29/month (V2 above; VAT not checked) | Without the key: `air = null`, `marine.wave_m = null`, `weather.uv = null`; every page hides them. Hostnames `customer-air-quality-api.` / `customer-marine-api.` are still inferred (V4). |
| Sunrise, sunset, golden hour (+6°), civil twilight (−6°) | **computed on the server** (USNO solar position + NOAA hour angle, §5) | public-domain formulas | Matches MET Sunrise 3.0 to the minute for 2026-10-23 (07:02/17:50 CEST), 2026-10-25 (06:04/16:47 CET, DST day), 2027-03-28 and 2027-06-21. `sunTimes(date)` is exported for the itinerary planner. |

- The `/api/live` shape stays backwards compatible; additions: `weather.{symbol, cloud, precip_mm, pressure_hpa, uv_clear_sky, valid_at}`, `marine.sea_date`, `sun.{golden_morning_end, civil_dawn, civil_dusk, day_length_min}`, `daily[].{symbol, label_*, precip_mm, sunrise, sunset}`, `hourly[]` (next 24 h), `sources[]` (one per provider with licence link), `provider`. `attribution` now names MET Norway.
- Golden hour follows the recommendation in §5 (sun below +6° until sunset), replacing the old "one hour before sunset".
- iNaturalist sightings remain out (terms unread, V4).
- Open for the owner: the User-Agent contact (`LIVE_CONTACT` env, or a confirmed e-mail / site URL in the admin); whether to buy Open-Meteo API Standard for air quality and waves (≈ €29/month).
