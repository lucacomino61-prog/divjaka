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

## Catalogue T0 (2026-10-23) — replaces the T1 catalogue above
Source: `scripts/seed-data/catalogue.mjs`, written into `data/divjaka.db` by `npm run db:demo` on 2026-10-23. Every product is `demo = 1` until the owner saves it in the admin. The T1 list under "Seeded demo values" (Pelican Observation Tower product, Visitor Centre 800 L, cultural visit 2 500 L, bundle 10 000 L, summer rates 1 Jul–31 Aug, offer without dates) no longer describes the database.

### Research facts the catalogue relies on (shown in product text; sources in each product's `options.sources`)
- Rooms (business.json `hotel.room_types`, verified; Booking.com + AlbaniaVisit): Deluxe Room 1 queen bed, ≈ 17 m² (183 ft²), balcony, view; Deluxe Triple 1 twin + 1 full bed, ≈ 25 m², balcony + terrace; Deluxe Quadruple 1 bunk + 1 queen bed, ≈ 25 m², sleeps 4; in-room: private bathroom, air conditioning, flat-screen TV, soundproofing, minibar, free Wi-Fi. Double Room (1 full bed) is listed with medium confidence only.
- Setting: hotel "on the edge of" the national park (business.json `hotel.setting`, high) and "near the sea and the pine park" (SPEC).
- Restaurant serves "fish, eel and other local specialities" (business.json `hotel.restaurant`, ATG). Lagoon species eel, grey mullet, gilthead seabream, sea bass: heritage `lagoon-12`.
- Park visit: the only natural coastal pine forest in Albania, stone pine native, Aleppo pine introduced early 20th c. (`flora-01`, `flora-02`); lagoon ≈ 42 km², largest in Albania (`lagoon-01`).
- Visitor Centre ≈ 4 km by road west of Divjakë town (`visit-01`); Kulla 360° wooden tower, 35 m (OSM) or 36 m (AKT) — shown as "35–36 m"; view best at sunset (`visit-02`).
- Birds: pelicans nest on Pelican Island Jan–Jun (`birds-10`); island always closed, boats keep ≈ 180 m (`park-23`, seasons `year_round`); 42 000 waterbirds in the Jan 2020 census (seasons Jan); species seen in March 2020 (`birds-25`); early morning best (`prac-13`).
- Boat trips: documented on channels and reed islets (`visit-06`); ≈ 30-minute ride from the canal ≈ 1 km east of the Visitor Centre (ATG, business.json `services.boat-trip`); boating forbidden in the strictest core zone (`park-22`).
- Cycling: paths for walking and cycling (`flora-02`); bikes "can be rented in the visitor's centre" (ATG, business.json `services.bike-rental`, verified — the price is not).
- Cultural day: 7 Churches of Karavasta e Re, 18th c. (`hist-09`); St Athanasius, Karavasta, 1778 (`hist-08`); Ardenica on a 237 m hill, ≈ 35 km from Divjakë (`hist-13`), founding date disputed 13th c.–1600 (`hist-15`, shown as a range), Skanderbeg's wedding 21 Apr 1451 (`hist-14`); Apollonia ≈ 52 km, founded ≈ 600 BC (`hist-16`).
- Proof: Booking.com 9.5/10 from 601 reviews, re-observed 2026-10-23 (business.json `hotel.ratings`) → `settings.proof` (`show: true`; the owner can hide it). No sub-scores, no review text.
- NOT used: the "pelican-tower" bird hide at 40.9504 N (tagged destroyed in OSM, survey 2025-09-24); landing on Pelican Island; horse riding, recreational fishing, kayaking (no operator the hotel works with); honey, olive oil, wine, crafts, buffalo products (not documented for Divjakë).

