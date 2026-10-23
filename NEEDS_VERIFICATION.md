# NEEDS VERIFICATION — values the owner (Hotel Pelikan) must confirm

Everything listed here is a working placeholder so the platform runs end to end. Each is editable in the admin panel (`/admin/`). Items seeded with `demo = 1` show a DEMO stamp in the admin until the owner saves them. Agents: append, never delete; group by area; give the file/table where the value lives.

## Business identity and contact
- Legal name, NIPT, address, phone, email, WhatsApp/Viber, social links — settings `business`, `social`.
- Check-in / check-out times, reception hours.
- Whether "book direct = best rate" may be claimed.

## Rooms (stay)
- Room types, number of rooms per type, capacity, beds, size, amenities — table `products` (kind=room).
- Nightly prices per season — `products.price`, `room_rates`.
- Cancellation and deposit policy — `/kushtet/` terms.

## Experiences / activity packages
- Which packages the hotel actually runs or resells, durations, meeting points, guides, languages, schedules, capacities, prices — `products` (kind=experience), `sessions`.
- Visitor Centre and Pelican Tower opening hours and any entrance fees (only official sources may be shown).

## Shop
- Local products, producers, prices, stock, delivery/pickup terms — `products` (kind=goods).
- Gift card amounts and validity — `products` (kind=gift).
- Bundles and offers / promo codes — `products` (kind=bundle), `offers`.

## Payments
- Payment methods offered; bank name + IBAN for transfers — settings `payments`.
- Card payments: no merchant contract yet → TEST mode only. Real card payments need a POK merchant account (or BKT Virtual POS) and keys in env vars.
- EUR display rate — settings `currency`.

## Legal
- Privacy policy and terms drafts must be reviewed by the owner (and ideally a lawyer) before going live.

## Seeded demo values (T1, scripts/seed-data/catalogue.mjs — all `demo = 1`)
- Rooms: types, beds, sizes and features come from the public listings (research/business.json, Booking.com + AlbaniaVisit): "Dhomë Deluxe" (1 queen, ~17 m²), "Dhomë Deluxe treshe" (~25 m²), "Dhomë Deluxe katërshe" (~25 m², sleeps 4). DEMO: unit counts 8 / 4 / 4; base prices 4 100 / 5 000 / 5 900 L (rounded from Booking.com low-season rates seen for 6–7 Nov 2026, which included breakfast — whether direct rates include breakfast is not confirmed); summer rate 1 Jul–31 Aug 5 500 / 6 500 / 7 500 L is invented (`room_rates`, note "DEMO: sezoni i lartë"). Total number of rooms is not published.
- Business settings prefilled from public listings (research/business.json): address "Divjake qender plazh 1, 9022 Divjakë" and coordinates 40.972262, 19.479574 (high confidence, shown publicly); legal name Pelikan-rr Shpk, NIPT L64710402V, phone +355 68 504 3955, check-in 13:00–23:30, check-out until 11:00 (medium confidence — hidden as placeholders until the owner saves them in Cilësimet).
- Experiences (per person, capacity, length, weekly schedule → `sessions` 90 days ahead): National Park visit 1 500 L, 15, 150 min, Tue/Thu/Sat 09:00 · Karavasta Lagoon 2 000 L, 12, 180 min, Wed/Sat/Sun 08:30 · Pelican Observation Tower 1 200 L, 10, 120 min, daily 08:00 + 16:30 · Visitor Centre 800 L, 20, 60 min, Tue–Sun 10:00 + 14:00 · Cultural visit 2 500 L, 12, 240 min, Fri/Sun 10:00. Which of these the hotel runs, and with whom, is not confirmed.
- Bundle "Fundjavë me pelikanët" 10 000 L (2 nights Deluxe Room + tower visit for 2).
- Gift card 5 000 L default, custom value 2 000–50 000 L in steps of 500 (`products.options`).
- Shop goods: binoculars to rent 800 L/day (6), lagoon chart print 1 500 L (25) — invented. No food products seeded: no local producers are documented.
- Offers: automatic "Qëndrim i gjatë" −10 % on rooms from 3 nights; promo code MIRESEVINI10 −10 % from 5 000 L, max 200 uses (`offers`).
- FAQ (8 rows) restates SPEC facts and how the platform works; T7 replaces/extends it.
- Settings: `payments.mode = test` (card = TEST simulator), IBAN/bank empty, `card_hold_minutes = 30`, `inventory.booking_cutoff_hours = 2` (sessions stop selling 2 h before start), `inventory.low_stock = 5`.
- EUR rate: 90.64 L = 1 € — Bank of Albania official rate of 22.10.2026 (source URL stored in `settings.currency`). Must be updated by the owner over time.
- Demo activity (`npm run db:demo`): ~60 fake orders/customers (@example.com) and browsing events (sid `demo-…`) so the dashboard has data. Remove before launch: `npm run db:seed -- --reset` (then re-enter real data) or delete rows with `demo = 1` / `sid LIKE 'demo-%'`.
- Site domain: `astro.config.mjs` `site` is a placeholder (https://divjaka.example). Feed, sitemap, robots and POK webhook/return URLs need the real domain — set `settings.seo.site_url` in the admin (or the real `site`).

## Site chrome (T2)
- Hotel position shown in the header, loader, menu chart and hero ("40°58′N", "40°58′N 19°29′E") comes from research/business.json `hotel.coordinates` (high confidence); once the owner saves lat/lon in Cilësimet those win (`src/components/site/site-data.ts → hotelSpot()`). DESIGN.md's "19°28′E" was a rounding of an earlier guess; the research value rounds to 19°29′E.
- Footer contact shows only business fields that are not in `settings.business.placeholders`; until phone/email are confirmed it says "Telefoni dhe emaili do të publikohen pasi t’i konfirmojë hoteli."
- Footer/meta sentence "Mbi 20 vite mikpritje në Divjakë, pranë detit dhe parkut me pisha" is from SPEC.md (the client's own document) — the owner should still confirm the wording.
- The ticker shows "N dhoma të lira sonte" from `/api/live` `availability_today.rooms_left`, which counts the DEMO room units (8/4/4) until the owner enters the real number of rooms.
  - **Correction (T2 fix round 1, logged 2026-10-23):** the ticker no longer shows that line from demo counts. "N dhoma të lira sonte" appears only when `/api/live` sets `availability_today.rooms_verified: true` (T1 still has to add the field: true once every room product has real unit counts, `demo = 0`). Until then the rooms line never shows.
- Share image `public/og-default.png` (wordmark + hotel line, generated by `npm run icons`) is a stand-in until a licensed lagoon photo is chosen.
