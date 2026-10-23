# DESIGN — "Harta e Lagunës" (The Lagoon Chart)

Direction: the Awwwards vocabulary Luca pins for every build (poster type 150–480 px, two colours, one named signature moment borrowed from a winner's technique, GSAP + Lenis on one ticker, a Stop-animations switch, list views, a loader with a skip) — translated into **one invented world** that belongs to Divjakë. Craft floor: `~/.claude/skills/awwwards-blueprints` (`references/craft-rules.md`, `references/scorecard.md`, `assets/base.css`, `scripts/audit.mjs` as the gate). Method: `LC/Claude/awwwards-broadside-direction.md` Part A (borrow techniques, never looks; every technique must exist in the world; real evidence only; every pointer effect has a phone form).

**Engine line (non-negotiable):** GSAP 3.15 (+ScrollTrigger, SplitText, DrawSVGPlugin) + Lenis 1.3. `gsap.ticker` is the ONLY requestAnimationFrame owner (`lenis` with `autoRaf:false`, stepped from the ticker; `gsap.ticker.lagSmoothing(0)`). Page changes = native cross-document View Transitions. No other motion library, no CSS keyframe loops that run forever, no independent rAF anywhere (admin included). Engine lives in `src/scripts/motion.ts`.

## 1. The world

What tourism sites always do — and we refuse: a drone photo with "Discover paradise", a floating booking bar over it, rounded cards with shadows, testimonial carousels, stock icons, "Top 10 things to do".

**Thesis:** the platform is the **warden's chart of Karavasta** — the survey sheet kept at the Pelican Tower: a sea chart and a bird log in one. The coast is a single inked line, water is drawn with waterlines (parallel offset lines along the shore, the old cartographers' convention), places are survey pins with coordinates, every reading is logged in mono figures with a time stamp, and the lagoon's names are lettered in italic serif the way charts letter water. Bookings are **permits** (leje) with a perforated stub; shop items carry **specimen tags**; the itinerary is a **route plotted on the chart**; live conditions are the **logbook's latest entry**.

Physics of the world = **still water and a pen**: lines draw at the speed of a hand; things settle like a boat coming to rest (ease-out, a 2–4 px drift that settles, never a bounce); pins drop like survey stakes with one ripple ring; pages change with a **tide line** sweeping across (slit wipe). Nothing spins, nothing wobbles, nothing loops forever.

## 2. Tokens

**Two colours carry the site:**
- `--salt` `#EDEAE0` — bleached chart paper (backgrounds, text on ink)
- `--ink` `#0E2B29` — lagoon ink, deep teal-black (text, lines, dark sections)

Derived (same two hues, never new colours): `--ink-70` `color-mix(in oklch, var(--ink) 70%, var(--salt))`, `--ink-40`, `--ink-12` (rules, hairlines, hatch), `--salt-2` `#E3DFD2` (aged stock for inset plates), `--ink-2` `#163B38` (raised ink).

**One signal mark, used like the chart's red overprint, ≤ 3 % of any screen:** `--pouch` `#E2592A` (the breeding Dalmatian pelican's pouch). Allowed for: the live dot, focus rings, selected pin, "sold out / closed" stamp, the cart count, error underline, the route line in the itinerary. On salt, text in this colour must use `--pouch-text` `#A83C15` (≥ 4.5:1). Never for large fills, never a gradient.

Imagery is the only other colour: licensed photographs of the lagoon (research/photos.json), shown as **mounted plates** (thin ink border, 6 px salt mat, coordinate caption in mono below). Duotone/greyscale filters are forbidden — the photos stay true.

