# Divjaka Smart Tourism Platform — Hotel Pelikan

Albanian at `/`, English under `/en/`. Astro 7 (SSR, `@astrojs/node`), SQLite (`node:sqlite`), GSAP + Lenis. Plan: `PLAN.md` · design: `DESIGN.md` · open values: `NEEDS_VERIFICATION.md`.

## Back end

### Commands
| Command | What it does |
|---|---|
| `npm run db:seed` | Creates `data/divjaka.db` (schema + migrations) and adds what is missing: settings, categories, admin user, demo catalogue, sessions 90 days ahead, offers, FAQ. Never overwrites rows the owner edited. If `.env` has no `ADMIN_PASSWORD`, one is generated and written there (never printed). |
| `npm run db:demo` | `--reset --demo`: empties every table, re-seeds, and adds ~60 fake orders + browsing events so the admin dashboard has data. **Refused** when `NODE_ENV=production` or the database looks live: real orders (not demo, not `@example.com`), a product or offer the owner saved, an IBAN, more than one settings group changed from the seed defaults, or an admin password that is no longer the one in `.env`; add `-- --i-know-this-wipes-everything` only after a backup. |
| `node scripts/seed.mjs --sync-admin` | Sets the admin password from `.env` again (the plain seed only uses it when the admin user is first created). After the first sign-in: change the password in the admin and delete `ADMIN_PASSWORD` from `.env`. **Recovery** when nobody can sign in (forgotten password, or someone keeps the account locked and you are on a new browser): put a new `ADMIN_PASSWORD` in `.env` on the server and run this. |
| `npm run dev` | Dev server (the DB is opened and migrated on first request). |
| `npm run build` then `PORT=3801 npm start` | Production server (`dist/server/entry.mjs`); run it from the project folder so `data/` and `.env` are found. |
| `API_URL=http://127.0.0.1:3810 npm run test:api` | API tests (node:test) against a running server started with `RATE_LIMIT_FACTOR=50` (and `ALLOW_TEST_PAYMENTS=1` for a built server). They create `apitest-*` products (archived afterwards) and orders from `api-test-…@example.com` with random phone numbers (cancelled afterwards). |

