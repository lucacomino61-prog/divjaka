# NEEDS VERIFICATION · checklist for Hotel Pelikan before launch

Every value below is either a working placeholder (so the platform runs end to end) or a fact taken from a public source that the hotel should confirm. Nothing here is invented as a fact on the public pages: placeholders are stamped **DEMO** or **E pakonfirmuar** in the admin and stay off the public site, or are shown with their source.

How to read it:
- **[Admin]**: the owner changes it in `/admin/` (path given). See `OWNER.md` for how.
- **[Dev]**: needs the developer (file or table given).
- **[Owner + lawyer]**: a decision the hotel makes, then the developer updates the text.
- **[Info]**: no action unless it is wrong.

Today's values are those in `data/divjaka.db` (built by `npm run db:demo` from `scripts/seed-data/catalogue.mjs` on 23.10.2026) and in the settings defaults.

Agents: add new items to the right group with their mark; remove an item only when the owner has confirmed the value, and say where it was confirmed.

---

## 1. Hotel identity and contact · [Admin] Cilësimet → Hoteli (`settings.business`)

- [ ] **Legal name and NIPT**: empty. Candidates (Booking.com trader panel only, medium confidence): *Pelikan-rr Shpk*, NIPT *L64710402V*. Needed by the privacy notice (data controller), the terms, consumer law and any card acquirer.
- [ ] **Address wording**: shown as "Divjakë qendër, plazh 1, 9022 Divjakë, Shqipëri" / "…, Albania" (`address_sq` / `address_en`, written from the listings' "Divjake qender plazh 1, 9022 Divjakë").
- [ ] **Coordinates** 40.972262, 19.479574 (public listings, high confidence): used by the header, loader, map pins, weather and JSON-LD. Confirm, or save the exact values (they then win everywhere).
- [ ] **Phone** +355 68 504 3955 (Google listing only, medium confidence): hidden until saved.
- [ ] **E-mail**: none. Needed for the contact page, data requests (privacy) and the MET Norway weather contact (or `LIVE_CONTACT`, §9).
- [ ] **WhatsApp, Viber, reception hours**: empty, hidden.
- [ ] **Check-in 13:00–23:30, check-out until 11:00** (Booking.com listing). Shown today on `/qendrimi/` and the room pages with their source, and quoted by the assistant ("confirm with reception"); hidden on the contact page; not sent in the Hotel JSON-LD. **Confirm in two places:** Cilësimet → Hoteli **and** Asistenti → FAQ "Në çfarë ore është check-in dhe check-out?" (the FAQ is static text). Optional [Dev]: let the assistant read `settings.business` at answer time so one change covers both.
- [ ] **Open all year?** Unknown. The FAQ "A është hoteli i hapur gjithë vitin?" says so and hands off to staff. [Admin] Asistenti: write the real answer.
- [ ] **Social links**: none found. [Admin] Cilësimet → Rrjetet sociale.
- [ ] **Booking.com score 9.5/10 from 601 reviews** (read 23.10.2026) is shown on the site (`settings.proof`, show on; no review text, no sub-scores). It changes over time: update or hide. [Admin] Cilësimet → Vlerësime të verifikuara.
- [ ] **"Book direct = best price"**: never claimed today. Tick only after checking prices elsewhere. [Admin] Cilësimet → Rezervimi direkt.

## 2. Hotel facts shown as text · [Dev] unless marked

- [ ] **"Mbi 20 vite mikpritje në Divjakë, pranë detit dhe parkut me pisha"**, "dhoma moderne, bar-restorant": from SPEC.md (the hotel's own application). The 20 years cannot be checked in public sources. Footer, meta descriptions and home strip (`src/i18n/dict/common.ts`, `home.ts`). Confirm the wording.
- [ ] **House details from the Booking.com listing** (23.10.2026), printed with their source on `/qendrimi/` ("Mirë ta dini") and the room pages: breakfast 07:30–11:00 à la carte; pets on request (a fee is possible); children from 4 charged as adults, no cots or extra beds; English and Italian spoken; paid airport transfer; the facilities list. Source `research/business.json`, rendered by `src/components/stay/facts.ts`. Check-in/out are replaced by the owner's values from the admin; the rest needs [Dev]. The languages also live in the FAQ "Në cilat gjuhë flitet?" [Admin].
- [ ] **Listing facts on the home page and in JSON-LD** (verified in public listings): on the edge of the national park; balcony and air conditioning; restaurant with "fish, eel and other local specialities" (Albania Travel Guide) and "local and international cooking" (Booking.com); 24-hour front desk, free private parking, free Wi-Fi (also answered by the assistant). `src/i18n/dict/home.ts` `home.hotel.f.*`. Confirm they are still true.
- [ ] **Restaurant menu and prices**: none published; the site names none.
- [ ] **Paying at reception: currency and means** (lek? euro? cash? card?): stated nowhere on purpose. Once known: add to `/kushtet/` [Dev, `src/components/legal/content.ts`] and to the FAQ "A janë çmimet në lekë apo në euro?" [Admin].
- [ ] **Breakfast in direct rates**: the Booking.com rates seen included breakfast; whether direct rates do is unknown, so no product says so.

## 3. Rooms · [Admin] Dhomat & çmimet, Produktet

All room products are **DEMO** until the owner ticks "Vlerat janë të vërteta" and saves.

| Room type (slug) | Rooms of this type | Base price / night | High season 15 Jun – 15 Sep 2027 |
|---|---|---|---|
| Dhomë Deluxe (`dhome-deluxe`) | 8 | 4 100 L | 6 000 L |
| Dhomë Deluxe treshe (`dhome-deluxe-treshe`) | 4 | 5 000 L | 7 000 L |
| Dhomë Deluxe katërshe (`dhome-deluxe-katershe`) | 4 | 5 900 L | 8 000 L |
| Dhomë dyshe (`dhome-dyshe`), **draft, not public** | 2 | 3 700 L | 5 500 L |

- [ ] **Number of rooms per type**: invented; the hotel's total is not published anywhere. Until every published type is confirmed, the site shows no room counts (the ticker's "N rooms free tonight" stays hidden) and the dashboard occupancy is computed on these demo numbers.
- [ ] **Base prices**: rounded from Booking.com low-season rates seen for 6–7 Nov 2026 (breakfast included there).
- [ ] **High-season rates** (`room_rates`, note "DEMO: sezoni i lartë"): pure placeholders; summer prices are not observable anywhere.
- [ ] **Double room** (1 full bed): listed with medium confidence only. Publish only once the type and its price are confirmed.
- [ ] **Minimum nights**: 1 for every type (`products.options.min_nights`, product editor).
- [ ] **Beds, sizes and features** (from Booking.com and AlbaniaVisit, verified): Deluxe 1 queen bed, ≈ 17 m², balcony, view; Triple 1 twin + 1 full bed, ≈ 25 m², balcony and terrace; Quadruple 1 bunk + 1 queen bed, ≈ 25 m², sleeps 4; private bathroom, air conditioning, flat-screen TV, soundproofing, minibar, free Wi-Fi. Beds and size are in `products.options` and not in the admin editor: [Dev].
- [ ] **Cancellation and deposit policy**: see §8.

## 4. Experiences · [Admin] Produktet, Eksperiencat & oraret

All experiences are **DEMO** (price, places, length, schedule, meeting point). While DEMO, the site prints no free-place counts ("places available" only); the limits still apply.

| Experience (slug) | Price / person | Places | Length | Schedule (demo) | Meets |
|---|---|---|---|---|---|
| Parku Kombëtar me guidë (`parku-kombetar-me-guide`) | 1 800 L | 12 | 150 min | Tue, Thu, Sat 09:30 | reception |
| Qendra e Vizitorëve dhe Kulla 360° (`qendra-e-vizitoreve-dhe-kulla-360`) | 900 L | 15 | 90 min | Tue–Sun 10:30; Fri–Sun ≈ 75 min before sunset | Visitor Centre |
| Shpendët e lagunës në agim (`shpendet-e-lagunes-ne-agim`) | 2 200 L | 8 | 150 min | Wed, Sat, Sun ≈ 20 min before sunrise; not Jul–Aug; binoculars included | reception |
| Shëtitje me varkë në lagunë (`shetitje-me-varke-ne-lagune`) | 500 L | 10 (one boat) | 60 min | daily 10:00 + an afternoon slot (new seeds: 90 min before sunset); April–October | boat point on the canal |
| Me biçikletë nëpër pyllin me pisha (`me-biciklete-neper-pyllin-me-pisha`) | 1 500 L | 8 | 150 min | Wed, Sat, Sun 09:30 (Jun–Aug 08:00); March–November; bike hire not included | Visitor Centre |
| Ditë kulturore: Karavasta, Ardenica, Apolonia (`dite-kulturore-karavaste-ardenice-apoloni`) | 4 000 L | 8 | 8 h | Thu, Sun 09:00; transport included; tickets and lunch not | reception |
| Darkë me peshk në restorantin e hotelit (`darke-me-peshk-ne-restorantin-e-hotelit`) | 2 000 L | 20 | 120 min | daily 19:30 (Jun–Sep 20:00); drinks not included | restaurant |

- [ ] **Which packages the hotel runs itself, which it resells, and with whom** (boatmen, the cultural-day driver).
- [ ] **Guides**: SPEC says the hotel offers "dedicated" guides (shown on the experiences index and on nature/birds pages). Who they are and which languages they speak.
- [ ] **Meeting points and what is included/excluded**: demo terms. Included/excluded lists: [Admin] product editor. Meeting point (`options.meeting`): [Dev].
- [ ] **Which tower SPEC's "Kulla e Vëzhgimit të Pelikanëve" means**: the 360° Tower in the pine forest, or the bird hide on the lagoon barrier (mapped as destroyed in OpenStreetMap, survey 24.09.2025). No product uses that name; the assistant explains this and hands off. Tell us which tower guests are taken to.
- [ ] **Opening hours and fees** of the Visitor Centre, the 360° Tower and Altin's Nature Collection: not published anywhere official; the itinerary says "check the hours". [Dev] `src/components/itinerary/places.ts`.
- [ ] **Park entrance ticket**: the Ministry *announced* 50 lekë for tourists (undated); not verified whether it is collected today. Heritage sheets [Dev, `src/content/heritage/`] and FAQ "Sa kushton hyrja në park?" [Admin].
- [ ] **Bad weather**: FAQ "Çfarë ndodh me një eksperiencë nëse moti është i keq?" says the organiser decides and hands off. Write the real rule, per product if it differs. [Admin]
- [ ] **Boat trip, late slots**: 5 open slots at 17:00 between 27 and 31 Oct 2026 start after sunset (≈ 16:45). Close or cancel them. (New seeds start 90 min before sunset.) [Admin] Eksperiencat & oraret.
- [ ] **Slots run out**: the seed created slots 90 days ahead. Extend them with the weekly generator. [Admin]
- [ ] **Bike hire**: "bikes can be rented at the Visitor Centre" (Albania Travel Guide, verified); price unknown (last public price 200 L/hour, 2021). Not included in the bike tour.
- [ ] **Boat prices seen locally** (Albania Travel Guide): 300 L/person for 6–10 people or 1 500 L per boat for 1–5. The demo price is 500 L/person.
- [ ] **Godulla bird hide**: not offered by the itinerary planner (nothing says it is open to the public). If guests may use it, [Dev] removes `unconfirmed: true` from `bird-hide` in `src/components/itinerary/places.ts`.

## 5. Shop · [Admin] Produktet

All **DEMO**.

- [ ] **Gift card** (`karte-dhurate`): 5 000 L default; any amount 2 000–50 000 L in steps of 500; suggested amounts 5 000 / 10 000 / 20 000 ("Shumat e propozuara"). **Validity period: not set anywhere.** Decide it and state it in the product text [Admin] and the terms [Dev].
- [ ] **Binoculars to rent** (`dylbi-me-qira`): 800 L/day; stock seeded at 6.
- [ ] **Lagoon chart print** (`harta-e-lagunes`): 1 500 L; stock seeded at 25. Print format and paper to decide. The print must carry "© OpenStreetMap contributors, ODbL".
- [ ] **Bundle "Fundjavë me pelikanët"**: 14 900 L, 5 for sale; 2 nights Deluxe + dawn birds ×2 + park ×2; January–June.
- [ ] **Bundle "Tri ditë: laguna dhe historia"**: 23 500 L, 3 for sale; 3 nights Deluxe + boat ×2 + cultural day ×2 + fish dinner ×2; April–October.
- [ ] **Local products**: none documented, so none are sold. The category "Për udhëtimin / For your trip" stands in for "local products". Add producers, products and a category when real ones exist.
- [ ] **Delivery or pickup terms** for goods: not set. [Owner + lawyer] → terms [Dev].

## 6. Offers · [Admin] Ofertat

- [ ] **"Jashtë sezonit: −10% nga 3 netë"**: automatic, on rooms, arrivals 1 Nov 2026 – 31 Mar 2027. **Active and DEMO**: it already lowers room prices on the site from 3 nights. Keep, change or switch off; saving it clears DEMO.
- [ ] **Promo code `MIRESEVINI10`**: −10 % from 5 000 L, max 200 uses; **inactive**, DEMO. The code is public in this repository: change it before switching it on.

## 7. Payments · [Admin] Cilësimet → Pagesat unless marked

- [ ] **Methods**: pay at the hotel on; bank transfer off; card in TEST mode (on the public site card is not offered until there is a contract).
- [ ] **Bank transfer**: IBAN, beneficiary, bank name, SWIFT are empty. Bank transfer appears only once IBAN and beneficiary are saved.
- [ ] **Card**: no merchant contract. POK: keys in env vars `POK_KEY_ID`, `POK_KEY_SECRET`, `POK_MERCHANT_ID`, `POK_ENV` [Dev], then mode LIVE [Admin] (steps in `OWNER.md` §5). BKT Virtual POS: no adapter exists yet [Dev]; BKT lists €170 one-time + €110/year, per-transaction rate not published.
- [ ] **EUR display rate**: 90.64 L = 1 € (Bank of Albania, 22.10.2026). Update it regularly. [Admin] Cilësimet → Kursi i euros.
- [ ] **Hold times** (platform defaults): card 30 min, bank 72 h, pay at hotel 24 h, short hold 2 h. Confirm they suit the hotel. [Admin] Pagesat, Inventari dhe rezervimet.
- [ ] **Payment at reception**: see §2.

## 8. Legal pages · [Owner + lawyer], text in `src/components/legal/content.ts` [Dev]

`/privatesia/` and `/kushtet/` (and the English twins) are **drafts** written from what the site really does.

- [ ] **Data controller**: legal name and NIPT (§1); a contact e-mail for data requests (today: the contact form).
- [ ] **Retention**: how long completed orders are kept (the draft says "set by the hotel under its accounting obligations"). Other periods come from Cilësimet → Privatësia [Admin].
- [ ] **Hosting provider**: to be named once chosen.
- [ ] **Cancellation, deposit and refunds**: today the terms say the hotel sets them and confirms them for each booking "when it confirms the booking, by phone or in writing" (the site sends no e-mail). Write the real policy.
- [ ] **14-day right of withdrawal** and whether the accommodation exception applies (unverified); status of the new consumer-protection law; the cookie rule under Law 54/2024 (not read). The public site sets no cookies (only the admin does) and lists every browser-storage key on `/privatesia/`.
- [ ] **AI assistant**: if `ANTHROPIC_API_KEY` is set, the notice adds that question text may go to Anthropic. Confirm that use, or leave the key unset.
- [ ] **Marketing consent** ("Më dërgoni me email oferta dhe lajme nga Hotel Pelikan. Mund të çregjistroheni kur të doni."): needs a working unsubscribe process before any newsletter is sent.
- [ ] **Company details on the site**: consumer law and BKT's rules ask for trade name, address and NIPT on the site. They appear once §1 is filled.

## 9. Live data and assistant

- [ ] **MET Norway contact** (weather): set `LIVE_CONTACT` [Dev] or confirm the business e-mail [Admin]. Until then the User-Agent falls back to the site's address and the dashboard warns.
- [ ] **Air quality, waves, actual UV**: hidden. Showing them needs Open-Meteo **API Standard** (€29/month, read 23.10.2026, VAT not checked) and `OPEN_METEO_API_KEY` [Dev]. The free tier is non-commercial only.
- [ ] **Assistant answers the owner must give** (they say "ask reception" and offer the hand-off today): children's beds and prices, pool, transfers, invoices, cancellation and refunds, plus the rows named in §1, §2 and §4. [Admin] Asistenti → FAQ (61 rows in each language).
- [ ] **Hand-off e-mail**: Cilësimet → Asistenti has an e-mail field, but the site sends no e-mail; hand-offs arrive only under Mesazhet. E-mail alerts would be new work [Dev].
- [Info] Sea temperature: NASA JPL MUR satellite analysis, about a day behind, shown with its date and labelled "sea", never "lagoon".
- [Info] Pelican numbers are given as the sources state them (200–250 pairs historically, 19 at the low point, 85 counted in 2020, "around 100" in an undated 2025 flyer). No official count after 2020 was found.
- [Info] Amenities the knowledge base does not know (gym, spa, sauna, EV charging…) get the hand-off, never a "yes".

## 10. Photos and share image

- [ ] **No licensed photo of the hotel, its rooms, its restaurant or its dishes exists.** Room and dinner cards and the home "Hotel Pelikan" strip show the beach, the pine forest and fishing boats, captioned as what they show. Upload real room and restaurant photos [Admin] Produktet → Fotot; the home strip and the stay page header need [Dev].
- [ ] **Share image** `public/og-default.png` (wordmark + hotel line) stands in until a photo is chosen. [Dev]: the admin field Cilësimet → SEO → "Fotoja e parazgjedhur për ndarje" is saved but the pages do not read it yet (`src/layouts/Base.astro` uses `/og-default.png`).
- [Info] Every photo comes from Wikimedia Commons under its own licence and is credited on `/kreditet/` (`research/ASSETS.md`).

## 11. Server, data and repository · [Dev]

- [ ] **Public address**: `settings.seo.site_url` [Admin, Cilësimet → SEO] (or `site` in `astro.config.mjs`, today the placeholder `https://divjaka.example`). The sitemap, product feed, robots.txt and POK need it; card stays off without it.
- [ ] **Fresh production database without demo data**: run `npm run db:seed` (no `--demo`) on a new file. The development database `data/divjaka.db` holds 64 demo orders and customers, demo browsing events and a leftover test account `apitest-staff-…@example.com` (staff): never use it as the live database, or first run `DELETE FROM admin_users WHERE email LIKE 'apitest-staff-%';`.
- [ ] **Uploads**: `data/uploads/2026` holds files from upload tests. Start production with an empty `DIVJAKA_DATA` folder.
- [ ] **Environment**: `ALLOW_TEST_PAYMENTS` and `RATE_LIMIT_FACTOR` unset; `TRUST_PROXY=1` behind the reverse proxy; `ADMIN_PASSWORD` deleted from `.env` after the owner's first sign-in (README → Deployment contract).
- [ ] **Staff accounts**: the admin has no screen to add them; created by hand.
- [ ] **Backups**: daily, encrypted, off the server (`OWNER.md` §7).
- [ ] **Licence**: no LICENSE file yet. Choose one (or "all rights reserved") before the repository goes public. Photos, fonts, map data and GSAP keep their own licences (README → Licences).
- [ ] **Research folder**: `research/` holds the client's application pages (`spec-page-1.webp`, `spec-page-2.webp`) and business research. Decide whether they belong in a public repository.
- [ ] **Meta (Facebook/Instagram) catalogue**: the feed serves WebP; Meta documents JPG/PNG. Add a JPEG export before connecting Meta (Google Merchant accepts WebP).
- [Info] Customer CSV: phone numbers starting with + are left as is; Excel may show a formula error in that cell. Check once.

## 12. Facts on the site from public sources · [Info]

Each is shown with its source on the page (`research/heritage.json`, `research/business.json`, verified entries only). Tell us if any is wrong.

- Lagoon ≈ 42 km², the largest in Albania; eel, grey mullet, gilthead seabream and sea bass live in it.
- The only natural coastal pine forest in Albania; stone pine native, Aleppo pine introduced in the early 20th century.
- Visitor Centre ≈ 4 km by road west of Divjakë town; the 360° Tower is a wooden tower of 35 m (OpenStreetMap) or 36 m (AKT), shown as "35–36 m"; the view is best at sunset.
- Pelicans nest on Pelican Island January–June; the island is always closed and boats keep ≈ 180 m away; 42 000 waterbirds in the January 2020 census; early morning is best for birds.
- Boat trips on the channels and reed islets: ≈ 30-minute ride from the canal ≈ 1 km east of the Visitor Centre; boating is forbidden in the strictest core zone.
- Paths for walking and cycling in the forest.
- Cultural day: the 7 churches of Karavasta e Re (18th century); St Athanasius, Karavasta (1778); Ardenica on a 237 m hill, ≈ 35 km from Divjakë, founding date disputed (13th century to 1600), Skanderbeg's wedding on 21 April 1451; Apollonia ≈ 52 km away, founded ≈ 600 BC.
- **Not used on purpose:** the bird hide at 40.9504 N (mapped as destroyed); landing on Pelican Island; horse riding, recreational fishing, kayaking (no operator the hotel works with); honey, olive oil, wine, crafts, buffalo products (not documented for Divjakë).

## 13. Our own rules, not hotel facts · [Info]

These are planning choices built into the platform. Change them only if the hotel wants different ones ([Dev] unless marked).

- **Itinerary planner**: travel time = straight-line distance × 1.35 at 35 km/h by car, 12 km/h by bike, 4.5 km/h on foot, + 10 min per leg; a day by bike ≤ 40 km, on foot ≤ 12 km (return included); self-guided outdoor stops end by sunset (the 360° Tower by civil dusk); with children on foot or by bike, back at the hotel by civil dusk; one paid product per trip.
- **Counts hidden while DEMO**: free rooms, places and stock are never printed for a product with DEMO values.
- **Holds and anti-abuse limits**: unconfirmed orders may hold at most half of a room type, a slot or a stock per night; the rest of the limits are in Cilësimet → Inventari dhe rezervimet [Admin].
- **Checkout country list** (`src/components/checkout/countries.ts`): a convenience list of dialling codes, not a statement about who visits.