**Type (self-hosted woff2, `font-display: swap`, display face preloaded):**
- **Display + text: Bricolage Grotesque** (variable: opsz 12–96, wdth 75–100, wght 200–800, OFL). Poster setting: `opsz 96, wdth 75, wght 800`, uppercase, `letter-spacing: -0.045em`, line-height 0.82. Headings: `opsz 72, wdth 85, wght 700`. Body: `opsz 14, wdth 100, wght 400`, 17–19 px, line-height 1.5, measure ≤ 66ch.
- **Water lettering + annotations: Instrument Serif Italic** (OFL) — lagoon/sea names, pull quotes, the "you are here" notes, large numerals in prose.
- **Readings + labels: Geist Mono** (OFL) 11–13 px, uppercase, `letter-spacing: 0.06em` — coordinates, times, prices, seats left, form labels, buttons' secondary lines, table heads.
- Poster sizes: the home wordmark DIVJAKA spans the content width (≈ 150 px at 390, 300–440 px at 1440+). It is **outlined to SVG at build time** (`tools/wordmark.mjs` → `src/assets/wordmark.ts`) so it never shifts when fonts load and can be drawn as a line.
- Fluid scale from base.css (Utopia 360→1440). Albanian words are long: every heading gets `overflow-wrap: anywhere; hyphens: manual` and is checked at 320 px.

**Shape:** rules, not panels. 1 px `--ink-12` hairlines; 2 px ink rules under section heads; double rule (3 px + 1 px) at the top of each "sheet". Corners square; the only round things are pins, the live dot, the scope ring of the loader and pill buttons (`border-radius: 99px`). No drop shadows; elevation is a 1 px ink border + 4 px offset ink "print shadow" on the floating order card only.

**Grid:** 12 columns, `--gutter` fluid 16→32 px, max content 1440 px, page side padding `max(16px, 4vw)`. Chart sheets may bleed full width.

## 3. Components (look)
- **Header:** salt bar, 64 px; left: small wordmark "DIVJAKA" + mono "HOTEL PELIKAN · 40°58′N"; centre (≥1024): 4 links (Qëndrimi · Eksperienca · Dyqani · Trashëgimia); right: live dot + temperature (from /api/live), `SQ/EN`, cart pill `SHPORTA · 02`, `MENU` button. Above it on every page: **the logbook ticker** — a single mono line scrolling slowly (CSS transform from the GSAP ticker, pauses on hover/focus and with Stop-animations): "DIVJAKË 22°C · ERË VP 12 KM/H · DETI 21°C · PERËNDIMI 18:42 · PELIKANËT: SEZONI I FOLEVE" — real data only, hidden when stale.
- **Menu (full screen):** an ink sheet that rises with the tide line; left: numbered legend (01 Ballina … 09 Kontakt) in poster-size display type, each with a mono sub-line; right: the mini chart — hovering/focusing a legend item drops its pin and draws a leader line to it (Igloo HUD labels). Bottom row: language, currency (LEK/EUR), Stop animations, live reading, contact channels. Phone: legend only, chart as a strip at the top; swipe down / Esc / button to close; focus trapped; `inert` on the page behind.
- **Footer:** ink sheet; the giant outlined wordmark drawn edge to edge; columns of links; live reading; "Të dhënat e motit: Open-Meteo · Harta: © OpenStreetMap"; legal; Stop animations switch; credits link; "Hotel Pelikan" contact from settings (placeholders flagged until verified).
- **Plates (photos):** `<Photo>` from photos.json → `<picture>` AVIF/WebP srcset, width/height, LQIP background, lazy except LCP (`fetchpriority="high"`). Caption row: italic place name + mono coordinates + credit initials linking to /kreditet/. Inner parallax ±4 % on scroll (transform on the img inside an `overflow: clip` frame, no radius).
- **Pins:** 14 px ink ring with a salt core; selected = pouch core + one ripple ring (CSS transition, once). Label = mono caps on a salt tag with a leader line.
- **Permit card (booking/order card):** salt card, 1 px ink border, 4 px offset print shadow, a perforated edge (CSS mask of 6 px circles) separating the stub (dates, guests, total) from the body. Price in display type; per-night/per-person in mono.
- **Specimen tag (product card):** image plate + a tag: mono catalogue number (e.g. `NR. 014`), name in display 24–32 px, one line, price in mono, availability readout ("3 VENDE TË LIRA", "MBARUAR" stamp in pouch). Hover (pointer): the tag slides 6 px and the plate's crosshair follows the cursor; touch: none needed (whole card is the link). **Grid ↔ list** switch on every index (list = ruled table rows: nr · name · kind · next date · price).
- **Buttons:** primary = ink pill, salt text, 48 px tall, mono sub-label optional; secondary = 1 px ink outline pill; text links underlined 1 px, offset 3 px. Press state `scale(0.97)` 120 ms. Never disabled before submit; errors explain inline (mono, pouch-text).
- **Forms:** labels above in mono, inputs 48 px, 16 px text (no iOS zoom), 1 px ink bottom rule + full outline on focus (pouch 2 px ring). No motion inside forms beyond focus and validation states.
- **Calendar:** month grid in mono; each day shows price (rooms) or seats (experiences) in tiny mono; sold-out days struck through; range selection draws a line between the two dates (like plotting a route). Albanian month/day names from our own table.
- **Stamps:** "OFERTË", "MBARUAR", "TEST", "DEMO" — rotated −4°, double-ring border, mono caps, pouch on salt or salt on ink.