### DEMO values (owner must confirm or replace) — table `products` unless noted
| Product (slug) | Price (lek) | Other demo values |
|---|---|---|
| Dhomë Deluxe (`dhome-deluxe`) | 4 100 / night; 6 000 high season | 8 units |
| Dhomë Deluxe treshe (`dhome-deluxe-treshe`) | 5 000; 7 000 high season | 4 units |
| Dhomë Deluxe katërshe (`dhome-deluxe-katershe`) | 5 900; 8 000 high season | 4 units |
| Dhomë dyshe (`dhome-dyshe`) — **draft, not public** | 3 700; 5 500 high season | 2 units; publish only once the owner confirms the type exists and its price |
| Parku Kombëtar me guidë (`parku-kombetar-me-guide`) | 1 800 / person | 12 seats, 150 min, Tue/Thu/Sat 09:30, meets at reception |
| Qendra e Vizitorëve dhe Kulla 360° (`qendra-e-vizitoreve-dhe-kulla-360`) | 900 / person | 15 seats, 90 min, Tue–Sun 10:30 + Fri/Sat/Sun ≈ 75 min before sunset, meets at the Visitor Centre |
| Shpendët e lagunës në agim (`shpendet-e-lagunes-ne-agim`) | 2 200 / person | 8 seats, 150 min, Wed/Sat/Sun ≈ 20 min before sunrise, not in Jul–Aug, binoculars included, meets at reception |
| Shëtitje me varkë në lagunë (`shetitje-me-varke-ne-lagune`) | 500 / person | 10 seats (one boat), 60 min, daily 10:00 + 17:00, April–October only, meets at the boat point. Observed local prices: 300 L/person (6–10 people) or 1 500 L per boat (1–5) — ATG |
| Me biçikletë nëpër pyllin me pisha (`me-biciklete-neper-pyllin-me-pisha`) | 1 500 / person | 8 seats, 150 min, Wed/Sat/Sun 09:30 (Jun–Aug 08:00), March–November, bike hire NOT included (paid at the Visitor Centre; last public price 200 L/hour in 2021) |
| Ditë kulturore (`dite-kulturore-karavaste-ardenice-apoloni`) | 4 000 / person | 8 seats, 8 h, Thu/Sun 09:00, transport from the hotel included, tickets and lunch excluded |
| Darkë me peshk në restorantin e hotelit (`darke-me-peshk-ne-restorantin-e-hotelit`) | 2 000 / person | 20 seats, 120 min, daily 19:30 (Jun–Sep 20:00), drinks excluded |
| Fundjavë me pelikanët (bundle) | 14 900 | stock 5; 2 nights Deluxe + dawn birds ×2 + park ×2; Jan–Jun |
| Tri ditë: laguna dhe historia (bundle) | 23 500 | stock 3; 3 nights Deluxe + boat ×2 + cultural day ×2 + fish dinner ×2; Apr–Oct |
| Kartë dhuratë (`karte-dhurate`) | 5 000 default | custom value 2 000–50 000 in steps of 500 (`options`); validity period not set |
| Dylbi me qira (`dylbi-me-qira`) | 800 / day | stock 6 |
| Harta e Lagunës (`harta-e-lagunes`) | 1 500 | stock 25; print format and paper to decide; needs "© OpenStreetMap contributors, ODbL" on the print |

- Room rates (`room_rates`): high season 15 Jun–15 Sep (next one: 2027), note "DEMO: sezoni i lartë". Summer prices are not observable anywhere (business.json `prices`): pure placeholders.
- Breakfast: the observed Booking.com rates included breakfast; whether direct rates include it is not confirmed, so no product says so.
- Sessions (`sessions`, 90 days ahead): generated from the schedules above. Light-linked slots carry `note = 'sunrise' | 'sunset'` and are computed for the hotel's coordinates (± a few minutes, rounded to 15). The admin's weekly generator uses fixed times.
- Meeting points (`options.meeting`) and what is included/excluded (`includes_*`, `options.excludes_*`) are demo terms.
- Guides: SPEC says the hotel offers "dedicated" guides; who they are, their languages and whether the hotel runs or resells each tour (boatmen, cultural-day driver) are not confirmed.
- Which tower the SPEC calls "Kulla e Vëzhgimit të Pelikanëve" (Kulla 360° or the bird hide on the lagoon barrier, now tagged destroyed) — ask the owner; no product uses that name.
- Product images: no licensed photos of the hotel, its rooms or its dishes exist in research/photos.json. Room and dinner cards show the setting (beach, pine forest, fishing boats) with each photo's own caption as alt text. The owner should upload real room and restaurant photos.
- Category "Për udhëtimin / For your trip" (`categories.trip`) replaces "Produkte vendase / Local products": no local producer is documented. Add a category when real local products arrive.

