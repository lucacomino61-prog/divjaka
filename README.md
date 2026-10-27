# Divjaka Smart Tourism Platform · Hotel Pelikan

The booking site, shop and admin panel of Hotel Pelikan in Divjakë, Albania, next to the Divjakë-Karavasta National Park and the Karavasta Lagoon. Guests book rooms and guided experiences, buy gift cards and trip gear, plan a day-by-day itinerary, check live conditions and ask a bilingual assistant; the hotel runs orders, inventory, prices, offers and analytics from `/admin/`. Albanian is served at `/`, English under `/en/`.

It is built from the hotel's own specification (`research/SPEC.md`). The catalogue it ships with is a sample: rooms, prices and schedules are stamped DEMO until the hotel confirms them (`NEEDS_VERIFICATION.md`). Card payments run in a TEST mode until the hotel has a merchant contract.

## What it does

- **Stay and experiences**: room pages with a live availability calendar and seasonal prices; experience pages with dated time slots and places; one cart and a 3-step checkout.
- **Shop**: catalogue with filters, search and list/grid views; gift cards, bundles, goods; automatic offers and promo codes, priced on the server only.
- **Payments**: pay at the hotel, bank transfer (IBAN from the admin), card through a POK adapter (TEST simulator until there is a contract). Inventory is held in one SQLite transaction, so overselling is impossible.
- **Itinerary planner**: days, interests, pace and transport give a timed plan drawn as a route on the lagoon chart, with bookable stops.
- **Live conditions**: weather (MET Norway), sea temperature (NASA JPL MUR), sunrise and sunset, what's in season; a ticker on every page.
- **Assistant**: answers in Albanian and English from a 61-question knowledge base, live availability and the forecast, and hands off to staff.
- **Heritage guide**: 8 sourced articles on the lagoon, the Dalmatian pelican, birds by season, the pine forest, the park and local history.
- **Admin**: dashboard, orders, room-night grid, products, schedules, rates, offers, customers, messages, analytics without cookies, assistant FAQ, settings.
- **Integrations**: product feed for Google Merchant Center (`/feed/products.xml`), sitemap with hreflang pairs, Product/Hotel JSON-LD, share buttons, UTM link builder.

## Stack

| Layer | Choice |
|---|---|
| Framework | Astro 7 (`output: 'server'`), `@astrojs/node` standalone; every page server-rendered |
| Database | SQLite through Node's built-in `node:sqlite` (one file, `data/divjaka.db`) |
| Validation | zod 4 on every API input |
| Motion | GSAP 3.15 + Lenis 1.3 on one ticker; cross-document View Transitions |
| Fonts | Bricolage Grotesque, Instrument Serif, Geist Mono, self-hosted |
| Tests | `node:test` API suite, Playwright e2e (Chromium + WebKit) |

No front-end framework, no CMS, no third-party scripts or cookies on the public site.

## Quick start

Needs **Node.js 24 or newer** (for `node:sqlite`) and npm.

```sh
npm install
npm run db:demo
npm run dev
```