## 4. Signature moment — "Laguna vizatohet" (The lagoon draws itself)
Borrowed techniques: Don't Board Me (a line drawn by the scroll) + Noomo (pinned exhibit, cards dealt per stop). Home, right after the poster.

1. The section pins for ~500 vh (desktop) / ~420 vh (phone). The chart (SVG from `research/geo.json`) fills the viewport on salt.
2. Scroll 0–25 %: the **coastline** draws as one continuous ink line from the Shkumbin mouth south to the Seman mouth (DrawSVG scrub), then the **lagoon outline** closes; **waterlines** (3–5 offset strokes inside the lagoon, clipped to the water polygon) fade in one after another like a pen going over the shore again; the italic label *Laguna e Karavastasë* letters itself (SplitText, chars).
3. 25–90 %: the camera (a `transform` on the chart group — never viewBox animation) flies through **5 stops**, each: pin drops + ripple → leader line → a **card is dealt** from the right (desktop) / bottom sheet (phone) with photo plate, name, one sourced sentence, distance from the hotel, and a CTA (Book / Read):
   - **Hotel Pelikan** (near the sea and the pine park — from SPEC) → "Rezervo qëndrimin"
   - **Pishat e Divjakës** (pine forest) → experience
   - **Kulla e Vëzhgimit të Pelikanëve** (Pelican tower) → dawn birdwatch experience
   - **Qendra e Vizitorëve** (Visitor Centre) → guided visit
   - **Plazhi i Divjakës** (beach) / Karavasta lagoon → itinerary planner
   The camera path itself is drawn as a dashed route between stops (this is the same route language the itinerary planner uses).