Environment (`.env`, git-ignored; names in `.env.example`): `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `POK_KEY_ID`, `POK_KEY_SECRET`, `POK_MERCHANT_ID`, `POK_ENV`, `ANTHROPIC_API_KEY`, `TRUST_PROXY`, `TRUST_PROXY_HOPS`, `CLIENT_IP_HEADER`, `COOKIE_SECURE`, `ALLOW_TEST_PAYMENTS`, `RATE_LIMIT_FACTOR`, `DIVJAKA_DB`, `DIVJAKA_DATA`. The server loads `.env` itself (`src/lib/dotenv.ts`).

### Deployment contract
- **TLS ends at a reverse proxy** (Caddy / nginx) in front of `node dist/server/entry.mjs` bound to 127.0.0.1. The proxy must **append** the client address to `X-Forwarded-For` (nginx `$proxy_add_x_forwarded_for`, Caddy default) or overwrite one header named in `CLIENT_IP_HEADER` (`X-Real-IP`, `CF-Connecting-IP`), set `X-Forwarded-Proto` and **overwrite** `X-Forwarded-Host` (nginx `proxy_set_header X-Forwarded-Host $host;` — never pass the client's own header through; until `site_url` is saved the sitemap, feed and robots.txt take their origin from it, and are then sent `no-store`), and cap bodies (`client_max_body_size 20m`). Set `TRUST_PROXY=1` (and `TRUST_PROXY_HOPS=2` behind two appending proxies, e.g. Cloudflare + nginx). Without it every visitor shares the proxy's address for rate limits (logged once, shown in `/api/admin/me` warnings).
- **Public origin**: set it in the admin (Cilësimet → SEO → site URL) or `site` in `astro.config.mjs`. Sitemap, feed, robots and POK callbacks use it; until it is set they use the forwarded host (with `TRUST_PROXY=1`) or a placeholder, never localhost, and **POK card payments stay off**.
- **Cookies / HSTS**: in a production build the admin cookie is always `Secure` (`COOKIE_SECURE=0` only for a plain-http LAN test); HSTS (`max-age=31536000`) and `upgrade-insecure-requests` are sent when the request or the configured origin is https.
- **Payments**: card is offered only with `mode: live` + POK keys, or `mode: test` where `ALLOW_TEST_PAYMENTS=1` (never in production: the TEST simulator lets a customer mark their own order paid; such orders carry `orders.test = 1` and never count as money). Bank transfer is offered only once IBAN and beneficiary are set. Unconfirmed holds expire: card 30 min, bank 72 h, pay-at-hotel 24 h (settings → payments; staff confirming an order ends its hold).
- **Anonymous bookings cannot block the hotel** (settings → inventory; `src/lib/orders.ts` header). A pay-at-hotel, bank or TEST-card order nobody has confirmed (a "long hold") may take at most `unconfirmed_share` (50 %) of a room type's units per night, of a session's seats and of a tracked product's stock, and at most `max_units_per_unconfirmed_order` (5) units of one item (409 `hold_cap` / `hold_cap_units`); the other half stays bookable by card (a 30-minute hold, then paid or released) and by staff. Long or far-ahead stays (> 7 nights or > 60 days ahead), orders placed while new long holds in the last hour passed `max_unconfirmed_{room_nights,seats,units}_per_hour` (unless small and within 30 days), orders past an address group's hourly share (`address_*_per_hour`) and orders by a person who already has open orders from another address get the SHORT hold (`short_hold_hours`, 2 h; `orders.review` says why) — nothing sitewide refuses everybody. Per order: `max_room_nights_per_order` (40), 10 people per time slot, 5 time slots, 30 people. Per address group (IPv4 /24, IPv6 /48) and day: 60 room-nights, 40 seats, 20 units (429). One person: `max_open_orders_per_email` (3) waiting orders on the normalised e-mail or phone, refused only from the same address group. A phone number is required for pay-at-hotel and bank. The dashboard warns (`pending_surge`) at `pending_alert_per_hour` (5) unconfirmed orders or half a surge threshold within an hour; `POST /api/admin/orders/cancel-unconfirmed` (dry run first) cancels a flood in one click. Confirm the real ones (that lifts every limit for them).
- **Rate limits** are in memory, per client address; IPv6 addresses are grouped per /64. Public API reads: 1 200 a minute (`/api/live` and `/api/config` are not counted). Admin sign-in: 5/min per address + e-mail, 20/min per address, 60 password checks/min sitewide, and after 10 failures in 15 min one try per 30 s for that account — except from a **known device** (`dv_device` cookie, 180 days, set at every successful sign-in), so a password guesser can never lock the owner out of a browser they used before. The sitewide sign-in ceiling (60 password checks a minute, 10 per address group) is audited when hit (`login_ceiling_hit`, dashboard warning); remembered browsers still sign in. `RATE_LIMIT_FACTOR` multiplies every limit and ceiling: test servers only — a production server with it set logs a warning at boot and shows `rate_limit_factor_set`.
- **Audit log** (`audit_log`, also one JSON console line each): sign-ins, first failure and lockout per account, password changes, settings changes (IBAN / beneficiary / bank / SWIFT flagged; the dashboard shows `payment_details_changed` for 7 days), price and unit changes, offers, room rates, customer exports and erasures. No secrets are logged; addresses are cut to /24 (IPv4) or /48 (IPv6).
- **Roles**: `owner` and `staff`. Owner only: settings, prices (`price`, `compare_at`, gift amount limits, `min_nights`), publishing a product and taking a published one off sale (staff-created products are saved as drafts), offers, room rates, customer CSV export, customer erasure. Payment settings (IBAN, beneficiary, bank, SWIFT, card mode, methods) also need the owner's password again (`current_password`). Everyone: their own password. Password re-entry is throttled (5 per user / 10 per address in 15 min) and 5 wrong in a row end every session of that user. Admin sessions: 14 days sliding, 30 days at most.
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
- `GET /api/availability/room/:slug?from&to[&qty&guests]` or `?month=YYYY-MM` · `GET /api/availability/experience/:slug?month=YYYY-MM`
- `POST /api/quote` `{lang, items, promo}` — the only place prices are computed (`src/lib/pricing.ts`). A failed promo code gets one generic message; 10 failed codes per address in 10 minutes and codes are not looked up any more (checkout: 429 `promo_rate`).
- `POST /api/checkout` `{lang, items, customer, payment_method, promo, notes, marketing_consent, terms_accepted, utm, ref}` → `201 {code, token, next, order}`; errors 409 `cart_problem` / `sold_out` / `promo_invalid` / `hold_cap`, 429 `too_many_open_orders` / `busy` / `promo_rate` / `rate_limited` (`sid` is accepted and ignored)
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
Helpers in `src/components/chart/geo.ts` (server): `pois()`, `poi(id)` (+ the chart spot `pine-forest` inside the OSM forest polygon), `project(lat, lon)`, `unproject(x, y)`, `resolvePoint()`, `distanceKm(a, b)`, `fromHotelKm(p)` (straight line), `kmLabel(km, lang)` ("≈ 2,0 km"), `layers()` (simplified paths + computed waterlines, cached), `cropAround(points, opts)`, `SHEET_CROP`, `KM_PER_UNIT()`.
For T7: the wind arrow at the hotel = `slot="overlay"` element at the hotel's `%` position; for T4: `<Chart lang mode="pin" pins={[product.poi]} />`; for the itinerary: `<Chart lang mode="route" route={ids} pins={ids.map((id, i) => ({ id, n: i + 1, tag: 'both' }))} />`.

### Signature, verse, recommendations (T3)
- `src/components/home/Signature.astro` + `src/scripts/chart-signature.ts`: "Laguna vizatohet". CSS-sticky stage inside a tall track (`html.js:not([data-motion=off])` + `prefers-reduced-motion: no-preference` only), one scrubbed timeline (ScrollTrigger, no pin): DrawSVG on ≤ 2 paths at once, camera = transform on the chart group, overlays moved with `translate`, nothing written when the camera did not move. The five stops are in `src/components/home/stops.ts` (one verified fact each, sources listed under the list view). Stop/reduced motion: the finished chart + the ruled list; `#harta-liste` opens the list, `#pas-hartes` skips the section.
- `src/components/heritage/Verse.astro` + `initVerses()` in `src/scripts/heritage.ts`: the Opal sentence (dict key `heritage.verse`, `[[photo-slug|words]]` = inline photo cut). Words light as the sentence is read; with motion off every word is ink.
- `src/components/recommend/RecommendRail.astro` + `src/scripts/recommend.ts` — reusable on product, cart and confirmation pages:
  `<RecommendRail lang index? title? lead? limit?(4–8, default 6) kinds?(Kind[]) exclude?(slugs) prefs?(default true) id?(unique per page) class? />`.
  Server: popular / in-season picks (`lib/recommend.ts`), every published product rendered once (hidden pool). Client: `GET /api/recommend` with dv-prefs interests, dv-viewed and the cart's slugs, re-orders the cards and writes the reason (`recommend.reason.<interests|history|together|season|popular>`). "Interesat e mia" = a bottom-sheet `<dialog>` with chips (birds, nature, beach, culture, food, active, family, couple, slow) that write dv-prefs through `scripts/prefs.ts`. Example on a product page: `<RecommendRail lang={lang} title={t(lang,'…')} exclude={[product.slug]} limit={4} id="rekomanduar-produkt" />`.
- Heritage sheets: `src/content/heritage/<slug>.<sq|en>.md` (same slug in both languages; `src/lib/content.ts` feeds search + sitemap from the same files). Body syntax and frontmatter: `src/components/heritage/articles.ts` header. Footnotes are `research/heritage.json` fact ids (`[^lagoon-01]`), verified facts only; `::photo slug | note`, `::chart poi poi*`, `::seasons`, `::distances`.