### Offers and settings (T0)
- `offers`: automatic "Jashtë sezonit: −10% nga 3 netë" on rooms, arrivals 1 Nov 2026 – 31 Mar 2027 (DEMO); promo code `MIRESEVINI10` −10 % from 5 000 L, max 200 uses, **inactive** (DEMO).
- `settings.business`: legal name and NIPT are now **empty** (Booking's trader panel is the only source, medium confidence). Candidates for the owner to confirm: Pelikan-rr Shpk, NIPT L64710402V. Phone +355 68 504 3955 (Google listing only, medium) and check-in 13:00–23:30 / check-out until 11:00 (Booking only) are prefilled but hidden (`placeholders`) until saved. New fields `address_sq` "Divjakë qendër, plazh 1, 9022 Divjakë, Shqipëri" and `address_en` "Divjakë qendër, plazh 1, 9022 Divjakë, Albania" (the verified address with accents; the owner should confirm the wording).
- `settings.proof`: Booking.com 9.5/10 (601 reviews, read 2026-10-23). The score changes over time: update or hide it.
- `settings.social`: empty (no account found).

## Home, heritage and credits (T3, 2026-10-23)
- Home "Hotel Pelikan" strip: "Mbi 20 vite…, pranë detit dhe parkut me pisha" and "dhoma moderne, bar-restorant" are from SPEC.md (the hotel's own document; business.json marks the 20 years as unverifiable from public sources — the owner should confirm). "Në kufi me Parkun Kombëtar", room features (balcony, air conditioning), restaurant "peshk, ngjalë dhe specialitete vendase", "recepsion 24 orë, parkim privat falas, Wi-Fi falas" are business.json entries with `verified: true` (Booking.com / AlbaniaVisit / Albania Travel Guide) — `src/i18n/dict/home.ts` `home.hotel.f.*`.
- Home "Dhomat nga … / natë" shows the lowest published room price (DEMO until the owner saves the rooms). Experience strip: next session and free places come from the `sessions` table (DEMO schedules and capacities, see T0 above).
- No photo of the hotel, its rooms or its restaurant exists: the home strip shows the beach and the forest and says so (`home.hotel.note`). Replace with real photos once uploaded.
- Signature chart stop 3 shows the 360° Tower as "35–36 m" (OSM 35 m, AKT 36 m). Stop 5 (Pelican Island) uses the en.wikipedia coordinate, which falls in open water (geo.md): it is drawn as an approximate closed zone, never routed to.
- The heritage sheets mention the park entrance ticket (50 lekë for tourists, Ministry announcement, undated) with "not verified whether it is collected today" — the owner or RAPA Fier should confirm.
- `/kreditet/` weather provider line shows whatever `/api/live` → `attribution` says (currently Open-Meteo, whose free tier is non-commercial — see T7 / research/live.md).
- JSON-LD on the home adds verified amenities to the Hotel node and `containedInPlace` the national park; no SearchAction (the site has no search results page), no rating markup (the Booking score is a third-party score).

## Shop, checkout and order pages (T5, 2026-10-23)
- Product cards show stock ("5 copë në stok") and free places straight from the DB; with the DEMO catalogue these are demo numbers until the owner saves real stock/schedules. Room counts are never shown until `roomsVerified()` (every room saved by the owner).
- Gift card amount presets on the product page: the minimum + 5 000 / 10 000 / 20 000 lekë (demo; the owner sets them in `products.options.amount_presets`; only values inside `amount_min..amount_max` and the step are shown) + a custom amount. The "from" price shown is `amount_min`. Validity period of gift cards is not stated anywhere (not set).
- Checkout copy describes the platform's own rules, not hotel promises: pay-at-hotel "the hotel confirms the order and may call you"; holds from settings.payments (card 30 min, hotel 24 h, bank 72 h; possibly a 2 h short hold — the order page shows the exact deadline). The order page now says only "Paguani në recepsion kur mbërrini." — the currency and accepted means at reception (lek? cash/card?) are unconfirmed and not printed; add them once the owner confirms.
- Marketing consent text: "Më dërgoni me email oferta dhe lajme nga Hotel Pelikan. Mund të çregjistroheni kur të doni." — needs a working unsubscribe process at the hotel before any newsletter is sent.
- Phone dialling-code list and country suggestions (`src/components/checkout/countries.ts`) are a convenience list, not a statement about who visits.

## Stay and experiences pages (T4, 2026-10-23)
- `/qendrimi/` "Mirë ta dini" and the room pages' house rules print verified public-listing details with their source (Booking.com, 23.10.2026) until the owner saves them in Cilësimet: check-in 13:00–23:30, check-out until 11:00, breakfast 07:30–11:00 à la carte, pets on request (fee possible), children 4+ charged as adults / no cots or extra beds, English and Italian spoken, paid airport transfer, the facilities list. A value the owner saves in settings.business (checkin/checkout) replaces the listing line and is labelled "Konfirmuar nga hoteli". The same check-in/out feed the Hotel JSON-LD (`checkinTime`, `checkoutTime`).
- "Book direct = best rate" is never claimed until a settings row `booking` = `{"best_rate_direct": true}` exists (no admin field yet, see HANDOFF T4).
- Room "from" prices = the price of the first free night in the next 60 days (DEMO prices and unit counts until the owner saves the rooms). Room counts are never shown publicly.
- Experience index season hints ("Pelikanët: foletë jan–qer", "Shtegtimi i vjeshtës", "Pamja më e bukur: në perëndim"…) restate verified seasons.json / heritage.json items; sources are listed under the index. Each experience page lists the verified season items for its tags and the park rules from Law 81/2017 (heritage `park-21`–`park-24`).
- The dedicated-guides sentence (SPEC) is shown on the experiences index and on nature/birds experience pages; who the guides are and their languages are not confirmed.
- Bar-restaurant section: no menu or prices are published (none confirmed); only "fish, eel and local specialities" (ATG) and "local and international cooking" (Booking).

## Live data, assistant, itinerary, contact, legal (T7, 2026-10-23)
- **Weather provider:** MET Norway (free incl. commercial use, CC BY 4.0). Their terms ask for a contact in the User-Agent: set env `LIVE_CONTACT` (an e-mail of the hotel) or confirm `business.email` / `seo.site_url` in the admin. Until then the User-Agent says "contact: see NEEDS_VERIFICATION" — MET may throttle anonymous clients. Since 2026-10-26 the site also falls back to the public https origin a visitor reached /tani/ on, and the server logs a warning at the first MET request while neither a contact nor a site URL is set.
- **Air quality, waves, actual UV:** hidden. To show them, buy Open-Meteo **API Standard (≈ €29/month, VAT not checked)** and set `OPEN_METEO_API_KEY`. Alternatives not chosen: free Open-Meteo (non-commercial only), CAMS via Copernicus ADS (free but needs an account + batch processing).
- **Sea temperature:** NASA JPL MUR satellite analysis, about one day behind; shown with its date, labelled "deti" (open sea), never "laguna".
- **Assistant knowledge base** (`scripts/seed-data/faq.mjs`, 61 Q/A in each language since the 2026-10-26 fix round 3): answers about the hotel use SPEC facts and verified research only; questions whose answer the owner must give (check-in times, breakfast, children's beds and prices, pool, transfers, staff languages, invoices, cancellation and refunds) answer "pyesni recepsionin" and offer the staff hand-off. Pets, free parking, free Wi-Fi, the 24-hour front desk and the room types/features are answered from the hotel's own public listings (business.json, verified) and say so. When the owner confirms a value, edit that FAQ row in Admin → Asistenti.
- **Assistant, added 2026-10-26:** (1) "Is the hotel open all year / in winter?" answers that nothing is confirmed and offers the hand-off — the owner should write the real seasonal opening into that FAQ row. (2) "Pelican Observation Tower" (SPEC wording): it is unknown which tower the SPEC means; the assistant says the old bird hide on the barrier is mapped as destroyed in OpenStreetMap, points to the 360° Tower and the boat tours, and offers the hand-off. The owner should say which tower the hotel takes guests to. (3) Pelican numbers are given as the sources state them (200–250 pairs historically, 19 at the low point, 85 counted in 2020, "around 100" in a 2025 flyer without a year); no official count after 2020 was found. (4) Questions about amenities the knowledge base does not know (gym, spa, sauna, EV charging…) get no answer and the hand-off, never a "yes".
- **Park entrance ticket:** the assistant says the Ministry *announced* 50 lekë (park-19, undated) and that it is not verified whether it is collected today.
- **Itinerary planner:** opening hours of the Visitor Centre, the 360° Tower and Altin's Nature Collection are not published anywhere official (heritage visit-08) → the plan says "kontrolloni oraret". Travel times are estimates (straight-line distance × 1.35 at 35 km/h by car, 12 km/h by bike, 4.5 km/h on foot); drive times to Ardenica and Apollonia come from research (hist-13, hist-16) plus the chart leg to Divjakë town. Since 2026-10-26 every leg is reserved in the timetable (+10 min), the way back to the hotel is shown, a day by bike is capped at 40 km and on foot at 12 km (return included), and an outdoor stop done on your own ends by sunset (the 360° Tower viewpoint by civil dusk). These caps are our own planning choices, not sourced rules. **The Godulla bird hide** (OSM node, medium confidence) is shown as "OpenStreetMap marks a bird hide…; check access and hours on the spot": nothing verified says it is open to the public — confirm or remove it (src/components/itinerary/places.ts, id bird-hide).
- **Contact page:** shows only confirmed channels (today: the address and the form). Phone +355 68 504 3955, check-in/out and reception hours stay hidden until saved in Cilësimet.
- **Privacy notice and booking terms (`/privatesia/`, `/kushtet/`) are DRAFTS** written from what the site really does. Owner + lawyer must confirm: the controller's legal name and NIPT, a contact e-mail for data requests, the retention periods (taken from settings.privacy), the cancellation/deposit policy (the terms say it "is set by the hotel, which confirms it for each booking when it confirms the booking (by phone or in writing)" until the owner writes it — the site sends no e-mail), whether the 14-day withdrawal right applies (business.json legal[4], unverified; accommodation exception unverified), the new consumer-protection law status, and the cookie rule under Law 54/2024 (unread).
- Privacy draft, open values: how long COMPLETED orders are kept (the draft says "set by the hotel under its accounting obligations"), the hosting provider (named once chosen), a contact e-mail for data requests (today: the contact form). If `ANTHROPIC_API_KEY` is set, the notice automatically adds that question text may go to Anthropic — the owner should confirm that use.
- Terms draft: the payment-methods sentence lists only what checkout offers at that moment (/api/config rule); hold times come from settings.payments / settings.inventory.

## Stay and experiences pages — corrections (T4 fix round 2, 2026-10-26)
- Correction to the T4 note above: the Hotel JSON-LD sends `checkinTime` / `checkoutTime` ONLY when the owner saved them in Cilësimet (settings.business). The listing's times (Booking.com) are shown on the page with their source but are not sent to search engines.
- Experience seat counts: the experience schedules are DEMO (see T0 above), so their free places are no longer printed anywhere (index strip and list, the booking calendar, the time slots: "Ka vende"). The limits still apply (the participants stepper and the server). Once the owner saves a product (demo = 0), its real counts appear.
- "Çfarë shihni" on experience pages shows only what a guest on that trip sees (bird items on the bird and boat trips, flora on the forest trips and the tower, the 360° view on the tower); one-off events (World Wetlands Day 2021) and dates already past this year are left out.

## Assistant, itinerary, legal — T7 fix round 3 (2026-10-26)
- **Free places of demo experiences** are never printed by the assistant or the itinerary (site rule): sessions show their time and "ka vende" / "places available"; the count comes back by itself once the owner saves a product with demo = 0.
- **Payment at reception:** no page says any more that you pay "in lek" at the hotel (terms, FAQ 31). The platform's own prices are in lek (that stays). Owner: confirm the currency and the means accepted at reception (cash? card?) and add them to /kushtet/ and FAQ "A janë çmimet në lekë apo në euro?".
- **No e-mail is sent by the site.** The cancellation/refund texts (terms, FAQ) now say the hotel confirms the terms "when it confirms the booking, by phone or in writing"; the FAQ "I did not get an e-mail" says the site sends none. If the owner adds e-mail confirmations later, these rows change with it.
- **New FAQ row "What happens to a tour in bad weather?"**: says the organiser decides and the hotel sets how a tour is moved/cancelled and what happens to the payment, then hands off to staff. The owner should write the real rule (by product, if it differs).
- **Boat FAQ** no longer states the demo season (April–October) as a fact; it points to the product page.
- **"Am I talking to a person?"** now says the answers may be phrased with an AI service "when the hotel has switched it on" (ANTHROPIC_API_KEY); the panel's own note names Anthropic and links the privacy section whenever that fallback can run.
- **MET Norway contact:** the admin dashboard now shows the warning "live_contact_missing" until LIVE_CONTACT is set or the business e-mail is confirmed (Cilësimet → Hoteli); the server also logs it once per start.
- **Itinerary:** one paid visit is offered once per trip (the Visitor Centre + 360° Tower product is no longer bookable twice; the sunset at the tower stays as a visit on your own); with children on foot or by bike the last outdoor stop ends early enough to be back at the hotel by civil dusk (our own planning rule); the date limit follows settings.inventory.booking_horizon_days.