4. 90–100 %: zoom out to the whole chart with all pins; a toggle **"Shiko si listë / View as list"** swaps the chart for a ruled list of the stops (and is always available as a skip link at the section's start: "Kalo hartën").
5. Stop-animations / reduced motion: the finished chart (all lines, all pins) + the list, no pin, no scrub.
6. Performance: one SVG, ≤ 2,000 path points, transforms only; DrawSVG on ≤ 3 paths at a time; cards are DOM (not SVG) and use transform/opacity only; no filters on moving layers.
The same `<Chart>` component is reused: menu mini-chart, experience pages (one pin), itinerary planner (route), contact (hotel pin), /tani/ (wind arrow at the hotel).

## 5. Technique map (8–12 award techniques, each an object in the world)
| Award source | Technique | In the Lagoon Chart |
|---|---|---|
| Kode + Lusion | circular portal intro with % counter | **Preloader = the tower's spotting scope**: a ring focuses (blur → sharp on a lagoon plate inside the ring) while a mono counter runs the coordinates from 0°00′ to the hotel's 40°58′N 19°28′E (real load progress); then the ring opens to the page. "Kalo / Skip" button visible from 0 ms; once per session; ≤ 1.8 s cap; never on admin; reduced motion = no loader. |
| Pioneer | headline outline → fill | The DIVJAKA wordmark arrives as an ink outline and fills like wet ink pooling from the bottom (clip rising), once. |
| Don't Board Me + Noomo | scroll-drawn line + pinned exhibit | The signature (§4). |
| Igloo | HUD labels with leader lines | Menu mini-chart; pins everywhere; the live page's readings point at the hotel pin. |
| Vazzi | ticker + Stop animations switch | The logbook ticker of live readings; Stop switch in header (icon + label), menu, footer. |
| Opal | sentence with inline pictures, lit word by word | Heritage intro: "Në lagunë jetojnë [pelikanë] mes [pishave] dhe [detit]…" with small round-cornerless photo cuts inline, words light from ink-40 to ink on scroll. |
| KPR | slit wipe page transitions | **Tide line**: cross-document VT — old page slides out under a 2 px ink horizon line sweeping bottom→top, new page fades in under it (CSS `::view-transition-*`, 420 ms, disabled with Stop/reduced motion). |
| iyO | product fills the screen, one floating order card | Room & experience pages: full-bleed plate, one **permit card** floating bottom-right with dates/guests/total/Book; on phones a sticky bottom pill "Nga 6 500 L · Rezervo". |
| Moooor | floating pill buy bar | Phone buy bar on every product page. |
| Bécane | listing as a lineup you walk along | Experiences index: horizontal **survey strip** of packages ordered by distance from the hotel (drag/scroll), with list view one click away. |
| Lando Norris | cursor-following reveal | Plates: a thin crosshair + mono coordinates follow the pointer over photos (pointer devices only; nothing on touch). |
| Don't Board Me | joke 404 | 404 = a pin dropped in the open sea: "Ky vend nuk është në hartë" + search + back to the chart. |
| Star Atlas | live clock | Mono Albania time in the menu footer and the logbook ("ORA NË DIVJAKË 09:41"). |

## 6. First screens (contract: at rest, before scroll)
- **Home:** ticker · header · poster wordmark DIVJAKA full width · under it a full-bleed lagoon plate (LCP, `fetchpriority=high`) with the italic water label and coordinates · one line in display 32–48 px: "Laguna, pishat dhe pelikanët — rezervo direkt nga Hotel Pelikan." · two ways in: `Rezervo qëndrimin` (primary pill) and `Shiko hartën` (scrolls into the signature) · cart pill visible.
- **Stay:** poster "QËNDRIMI" + Hotel Pelikan facts from SPEC + the permit card with date range and guests (live availability) — the way to buy is visible without scroll.
- **Room / Experience:** iyO split: plate left/full-bleed, permit card with calendar right; price, options, quantity/guests and Book visible together at 1440×900; sticky pill on phones.
- **Shop:** poster "DYQANI" + filters as pills + grid/list switch + first row of specimen tags visible.
- **Heritage:** poster "TRASHËGIMIA" + the Opal sentence + index of articles (list view).
- **Now:** the logbook entry: temperature in poster figures, wind arrow on the chart, sea temp, sunrise/sunset, air, what's in season — each with "përditësuar 09:40" and source.
- **Itinerary:** the question sheet (days, interests, pace) on the left, the empty chart on the right waiting for the route.

## 7. Motion rules
- UI feedback < 300 ms, ease-out (`cubic-bezier(.2,.7,.2,1)`); scroll-linked scrubs use Lenis + ScrollTrigger `scrub: 0.6`; reveals: lines rise 24 px + fade, 600 ms, stagger 60 ms, once.
- Never animate from `scale(0)`; never `transition: all`; only transform/opacity/clip-path (rectangular inset) on moving layers.
- Entrances never move tap targets (menu, header, buttons appear with opacity only).
- `prefers-reduced-motion` and `html[data-motion="off"]` (the Stop switch, stored in `localStorage['dv-motion']`) both: no Lenis (native scroll), no scrubs, no loader, no ticker movement, no VT animation, finished states shown.
- One ticker: also drives the ticker strip, chart camera, crosshair. When the tab is hidden, the ticker sleeps (GSAP does this).

## 8. Phone forms
Hover → tap/press states; crosshair → none; menu chart → strip; signature cards → bottom sheets; permit card → sticky pill + full-screen sheet; calendar → full-width month with 44 px day cells; 44 px minimum targets everywhere; checked at 390×844 and 320×568.

## 9. Admin look
Same two colours and three faces, denser: salt background, ink sidebar with the legend-style numbered sections, mono tables with 1 px rules, poster-size KPI figures in display type, hand-drawn-feel SVG charts (ink lines, pouch for the current value). No motion beyond 150 ms state changes; no Lenis in admin.

## 10. Don'ts
No gradients, no glassmorphism, no drop shadows (except the print shadow on the permit card), no emoji, no stock icons sets (draw the few icons as 1.5 px ink strokes), no fake reviews/ratings/awards, no "Discover", no countdown timers, no fake scarcity (seats-left numbers are real from the DB or hidden).