- The site runs at http://127.0.0.1:3800 and the admin at http://127.0.0.1:3800/admin/.
- `npm run db:demo` creates `data/divjaka.db` with the sample catalogue, about 60 fake orders and browsing events (so the dashboard has data), and the admin user. When `.env` has no `ADMIN_PASSWORD`, it generates one and writes `ADMIN_EMAIL` (default `admin@divjaka.local`) and `ADMIN_PASSWORD` to `.env`. The password is never printed: read it there.
- Copy `.env.example` to `.env` first if you want to choose the e-mail and password or set other variables (list under [Environment](#environment)).
- In development, card payments use the TEST simulator.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 3800 (the database is opened and migrated on the first request). |
| `npm run build` | Production build into `dist/`. |
| `npm start` | Runs the build (`node ./dist/server/entry.mjs`). Set `PORT` and `HOST`; run it from the project folder so `data/` and `.env` are found. |
| `npm run preview` | Astro preview of the build on port 3801. |
| `npm run check` | `astro check` (types and templates). |
| `npm run db:seed` | Creates the database (schema + migrations) and adds what is missing: settings, categories, admin user, sample catalogue, slots 90 days ahead, offers, FAQ. Never overwrites rows the owner edited. Use this, without `--demo`, for a production database. |
| `npm run db:demo` | `--reset --demo`: empties every table, re-seeds and adds fake orders and events. **Refused** under `NODE_ENV=production` or when the database looks live (real orders, a product or offer the owner saved, an IBAN, more than one settings group changed, or an admin password no longer the one in `.env`); `-- --i-know-this-wipes-everything` overrides, only after a backup. |
| `npm run db:faq` | Non-destructive sync of the assistant FAQ from `scripts/seed-data/faq.mjs`: adds new rows, refreshes seed-written rows nobody edited, leaves owner-edited rows alone. |
| `node scripts/seed.mjs --sync-admin` | Sets the admin password from `.env` again and ends every admin session. Recovery when nobody can sign in. After the first sign-in, change the password in the admin and delete `ADMIN_PASSWORD` from `.env`. |
| `npm run test:api` | API tests against a running server (see [Tests](#tests)). |
| `npm run test:e2e` | Playwright end-to-end suite against a running server (see [End-to-end tests](#end-to-end-tests)). |
| `npm run wordmark` | Build-time tool: outlines the DIVJAKA wordmark to SVG and writes the poster metrics (`tools/wordmark.mjs`). |
| `npm run icons` | Build-time tool: favicons and the default share image (`tools/icons.mjs`). |

## Tests

- **API** (`tests/api/`, `node:test`): start a server on a **copy** of the database with `RATE_LIMIT_FACTOR=50` (and `ALLOW_TEST_PAYMENTS=1` for a built server), then run the tests with the same `DIVJAKA_DB`:
  ```sh
  DIVJAKA_DB=/tmp/dv/divjaka.db DIVJAKA_DATA=/tmp/dv RATE_LIMIT_FACTOR=50 npx astro dev --port 3812
  DIVJAKA_DB=/tmp/dv/divjaka.db API_URL=http://127.0.0.1:3812 npm run test:api
  ```
  They create `apitest-*` products (archived afterwards) and orders from `api-test-…@example.com` (cancelled afterwards). `abuse3.test.mjs` writes a staff account straight into the database and refuses `data/divjaka.db`; `final.test.mjs` reads analytics counts from it; `csp.test.mjs` checks the inline scripts against the CSP header when `API_URL` is a production build. Covers pricing, offers, holds, concurrent last-unit checkouts, abuse limits, admin roles, SEO files and the CSP.
- **End-to-end** (`tests/e2e/`, Playwright, Chromium + WebKit at desktop and phone sizes): read-only by default, `E2E_WRITE=1` adds the full ordering journey and admin checks. Details under [End-to-end tests](#end-to-end-tests).

## Deployment

The app is one Node process that keeps its data in files, so it needs a **Node 24 host with a persistent disk** (a VPS, a dedicated server or a container with a mounted volume). Serverless or read-only hosts do not fit.

1. Clone, `npm ci`, `npm run build`.
2. Create `.env` from `.env.example` (admin e-mail, payment keys when there is a contract, `TRUST_PROXY=1`, `LIVE_CONTACT`). Never set `ALLOW_TEST_PAYMENTS` or `RATE_LIMIT_FACTOR` on the public server.
3. `npm run db:seed` (no `--demo`) creates a fresh database. Keep `data/` (or `DIVJAKA_DB` / `DIVJAKA_DATA`) on the persistent disk.
4. Run `PORT=3801 HOST=127.0.0.1 node dist/server/entry.mjs` under a process manager (systemd, pm2 or the container runtime), behind a reverse proxy that ends TLS (Caddy or nginx). The proxy rules are in the [Deployment contract](#deployment-contract).
5. In the admin: Cilësimet → SEO → the public `https://` address (sitemap, feed, robots and card payments need it), then the owner's checklist in `NEEDS_VERIFICATION.md`.
6. Back up `data/divjaka.db` every day with `VACUUM INTO` (command in `OWNER.md` §7) plus `data/uploads/`, encrypted and off the server. The database holds guests' names, e-mails, phones and order links.

## Licences

- **Code**: no licence has been chosen yet. Until a `LICENSE` file is added, all rights are reserved.
- **Photos** (`public/photos/`): 32 photos from Wikimedia Commons, each under its own licence (CC BY 2.0, CC BY 4.0, CC BY-SA 2.0/3.0/4.0 or CC0). They were resized and re-encoded; one (`beach-shelters`) was also cropped. Author, licence and source for every file: `research/ASSETS.md` and the site's credits page (`/kreditet/`, `/en/credits/`). Reusing a photo means keeping its credit and licence; ShareAlike photos stay under ShareAlike.
- **Fonts**: Bricolage Grotesque, Instrument Serif and Geist Mono under the SIL Open Font License 1.1 (`public/fonts/LICENSES/`; the static instances in `tools/fonts/` are derived from Bricolage Grotesque under the same licence).
- **Map data**: © OpenStreetMap contributors, ODbL (`research/geo.json`); the chart always prints the attribution.
- **Live data**: MET Norway (CC BY 4.0 / NLOD), NASA JPL MUR SST (JPL PO.DAAC policy), credited next to the readings.
- **Dependencies** keep their own licences: Astro, `@astrojs/node`, Lenis and zod are MIT; GSAP 3.15 is under GreenSock's "Standard no charge" licence (https://gsap.com/standard-license).

## Documents

| File | What it holds |
|---|---|
| `OWNER.md` | The hotel's guide to the admin (Albanian, then English): daily tasks, DEMO stamps, payments, weather, backups, analytics. |
| `NEEDS_VERIFICATION.md` | The checklist of values the hotel must confirm before launch, marked admin or developer. |
| `PLAN.md` | Spec → feature map, routes, data model, API, acceptance criteria. |
| `DESIGN.md` | The design contract ("Harta e Lagunës"): type, colour, motion, the signature chart. |
| `HANDOFF.md` | Cross-team notes from the build. |
| `research/` | The specification, the sourced facts (heritage, business, geography, live APIs) and the photo credits. |

## Environment

`.env` is git-ignored; names in `.env.example`: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `POK_KEY_ID`, `POK_KEY_SECRET`, `POK_MERCHANT_ID`, `POK_ENV`, `ANTHROPIC_API_KEY` (optional: the assistant asks Claude when the FAQ has no answer), `TRUST_PROXY`, `TRUST_PROXY_HOPS`, `CLIENT_IP_HEADER`, `COOKIE_SECURE`, `ALLOW_TEST_PAYMENTS`, `RATE_LIMIT_FACTOR`, `LIVE_CONTACT` (an e-mail for the MET Norway User-Agent on /tani/), `OPEN_METEO_API_KEY` (optional, a secret: air, waves, UV), `DIVJAKA_DB`, `DIVJAKA_DATA`. The server loads `.env` itself (`src/lib/dotenv.ts`).

---

# Technical reference

## Back end

### Deployment contract
- **TLS ends at a reverse proxy** (Caddy / nginx) in front of `node dist/server/entry.mjs` bound to 127.0.0.1. The proxy must **append** the client address to `X-Forwarded-For` (nginx `$proxy_add_x_forwarded_for`, Caddy default) or overwrite one header named in `CLIENT_IP_HEADER` (`X-Real-IP`, `CF-Connecting-IP`), set `X-Forwarded-Proto` and **overwrite** `X-Forwarded-Host` (nginx `proxy_set_header X-Forwarded-Host $host;` — never pass the client's own header through; until `site_url` is saved the sitemap, feed and robots.txt take their origin from it, and are then sent `no-store`), and cap bodies (`client_max_body_size 20m`). Set `TRUST_PROXY=1` (and `TRUST_PROXY_HOPS=2` behind two appending proxies, e.g. Cloudflare + nginx). Without it every visitor shares the proxy's address for rate limits (logged once, shown in `/api/admin/me` warnings).
- **The proxy also compresses, caches, rate-limits and sends nosniff.** The app gzips the text it renders itself (pages, JSON, feeds) in production; the files the adapter serves (`/_astro/*` scripts and styles, `/fonts/*`, `/photos/*`, `/favicon.svg`) leave it plain and with no security headers. Caddy: `encode zstd gzip` and `header X-Content-Type-Options nosniff`; nginx: `gzip on; gzip_types text/css application/javascript image/svg+xml application/json application/xml text/plain;` and `add_header X-Content-Type-Options nosniff always;` in every location. `/_astro/*` names carry a content hash: the adapter sends `Cache-Control: public, max-age=31536000, immutable` on a 200 GET — keep it (do not overwrite it at the proxy). `/fonts/*` and `/photos/*` are NOT hashed (`max-age=0`, revalidated by ETag): give them at most a short cache (e.g. `max-age=604800`) and change the file name when a file changes. Put a request limit in front of the app (nginx `limit_req` about 10 r/s per address with a burst of 40, or a Cloudflare rate-limiting rule): the in-memory limits below are the last line of defence, and every server-rendered page costs 15–35 ms on the one Node thread that also runs checkout.
- **Public origin**: set it in the admin (Cilësimet → SEO → site URL) or `site` in `astro.config.mjs`. Sitemap, feed, robots and POK callbacks use it; until it is set they use the forwarded host (with `TRUST_PROXY=1`) or a placeholder, never localhost, and **POK card payments stay off**.
- **Cookies / HSTS**: in a production build the admin cookie is always `Secure` (`COOKIE_SECURE=0` only for a plain-http LAN test); HSTS (`max-age=31536000`) and `upgrade-insecure-requests` are sent when the request or the configured origin is https.
- **Payments**: card is offered only with `mode: live` + POK keys, or `mode: test` where `ALLOW_TEST_PAYMENTS=1` (never in production: the TEST simulator lets a customer mark their own order paid; such orders carry `orders.test = 1` and never count as money). Bank transfer is offered only once IBAN and beneficiary are set. Unconfirmed holds expire: card 30 min, bank 72 h, pay-at-hotel 24 h (settings → payments; staff confirming an order ends its hold).
- **Anonymous bookings cannot block the hotel** (settings → inventory; `src/lib/orders.ts` header). A pay-at-hotel, bank or TEST-card order nobody has confirmed (a "long hold") may take at most `unconfirmed_share` (50 %) of a room type's units per night, of a session's seats and of a tracked product's stock, and at most `max_units_per_unconfirmed_order` (5) units of one item (409 `hold_cap` / `hold_cap_units`); the other half stays bookable by card (a 30-minute hold, then paid or released) and by staff. Long or far-ahead stays (> 7 nights or > 60 days ahead), orders placed while new long holds in the last hour passed `max_unconfirmed_{room_nights,seats,units}_per_hour` (unless small and within 30 days), orders past an address group's hourly share (`address_*_per_hour`) and orders by a person who already has open orders from another address get the SHORT hold (`short_hold_hours`, 2 h; `orders.review` says why) — nothing sitewide refuses everybody. Per order: `max_room_nights_per_order` (40), 10 people per time slot, 5 time slots, 30 people. Per address group (IPv4 /24, IPv6 /48) and day: 60 room-nights, 40 seats, 20 units (429). One person: `max_open_orders_per_email` (3) waiting orders on the normalised e-mail or phone, refused only from the same address group. A phone number is required for pay-at-hotel and bank. The dashboard warns (`pending_surge`) at `pending_alert_per_hour` (5) unconfirmed orders or half a surge threshold within an hour; `POST /api/admin/orders/cancel-unconfirmed` (dry run first) cancels a flood in one click. Confirm the real ones (that lifts every limit for them).
- **Rate limits** are in memory, per client address; IPv6 addresses are grouped per /64. Public API reads: 1 200 a minute (`/api/live` and `/api/config` are not counted). Server-rendered pages (GET/HEAD outside `/admin` and `/api`): 600 a minute (429 text with `Retry-After`). Admin sign-in: 5/min per address + e-mail, 20/min per address, 60 password checks/min sitewide, and after 10 failures in 15 min one try per 30 s for that account — except from a **known device** (`dv_device` cookie, 180 days, set at every successful sign-in), so a password guesser can never lock the owner out of a browser they used before. The sitewide sign-in ceiling (60 password checks a minute, 10 per address group) is audited when hit (`login_ceiling_hit`, dashboard warning); remembered browsers still sign in. `RATE_LIMIT_FACTOR` multiplies every limit and ceiling: test servers only — a production server with it set logs a warning at boot and shows `rate_limit_factor_set`.
- **Audit log** (`audit_log`, also one JSON console line each): sign-ins, first failure and lockout per account, password changes, settings changes (IBAN / beneficiary / bank / SWIFT flagged; the dashboard shows `payment_details_changed` for 7 days), price and unit changes, offers, room rates, customer exports and erasures. No secrets are logged; addresses are cut to /24 (IPv4) or /48 (IPv6).
- **Roles**: `owner` and `staff`. Owner only: settings, prices (`price`, `compare_at`, gift amount limits, `min_nights`), publishing a product and taking a published one off sale (staff-created products are saved as drafts), offers, room rates, customer CSV export, customer erasure. Payment settings (IBAN, beneficiary, bank, SWIFT, card mode, methods) also need the owner's password again (`current_password`). Everyone: their own password. Password re-entry is throttled (5 per user / 10 per address in 15 min) and 5 wrong in a row end every session of that user. Admin sessions: 14 days sliding, 30 days at most.
- **Backups and the database file** hold every guest's order link: `orders.access_token` is the bearer token of the order page (bank details, name, e-mail, phone) and is stored as is, because "find my booking" (code + e-mail) hands it back. Encrypt backups and never copy the `.db` anywhere it could be committed (`.gitignore` ignores `*.db`, `*.db-wal`, `*.db-shm`, `*.sqlite` everywhere).
- **Before launch**: list `admin_users` and delete anything you do not recognise (an interrupted API test run once left `apitest-staff-…@example.com`, role staff: `DELETE FROM admin_users WHERE email LIKE 'apitest-staff-%';` — sessions and devices cascade). The demo promo code `MIRESEVINI10` is public in this repository: it is seeded inactive and DEMO-flagged; change the code (Ofertat) before you switch it on.
- **Retention** (settings → privacy): raw analytics events older than `events_days` (180) are rolled up per day/type/product into `events_daily` and deleted; handled messages older than `messages_days` (730) are deleted; at most `events_per_day` (30 000) events are stored per day sitewide, 400 per browsing tab, 120 per address a minute. Runs a minute after boot and every 6 hours. Orders never store the browsing tab id. Cancelled, never-paid orders older than `orders_days` (90) are anonymised (name, e-mail, phone, notes cleared; amounts kept), customers left without any order deleted; `inventory_log` older than `inventory_log_days` (730) deleted. Analytics volume: 2 000 ordinary events per address group a day (then 1 in 20, up to 4 000), own budgets for search / assistant / vital events.
- **CSP**: `script-src 'self'` + sha256 of every `<script is:inline>` in `src/**/*.astro`, fixed at build time (`src/lib/csp.ts`); processed `<script>`s are bundled files. Inline scripts must be static (no `define:vars`, no `{…}`); violations are logged by `/api/csp-report`.

### Data
- `db/schema.sql` (idempotent, applied on every boot) + `db/migrations/NNN-name.sql`. Money in whole lek; dates `YYYY-MM-DD`; session times Europe/Tirane `YYYY-MM-DDTHH:MM`.
- Oversell is impossible: holds run in one `BEGIN IMMEDIATE` transaction; triggers/CHECKs abort when room nights, session seats or stock would go negative.
- Uploads: `data/uploads/<yyyy>/<id>-<480|960|1600>.webp`, served at `/media/…` (immutable).
- Every `/api/*` answer is JSON, unknown routes and refused cross-site form posts included (`src/middleware.ts`; Astro's own `security.checkOrigin` is off because it compared against `http://localhost:PORT` behind the proxy).

### API (JSON; errors `{ error: { code, message_sq, message_en } }`)
Public
- `GET /api/catalog?lang&kind&category&tag&q&sort&ids&featured&limit` · `GET /api/product/:slug?lang` · `GET /api/config`
- `GET /api/availability/room/:slug?from&to[&qty&guests]` or `?month=YYYY-MM` (while the room unit counts are demo values no count is sent: no `units`, no `left`, only prices and day status) · `GET /api/availability/experience/:slug?month=YYYY-MM`
- `POST /api/quote` `{lang, items, promo}` — the only place prices are computed (`src/lib/pricing.ts`). A failed promo code gets one generic message; 10 failed codes per address in 10 minutes and codes are not looked up any more (checkout: 429 `promo_rate`).
- `POST /api/checkout` `{lang, items, customer, payment_method, promo, notes, marketing_consent, terms_accepted, utm, ref, checkout_id}` → `201 {code, token, next, order}`; a repeat with the same `checkout_id` (one per checkout draft) and e-mail within 24 h, while that order is not cancelled, is answered `201` with that same order (header `X-DV-Replay: 1`) — nothing is held twice; errors 409 `cart_problem` / `sold_out` / `promo_invalid` / `hold_cap` / `hold_cap_units` (both with `lines:[{key, problem:{code}}]`), 400 `bank_late` (bank transfer for a stay or session that starts within `bank_hold_hours`; `lines`), 429 `too_many_open_orders` / `busy` / `promo_rate` / `rate_limited` (`sid` is accepted and ignored)
- `GET /api/order/:code?t=TOKEN` · `POST /api/lookup` `{code, email}` → `{token, url}`
- `GET|POST /api/pay/test/:code?t=` (TEST card simulator, test mode only) · `POST /api/pay/pok/webhook` (POK; re-reads the order from POK)
- `GET /api/recommend?lang&interests&viewed&cart&exclude&kinds&limit` · `GET /api/search?q&lang[&track=1&sid]` · `GET /api/live` (`availability_today.rooms_verified`: true only when every published room type was saved by the owner; until then `rooms_left` is a demo figure — do not show it)
- `POST /api/assistant` `{lang, message, context, contact?}` (date ranges over 30 nights, in the past or beyond the booking horizon are answered without any availability work; room counts only once `rooms_verified`) · `POST /api/contact` · `POST /api/e` (analytics beacon → 204; one event or `{batch}` of ≤ 10)

Admin (cookie `dv_admin`; mutations need `Sec-Fetch-Site: same-origin` or a matching `Origin`)
- `POST /api/admin/login|logout|password` · `GET /api/admin/me`
- `/api/admin/products[/:id]` · `/sessions[/:id]` · `POST /sessions/generate` · `/room-rates[/:id]` · `/room-nights` · `/offers[/:id]` · `/faq[/:id]` · `/categories[/:id]` · `/settings`
- `/api/admin/orders[/:id|code]` (PATCH `{status, payment_status, notes, payment_ref, confirm_consent}`; cancel releases inventory; any status set by staff makes the order a staff hold that is never released automatically; detail carries `consent_pending` — the marketing box ticked at checkout counts only after a payment or `confirm_consent: true`) · `/bookings?from&to` · `/customers[/:id]` (`DELETE` = erase: owner only, orders keep totals but lose name/e-mail/phone) · `/customers/export[?consent=1]` (CSV, owner only, phone numbers unprefixed) · `/messages[/:id]` · `/stats?from&to` · `/inventory` · `POST /upload`
- `PATCH /api/admin/products/:id` refuses a room's `units` below what is booked or closed on a night from today on (409 `below_booked {nights}`: close single nights in `/room-nights` instead); list `limit` is always 1–200.

Feeds: `/feed/products.xml` (RSS 2.0 + `g:`; research photos resolve to their real `/photos/<slug>-<w>.webp` file, widest ≤ 1920; uploads to `-1600.webp`; XML-invalid characters are dropped. Google Merchant accepts WebP; the Meta catalogue documents JPG/PNG — add a JPEG export to the photo pipeline before connecting Meta) · `/sitemap.xml` (hreflang pairs + x-default) · `/robots.txt`.

## Front end

Design contract: `DESIGN.md` ("Harta e Lagunës"). Styles: `src/styles/base.css` (awwwards-blueprints starter, kept verbatim) → `tokens.css` (salt/ink + derived + pouch, semantic `--fg/--bg/--muted/--rule…`, `.on-ink` flips them) → `type.css` (@font-face, fallbacks, `.poster .heading .title .lede .water .mono .label`) → `chrome.css` (layout primitives + every chrome component). Feature CSS goes in the feature's components (scoped `<style>`), using the semantic tokens.

### Build-time tools
| Command | What it does |
|---|---|
| `npm run wordmark` | `tools/wordmark.mjs`: outlines DIVJAKA (and HOTEL PELIKAN) from `tools/fonts/BricolageGrotesque-VF.ttf` at opsz 96 · wdth 75 · wght 800 → `src/assets/wordmark.ts`; writes the poster advance table `src/assets/poster-metrics.ts` (server-side poster fitting). |
| `npm run icons` | `tools/icons.mjs`: `public/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-512.png`, `og-default.png` (1200×630, outlined type, no fonts needed). |

Fonts: self-hosted woff2 in `public/fonts/` (latin + latin-ext subsets, licences in `public/fonts/LICENSES/`): Bricolage Grotesque (variable opsz/wdth/wght), Instrument Serif (italic + regular), Geist Mono (variable). Bricolage + Geist Mono latin are preloaded. Never use browser `Intl` with `sq` (Chrome has no Albanian data): use `src/i18n/format.ts`.

### Pages and views
- Route files in `src/pages/**` are thin shells: `<Stay lang="sq" />`. Dynamic ones call `load(params, lang)` from `src/views/<key>.load.ts`; `null` → the shell sets `Astro.response.status = 404` and renders `<NotFound>` (the URL stays, the status is a real 404). `src/pages/404.astro` handles unmatched URLs (language from the path).
- A feature task replaces `src/views/<View>.astro` (and its `.load.ts`) — never the shells. View props: `{ lang: Lang; params?: Record<string,string>; data?: <what load returns> }`. A view renders `<Base …>` itself.
- URLs only via `src/i18n/routes.ts`: `path(key, lang, params?)`, `twin(pathname)` → `{lang,key,params,other,known}`, `match()`, `langFromPath()`, `alternates()`, `ROUTES`.

### `<Base>` props (`src/layouts/Base.astro`)
`lang` · `title` (gets " · Divjaka · Hotel Pelikan" unless it already names the brand) · `description` · `routeKey` (a `ROUTES` key; drives canonical, hreflang sq/en/x-default, header `aria-current`, language switch) · `params?` · `image?` (OG, absolute or root path; default `/og-default.png`) · `jsonld?` (object or array, added after the Hotel + WebSite graph) · `noindex?` (drops canonical/hreflang, adds robots noindex) · `bodyClass?` · `hideTicker?` · `loader?` (default true) · `clientKeys?` (extra i18n key prefixes shipped to the browser in `#dv-i18n`) · `langHref?` (override the switch target). Slot `head` for extra tags.
Base prints `html[data-eur-rate]` (settings.currency), `html[data-route]`, the pre-paint script (`html.js`, `data-motion="off"` from storage, `data-cur`, `reveal-pending`, `loader-on`, VT skip when stopped) and the inline `@view-transition` + tide-line CSS.

### Components (`src/components/site/`)
| Component | Props | Notes |
|---|---|---|
| `Header` | `lang, routeKey, params?, lat, langHref?` | 64 px salt bar; live temp appears only when `/api/live` is fresh. |
| `Ticker` | `lang` | 32 px ink strip; clock always, readings only when fresh. |
| `Menu` | `lang, routeKey, params?, hotel{lat,lon}, langHref?` | `<dialog id="menu">`; legend items with `data-poi` drop pins on `MiniChart`. |
| `MiniChart` | `lang, hotel{lat,lon}, width?, height?` | Reads `research/geo.json` (GeoJSON or `{coastline,lagoon,pois}`); without it only grid + hotel pin. Set `data-active="<poi>"` on `[data-minichart]` to drop a pin. |
| `Footer` | `lang, routeKey, params?, langHref?` | Business contact = confirmed settings only (placeholders hidden). |
| `Preloader` | `lang, hotel` | Inline safety script: Skip at 0 ms, 1.8 s cap, once per session (`sessionStorage dv-seen`), never for JS-off/reduced/stopped. |
| `CartDrawer` | `lang` | `<dialog id="cart-drawer">`, filled by `scripts/drawer.ts` from `POST /api/quote`. |
| `AssistantPill` | `lang` | `<a href=contact data-assistant-open>`; see client events. |
| `Photo` | `slug, lang, sizes?, priority?, caption?, alt?, ratio?, mat?, parallax?, crosshair?, fit?, reveal?, class?` | From `research/photos.json`; files `/photos/<slug>-<w>.<avif|webp|jpg>` (or the entry's own `variants`). Missing slug → hatched placeholder plate. `priority` = eager + `fetchpriority="high"` (the LCP). |
| `Price` | `lek, lang, compare?, per?('night'|'person'|'each'), from?, size?('mono'|'title'|'display')` | Prints lek AND ≈ EUR (when a rate is set) on the server; CSS shows one from `html[data-cur]` (no text rewritten after load, no CLS). Client-built prices: `<span data-price-lek="6500"><span data-price-main></span><span data-price-alt hidden></span></span>` (no `data-price-ssr`) are painted by chrome.ts. |
| `Pill` | `href?, variant?('primary'|'outline'|'quiet'|'signal'), size?('m'|'s'), sub?, arrow?, block?, type?` + any attribute | `<a>` with href, else `<button type=button>`. 48 px (44 px `s`). |
| `Stamp` | `kind?('demo'|'test'|'offer'|'soldout'|'closed'), lang?, tone?('signal'|'ink'), tilt?` or slot text | |
| `SectionHead` | `title, as?('h1'|'h2'|'h3'), index?, kicker?, size?('poster'|'heading'|'title'), id?, lead?, reveal?` + slots `aside`, default | `poster` fits the longest word to the line on the server (`poster-metrics.ts`). |
| `SourceList` | `lang, items[{title,url,publisher?,accessed?,note?}], title?, id?` | Numbered; renders nothing when empty. |
| `Breadcrumbs` | `lang, items[{label,href?}], home?` | + BreadcrumbList JSON-LD. |
| `Pin` | `label?, selected?, leader?('right'|'up'|'none')` | HTML survey pin. |
| `PermitCard` | `label?, as?, floating?` + slots default, `stub` | Style shell: border, print shadow, perforation. |
| `LangSwitch` / `MotionSwitch` / `CurrencySwitch` | `lang` (+ `routeKey/params/href/full` · `compact`) | |
| `Wordmark` | `variant?('poster'|'outline'|'solid'), line?('divjaka'|'hotel'), enter?, draw?, label?, stroke?` | Outlined SVG, no font needed. |
| `PlaceholderView` | `lang, routeKey, index?, params?, poster?, title?, description?, noindex?` | The stand-in views use it. |
Server helpers: `site-data.ts` (`readResearch(name)`, `photos()`, `getPhoto(slug)`, `findPhoto(words)`, `business()`, `confirmed(b, field)`, `eurRate()`, `social()`, `hotelSpot()`, `siteOriginOf()`), `photo-url.ts` (`photoSrc(slugOrUrl, width, fmt)`, shared with the client), `nav.ts` (header/legend/footer link lists).

### Client modules (`src/scripts/`)
- `chrome.ts` — the one entry Base loads; boots everything below. Feature pages add their own `<script>` and import from these modules.
- `motion.ts` — **the engine**. `gsap, ScrollTrigger, SplitText, DrawSVGPlugin` (registered), `lenis()`, `onMotion(setup)` (setup runs in a `gsap.context` while motion is on; reverted to the finished CSS state on Stop/reduced motion; re-run on resume; may return a cleanup), `onMotionChange(cb(off))`, `isMotionOff()`, `isFinePointer()`, `setMotion(off)`, `userStopped()`, `lockScroll(bool)`, `scrollToTarget(target, {immediate})`, `settle()` (call after a UI tween while stopped so the ticker sleeps again). Attribute helpers, all handled automatically: `data-reveal="lines|fade|plate"` (+ `data-reveal-start`, `data-reveal-delay`), `data-parallax` (on a plate frame), `data-crosshair`, `svg[data-wordmark-enter]`, `svg[data-wordmark-draw]`.
- `cart.ts` — `getCart() addItem(item,{toast,name,value}) removeItem(key,{toast,name}) setQty(key,n) updateItem(key,patch) clear() count() itemKey(item) quoteBody(lang,promo?) onChange(cb(count,items)) setUnavailable(keys) isUnavailable(key)`. `count()` leaves out lines the last quote reported `unavailable` (localStorage `dv-cart-x`). Emits `dv:cart {count}`; add/remove show the "U shtua në shportë" toast with Undo and send `add_to_cart` / `remove_from_cart`.
- `drawer.ts` — `initDrawer()`, `initCartCount()`, `fetchQuote(items, signal?)` (typed `POST /api/quote`).
- `prefs.ts` — `getPrefs() setPrefs(patch) setInterests(list) toggleInterest(tag) setCurrency(c) getCurrency() eurRate() getViewed() addViewed(slug) clearViewed() onPrefs(cb)`. Emits `dv:prefs`.
- `track.ts` — `track(type, {product?, value?, meta?})`, `sid()`, `observeVitals()` (LCP/INP in ms, CLS as `value` ×1000 with the exact number in `meta.value`, sent once when the page hides). `chrome.ts` already sends one `view` per page; product pages send `product_view` themselves.
- `livefeed.ts` — `getLive({fresh?})` (one shared `/api/live` read, 5 min sessionStorage cache), `isFresh(l)`; type `Live` mirrors the API contract.
- `menu.ts` — `modal(dialog, {swipeClose:'down'|'right', onOpen, onClose})` for any page-level `<dialog>` (scroll lock, aria-expanded on `[aria-controls]` openers, focus return, swipe close; openers: `commandfor`/`command` or `data-open`/`data-close="<id>"`), `initMenu()`.
- `toast.ts` — `toast(message, {label, run}?)`, `hide()`. `loader.ts`, `ticker.ts` — chrome internals.
- Window events: `dv:cart {count}` · `dv:prefs` · `dv:motion {off}` · `dv:loaded` (loader gone; first-view entrances wait for it when `html.loader-on`) · `dv:assistant-open` (cancelable; T7's panel calls `preventDefault()` to claim the click, otherwise the pill follows its link to the contact page).
- Storage: `localStorage` `dv-cart`, `dv-prefs`, `dv-viewed`, `dv-motion`; `sessionStorage` `dv-seen`, `dv-sid`, `dv-live` (cache).

### Motion rules (DESIGN §7, enforced by `motion.ts`)
- `gsap.ticker` is the only `requestAnimationFrame` owner: never call rAF, never add another animation library, never import `gsap`/`lenis` directly — import from `scripts/motion.ts`. Loops go on `gsap.ticker.add(fn)` inside `onMotion()` and are removed in its cleanup.
- Everything scroll-linked or looping goes through `onMotion()`; with Stop or reduced motion the page shows finished states, Lenis is destroyed, ScrollTrigger is disabled and the ticker sleeps (measured: 0 rAF calls/s idle when stopped; ~128/s when running = GSAP ticker + ScrollTrigger's empty `_rafBugFix` keep-alive).
- Do not call `ScrollTrigger.config()` (in 3.15 it orphans ScrollTrigger's sync interval, which then keeps waking rAF after Stop).
- UI feedback < 300 ms ease-out; only transform/opacity/clip-path move; entrances on tap targets are opacity-only; never `transition: all`; never from `scale(0)`. CSS transitions/`@starting-style` for dialogs and UI states (no JS needed).
- Page changes are native cross-document View Transitions (tide line, 420 ms); skipped when stopped/reduced. `pageswap` is handled in `motion.ts`, `pagereveal` in Base's head script.
- Hidden-until-animated content uses `data-reveal` only (hidden by `html.reveal-pending`, which a 2.6 s failsafe removes if the script never runs). Never hide the LCP element.

### i18n
- `t(lang, key, vars?)`, `useT(lang)`, `has()`, `pick(lang, prefixes)`, `field(row, 'name', lang)` from `src/i18n/ui.ts` (server). In the browser: `tc(key, vars?)` and `lang()` from `src/i18n/client.ts` — strings come from `#dv-i18n` (Base ships prefixes `cart. live. motion. currency. stamp. price. assistant. loader.` + `clientKeys`) or any `<script type="application/json" data-dv-i18n>` island a view adds.
- A feature task adds `src/i18n/dict/<area>.ts` exporting `default { sq: {...}, en: {...} }` with flat dot keys (`shop.filter.kind`); `ui.ts` merges every dict file automatically (duplicate keys warn in dev). Albanian is the source; English must have the same keys.
- `src/i18n/format.ts`: `money(lek, lang, {currency, rate})` (sq "6 500 lekë", en "ALL 6,500", EUR "≈ 65 €" / "≈ €65"), `moneyShort`, `number`, `percent`, `pad2`, `MONTHS/MONTHS_SHORT/WEEKDAYS/WEEKDAYS_SHORT/WEEKDAYS_MIN` (Monday first), `formatDate(iso, lang, 'long'|'medium'|'short'|'day-month'|'month-year'|'weekday'|'weekday-short'|'numeric')`, `formatRange`, `relativeDay` (sot/nesër/dje), `time`, `tirane()` (Europe/Tirane wall clock), `todayISO`, `parseYMD/toISODate/addDays/daysBetween/daysInMonth/weekdayIndex`, `nights/guests/seats`, `dms/coords`, `compass` (sq V/VL/L/JL/J/JP/P/VP).

### Chart (`src/components/chart/`, T3)
The lagoon chart drawn from `research/geo.json` (projection: equirectangular, viewBox `0 0 1000 1360`, 1 unit = 21.4 m; OSM © contributors, ODbL — the component always prints the attribution).

`<Chart lang mode? pins? route? routeTone? highlight? hotel? crop? tags? lettering? scale? title? class? id?>`
| Prop | Meaning |
|---|---|
| `mode` | `'pin'` (default: crop around the pins), `'route'` (crop around the route), `'mini'` (the working sheet, no labels), `'signature'` (the home; script-driven) |
| `pins` | `(poiId \| PinSpec)[]`. `PinSpec { id?, x?, y?, lat?, lon?, label?, n?, key?, selected?, side?: 'left'\|'right', zone?, tag?: 'name'\|'number'\|'both'\|'none' }`. Unknown ids are dropped, never guessed. `zone: true` = a closed/approximate area (dashed pouch ring), e.g. `pelican-island`. Low-confidence POIs get "≈" after the name. |
| `route` | `(poiId \| {x,y} \| {lat,lon})[]` → straight legs between consecutive points (`data-leg=i`). Never route to `pelican-island` (closed) or `pelican-tower` (bird hide tagged destroyed in OSM). |
| `routeTone` | `'signal'` (pouch, default in route mode — DESIGN: the itinerary route) or `'ink'` (dashed ink) |
| `highlight` | poi id drawn selected (pouch core) |
| `hotel` | add the hotel as a home pin (default true in pin/route) |
| `crop` | `[x, y, w, h]` in chart units (default: `cropAround()` of pins + route, or `SHEET_CROP` for mini/signature) |
| `tags`, `lettering`, `scale` | default pin tag, water/place names, the scale bar + north + © row |
Slots: `overlay` (HTML inside the pin layer; position with `style="left:x%;top:y%"` from the crop) and `caption`. Labels choose the roomier side and drop below a neighbour's line by themselves.
Script hooks (the component ships no script): `[data-chart]` (`data-crop`, `data-upk` units per km), `[data-chart-cam]` (camera `<g>`; put a `transform` on it, never animate the viewBox), `[data-pin=<key>]` / `[data-letter=<key>]` with `data-x/data-y` (chart units; move them with the CSS `translate` property, see `scripts/chart-signature.ts` → `apply()` for the formula), `[data-draw="coast|shore"]` (drawable single subpaths), `[data-waterline]`, `[data-sealine]`, `[data-layer=…]`, `[data-leg]`, `[data-zone]`, `.chart__scale-bar`.
Helpers in `src/components/chart/geo.ts` (server): `pois()`, `poi(id)` (+ the chart spot `pine-forest` inside the OSM forest polygon), `project(lat, lon)`, `unproject(x, y)`, `resolvePoint()`, `distanceKm(a, b)`, `fromHotelKm(p)` (straight line), `kmLabel(km, lang)` ("≈ 2,0 km"), `layers(detail?)` (simplified paths + computed waterlines, cached; `'full'` or `'mini'`), `cropAround(points, opts)`, `SHEET_CROP`, `KM_PER_UNIT()`.
Point budget (DESIGN §4.6: at most 2 000 path points per chart, because the signature re-rasterises the SVG on every scroll frame): full = 1 881 points / 25 KB in 39 paths (3 waterlines, 1 sea line, the forest's fill and edge in one path); `mode="mini"` = 722 points / 11 KB (coast, the lagoon water stroked as its own shore, park, forest, one waterline; no rivers, roads, sea lines or lettering). Measure by fetching the page and counting M/L/H/V in the chart's `d` attributes. "Laguna e Karavastasë" is lettered at the middle of the widest horizontal stretch of open water (computed in `geo.ts`), never across a shore.
For T7: the wind arrow at the hotel = `slot="overlay"` element at the hotel's `%` position; for T4: `<Chart lang mode="pin" pins={[product.poi]} />`; for the itinerary: `<Chart lang mode="route" route={ids} pins={ids.map((id, i) => ({ id, n: i + 1, tag: 'both' }))} />`.

### Signature, verse, recommendations (T3)
- `src/components/home/Signature.astro` + `src/scripts/chart-signature.ts`: "Laguna vizatohet". CSS-sticky stage inside a tall track (`html.js:not([data-motion=off])` + `prefers-reduced-motion: no-preference` only), one scrubbed timeline (ScrollTrigger, no pin): DrawSVG on ≤ 2 paths at once, camera = transform on the chart group, overlays moved with `translate`, nothing written when the camera did not move. The five stops are in `src/components/home/stops.ts` (one verified fact each, sources listed under the list view). Stop/reduced motion: the finished chart + the ruled list; `#harta-liste` opens the list, `#pas-hartes` skips the section. While the chart plays, CSS hides the list until it is opened (`.sig__list.is-open`), so the page height is final at first paint; opening it calls `ScrollTrigger.refresh()`. The scrub starts when the stage sticks (the coast draws on the pinned stage); each stop holds its card for ~11 of its 18 timeline units; `html.sig-card-on` and the cards' `inert` follow the card's own on-screen window. Pressing Stop inside the chart puts the reader back at the section's start.
- `src/components/heritage/Verse.astro` + `initVerses()` in `src/scripts/heritage.ts`: the Opal sentence (dict key `heritage.verse`, `[[photo-slug|words]]` = inline photo cut). Words light as the sentence is read; with motion off every word is ink.
- `src/components/recommend/RecommendRail.astro` + `src/scripts/recommend.ts` — reusable on product, cart and confirmation pages:
  `<RecommendRail lang index? title? lead? limit?(4–8, default 6) kinds?(Kind[]) exclude?(slugs) prefs?(default true) id?(unique per page) variant?('cards' default | 'list') class? />`. `variant="cards"`: plates (2–3 columns; under 640 px a horizontal swipe rail, never a tall stack). `variant="list"`: a ruled text index (nr · reason · name · kind · price), for pages that already show the same plates (the home uses it for rooms, packages and gear, since the strip above lists every experience).
  Server: in-season / hotel-picked order (`lib/recommend.ts`; demo events and demo orders never count as popularity), every published product rendered once (hidden pool). Client: `GET /api/recommend` with dv-prefs interests, dv-viewed and the cart's slugs, re-orders the cards and writes the reason (`recommend.reason.<interests|history|together|season|popular|picked>`). "Interesat e mia" = a bottom-sheet `<dialog>` with chips (birds, nature, beach, culture, food, active, family, couple, slow) that write dv-prefs through `scripts/prefs.ts`. Example on a product page: `<RecommendRail lang={lang} title={t(lang,'…')} exclude={[product.slug]} limit={4} id="rekomanduar-produkt" />`.
- Heritage sheets: `src/content/heritage/<slug>.<sq|en>.md` (same slug in both languages; `src/lib/content.ts` feeds search + sitemap from the same files). Body syntax and frontmatter: `src/components/heritage/articles.ts` header. Footnotes are `research/heritage.json` fact ids (`[^lagoon-01]`), verified facts only; `::photo slug | note`, `::chart poi poi*`, `::seasons`, `::distances`.

## End-to-end tests

`tests/e2e/` holds a Playwright suite (`@playwright/test` 1.63.0, the version of the browsers in `%LOCALAPPDATA%\ms-playwright`). It never starts a server: point it at one with `E2E_BASE_URL` (default `http://127.0.0.1:3801`). Results and traces go to `tests/e2e/.results/` (git-ignored, inside the folder Vite already ignores).

| Command | What it runs |
|---|---|
| `E2E_BASE_URL=http://127.0.0.1:3850 npm run test:e2e` | Read-only checks on four projects (`chrome-desktop` 1440×900, `chrome-phone` 390×844, `webkit-desktop`, `webkit-iphone` = iPhone 13): every sitemap route answers 200 with one h1, canonical, hreflang twins, parseable JSON-LD (once); 404s; robots, sitemap, product feed; key pages load without console errors, failed requests or sideways scroll; menu open/close; language switch to the twin page; no third-party requests and no cookies; Stop-animations (0 rAF calls/s, persisted), reduced motion (no loop, nothing left invisible), preloader (Skip, once per session), signature coastline drawing with scroll; JavaScript off (h1 + ≥ 50 words, prices, GET forms, the checkout notice); `/tani/` shows live data or a clean stale state. |
| `E2E_WRITE=1 E2E_BASE_URL=… npm run test:e2e` | Adds `journey.spec.mjs`: home → signature → stay → room (2 nights picked on the calendar) → experience session → shop → gift card + map print → cart → checkout (empty-submit errors, pay at the hotel, a double click sends one order) → order page; TEST card checkout → paid; "find my booking" without JavaScript; then `/admin/`: both orders listed (TEST stamp), room-night grid, seats and stock moved; cancelling the pay-at-hotel order releases nights, seats and stock; the TEST order is cancelled too. Orders use `e2e-…@example.com`; leftovers of a failed run are cancelled at the start of the next one. |

**Write runs only against a test server on a database copy**, never on the shared `data/divjaka.db`:

```sh
npm run build
# copy the database first (VACUUM INTO, or stop writers and copy divjaka.db*), then:
PORT=3850 HOST=127.0.0.1 DIVJAKA_DB=/tmp/e2e/divjaka.db DIVJAKA_DATA=/tmp/e2e ALLOW_TEST_PAYMENTS=1 COOKIE_SECURE=0 RATE_LIMIT_FACTOR=20 node dist/server/entry.mjs
E2E_BASE_URL=http://127.0.0.1:3850 E2E_WRITE=1 npm run test:e2e
```

- `ALLOW_TEST_PAYMENTS=1` enables the TEST card simulator (the card step is skipped without it); `COOKIE_SECURE=0` lets the admin cookie work on plain http; `RATE_LIMIT_FACTOR=20` because the four projects share one address (checkout allows 8 orders per 10 minutes per address).
- Admin sign-in uses `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`, else `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (never printed).
- The journey books next month (the room on different nights per project, the Visitor Centre & Tower session, which runs all year); a demo experience that is out of season (the boat trip ends in October) would have no sessions.
- Firefox is not a project: Playwright's Firefox does not launch on this Windows machine. WebKit on Windows draws variable fonts from their default instance and leaves WebGL out of screenshots; judge type in Chrome. How it feels on a real iPhone (type, scroll) is not covered.
- Not covered here: concurrent last-unit checkouts (covered by `npm run test:api`) and a weather provider that answers slowly. The slow case needs a delaying proxy in front of the server; it was checked by hand (2026-10-27): with a 7 s delay `/tani/` shows its loading state and swaps the readings in without a reload; with 20 s it shows the stale state after 15 s.
