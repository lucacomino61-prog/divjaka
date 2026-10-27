# PLAN — Divjaka Smart Tourism Platform

Owner: Hotel Pelikan, Divjakë (Albania). Requested by Luca, 2026-10-23.
Brief: `research/SPEC.md` (the client's specification, transcribed and translated). Design contract: `DESIGN.md`. Unverified values: `NEEDS_VERIFICATION.md`. Research: `research/*.md|json` (facts, photos, map, live APIs — each fact carries a source).

Luca's words: "build all of it following awwwards website design, animation, interaction, admin panel, webstore, preloader, menu, English + Albanian (Albanian first), don't put things that don't make sense, take images from the internet for the Divjaka lagoon". Signature moment chosen by Luca: **"The lagoon draws itself"** (see DESIGN.md §4).

---

## 1. Spec → features (every spec line has a home)

| Spec requirement (SPEC.md) | Feature | Where |
|---|---|---|
| Promotion of Divjakë-Karavasta tourism | Home poster + signature chart, Heritage, Experiences | `/`, `/trashegimia/`, `/eksperienca/` |
| Online bookings | Room booking (date range, guests, real availability) and experience booking (session date, seats) | `/qendrimi/…`, `/eksperienca/…`, cart, checkout |
| Personalised itineraries | Itinerary planner: days, interests, pace, season → day-by-day plan drawn as a route on the chart, bookable items added to cart, shareable URL | `/itinerari/` |
| Real-time information | Live conditions (weather, wind, sea temperature, sunrise/sunset, air quality, what's in season now), live availability (rooms tonight, seats today), live ticker on every page | `/tani/`, header ticker, `/api/live` |
| Multilingual assistance (24/7) | Assistant chat in Albanian and English (knowledge base + live availability + recommendations + hand-off to staff) | floating "Pyet" pill on every public page, `/api/assistant` |
| Complete virtual shop: catalogue, current prices, real-time availability, buy in a few clicks | Shop with categories, filters, search, grid/list views, product pages, cart drawer, 3-step checkout | `/dyqani/`, `/shporta/`, `/arka/` |
| Electronic payments | Pay at the hotel, bank transfer, card through a payment-provider adapter (POK) with a clearly labelled TEST mode until the owner has a merchant contract; payment confirmed server-side only | `/arka/`, `/api/pay/*` |
| Inventory management | Stock for goods, units × nights for rooms, seats × sessions for experiences, closures, inventory log; oversell impossible (SQLite transaction + CHECK) | admin |
| Customer-data analysis | Customers, order history, cohort/repeat rate, consented marketing list export | admin |
| Personalised experience based on history and preferences | Interests chosen in the planner or the "Interesat e mia" sheet; viewed history; past orders (by email) → recommendations everywhere | client prefs + `/api/recommend` |
| Automatic product recommendations | "Rekomanduar për ju", "Shkon mirë me", "Kush e rezervoi këtë, rezervoi edhe" (co-purchase from real orders, tag overlap, season fit, popularity) | home, product, cart, confirmation |
| Special offers | Automatic offers (date windows, min nights, categories) + promo codes, strike-through prices, Oferta badges | shop, admin |
| Eliminate intermediaries / direct sales | Book direct on the hotel's own platform; "best rate when you book direct" only if the owner confirms it (NEEDS_VERIFICATION) | stay page |
| Personalised communication | Order confirmation page with a personal itinerary, assistant, contact form; marketing consent (opt-in) stored | checkout, admin messages |
| Integration with main e-commerce platforms and social networks | Product feed `/feed/products.xml` (Google Merchant / Meta catalogue format), Product/Hotel/TouristAttraction JSON-LD, Open Graph per page, share buttons (Web Share API, WhatsApp, Viber, Facebook), UTM link builder in admin, social links from settings | site-wide, admin |
| Automate sales, inventory, customer communication | Order status flow, automatic seat/stock holds, low-stock alerts, message inbox | admin |
| Promote natural and cultural heritage, for locals and foreigners | Heritage hub with articles (lagoon, Dalmatian pelican, birds by season, pine forest, flora & fauna, history, nearby culture), each fact sourced | `/trashegimia/…` |
| Continuous monitoring: sales metrics, customer behaviour, platform performance | Admin dashboard + analytics: revenue, orders, AOV, funnel, top products, sources/UTM, devices, languages, site search with no results, assistant questions unanswered, real-user Web Vitals (LCP/INP/CLS), occupancy next 30 days, low stock | `/admin/` |
| Hotel Pelikan: 20+ years, near the sea and the pine park, modern rooms, bar-restaurant | Stay page (rooms + bar-restaurant), About strip on home | `/qendrimi/` |
| Activity packages: cultural, National Park, Karavasta Lagoon, Pelican Observation Tower, Visitor Centre with dedicated guides | Experiences catalogue (one product per package, each pinned on the chart) | `/eksperienca/` |

Not built (would not make sense here): user accounts with passwords for tourists (bookings are looked up by code + email instead), reviews/testimonials (none exist — never invent), a blog, multi-vendor marketplace payouts.

## 2. Facts rules (non-negotiable)
- Only facts from `SPEC.md` (about the hotel) or from `research/*.json` entries with `verified: true` (about the area) may appear as statements. Copy each fact's source into the page's source list where it is a number or date.
- Everything invented for a working demo (room types, prices, schedules, stock, contact details, IBAN, opening hours, product list of local goods) is seeded with `demo = 1`, listed in `NEEDS_VERIFICATION.md`, and editable in the admin. Public pages must never present a demo value as an official fact in prose ("open daily 8–18" is NOT allowed unless sourced; a price on a product card is fine because the owner sets it).
- Photos: only from `research/photos.json` (licensed, credited on `/kreditet/`). A caption may say "Karavasta" only when `location_verified` is true.
- No testimonials, ratings, awards, partner logos or "as seen in" unless real and sourced.

## 3. Stack and repo

- **Astro 7.4** (`output: 'server'`, `@astrojs/node` standalone) — every page SSR-rendered from SQLite so prices, availability and admin edits are live, and all words are in the server HTML (SEO, JS-off). Vite 8 underneath.
- **Database:** Node 24 built-in `node:sqlite` (`DatabaseSync`), file `data/divjaka.db` (gitignored). Schema in `db/schema.sql`, migrations applied on boot (`src/lib/db/index.ts`), seed via `node scripts/seed.mjs` (`--demo` adds demo orders/events for the dashboard; without it only catalogue + settings). Uploads in `data/uploads/` served by `src/pages/media/[...path].ts`.
- **Motion:** GSAP 3.15 (ScrollTrigger, SplitText, DrawSVGPlugin — all free) + Lenis 1.3, **one ticker**: `gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0)`. Nothing else calls `requestAnimationFrame`. Cross-document View Transitions (inline `<style>@view-transition{navigation:auto}</style>` in every head) for page changes. No other animation library anywhere (admin included).
- **Validation:** zod 4 on every API input.
- **Fonts:** self-hosted woff2 in `public/fonts/` (see DESIGN.md §2). Giant wordmark outlined to SVG at build time by `tools/wordmark.mjs` (opentype.js) → `src/assets/wordmark.ts`, so no late-font CLS.
- **Dev:** `npm run dev` → http://127.0.0.1:3800 (launch config `divjaka` in `.claude/launch.json`). Prod: `npm run build && PORT=3801 npm start`.
- **Git:** local repo, commit after each verified task. Never push or deploy unless Luca says so.

### Folders (ownership is assigned per task in §9)
```
db/schema.sql                    tables (§5)
scripts/seed.mjs                 catalogue/settings seed from research + demo flags
tools/                           build-time tools (wordmark, image variants, probes)  — not shipped
public/fonts, public/photos      self-hosted fonts, licensed photos (AVIF/WebP widths)
src/
  layouts/Base.astro             <html lang>, head (meta, hreflang, OG, JSON-LD, VT opt-in), skip link, chrome
  layouts/Admin.astro            admin shell
  components/site/               Header, Menu, Footer, Preloader, Ticker, LangSwitch, MotionSwitch, CartDrawer, AssistantPill, Breadcrumbs, SourceList, Photo, Price, Pill, …
  components/chart/              Chart.astro (SVG chart of the lagoon from research/geo.json), pins, legend
  components/<feature>/          per-feature components (home, stay, experiences, shop, checkout, itinerary, live, assistant, heritage)
  views/                         one view per page, rendered by both the sq and en route files: <View lang="sq|en" />
  pages/                         route files (thin): sq at root, en under /en; api/, feed/, admin/, media/
  i18n/                          ui.ts (t()), routes.ts (route keys ↔ localized paths), dict/<area>.ts ({sq,en}), format.ts (money, dates — Albanian tables, no browser Intl for sq)
  lib/db/                        index.ts (open, migrate, tx()), repo/<table>.ts
  lib/                           pricing.ts (single price authority), availability.ts, offers.ts, recommend.ts, assistant/, live.ts (Open-Meteo, cached), analytics.ts, auth.ts, security.ts (headers, origin checks, rate limit), payments/ (provider adapters), feed.ts, seo.ts
  scripts/                       client modules: motion.ts (engine), loader.ts, menu.ts, cart.ts, prefs.ts, track.ts, live.ts, chart-signature.ts, …
  styles/                        base.css (from awwwards-blueprints), tokens.css, type.css, chrome.css, …
  middleware.ts                  security headers, admin guard, locals.lang
```

## 4. Routes (Albanian first)

| Key | Albanian | English | Notes |
|---|---|---|---|
| home | `/` | `/en/` | poster + signature chart |
| stay | `/qendrimi/` | `/en/stay/` | Hotel Pelikan: rooms, bar-restaurant, booking bar |
| room | `/qendrimi/[slug]/` | `/en/stay/[slug]/` | room page: floating order card, calendar with live availability |
| experiences | `/eksperienca/` | `/en/experiences/` | packages; list/grid; filter by interest |
| experience | `/eksperienca/[slug]/` | `/en/experiences/[slug]/` | sessions calendar, seats left |
| shop | `/dyqani/` | `/en/shop/` | full catalogue (all kinds), filters `?lloji=&interes=&q=&rendit=&pamja=liste` |
| product | `/dyqani/[slug]/` | `/en/shop/[slug]/` | goods, gift cards, bundles (rooms/experiences redirect to their own pages) |
| cart | `/shporta/` | `/en/cart/` | full cart page (the drawer is the quick view) |
| checkout | `/arka/` | `/en/checkout/` | details → payment → review |
| order | `/porosia/[code]/` | `/en/order/[code]/` | confirmation/status (needs `?e=` email token or session) |
| account | `/rezervimet/` | `/en/bookings/` | find my bookings (code + email), my interests, recently viewed |
| itinerary | `/itinerari/` | `/en/itinerary/` | planner; state in URL |
| heritage | `/trashegimia/` | `/en/heritage/` | hub |
| article | `/trashegimia/[slug]/` | `/en/heritage/[slug]/` | sourced articles |
| now | `/tani/` | `/en/now/` | real-time info |
| contact | `/kontakt/` | `/en/contact/` | form → admin inbox, map pin, channels from settings |
| privacy | `/privatesia/` | `/en/privacy/` | |
| terms | `/kushtet/` | `/en/terms/` | booking & cancellation terms (owner must confirm) |
| credits | `/kreditet/` | `/en/credits/` | photo + map + data credits |
| 404 | `404.astro` | | bilingual, with search |
| admin | `/admin/…` | (Albanian UI, EN toggle) | §7 |
| api | `/api/…` | | §6 |
| feed | `/feed/products.xml`, `/sitemap.xml`, `/robots.txt` | | |

Every page: `<link rel="alternate" hreflang="sq|en|x-default">` to its twin (from `i18n/routes.ts`); the language switch goes to the twin, not to the home.

## 5. Data model (`db/schema.sql`, SQLite, money in whole lek, dates `YYYY-MM-DD`, times Europe/Tirane)

```sql
settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)                       -- JSON values: business, payments, currency(eur_rate), social, assistant, seo
admin_users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', created_at TEXT NOT NULL)
admin_sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES admin_users(id), created_at TEXT, expires_at TEXT, last_seen TEXT)
categories(id TEXT PRIMARY KEY, name_sq TEXT, name_en TEXT, sort INTEGER)  -- stays, experiences, bundles, gifts, local
products(
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('room','experience','bundle','gift','goods')),
  category TEXT REFERENCES categories(id),
  name_sq TEXT NOT NULL, name_en TEXT NOT NULL,
  summary_sq TEXT, summary_en TEXT, body_sq TEXT, body_en TEXT,          -- short markdown subset
  includes_sq TEXT, includes_en TEXT,                                    -- JSON arrays
  price INTEGER NOT NULL CHECK (price >= 0),                             -- room: per night; experience: per person; others: per unit
  compare_at INTEGER,                                                    -- manual strike-through
  stock INTEGER CHECK (stock IS NULL OR stock >= 0),                     -- goods only; NULL = not tracked
  units INTEGER,                                                         -- room: identical rooms of this type
  capacity INTEGER,                                                      -- room: max guests per room; experience: default seats per session
  duration_min INTEGER, poi TEXT,                                        -- poi = research/geo.json poi id (chart pin)
  tags TEXT NOT NULL DEFAULT '[]',                                       -- birds, nature, beach, culture, food, active, family, couple, slow, rainy
  seasons TEXT NOT NULL DEFAULT '[]',                                    -- months 1–12 when it makes sense
  images TEXT NOT NULL DEFAULT '[]',                                     -- [{slug, alt_sq, alt_en}] referencing research/photos.json or uploads
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  featured INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0,
  demo INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)
bundle_items(bundle_id INTEGER REFERENCES products(id), product_id INTEGER REFERENCES products(id), qty INTEGER, PRIMARY KEY(bundle_id, product_id))
room_rates(id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), date_from TEXT NOT NULL, date_to TEXT NOT NULL, price INTEGER NOT NULL)  -- seasonal per-night price
room_nights(product_id INTEGER NOT NULL REFERENCES products(id), night TEXT NOT NULL, booked INTEGER NOT NULL DEFAULT 0, closed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(product_id, night))  -- app enforces booked+closed <= units inside tx
sessions(id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), starts_at TEXT NOT NULL, capacity INTEGER NOT NULL, booked INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')), note TEXT, CHECK (booked <= capacity), UNIQUE(product_id, starts_at))
customers(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, phone TEXT, country TEXT, lang TEXT, marketing_consent INTEGER NOT NULL DEFAULT 0, consent_at TEXT, created_at TEXT NOT NULL, notes TEXT)
orders(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, access_token TEXT NOT NULL, customer_id INTEGER REFERENCES customers(id),
  email TEXT NOT NULL, name TEXT NOT NULL, phone TEXT, country TEXT, lang TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','completed','cancelled')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('hotel','bank','card')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded','failed')),
  payment_ref TEXT, subtotal INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL, promo_code TEXT,
  notes TEXT, source TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, paid_at TEXT, cancelled_at TEXT)
order_items(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER REFERENCES products(id), kind TEXT NOT NULL,
  name TEXT NOT NULL, unit_price INTEGER NOT NULL, qty INTEGER NOT NULL, line_total INTEGER NOT NULL,
  date_from TEXT, date_to TEXT, session_id INTEGER REFERENCES sessions(id), guests INTEGER, meta TEXT)
offers(id INTEGER PRIMARY KEY, name_sq TEXT, name_en TEXT, type TEXT NOT NULL CHECK (type IN ('percent','fixed')), value INTEGER NOT NULL,
  scope TEXT NOT NULL DEFAULT '{}',          -- JSON {kinds:[], categories:[], products:[]} empty = everything
  min_nights INTEGER, min_total INTEGER, starts_on TEXT, ends_on TEXT,
  code TEXT UNIQUE,                          -- NULL = automatic offer shown on prices; else a promo code
  max_uses INTEGER, used INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, demo INTEGER NOT NULL DEFAULT 1)
inventory_log(id INTEGER PRIMARY KEY, product_id INTEGER, session_id INTEGER, night TEXT, delta INTEGER NOT NULL, reason TEXT NOT NULL, order_id INTEGER, admin_id INTEGER, ts TEXT NOT NULL)
messages(id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('contact','assistant','callback')), name TEXT, email TEXT, phone TEXT, lang TEXT, subject TEXT, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','done')), created_at TEXT NOT NULL)
faq(id INTEGER PRIMARY KEY, q_sq TEXT, q_en TEXT, a_sq TEXT, a_en TEXT, keywords TEXT, links TEXT, sort INTEGER, active INTEGER NOT NULL DEFAULT 1)
events(id INTEGER PRIMARY KEY, ts TEXT NOT NULL, day TEXT NOT NULL, type TEXT NOT NULL, path TEXT, lang TEXT, product_id INTEGER, value INTEGER, sid TEXT, ref TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, device TEXT, meta TEXT)
  -- types: view, product_view, search, add_to_cart, remove_from_cart, checkout_start, order, paid, assistant_q, assistant_miss, itinerary, share, vital (meta {name,value,rating}), live_view
CREATE INDEX … on events(day,type), orders(created_at), order_items(product_id), sessions(product_id, starts_at), room_nights(night)
```
Holds: an order reserves room nights / session seats / stock inside one `BEGIN IMMEDIATE` transaction; a cancelled order releases them (and writes `inventory_log`). Pending card orders that are not paid in 30 min are released by a sweep on each request to `/api/checkout` and on admin load.

Added by T1 (2026-10-23; `db/schema.sql` is the source of truth):
- `schema_version(version, name, applied_at)` — v1 = schema.sql; later changes go in `db/migrations/NNN-name.sql`.
- `products.options TEXT '{}'` — kind-specific JSON: room `{min_nights}`, gift `{amount_min, amount_max, amount_step}`, any `{google_category}`. `includes_*` default `'[]'`.
- `orders.payment_provider` ('test' | 'pok' for card), `orders.sid` (analytics tab id, funnel join), `orders.demo`, `customers.demo` (rows from `seed --demo`).
- `room_rates.note`; `room_rates.date_to` is inclusive. `room_nights` cap enforced by triggers `room_nights_cap_ins/upd` (booked + closed ≤ units → ABORT), plus `CHECK (booked >= 0, closed >= 0)`; `sessions` `CHECK (booked <= capacity)`; `products` `CHECK (stock >= 0)`.
- `sessions.starts_at` is local Europe/Tirane wall-clock `'YYYY-MM-DDTHH:MM'`; `created_at`-style columns are UTC ISO.
- Extra indexes: events(type, product_id), orders(status, payment_status), orders(customer_id), order_items(order_id), order_items(session_id), sessions(starts_at), products(kind, status), room_rates(product_id, date_from), inventory_log(product_id, ts), messages(status, created_at).
- Demo rows: events with `sid LIKE 'demo-%'`, orders/customers with `demo = 1`.
- Migration `002-order-holds-consent-test` (2026-10-23): `orders.test` (1 = TEST card simulator; never counted as money), `orders.marketing_consent` (box ticked on that checkout; copied to `customers.marketing_consent` only when the order is paid or staff confirm it — a checkout never overwrites an existing customer's fields), `orders.hold_until` (unpaid/unconfirmed orders are released by the sweep after it: card 30 min, bank 72 h, pay-at-hotel 48 h, settings.payments; staff confirming clears it). Indexes orders(email, status), orders(status, hold_until). The sweep also runs every 5 minutes in the background.
- Migration `003-holds-devices-audit` (2026-10-23, T1 fix round 2): `orders.email_key` (normalised e-mail: lower case, +tag and Gmail dots removed) and `orders.phone_key` (last 9 digits) — the per-person cap on waiting orders counts these; `orders.staff_hold` (1 = staff set the status by hand: never swept, not an unconfirmed hold). "Unconfirmed" = pending + unpaid/failed + staff_hold 0 + demo 0; such orders may hold at most `settings.inventory.unconfirmed_share` (50 %) of a room type's units per night and `max_unconfirmed_room_nights_per_hour` (60) room-nights sitewide per hour. Pay-at-hotel hold now 24 h. Marketing consent ticked at checkout is copied to the customer only on a (non-TEST) payment or an explicit staff `confirm_consent`. `orders.sid` is no longer written (cleared; orders are not linked to browsing). New tables `admin_devices(token_hash, user_id, created_at, last_seen, expires_at)` (known-device cookie for sign-in under attack), `audit_log(ts, admin_id, action, ip, detail)`, `events_daily(day, type, product_id, n, sids, value_sum)` (roll-up kept after raw events expire, `settings.privacy`). Indexes orders(email_key, status), orders(phone_key, status), order_items(product_id, kind, date_from, date_to). Pre-002 card orders got their 30-minute `hold_until`; demo promo codes start inactive.
- Migration `004-review-holds` (2026-10-23, T1 fix round 3): `orders.review` (why an unconfirmed order got the SHORT hold, `settings.inventory.short_hold_hours` = 2 h, instead of 24/72 h: comma list of `far_or_long` (> 7 nights or arrival > 60 days ahead), `surge` (sitewide hourly thresholds reached and the order is not small and near-term), `address_share` (the address group passed its hourly share), `person_open_orders` (the e-mail/phone already has open orders placed from another address)). Indexes order_items(session_id), order_items(product_id, kind). "Unconfirmed" now also covers TEST-paid orders (released by the sweep after their hold). "Long hold" = unconfirmed and paid at hotel / by bank / by TEST card: these may hold at most `unconfirmed_share` (50 %) of a room type per night, of a session's seats and of a tracked product's stock, and ≤ `max_units_per_unconfirmed_order` (5) units of one product; a real card order (30-minute hold) is never share-capped. Nothing sitewide refuses everybody any more (the old 429 `busy` is gone). New settings: `inventory.max_unconfirmed_{seats,units}_per_hour`, `address_{room_nights,seats,units}_per_hour`, `max_{seats,units}_per_address_day`, `max_units_per_unconfirmed_order`, `max_people_per_session_line` (10), `max_session_lines_per_order` (5), `max_people_per_order` (30), `short_hold_hours`, `far_stay_nights`, `far_stay_days`; `privacy.events_per_address_day` (2000), `orders_days` (90: cancelled never-paid orders anonymised), `inventory_log_days` (730).

## 6. API (JSON; zod-validated; errors `{error:{code,message_sq,message_en}}`)
Public:
- `GET /api/catalog?lang&kind&category&tag&q&sort&ids` · `GET /api/product/:slug`
- `GET /api/availability/room/:slug?from&to` (per night: price, left) · `?month=YYYY-MM` (calendar)
- `GET /api/availability/experience/:slug?month=YYYY-MM` (sessions with seats left)
- `POST /api/quote` `{items, promo}` → server-priced lines, applied offers, totals, per-line problems. **`src/lib/pricing.ts` is the only place prices are computed.**
- `POST /api/checkout` `{items, customer, payment_method, promo, notes, marketing_consent, terms_accepted}` → `{code, token, next}`; re-quotes server-side, holds inventory in a tx.
- `GET /api/order/:code?t=` → status
- `POST /api/pay/test/:code` (TEST mode simulator, only when payments mode = test) · `POST /api/pay/pok/webhook` (real adapter, active only with POK_* env vars; confirms by re-reading the order from POK)
- `GET /api/recommend?lang&interests&viewed&cart&limit` → `[{slug, reason_key}]`
- `GET /api/live` → `{weather, marine, air, sun, season_now, availability_today, updated_at}` (server fetches Open-Meteo, caches 10 min, returns stale with `stale:true` on failure)
- `POST /api/assistant` `{lang, message, context}` → `{reply, chips, links, products}`
- `POST /api/contact` · `POST /api/e` (analytics beacon, 204) · `GET /api/search?q&lang` (site search across products, articles, FAQ)
Admin (session cookie `dv_admin`, HttpOnly, SameSite=Strict, Secure in prod; mutations require `Sec-Fetch-Site: same-origin` or matching Origin; login rate-limited):
- `POST /api/admin/login|logout`, `GET /api/admin/me`
- CRUD: `/api/admin/products`, `/sessions` (+ bulk generate from a weekly pattern), `/room-rates`, `/room-nights` (close/open), `/offers`, `/faq`, `/settings`, `/categories`
- `/api/admin/orders` (list/filter/detail, `PATCH` status/payment with inventory release on cancel), `/bookings?from&to` (room grid + sessions with guest lists), `/customers` (+ CSV export), `/messages`, `/stats?from&to`, `POST /api/admin/upload` (image → WebP widths)

## 7. Admin panel (`/admin/`)
Albanian by default with an EN toggle. Sections: **Paneli** (KPIs, revenue chart, funnel, occupancy next 30 days, low stock, latest orders, unanswered assistant questions) · **Porositë** · **Rezervimet** (room-night grid + sessions) · **Produktet** (all kinds, bilingual editor, images, status, demo flag cleared when the owner saves) · **Eksperiencat & oraret** (weekly pattern → sessions) · **Dhomat & çmimet** (units, seasonal rates, closures) · **Ofertat** (automatic offers + promo codes) · **Klientët** · **Mesazhet** · **Analitika** (sources/UTM, devices, languages, search terms, Web Vitals, top pages) · **Asistenti** (FAQ editor, missed questions) · **Cilësimet** (business details, payment methods + mode, IBAN, EUR rate, social links, UTM builder). Charts: hand-made SVG (dataviz skill), no chart library. First password from `scripts/seed.mjs` writes `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`) — never printed in chat.

## 8. Client behaviour
- Cart in `localStorage['dv-cart']` (`{v:1, items:[{key,slug,kind,qty,from,to,session_id,guests,amount}]}`), header count updates on the `dv:cart` event; drawer is a `<dialog>`; every displayed total comes from `/api/quote`.
- Prefs `dv-prefs` `{interests[], currency:'ALL'|'EUR'}`; history `dv-viewed` (30 slugs); motion `dv-motion`='off'; loader seen `sessionStorage['dv-seen']`; analytics tab id `sessionStorage['dv-sid']` (no cookies; first-party, aggregate; no IP stored) — so no cookie banner is needed; the privacy page says exactly this.
- Currency: lek (ALL) stored; EUR shown as approximate using the admin's rate, with "≈".
- Albanian dates/numbers are formatted from our own tables (`src/i18n/format.ts`), never with browser `Intl` for `sq` (Chrome ships no Albanian data). Server may use Node's full ICU.
- State in the URL: shop filters, view mode, itinerary choices, calendar month.

## 9. Tasks (each: build → verify (site-verifier) → review (site-reviewer) → fix → commit)

| ID | Task | Owns (write) | Needs |
|---|---|---|---|
| T1 | **Core back end**: schema, db layer, pricing/availability/offers, all public + admin API routes listed in §6 (admin UI excluded), security middleware, analytics ingest, live data, feed/sitemap/robots, seed from research | `db/`, `scripts/`, `src/lib/**`, `src/pages/api/**`, `src/pages/feed/**`, `src/pages/media/**`, `src/pages/sitemap.xml.ts`, `src/pages/robots.txt.ts`, `src/middleware.ts` | research |
| T2 | **Design system + chrome**: tokens, fonts, base.css, type, wordmark tool, Base layout, Header, Menu, Footer, Preloader, Ticker, MotionSwitch, LangSwitch, CartDrawer, AssistantPill shell, Photo/Price/Pill/SourceList/Breadcrumbs, motion engine, i18n infra + routes map + formatters, every route file as a thin shell rendering a view placeholder | `src/styles/**`, `src/layouts/**`, `src/components/site/**`, `src/scripts/{motion,loader,menu,cart,prefs,track}.ts`, `src/i18n/**` (except `dict/<feature>.ts` files owned below), `src/pages/**` route shells (non-api), `public/fonts/**`, `tools/wordmark.mjs`, `src/assets/**` | DESIGN.md |
| T3 | **Home + signature chart + heritage + credits** | `src/views/{Home,Heritage,Article,Credits}.astro`, `src/components/{home,chart,heritage}/**`, `src/scripts/chart-signature.ts`, `src/i18n/dict/{home,heritage}.ts`, `src/content/heritage/**` | T1, T2, research |
| T4 | **Stay + experiences + booking widgets** | `src/views/{Stay,Room,Experiences,Experience}.astro`, `src/components/{stay,experiences,booking}/**`, `src/scripts/booking.ts`, `src/i18n/dict/{stay,experiences,booking}.ts` | T1, T2 |
| T5 | **Shop, cart, checkout, payments UI, order page, bookings lookup, recommendations rail, offers** | `src/views/{Shop,Product,Cart,Checkout,Order,Bookings}.astro`, `src/components/{shop,checkout,recommend}/**`, `src/scripts/{shop,checkout,recommend}.ts`, `src/i18n/dict/{shop,checkout}.ts` | T1, T2 |
| T6 | **Admin panel** | `src/pages/admin/**`, `src/layouts/Admin.astro`, `src/components/admin/**`, `src/scripts/admin/**`, `src/styles/admin.css`, `src/i18n/dict/admin.ts` | T1 |
| T7 | **Now (real-time), itinerary planner, assistant, contact, legal, 404** | `src/views/{Now,Itinerary,Contact,Privacy,Terms,NotFound}.astro`, `src/components/{live,itinerary,assistant,contact}/**`, `src/scripts/{live,itinerary,assistant}.ts`, `src/i18n/dict/{now,itinerary,assistant,contact,legal}.ts`, `src/lib/assistant/kb/**` | T1, T2, research |
| T8 | **Whole-site pass**: copy review (Albanian native quality), impeccable critique/audit, awwwards audit.mjs on every route (0 FAIL), performance, a11y, e2e suite `tests/e2e`, NEEDS_VERIFICATION + OWNER.md + README | any (coordinated) | all |

Rule for shared files: a task may only ADD exports to files owned by another task (never rewrite or delete), and must record the addition in `HANDOFF.md`.

## 10. Acceptance (gate for "done")
- Every route in §4 renders 200 in both languages, words in the server HTML, valid hreflang pairs, one h1, titles/descriptions per page.
- `node ~/.claude/skills/awwwards-blueprints/scripts/audit.mjs <url>` → 0 FAIL on every public route (WARNs fixed or justified; the English-only Stop-animations regex WARN on sq pages is a known false positive). Justified WARN: `targets-44` on article footnote marks (`sup.ref a`, 44×24 px on touch, 24×24 px with a mouse): they are inline links inside running text, exempt under WCAG 2.5.8 (inline exception); a 44 px tall box would overlap the lines above and below (line height ≈ 26 px) and steal the taps of links there, so the hit area grows sideways only.
- Justified exception to the 50-word JavaScript-off rule: `/arka/` and `/en/checkout/` (≈ 25–30 words with scripts off). The cart lives in this browser's `localStorage` (§8), so without JavaScript there is no cart to check out; the page says so in its h1 + noscript notice and links to the contact page (`/kontakt/`, `/en/contact/`), where the hotel's channels are. The shop and every product page keep their words, prices and GET forms without JavaScript.
- Loader with skip, shows once per session, never blocks a returning visitor; Stop-animations switch kills Lenis, ScrollTrigger scrubs and the chart animation (state persisted); prefers-reduced-motion respected.
- Signature: the coastline draws with scroll; 5 stops; list view toggle; works on phones (390×844) and with reduced motion (static chart + list).
- Booking: room for 2 nights → availability decreases in the admin grid; overbooking impossible (two concurrent checkouts for the last unit → one fails cleanly); experience seats likewise; goods stock likewise.
- Checkout: pay at hotel, bank transfer (IBAN from settings), card TEST mode (labelled TEST, server confirms) all produce an order with the right status; cancelling in admin releases inventory.
- Offers/promo codes change prices server-side; strike-through shown.
- Recommendations change with interests and history.
- Assistant answers ≥ 30 common questions in both languages from the knowledge base, can check availability for dates, and hands off to staff (message in admin inbox).
- Live panel shows real Open-Meteo data (with attribution) and degrades gracefully offline.
- Admin: login, dashboard numbers match the DB, CRUD for all entities, CSV export, analytics shows real events from browsing the site.
- Feed `/feed/products.xml` validates as RSS 2.0 with `g:` fields; Product/Hotel JSON-LD valid.
- Lighthouse-ish budget: first screen ≤ 3 MB, JS ≤ 200 KB gz on public pages, CLS < 0.05, LCP image `fetchpriority=high`.
- WebKit (Playwright) + Chromium pass the e2e suite at desktop and phone sizes.
