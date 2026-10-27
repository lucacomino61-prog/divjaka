/**
 * faq.mjs — the assistant's knowledge base (T7, 2026-10-23; fix round 2026-10-26: pelican tower,
 * pelican counts, room prices, seasonal opening; round 3: hold times from settings ({bank_h}…, filled in by
 * src/lib/assistant/holds.ts), birds without a viewpoint claim, coach parking, beach services; no answer opens with a bare "Po/Yes", so a loose
 * match never reads as a confirmation). 61 questions, Albanian + English.
 *
 * Facts rule (PLAN §2): about the hotel only what SPEC.md says or what research/business.json
 * marks verified (Booking.com / AlbaniaVisit listing data, never review text); about the area only
 * verified research/heritage.json / seasons.json facts (ids in the comment above each entry).
 * Anything the owner has not confirmed (breakfast, pool, transfers, prices of third parties,
 * cancellation policy) answers "pyesni recepsionin" and the UI offers the staff hand-off; listing
 * data the stay page also prints (check-in/out, languages, pets) is quoted as the Booking.com
 * listing with "confirm with reception" (final pass 2026-10-27), so the two never disagree. Keywords: both languages, folded (no ë/ç needed), common spellings without accents.
 *
 * Used by:
 *   scripts/seed.mjs            — default export, inserted into an EMPTY faq table only;
 *   npm run db:faq              — `node scripts/seed-data/faq.mjs --sync`: a non-destructive upsert
 *                                 into the existing database (DIVJAKA_DB or data/divjaka.db):
 *                                 new questions are added; a row the seed wrote earlier (unchanged
 *                                 since) is refreshed; a row the owner edited in the admin is left
 *                                 alone and reported; nothing is ever deleted. Old built-in rows that
 *                                 an entry `replaces` are switched off only if nobody edited them.
 */

const L = (key, sq, en, params) => ({ key, label_sq: sq, label_en: en, ...(params ? { params } : {}) });
const STAY = L('stay', 'Qëndrimi', 'Stay');
const EXP = L('experiences', 'Eksperiencat', 'Experiences');
const CONTACT = L('contact', 'Kontakt', 'Contact');
const TERMS = L('terms', 'Kushtet', 'Terms');
const ACCOUNT = L('account', 'Rezervimet e mia', 'My bookings');
const NOW = L('now', 'Tani në Divjakë', 'Now in Divjakë');
const PLAN = L('itinerary', 'Itinerari', 'Itinerary');
const SHOP = L('shop', 'Dyqani', 'Shop');
const PRIVACY = L('privacy', 'Privatësia', 'Privacy');
const art = (slug, sq, en) => L('article', sq, en, { slug });
const BIRDS = art('zogjte-sipas-stineve', 'Zogjtë sipas stinëve', 'Birds by season');
const PELICAN = art('pelikani-kacurrel', 'Pelikani kaçurrel', 'The Dalmatian pelican');
const PARK = art('parku-kombetar', 'Parku Kombëtar', 'The National Park');
const GETTING = art('si-te-vini', 'Si të vini', 'Getting here');
const HISTORY = art('historia-dhe-kultura', 'Historia dhe kultura', 'History and culture');
const PINES = art('pylli-me-pisha-dhe-flora', 'Pylli me pisha', 'The pine forest');
const LAGOON = art('laguna-e-karavastase', 'Laguna e Karavastasë', 'Karavasta Lagoon');

export const FAQ = [
  /* ---------------- the hotel ---------------- */
  { // SPEC
    q_sq: 'Çfarë është Hotel Pelikan?', q_en: 'What is Hotel Pelikan?',
    a_sq: 'Hotel Pelikan është një strukturë akomoduese me mbi 20 vite përvojë në zonën e Divjakës, pranë detit dhe parkut me pisha. Ka dhoma moderne dhe bar-restorant, dhe organizon paketa aktivitetesh në park, në lagunë dhe në trashëgiminë kulturore të zonës.',
    a_en: 'Hotel Pelikan is an accommodation business with over 20 years in the Divjaka area, close to the sea and the pine park. It has modern rooms and a bar-restaurant, and arranges activity packages in the park, on the lagoon and around the area’s cultural heritage.',
    keywords: 'hotel pelikan, rreth hotelit, kush jeni, cfare eshte hoteli, about the hotel, who are you, about you, pervoje, vite, years', links: [STAY],
    replaces: 'Çfarë është Hotel Pelikan?',
  },
  { // business.json address (high), setting (high), SPEC
    q_sq: 'Ku ndodhet hoteli?', q_en: 'Where is the hotel?',
    a_sq: 'Në Divjakë, në fund të rrugës së plazhit (Divjakë qendër, plazh 1, 9022 Divjakë), në kufi me Parkun Kombëtar Divjakë-Karavasta, pranë detit dhe pyllit me pisha. Harta dhe udhëzimet janë te faqja e kontaktit.',
    a_en: 'In Divjakë, at the end of the beach road (Divjakë qendër, plazh 1, 9022 Divjakë), on the edge of Divjakë-Karavasta National Park, by the sea and the pine forest. The map and directions are on the contact page.',
    keywords: 'ku ndodhet, ku jeni, adresa, adres, vendndodhja, harta e hotelit, where is the hotel, where are you, address, location, hotel location', links: [CONTACT, GETTING],
  },
  { // business.json room_types (verified, Booking + AlbaniaVisit)
    q_sq: 'Çfarë dhomash keni?', q_en: 'What rooms do you have?',
    a_sq: 'Sipas listimeve publike të hotelit: Dhomë Deluxe (rreth 17 m²) me një shtrat dopio të madh, Dhomë Deluxe treshe (rreth 25 m²) dhe Dhomë Deluxe katërshe për 4 persona (rreth 25 m²), të gjitha me ballkon. Çmimet dhe disponueshmëria e sotme janë te faqja e qëndrimit.',
    a_en: 'According to the hotel’s public listings: a Deluxe Room with one queen bed (about 17 m²), a Deluxe Triple (about 25 m²) and a Deluxe Quadruple for 4 people (about 25 m²), all with a balcony. Prices and today’s availability are on the stay page.',
    keywords: 'dhoma, dhomat, llojet e dhomave, dhome dyshe, dhome treshe, dhome katershe, deluxe, rooms, room types, double room, triple, quadruple, family room, dhome familjare', links: [STAY],
  },
  { // business.json room features (verified)
    q_sq: 'Çfarë ka në dhomë?', q_en: 'What is in the room?',
    a_sq: 'Banjë private, kondicioner, televizor me ekran të sheshtë, izolim nga zhurma, minibar dhe Wi-Fi falas. Për detaje të një dhome të caktuar pyesni recepsionin.',
    a_en: 'A private bathroom, air conditioning, a flat-screen TV, soundproofing, a minibar and free Wi-Fi. For the details of a particular room, ask reception.',
    keywords: 'kondicioner, kondicioneri, klima, banjo, banja, televizor, minibar, ne dhome, cfare ka dhoma, air conditioning, aircon, bathroom, tv, in the room, amenities, facilities in the room', links: [STAY],
  },
  { // business.json facilities (verified)
    q_sq: 'A ka Wi-Fi?', q_en: 'Is there Wi-Fi?',
    a_sq: 'Sipas listimeve publike të hotelit, Wi-Fi është falas.',
    a_en: 'According to the hotel’s public listings, Wi-Fi is free.',
    keywords: 'wifi, wi-fi, wi fi, internet, interneti, rrjeti, wireless, wifi falas, free wifi, wifi ne dhome, wifi ne dhoma, wifi in the room, falas', links: [],
  },
  { // business.json facilities: free private parking on site (verified)
    q_sq: 'A ka parkim?', q_en: 'Is there parking?',
    a_sq: 'Sipas listimeve publike të hotelit, parkimi privat në hotel është falas. Për autobusë, kamperë ose rimorkio pyesni recepsionin.',
    a_en: 'According to the hotel’s public listings, private parking at the hotel is free. For coaches, campervans or trailers, ask reception.',
    keywords: 'parkim, parkimi, parking, parkoj, ku te parkoj, makinen, makina, le makinen, ta le makinen, car park, where to park, where do i park, where can i park, do i park, park the car, park my car, parkoj makinen, garage, garazh', links: [],
  },
  { // SPEC (bar-restaurant) + business.json restaurant (verified: fish, eel, local specialities)
    q_sq: 'A keni restorant?', q_en: 'Do you have a restaurant?',
    a_sq: 'Hoteli ka bar-restorant me kuzhinë vendase dhe ndërkombëtare: peshk, ngjalë dhe specialitete të zonës. Mund të rezervoni edhe «Darkë me peshk» te eksperiencat. Oraret e restorantit i konfirmon recepsioni.',
    a_en: 'The hotel has a bar-restaurant with local and international cooking: fish, eel and local specialities. You can also book the “Fish dinner” among the experiences. The restaurant’s hours are confirmed by reception.',
    keywords: 'restorant, restoranti, restorantin, orari i restorantit, mbremje, bar, ushqim, darke, dreke, ku te ha, restaurant open, open in the evening, peshk, ngjale, restaurant, food, dinner, lunch, where to eat, fish, eel, bar restaurant', links: [EXP],
  },
  { // business.json breakfast: medium, direct rates not confirmed → ask
    q_sq: 'A përfshihet mëngjesi?', q_en: 'Is breakfast included?',
    a_sq: 'Këtë duhet ta konfirmojë hoteli: nuk e kemi të shkruar për rezervimet direkte. Pyesni recepsionin, ose lini kontaktin këtu dhe stafi ju shkruan.',
    a_en: 'The hotel has to confirm this: it is not set out for direct bookings. Ask reception, or leave your contact here and the staff will write to you.',
    keywords: 'mengjes, mengjesi, mengjesin, me mengjes, breakfast, breakfast included, morning meal', links: [CONTACT], handoff: true,
  },
  { // business.json check_in / check_out (verified, medium: Booking.com listing), as /qendrimi/ prints them
    q_sq: 'Në çfarë ore është check-in dhe check-out?', q_en: 'What are the check-in and check-out times?',
    a_sq: 'Sipas listimit të hotelit në Booking.com: check-in 13:00–23:30, check-out deri në 11:00. Konfirmojini me recepsionin para se të vini.',
    a_en: 'According to the hotel’s Booking.com listing: check-in 13:00–23:30, check-out until 11:00. Please confirm with reception before you arrive.',
    keywords: 'check in, check-in, check out, check-out, hyrja, dalja, ora e hyrjes, ora e daljes, mberritja vone, late arrival, arrival time, departure time, kur mund te hyj, kur duhet te dal, liroj dhomen, lirimi i dhomes, dita e fundit, diten e fundit, leave the room, last day, what time do i have to leave, check out time, checkout, checkin', links: [CONTACT], handoff: true,
  },
  { // business.json facilities: 24-hour front desk (verified)
    q_sq: 'A është recepsioni i hapur gjithë kohën?', q_en: 'Is reception open around the clock?',
    a_sq: 'Listimet publike të hotelit tregojnë recepsion 24 orë. Ky asistent përgjigjet në çdo orë, dhe pyetjet që s’i di ia kalon stafit.',
    a_en: 'The hotel’s public listings show a 24-hour front desk. This assistant answers at any hour and passes on to the staff what it does not know.',
    keywords: 'recepsioni, recepsion, 24 ore, 24/7, naten, reception, front desk, open at night, open 24, around the clock', links: [CONTACT],
  },
  { // business.json pets (high, Booking listing)
    q_sq: 'A mund të vij me kafshë shtëpiake?', q_en: 'Can I bring my dog?',
    a_sq: 'Sipas listimit të hotelit në Booking.com, kafshët pranohen me kërkesë dhe mund të ketë tarifë. Konfirmojeni me recepsionin para se të vini.',
    a_en: 'According to the hotel’s Booking.com listing, pets are allowed on request and charges may apply. Confirm with reception before you come.',
    keywords: 'kafshe, kafshet, qen, qeni, mace, kafshe shtepiake, lejohen kafshet, me kafshe, dog, dogs, cat, pet, pets, pets allowed, are pets allowed, animals, pet friendly, with my dog', links: [CONTACT], handoff: true,
  },
  { // children policy: medium only → ask; family experiences exist
    q_sq: 'A jeni të përshtatshëm për fëmijë?', q_en: 'Is it suitable for children?',
    a_sq: 'Parku, plazhi dhe shumë eksperienca janë për familje, dhe itinerari ka zgjedhjen «Udhëtojmë me fëmijë». Për shtretërit shtesë dhe çmimet për fëmijët pyesni recepsionin.',
    a_en: 'The park, the beach and many experiences suit families, and the itinerary planner has a “Travelling with children” option. For extra beds and children’s prices, ask reception.',
    keywords: 'femije, femijet, femij, foshnje, krevat shtese, children, kids, child, baby, cot, crib, family, familje', links: [PLAN, CONTACT],
  },
  { // pool: CONFLICT in research → cannot confirm
    q_sq: 'A ka pishinë?', q_en: 'Is there a swimming pool?',
    a_sq: 'Nuk mund ta konfirmojmë: burimet publike nuk përputhen. Pyesni recepsionin. Deti dhe plazhi i Divjakës janë fare pranë hotelit.',
    a_en: 'We cannot confirm it: the public sources disagree. Ask reception. The sea and Divjaka beach are right next to the hotel.',
    keywords: 'pishine, pishina, pishin, pool, swimming pool, piscina', links: [CONTACT], handoff: true,
  },
  { // prac-02 (79 km, 1 h 20); shuttle medium → ask
    q_sq: 'A keni transfertë nga aeroporti?', q_en: 'Do you offer an airport transfer?',
    a_sq: 'Për transfertën pyesni recepsionin. Nga qyteti i Divjakës deri te Aeroporti i Tiranës janë rreth 79 km me rrugë, rreth 1 orë e 20 minuta pa trafik.',
    a_en: 'Ask reception about a transfer. From Divjakë town to Tirana Airport it is about 79 km by road, about 1 hour 20 minutes without traffic.',
    keywords: 'transfer, transferte, transferta, transport, transport nga aeroporti, transport from the airport, airport transport, airport pickup, shuttle, taxi, taksi, airport transfer, transfer from the airport, taxi from the airport, taksi nga aeroporti, marrje nga aeroporti, me merrni ne aeroport, pick up, pickup', links: [GETTING, CONTACT], handoff: true,
  },
  { // business.json languages (verified, medium: Booking.com listing), as /qendrimi/ prints them; the assistant itself is bilingual
    q_sq: 'Në cilat gjuhë flitet?', q_en: 'Which languages do you speak?',
    a_sq: 'Ky asistent dhe sajti janë në shqip dhe anglisht. Listimi i hotelit në Booking.com shënon anglisht dhe italisht në recepsion; konfirmojeni me hotelin.',
    a_en: 'This assistant and the site are in Albanian and English. The hotel’s Booking.com listing shows English and Italian at reception; please confirm with the hotel.',
    keywords: 'gjuha, gjuhe, gjuhet, flisni, flisni anglisht, anglisht, italisht, gjermanisht, frengjisht, greqisht, language, languages, do you speak, speak english, english, italian, german, french, greek, spanish', links: [CONTACT],
  },
  { // nothing verified about seasonal opening → ask (never "yes")
    q_sq: 'A është hoteli i hapur gjithë vitin?', q_en: 'Is the hotel open all year?',
    a_sq: 'Nuk kemi informacion të konfirmuar se si punon hoteli jashtë sezonit. Pyesni recepsionin, ose lini kontaktin këtu dhe stafi ju shkruan. Datat që mund të rezervohen online i shihni te «Qëndrimi».',
    a_en: 'We have no confirmed information on how the hotel works out of season. Ask reception, or leave your contact here and the staff will write to you. The dates you can book online are under “Stay”.',
    keywords: 'ne dimer, dimer, dimri, gjate dimrit, jashte sezonit, gjithe vitin, i hapur, hapur, hapet, mbyllur, mbyllet, winter, in winter, open in winter, all year, open all year, year round, off season, closed, open', links: [STAY, CONTACT], handoff: true,
  },

  /* ---------------- booking and paying ---------------- */
  {
    q_sq: 'Si rezervoj një dhomë?', q_en: 'How do I book a room?',
    a_sq: 'Hapni «Qëndrimi», zgjidhni datat dhe numrin e personave: çmimi dhe dhomat e lira llogariten aty për aty. Shtoni në shportë dhe përfundoni në arkë. Mund të më shkruani edhe datat këtu, p.sh. «dhomë 12–14 korrik për 2».',
    a_en: 'Open “Stay”, choose your dates and the number of guests: the price and free rooms are worked out on the spot. Add to the cart and finish at checkout. You can also write me your dates here, e.g. “room 12–14 July for 2”.',
    keywords: 'si rezervoj, rezervim dhome, rezervoj dhome, dua te rezervoj, booking, how to book, book a room, reserve, reservation, make a booking', links: [STAY],
  },
  { // prices are the owner's data (catalogue), worked out live — never quoted here
    q_sq: 'Sa kushton një dhomë për një natë?', q_en: 'How much is a room per night?',
    a_sq: 'Çmimi për natë varet nga dhoma, datat dhe numri i personave, dhe llogaritet aty për aty te «Qëndrimi». Më shkruani datat këtu, p.sh. «dhomë 12–14 korrik për 2», dhe ju tregoj dhomat e lira me shumën gjithsej.',
    a_en: 'The price per night depends on the room, the dates and the number of guests, and is worked out on the spot under “Stay”. Write me your dates here, e.g. “room 12–14 July for 2”, and I will show you the free rooms with the total.',
    keywords: 'sa kushton dhoma, sa kushton nje dhome, sa kushton nje nate, sa kushton nata, cmimi i dhomes, cmimet e dhomave, cmimi per nate, cmimi, cmimet, room price, room prices, price of a room, how much is a room, room cost, cost of a room, per night, price per night, room rate, rates, price, prices, cheapest, cheapest room, cheap, lowest price, budget, me e lira, me e lire, dhoma me e lire, me lire', links: [STAY],
  },
  {
    q_sq: 'Si mund të paguaj?', q_en: 'How can I pay?',
    a_sq: 'Në arkë shfaqen mënyrat që ofrohen tani: pagesë në hotel, transferim bankar (kur hoteli ka publikuar llogarinë) ose kartë. Shumat janë në lekë; euro tregohet si përafërsi.',
    a_en: 'Checkout shows the methods offered right now: pay at the hotel, bank transfer (once the hotel has published its account) or card. Amounts are in lek; euros are shown as an approximation.',
    keywords: 'pagese, paguaj, si paguaj, menyrat e pageses, cash, kesh, para ne dore, pay, payment, payment methods, how to pay', links: [L('checkout', 'Arka', 'Checkout')],
    replaces: 'Si mund të paguaj?',
  },
  {
    q_sq: 'A është e sigurt pagesa me kartë?', q_en: 'Is paying by card safe?',
    a_sq: 'Kur pagesa me kartë është aktive, ajo kryhet te faqja e ofruesit të pagesave: të dhënat e kartës nuk kalojnë në këtë sajt, dhe porosia shënohet e paguar vetëm kur ofruesi e konfirmon.',
    a_en: 'When card payment is active, it happens on the payment provider’s page: your card details never pass through this site, and the order is marked paid only when the provider confirms it.',
    keywords: 'karte, karta, me karte, visa, mastercard, karte krediti, karte debiti, card, credit card, debit card, card payment, safe, secure, siguri', links: [PRIVACY],
  },
  {
    q_sq: 'Si paguaj me transferim bankar?', q_en: 'How do I pay by bank transfer?',
    a_sq: 'Kur hoteli ka publikuar llogarinë bankare, transferimi shfaqet në arkë. Pas porosisë shihni IBAN-in dhe kodin e porosisë për t’i shkruar në përshkrim. Porosia pa pagesë mbahet deri në {bank_h} orë, nëse hoteli s’e konfirmon më herët.',
    a_en: 'Once the hotel has published its bank account, transfer appears at checkout. After ordering you see the IBAN and the order code to put in the reference. An unpaid order is held for up to {bank_h} hours unless the hotel confirms it sooner.',
    keywords: 'transferte, transfert, transferim, banke, banka, iban, llogari bankare, bank transfer, wire transfer, bank account, swift', links: [L('checkout', 'Arka', 'Checkout')],
  },
  {
    q_sq: 'Mund të paguaj në hotel?', q_en: 'Can I pay at the hotel?',
    a_sq: 'Pagesa në hotel është e mundur kur kjo mënyrë ofrohet në arkë. Hoteli e konfirmon porosinë dhe mund t’ju telefonojë, ndaj kërkohet numri i telefonit. Pa konfirmim, rezervimi mbahet {hotel_h} orë.',
    a_en: 'Paying at the hotel is possible when the method is offered at checkout. The hotel confirms the order and may call you, so a phone number is required. Without confirmation, the booking is held for {hotel_h} hours.',
    keywords: 'paguaj ne hotel, pagese ne hotel, ne recepsion, kur te vij, ne mberritje, pay at the hotel, pay on arrival, when i arrive, pay later, pay at reception', links: [TERMS],
  },
  {
    q_sq: 'Sa kohë mbahet rezervimi im pa pagesë?', q_en: 'How long is my booking held without payment?',
    a_sq: 'Kartë: {card_min} minuta për të përfunduar pagesën. Transferim bankar: deri në {bank_h} orë. Pagesë në hotel: {hotel_h} orë, derisa hoteli ta konfirmojë. Qëndrimet e gjata ose shumë përpara mund të mbahen vetëm {short_h} orë; faqja e porosisë tregon afatin e saktë.',
    a_en: 'Card: {card_min} minutes to finish paying. Bank transfer: up to {bank_h} hours. Pay at the hotel: {hotel_h} hours, until the hotel confirms it. Long stays or bookings far ahead may be held for {short_h} hours only; your order page shows the exact deadline.',
    keywords: 'sa mbahet, afati, skadon, hold, held, expire, expires, how long is my booking held, reserved until, lirohet', links: [ACCOUNT, TERMS],
  },
  { // terms draft: policy set by the hotel
    q_sq: 'Si mund të anuloj ose ndryshoj një rezervim?', q_en: 'How can I cancel or change a booking?',
    a_sq: 'Kushtet e anulimit i përcakton hoteli dhe jua konfirmon kur konfirmon rezervimin, me telefon ose me shkrim. Për të anuluar ose ndryshuar, shkruajini stafit me kodin e porosisë, nga faqja e kontaktit ose këtu.',
    a_en: 'Cancellation terms are set by the hotel, which confirms them to you when it confirms your booking, by phone or in writing. To cancel or change, write to the staff with your order code, from the contact page or here.',
    keywords: 'anulim, anuloj, anulimi, ndryshim, ndryshoj, ndrysho datat, cancel, cancellation, change booking, modify, change dates, postpone', links: [TERMS, CONTACT], handoff: true,
    replaces: 'Si mund të anuloj ose ndryshoj një rezervim?',
  },
  {
    q_sq: 'A kthehen paratë nëse anuloj?', q_en: 'Will I get a refund if I cancel?',
    a_sq: 'Rimbursimi ndjek kushtet e anulimit që hoteli jua konfirmon kur konfirmon rezervimin. Pyesni stafin me kodin e porosisë.',
    a_en: 'Refunds follow the cancellation terms the hotel confirms to you when it confirms your booking. Ask the staff, quoting your order code.',
    keywords: 'rimbursim, rimbursimi, kthim parash, kthimi i parave, refund, money back, reimbursement', links: [TERMS, CONTACT], handoff: true,
  },
  {
    q_sq: 'Si e gjej rezervimin tim?', q_en: 'How do I find my booking?',
    a_sq: 'Hapni «Rezervimet e mia» dhe shkruani kodin e porosisë (p.sh. DV-7K3Q9) dhe emailin që përdorët.',
    a_en: 'Open “My bookings” and enter your order code (e.g. DV-7K3Q9) and the email you used.',
    keywords: 'rezervimi im, rezervimin tim, porosia ime, porosine time, kodi i porosise, kodin e porosise, kodi i rezervimit, kodin e rezervimit, kodin, humb, humba kodin, kam humbur kodin, harrova kodin, gjej rezervimin, gjej porosine, ku eshte rezervimi, my booking, find my booking, order code, booking code, order number, booking number, reservation number, numri i porosise, numrin e porosise, numri i rezervimit, find order, lost, lost my code, lost the code, forgot my code, lost booking', links: [ACCOUNT],
    replaces: 'Si e gjej rezervimin tim?',
  },
  {
    q_sq: 'Nuk mora email për porosinë. Çfarë të bëj?', q_en: 'I did not get an email about my order. What now?',
    a_sq: 'Ky sajt nuk dërgon email. Kodin e porosisë e shihni në faqen që hapet pas porosisë; me kodin dhe emailin e gjeni porosinë te «Rezervimet e mia». Nëse e keni humbur kodin, lini kontaktin dhe stafi ju shkruan.',
    a_en: 'This site does not send emails. Your order code is on the page that opens after you order; with the code and your email you find the order under “My bookings”. If you have lost the code, leave your contact and the staff will write to you.',
    keywords: 'nuk mora email, s mora email, nuk me erdhi, nuk me vjen, nuk me ka ardhur, me ka ardhur, asnje email, email per porosine, never got an email, email konfirmimi, konfirmim me email, a dergoni email, no email, did not receive, confirmation email, no confirmation, did not get an email, send an email', links: [ACCOUNT, CONTACT], handoff: true,
  },
  {
    q_sq: 'A janë çmimet në lekë apo në euro?', q_en: 'Are prices in lek or euros?',
    a_sq: 'Çmimet janë në lekë. Euro tregohet si përafërsi me kursin e vendosur nga hoteli; zgjidheni te ndërprerësi LEK/EUR. Mënyrën dhe monedhën e pagesës në recepsion jua konfirmon hoteli.',
    a_en: 'Prices are in lek. Euros are shown as an approximation at the rate the hotel sets; pick it with the LEK/EUR switch. The hotel confirms how, and in which currency, you pay at reception.',
    keywords: 'euro, eur, leke, lek, monedha, kursi, valuta, currency, exchange rate, in euros, price in euro', links: [],
  },
  {
    q_sq: 'Si përdor një kod promocional?', q_en: 'How do I use a promo code?',
    a_sq: 'Shkruajeni kodin në shportë ose në arkë; zbritja llogaritet nga serveri dhe shfaqet në shumën përfundimtare. Ofertat automatike shfaqen vetë te çmimet.',
    a_en: 'Type the code in the cart or at checkout; the discount is worked out by the server and shown in the final total. Automatic offers show up on the prices by themselves.',
    keywords: 'kod promocional, kod zbritjeje, kupon, kodi, zbritje, oferte, promo code, discount code, coupon, voucher code, offer, discount', links: [L('cart', 'Shporta', 'Cart')],
  },
  {
    q_sq: 'A mund të marr faturë?', q_en: 'Can I get an invoice?',
    a_sq: 'Për faturën pyesni recepsionin; ju lutem jepni emrin e firmës dhe NIPT-in nëse ju duhet faturë biznesi.',
    a_en: 'Ask reception about an invoice; please give your company name and tax number if you need a business invoice.',
    keywords: 'fature, fatura, nipt, kupon tatimor, invoice, receipt, vat, tax invoice', links: [CONTACT], handoff: true,
  },
  {
    q_sq: 'A ofroni karta dhuratë?', q_en: 'Do you offer gift cards?',
    a_sq: 'Te dyqani i këtij sajti blihet një kartë dhuratë me vlerën që zgjidhni. Afatin e vlefshmërisë e konfirmon hoteli.',
    a_en: 'In this site’s shop you can buy a gift card for the amount you choose. The hotel confirms how long it is valid.',
    keywords: 'karte dhurate, karta dhurate, kupon dhurate, dhurate, gift card, gift voucher, voucher, gift', links: [SHOP],
    replaces: 'A ofroni karta dhuratë?',
  },

  /* ---------------- experiences and the park ---------------- */
  {
    q_sq: 'Çfarë eksperiencash ofroni?', q_en: 'Which experiences do you offer?',
    a_sq: 'Parkun Kombëtar me guidë, Qendrën e Vizitorëve dhe Kullën 360°, shpendët e lagunës në agim, shëtitje me varkë në lagunë, biçikletë në pyllin me pisha, një ditë kulturore në Karavastë, Ardenicë dhe Apoloni, dhe darkë me peshk. Oraret dhe vendet e lira janë në faqen e secilës.',
    a_en: 'The National Park with a guide, the Visitor Centre and the 360° Tower, lagoon birds at dawn, a boat trip on the lagoon, cycling in the pine forest, a cultural day at Karavasta, Ardenica and Apollonia, and a fish dinner. Times and free places are on each one’s page.',
    keywords: 'eksperienca, aktivitete, paketa, ture, guida, guide, cfare beni, cfare ofroni, experiences, activities, packages, tours, guided tour, things to book', links: [EXP],
    replaces: 'Çfarë paketash aktivitetesh ofroni?',
  },
  { // park-23, birds-10, seasons year_round
    q_sq: 'A mund të shkoj në Ishullin e Pelikanit?', q_en: 'Can I visit Pelican Island?',
    a_sq: 'Ishulli i Pelikanit është i mbyllur për publikun. Sipas AKT-së, vizitorët e vëzhgojnë nga kullat e vëzhgimit dhe nga turet me varkë aty pranë, nga larg; pelikanët folezojnë atje nga janari në qershor.',
    a_en: 'Pelican Island is closed to the public. According to AKT, visitors watch it from the observation towers and the boat tours nearby, from a distance; the pelicans nest there from January to June.',
    keywords: 'ishulli i pelikanit, ishulli, pelican island, island, ishull, te ishulli, visit the island', links: [PELICAN],
    replaces: 'A mund të shkoj në Ishullin e Pelikanit?',
  },
  { // OSM pelican-tower (tagged destroyed, research/geo.json) + park-23 (AKT) + visit-02 (36 m) / OSM 35 m
    q_sq: 'A mund të vizitohet Kulla e Vëzhgimit të Pelikanëve?', q_en: 'Can I visit the Pelican Observation Tower?',
    a_sq: 'Vendvëzhgimi i vjetër i zogjve mbi brezin ranor pranë Ishullit të Pelikanit shënohet si i shkatërruar në OpenStreetMap, ndaj nuk e propozojmë si vizitë. Sipas AKT-së, pelikanët vëzhgohen nga kullat e vëzhgimit dhe nga turet me varkë aty pranë; pranë Qendrës së Vizitorëve ngrihet Kulla 360° (35–36 m). Për gjendjen e sotme të kullave pyesni stafin.',
    a_en: 'The old bird hide on the sand barrier near Pelican Island is mapped as destroyed in OpenStreetMap, so we do not suggest it as a visit. According to AKT, the pelicans are watched from the observation towers and the boat tours nearby; the 360° Tower (35–36 m) stands by the Visitor Centre. For the towers’ current state, ask the staff.',
    keywords: 'kulla e pelikaneve, kulla e pelikanit, kulla e vezhgimit, kulla e vezhgimit te pelikaneve, kulla e zogjve, vendvezhgimi, strehe vezhgimi, pelican tower, pelican observation tower, observation tower, kulle vezhgimi, kulla vezhgimi, kulle per zogjte, vezhgimi, bird hide, bird tower, birdwatching tower, hide', links: [PELICAN, EXP], handoff: true,
  },
  { // birds-03, birds-04, birds-07, birds-08 (counts as the sources give them; no official count after 2020)
    q_sq: 'Sa pelikanë kaçurrelë ka në Divjakë?', q_en: 'How many Dalmatian pelicans are there?',
    a_sq: 'Historikisht kolonia kishte 200–250 çifte folezuese; në pikën më të ulët, në fillim të viteve 2000, ra në 19 çifte. Më 2020 u numëruan saktësisht 85 çifte, numri më i lartë në rreth 40 vjet. Një fletëpalosje e PPNEA/Fondacionit Böll (2025) shënon «rreth 100 çifte» pa dhënë vitin; numërim zyrtar pas 2020-s nuk kemi gjetur.',
    a_en: 'Historically the colony held 200–250 breeding pairs; at its lowest, in the early 2000s, it fell to 19 pairs. In 2020 exactly 85 pairs were counted, the highest in about 40 years. A PPNEA/Böll Foundation flyer (2025) says “around 100 breeding pairs” without giving a year; we found no official count after 2020.',
    keywords: 'sa pelikane, sa jane pelikanet, sa pelikan, numri i pelikaneve, sa cifte, cifte, cifte folezuese, kacurel, sa jane, how many, how many pelicans, how many dalmatian pelicans, number of pelicans, pelican population, population, breeding pairs, pairs, popullata, popullsia', links: [PELICAN],
  },
  { // birds-10, prac-13, birds-11
    q_sq: 'Kur shihen pelikanët?', q_en: 'When can I see the pelicans?',
    a_sq: 'Sezoni më i mirë është janar–qershor, kur pelikanët kaçurrelë folezojnë në Ishullin e Pelikanit; guidat rekomandojnë mëngjesin herët për ujë të qetë dhe dritë të mirë. Në sezonin e çiftëzimit qeska e sqepit u bëhet portokalli deri në të kuqe.',
    a_en: 'The best season is January to June, when the Dalmatian pelicans nest on Pelican Island; guides recommend early morning for calm water and good light. In the breeding season their bill pouch turns orange to bright red.',
    keywords: 'pelikan, pelikane, pelikanet, pelikani, pelikani kacurrel, pelican, pelicans, dalmatian pelican, when to see pelicans, kur shihen', links: [PELICAN, BIRDS],
  },
  { // birds-15, birds-17, birds-25, seasons year_round flamingos (medium, Albanian wetlands)
    q_sq: 'Çfarë zogjsh mund të shoh?', q_en: 'Which birds can I see?',
    a_sq: 'Buletini i parkut numëron rreth 260 lloje shpendësh. Agjencia Kombëtare e Turizmit rendit flamingot, karabullakët dhe çafkat ndër shpendët e lagunës, dhe në mars 2020 vëzhguesit e shpendëve panë këtu edhe karabullakë të vegjël, pulëbardha e rosa; në dimër laguna mban deri në 84 000 shpendë uji. Kalendari muaj pas muaji është te «Zogjtë sipas stinëve».',
    a_en: 'The park bulletin counts about 260 bird species. The national tourism agency lists flamingos, cormorants and herons among the lagoon’s birds, and in March 2020 birdwatchers also saw pygmy cormorants, gulls and ducks here; in winter the lagoon holds up to 84,000 waterbirds. The month-by-month calendar is in “Birds by season”.',
    keywords: 'zogj, zogjte, zogjsh, cfare zogjsh, shpende, shpendet, shpendesh, shpendet e ujit, ne dimer, dimer, dimrit, shihen, flamingo, flamingot, cafka, karabullak, birds, winter, in winter, birds in winter, wintering, cormorant, birdwatching, bird watching, which birds, flamingos, herons, species, vezhgim zogjsh', links: [BIRDS],
  },
  { // visit-02 (36 m AKT) + OSM 35 m → "35–36 m"; visit-08 no official hours
    q_sq: 'Çfarë është Kulla 360°?', q_en: 'What is the 360° Tower?',
    a_sq: 'Një kullë panoramike prej druri, 35–36 m e lartë, pranë Qendrës së Vizitorëve: nga maja shihen pylli, laguna dhe deti, sidomos bukur në perëndim të diellit. Nuk ka orar zyrtar të publikuar; kontrolloni në vend ose rezervoni vizitën me guidë.',
    a_en: 'A wooden panoramic tower, 35–36 m tall, by the Visitor Centre: from the top you see the forest, the lagoon and the sea, at its best at sunset. There are no published official hours; check on the spot or book the guided visit.',
    keywords: 'kulla, kulla 360, kulle, kulla panoramike, kulla prej druri, tower, 360 tower, the 360, lookout, viewpoint, panorama, panoramic tower, wooden tower', links: [EXP, PARK],
  },
  { // visit-01, prac-06, visit-08
    q_sq: 'Ku është Qendra e Vizitorëve dhe kur hapet?', q_en: 'Where is the Visitor Centre and when is it open?',
    a_sq: 'Qendra e Vizitorëve Divjakë-Karavasta është në rrugën e parkut, rreth 4 km me rrugë (rreth 10 minuta) nga qyteti i Divjakës; aty njiheni me florën dhe faunën e parkut. Orar zyrtar nuk është publikuar: kontrolloni në vend.',
    a_en: 'The Divjakë-Karavasta Visitor Centre is on the park road, about 4 km by road (about 10 minutes) from Divjakë town; it introduces the park’s flora and fauna. No official hours are published: check on the spot.',
    keywords: 'qendra e vizitoreve, qendra, qendres, vizitoreve, visitor centre, visitor center, info centre, orari i qendres, kur hapet qendra, visitor centre opening hours, opening hours', links: [PARK, EXP],
  },
  { // park-19 (announced, medium)
    q_sq: 'Sa kushton hyrja në park?', q_en: 'How much is the park entrance?',
    a_sq: 'Ministria e Mjedisit ka njoftuar biletë elektronike 50 lekë për turistët në rrugën e parkut (banorët përjashtohen). Nuk e kemi verifikuar nëse merret sot.',
    a_en: 'The Ministry of Environment announced an electronic ticket of 50 lekë for tourists on the park road (local residents exempt). We have not verified whether it is collected today.',
    keywords: 'bileta, bilete, hyrja ne park, tarifa, sa kushton parku, entrance fee, ticket, park fee, park ticket, admission', links: [PARK],
  },
  { // park-20, park-22, prac-10
    q_sq: 'Çfarë rregullash ka në park?', q_en: 'What are the rules in the park?',
    a_sq: 'Gjuetia ndalohet gjithë vitin. Mos ndizni zjarr dhe mos lini mbeturina jashtë vendeve të caktuara, dhe mos lëvizni me makinë jashtë rrugëve. Vera është stina më e rrezikshme për zjarre. Ishulli i Pelikanit është i mbyllur.',
    a_en: 'Hunting is forbidden all year. Light no fires and leave no waste outside the places set aside, and do not drive off the roads. Summer is the worst season for fires. Pelican Island is closed.',
    keywords: 'rregullat, rregulla, ndalohet, lejohet, a lejohet, ndez zjarr, zjarr, gjueti, mbeturina, rules, regulations, park rules, what is allowed, forbidden, fire, hunting, camping, kamping, drone', links: [PARK],
  },
  { // visit-06; product Apr–Oct
    q_sq: 'A ka shëtitje me varkë në lagunë?', q_en: 'Are there boat trips on the lagoon?',
    a_sq: 'Varkat çojnë në ujërat e qeta të lagunës, nëpër kanale dhe ishuj me kallamishte, nga pika e varkave pranë Qendrës së Vizitorëve. Shëtitja rezervohet edhe këtu: oraret, çmimin dhe datat e lira i shihni në faqen e saj.',
    a_en: 'The boats take you onto the lagoon’s calm water, through channels and reed islets, from the boat point near the Visitor Centre. You can book the trip here too: its times, price and free dates are on its page.',
    keywords: 'varke, varka, me varke, lundrim, shetitje me varke, boat, boat trip, boat tour, lagoon boat, canoe, kayak, kajak', links: [EXP, LAGOON],
  },
  { // business.json services.bike-rental (verified, price not), flora-02, prac-12
    q_sq: 'Ku marr biçikletë me qira?', q_en: 'Where can I rent a bike?',
    a_sq: 'Sipas guidës turistike të Shqipërisë, biçikletat merren me qira te Qendra e Vizitorëve (çmimin konfirmojeni në vend). Pylli ka shtigje për biçikletë; mbi shtegun prej druri këshillohet ta shtyni biçikletën.',
    a_en: 'According to the Albania Travel Guide, bikes can be rented at the Visitor Centre (confirm the price there). The forest has cycling paths; over the wooden boardwalk you are asked to push the bike.',
    keywords: 'bicikleta, biciklete, me biciklete, bicikleta me qira, qira, bike, bikes, bicycle, rent a bike, bike rental, cycling, cycle', links: [EXP, PINES],
  },
  { // coast-01, coast-03, seasons July (low: guides name July–August)
    q_sq: 'Si është plazhi?', q_en: 'What is the beach like?',
    a_sq: 'Plazhi i Divjakës është brenda parkut: rërë e imët dhe ujë i qetë, me pishat pas tij; nga hija te deti kaloni brenda pak minutash. Guidat turistike e quajnë korrikun dhe gushtin sezonin e plazhit. Për çadra, shezlongë ose një pjesë plazhi të hotelit pyesni recepsionin.',
    a_en: 'Divjaka beach is inside the park: fine sand and calm water, with the pines behind it; you walk from shade to the sea in a few minutes. Travel guides call July and August the beach season. For umbrellas, sunbeds or a hotel stretch of beach, ask reception.',
    keywords: 'plazh, plazhi, deti, not, notoj, rere, beach, sea, swim, swimming, sand, beach season', links: [NOW],
  },
  { // flora-01, flora-02, flora-04
    q_sq: 'Çfarë e veçon pyllin me pisha?', q_en: 'What is special about the pine forest?',
    a_sq: 'Është i vetmi pyll natyror me pisha bregdetare në Shqipëri: pishë e butë vendase, ndërsa pisha e egër u soll nga Italia në fillim të shekullit XX. Ka shtigje për ecje dhe biçikletë përgjatë plazhit.',
    a_en: 'It is Albania’s only natural coastal pine forest: native stone pine, while the Aleppo pine was brought from Italy early in the 20th century. It has paths for walking and cycling along the beach.',
    keywords: 'pylli, pyll, pisha, pishat, pylli me pisha, pine forest, pines, forest, woods, stone pine, ecje, walk, hiking', links: [PINES],
  },
  { // prac-11 (low), seasons July (low)
    q_sq: 'A ka mushkonja?', q_en: 'Are there mosquitoes?',
    a_sq: 'Zona ka sezon mushkonjash, sidomos verës pranë lagunës: merrni me vete mjet kundër mushkonjave.',
    a_en: 'The area has a mosquito season, especially in summer near the lagoon: bring insect repellent.',
    keywords: 'mushkonja, mushkonjat, insekte, mosquito, mosquitoes, insects, repellent, bites', links: [],
  },

  /* ---------------- getting here ---------------- */
  { // prac-01, prac-08
    q_sq: 'Si vij nga Tirana?', q_en: 'How do I get here from Tirana?',
    a_sq: 'Me makinë: rreth 85 km nga qendra e Tiranës deri në qytetin e Divjakës, rreth 1 orë e 20 minuta pa trafik; hoteli është rreth 5 km më në perëndim në vijë ajrore, te plazhi. Me autobus: një faqe rezervimesh rendit rreth 10 nisje në ditë, rreth 1 orë e 30 minuta.',
    a_en: 'By car: about 85 km from central Tirana to Divjakë town, about 1 hour 20 minutes without traffic; the hotel is about 5 km further west as the crow flies, at the beach. By bus: a booking site lists about 10 departures a day, about 1 hour 30 minutes.',
    keywords: 'tirana, nga tirana, si vij, si te vij, rruga, autobus, furgon, si arrihet, how to get here, from tirana, by bus, by car, directions, drive', links: [GETTING, CONTACT],
  },
  { // prac-02
    q_sq: 'Sa larg është aeroporti?', q_en: 'How far is the airport?',
    a_sq: 'Aeroporti Ndërkombëtar i Tiranës (Rinas) është rreth 79 km me rrugë nga qyteti i Divjakës, rreth 1 orë e 20 minuta pa trafik.',
    a_en: 'Tirana International Airport (Rinas) is about 79 km by road from Divjakë town, about 1 hour 20 minutes without traffic.',
    keywords: 'sa larg aeroporti, sa larg eshte aeroporti, aeroporti, aeroport, aeroporti i tiranes, rinas, how far is the airport, airport, tirana airport, from tirana airport, from the airport, how long, airport distance, tia, flight', links: [GETTING],
  },
  { // prac-03, prac-04, prac-05, prac-07
    q_sq: 'Sa larg janë Durrësi, Fieri dhe Berati?', q_en: 'How far are Durrës, Fier and Berat?',
    a_sq: 'Nga qyteti i Divjakës me makinë, pa trafik: Durrësi rreth 54 km (50 minuta), Fieri rreth 45 km (47 minuta), Lushnja rreth 20 km (30 minuta), Berati rreth 60 km (1 orë e 10 minuta).',
    a_en: 'From Divjakë town by car, without traffic: Durrës about 54 km (50 minutes), Fier about 45 km (47 minutes), Lushnjë about 20 km (30 minutes), Berat about 60 km (1 hour 10 minutes).',
    keywords: 'durres, durresi, fier, fieri, berat, berati, lushnje, lushnja, nearby towns, qytetet perreth', links: [GETTING],
  },

  /* ---------------- culture ---------------- */
  { // hist-13, hist-14, hist-15, hist-16, hist-09
    q_sq: 'Çfarë vende kulturore ka afër?', q_en: 'What cultural sites are nearby?',
    a_sq: 'Kishat e Karavastasë (shekulli XVIII), Manastiri i Ardenicës, rreth 35 km nga qyteti i Divjakës, ku u martua Skënderbeu më 1451, dhe Apolonia, qyteti antik i themeluar rreth vitit 600 p.e.s., rreth 52 km larg. Të treja janë në «Ditën kulturore».',
    a_en: 'The churches of Karavasta (18th century), Ardenica Monastery, about 35 km from Divjakë town, where Skanderbeg married in 1451, and Apollonia, the ancient city founded around 600 BC, about 52 km away. All three are in the “Cultural day”.',
    keywords: 'kulture, kulturore, histori, manastir, ardenica, ardenice, apolonia, apollonia, kisha, kishat, karavasta, skenderbeu, culture, history, monastery, churches, ruins, archaeology, museum, muze', links: [HISTORY, EXP],
  },
  { // hist-21, lagoon-12
    q_sq: 'Çfarë të shijoj nga kuzhina vendase?', q_en: 'What local food should I try?',
    a_sq: 'Kuzhina e Divjakës ndërthur detin dhe tokën: ngjalë, levrek dhe karkaleca nga laguna dhe Adriatiku, në skarë ose të zier me perime, si dhe qumësht e djathë nga fermat e zonës.',
    a_en: 'Divjaka cooking mixes sea and land: eel, sea bass and shrimp from the lagoon and the Adriatic, grilled or stewed with vegetables, plus milk and cheese from local farms.',
    keywords: 'kuzhina, gatime, gatim tradicional, specialitete, ushqim, ushqimi, ushqim vendas, ushqim tipik, tipik, tipike, tradicional, provoj, te provoj, cfare te ha, local food, typical food, traditional food, cuisine, dishes, what to eat, specialities, local dish, seafood, should i try', links: [HISTORY],
  },

  /* ---------------- weather, seasons, planning ---------------- */
  {
    q_sq: 'Si është moti tani në Divjakë?', q_en: 'What is the weather like now?',
    a_sq: 'Leximet e fundit (temperatura, era, deti, lindja dhe perëndimi i diellit) dhe parashikimi për 7 ditë janë te «Tani në Divjakë». Faqja rifreskohet vetë çdo 10 minuta; moti ndryshon kur MET Norway publikon parashikimin e ri, deti një herë në ditë.',
    a_en: 'The latest readings (temperature, wind, sea, sunrise and sunset) and the 7-day forecast are on “Now in Divjakë”. The page refreshes itself every 10 minutes; the weather changes when MET Norway publishes a new forecast, the sea once a day.',
    keywords: 'moti, mot, temperatura, era, shi, parashikimi, sa grade, weather, temperature, forecast, wind, rain, how hot, how cold', links: [NOW],
    replaces: 'Si është moti tani në Divjakë?',
  },
  { // prac-13, birds-17, seasons
    q_sq: 'Kur është koha më e mirë për të ardhur?', q_en: 'When is the best time to come?',
    a_sq: 'Varet nga çfarë kërkoni: pelikanët folezojnë janar–qershor; në dimër laguna mbushet me shpendë uji (deri në 84 000); guidat e quajnë korrikun dhe gushtin sezonin e plazhit. Muaj pas muaji: «Zogjtë sipas stinëve».',
    a_en: 'It depends on what you are after: the pelicans nest January–June; in winter the lagoon fills with waterbirds (up to 84,000); guides call July and August the beach season. Month by month: “Birds by season”.',
    keywords: 'koha me e mire, kur te vij, kur eshte me mire, muaji me i mire, cili muaj, ne cilin muaj, sezoni, stina, best time, best month, which month, best season, best period, when to visit, when to come, season, high season, low season', links: [BIRDS, PLAN],
  },
  {
    q_sq: 'A mund të planifikoj disa ditë në Divjakë?', q_en: 'Can I plan a few days in Divjakë?',
    a_sq: 'Te «Itinerari» zgjidhni 1–4 ditë, interesat, ritmin dhe si lëvizni. Plani ndërtohet nga vende të vërteta, me lindjen dhe perëndimin e diellit, vizatohet mbi hartë dhe ruhet në lidhje.',
    a_en: 'In “Itinerary” choose 1–4 days, your interests, your pace and how you get around. The plan is built from real places, around sunrise and sunset, drawn on the chart and kept in its link.',
    keywords: 'itinerar, itinerari, plan, planifikoj, program, cfare te bej, ku te shkoj, itinerary, plan my trip, trip planner, what to do, things to do, schedule, days', links: [PLAN],
    replaces: 'A mund të planifikoj disa ditë në Divjakë?',
  },
  {
    q_sq: 'Çfarë të bëj kur bie shi?', q_en: 'What can I do on a rainy day?',
    a_sq: 'Qendra e Vizitorëve, qyteti i Divjakës me Koleksionin Natyror të Altinit, kishat e Karavastasë ose dita kulturore në Ardenicë dhe Apoloni, dhe një darkë me peshk në hotel. Oraret e vendeve kontrollojini në vend.',
    a_en: 'The Visitor Centre, Divjakë town with Altin’s Nature Collection, the churches of Karavasta or the cultural day to Ardenica and Apollonia, and a fish dinner at the hotel. Check the places’ hours on the spot.',
    keywords: 'kur bie shi, dite me shi, shi, rainy day, rain, when it rains, what to do in bad weather', links: [EXP, PLAN],
  },
  { // policy is the operator's / the hotel's (NEEDS_VERIFICATION: cancellation terms) → hand-off
    q_sq: 'Çfarë ndodh me një eksperiencë nëse moti është i keq?', q_en: 'What happens to a tour in bad weather?',
    a_sq: 'Nëse moti e pengon një eksperiencë në natyrë (varkën, shpendët në agim, biçikletën), vendimin e merr organizatori. Si shtyhet ose anulohet, dhe çfarë ndodh me pagesën, e përcakton hoteli dhe jua konfirmon kur konfirmon rezervimin. Pyesni stafin me kodin e porosisë; parashikimin për 7 ditë e gjeni te «Tani në Divjakë».',
    a_en: 'If the weather stops an outdoor experience (the boat, the dawn birds, the bike ride), the organiser decides. How it is moved or cancelled, and what happens to your payment, is set by the hotel, which confirms it to you when it confirms your booking. Ask the staff with your order code; the 7-day forecast is on “Now in Divjakë”.',
    keywords: 'mot i keq, moti i keq, mot te keq, moti eshte i keq, ne mot te keq, nese moti, bad weather, in bad weather, if the weather, weather is bad, anulohet, anulohen, shtyhet, shtyhen, cancelled, canceled, called off, postponed, stuhi, storm, era e forte, strong wind', links: [NOW, TERMS, CONTACT], handoff: true,
  },

  /* ---------------- privacy, contact, this assistant ---------------- */
  {
    q_sq: 'Çfarë të dhënash ruani për mua?', q_en: 'What data do you keep about me?',
    a_sq: 'Pa cookies gjurmuese: statistikat janë të përgjithshme, në sajtin tonë. Kur porositni ruajmë emrin, emailin, telefonin dhe porosinë, që hoteli ta përmbushë. Shporta dhe zgjedhjet tuaja ruhen vetëm në shfletuesin tuaj. Të gjitha te «Privatësia».',
    a_en: 'No tracking cookies: statistics are aggregate, on our own site. When you order we keep your name, email, phone and the order so the hotel can fulfil it. Your cart and choices stay in your browser only. All of it under “Privacy”.',
    keywords: 'privatesia, te dhenat, te dhenat personale, cookies, gdpr, privacy, personal data, data protection, my data, tracking', links: [PRIVACY],
  },
  {
    q_sq: 'Si i fshij të dhënat e mia?', q_en: 'How do I delete my data?',
    a_sq: 'Shkruajini hotelit nga faqja e kontaktit dhe kërkoni fshirjen ose kopjen e të dhënave tuaja; hoteli përgjigjet sipas ligjit për mbrojtjen e të dhënave personale. Të dhënat në shfletues i fshini vetë te «Rezervimet e mia» → «Fshi të dhënat e mia nga ky shfletues».',
    a_en: 'Write to the hotel from the contact page and ask for your data to be deleted or for a copy; the hotel answers under the personal-data protection law. Data in your browser you clear yourself in “My bookings” → “Delete my data from this browser”.',
    keywords: 'fshij te dhenat, fshirje, fshi, kopje e te dhenave, delete my data, erase, remove my data, right to be forgotten, data request', links: [PRIVACY, CONTACT], handoff: true,
  },
  {
    q_sq: 'Si kontaktoj stafin e hotelit?', q_en: 'How do I contact the hotel staff?',
    a_sq: 'Shkruani te faqja e kontaktit, ose lini këtu emrin dhe emailin ose telefonin dhe stafi ju kontakton. Kanalet e tjera shfaqen atje sapo i konfirmon hoteli.',
    a_en: 'Write through the contact page, or leave your name and email or phone here and the staff will contact you. Other channels appear there as soon as the hotel confirms them.',
    keywords: 'kontakt, kontakti, telefon, numri, email, whatsapp, viber, si ju kontaktoj, contact, phone number, call, email address, reach you', links: [CONTACT], handoff: true,
  },
  {
    q_sq: 'A po flas me një njeri?', q_en: 'Am I talking to a person?',
    a_sq: 'Jo, jam asistenti automatik i sajtit: përgjigjem nga pyetjet e hotelit dhe nga burime të verifikuara, dhe, kur hoteli e ka aktivizuar, me ndihmën e një shërbimi të inteligjencës artificiale. Kur s’e di, ia kaloj pyetjen stafit me «Fol me stafin».',
    a_en: 'No, I am the site’s automatic assistant: I answer from the hotel’s questions and verified sources and, when the hotel has switched it on, with the help of an AI service. When I do not know, I pass your question to the staff with “Talk to the staff”.',
    keywords: 'je njeri, a je njeri, je robot, po flas me nje njeri, flas me nje robot, bot, ai, inteligjence artificiale, are you human, are you a bot, is this a bot, robot, real person, chatbot, talking to a person, talking to a human, machine', links: [],
  },
  {
    q_sq: 'Faleminderit!', q_en: 'Thank you!',
    a_sq: 'Ju lutem! Nëse ju lind një pyetje tjetër, jam këtu, në çdo orë.',
    a_en: 'You are welcome! If anything else comes up, I am here at any hour.',
    keywords: 'faleminderit, flm, rrofsh, shume faleminderit, thanks, thank you, thx, cheers', links: [],
  },
];

export default FAQ;

/* ------------------------------------------------------------------ npm run db:faq */

if (process.argv.includes('--sync')) {
  const { DatabaseSync } = await import('node:sqlite');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  // .env may name the database (DIVJAKA_DB) — read it the same way the server does, no secrets printed
  let envDb = process.env.DIVJAKA_DB;
  if (!envDb) {
    try { const m = /^DIVJAKA_DB=(.+)$/m.exec(fs.readFileSync(path.join(root, '.env'), 'utf8')); if (m) envDb = m[1].trim().replace(/^["']|["']$/g, ''); } catch { /* none */ }
  }
  const file = envDb ? path.resolve(root, envDb) : path.join(root, 'data', 'divjaka.db');
  if (!fs.existsSync(file)) { console.error(`[db:faq] no database at ${file} — run npm run db:seed first`); process.exit(1); }
  const { FAQ: BUILTIN } = await import('./catalogue.mjs');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA busy_timeout = 5000');
  const kw = (k) => (Array.isArray(k) ? k.join(', ') : k ?? null);
  const row = (f) => [f.q_sq, f.q_en, f.a_sq, f.a_en, kw(f.keywords), JSON.stringify(f.links ?? [])];
  const same = (r, f) => JSON.stringify([r.q_sq, r.q_en, r.a_sq, r.a_en, r.keywords, r.links]) === JSON.stringify(row(f));
  // What this script wrote last time, per row id (a sidecar next to the database): a row still
  // equal to it was not edited by the owner and may be refreshed. Rows from the plain seed (no
  // record yet) count as untouched only if they equal a version this file or the built-in list has.
  const { createHash } = await import('node:crypto');
  const sig = (r) => createHash('sha256').update(JSON.stringify([r.q_sq, r.q_en, r.a_sq, r.a_en, r.keywords, r.links])).digest('hex').slice(0, 24);
  const sidecar = `${file}.faq-seed.json`;
  let written = {};
  try { written = JSON.parse(fs.readFileSync(sidecar, 'utf8')); } catch { /* first run */ }
  const seedVersions = [...BUILTIN, ...FAQ];
  const pristine = (r) => (written[r.id] ? written[r.id] === sig(r) : seedVersions.some((f) => same(r, f)));
  const remember = (id) => { const r = db.prepare('SELECT * FROM faq WHERE id = ?').get(id); if (r) written[id] = sig(r); };
  const byQ = db.prepare('SELECT * FROM faq WHERE q_sq = ? OR q_en = ? ORDER BY id LIMIT 1');
  const ins = db.prepare('INSERT INTO faq (q_sq, q_en, a_sq, a_en, keywords, links, sort, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)');
  const upd = db.prepare('UPDATE faq SET q_sq = ?, q_en = ?, a_sq = ?, a_en = ?, keywords = ?, links = ?, sort = ? WHERE id = ?');
  const off = db.prepare('UPDATE faq SET active = 0 WHERE id = ?');
  const n = { added: 0, refreshed: 0, same: 0, kept: [], retired: 0 };
  db.exec('BEGIN IMMEDIATE');
  try {
    FAQ.forEach((f, i) => {
      const sort = 100 + i;
      const r = byQ.get(f.q_sq, f.q_en) ?? (f.replaces ? byQ.get(f.replaces, f.replaces) : undefined);
      if (!r) { const res = ins.run(...row(f), sort); remember(Number(res.lastInsertRowid)); n.added++; return; }
      if (same(r, f)) { if (!written[r.id] || pristine(r)) remember(r.id); n.same++; return; }
      if (pristine(r)) { upd.run(...row(f), sort, r.id); remember(r.id); n.refreshed++; return; }
      n.kept.push(`#${r.id} ${r.q_sq}`);
    });
    // built-in rows replaced by a differently worded entry: switch off only when untouched
    for (const b of BUILTIN) {
      if (FAQ.some((f) => f.q_sq === b.q_sq)) continue;
      const r = byQ.get(b.q_sq, b.q_en);
      if (r && r.active && pristine(r) && FAQ.some((f) => f.replaces === b.q_sq)) { off.run(r.id); n.retired++; }
    }
    db.exec('COMMIT');
    fs.writeFileSync(sidecar, JSON.stringify(written));
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const total = db.prepare('SELECT COUNT(*) AS c, SUM(active) AS a FROM faq').get();
  console.log(`[db:faq] ${path.relative(root, file) || file}: ${n.added} added, ${n.refreshed} refreshed, ${n.same} unchanged, ${n.retired} old built-ins switched off, ${n.kept.length} kept as edited by the owner${n.kept.length ? ` (${n.kept.join('; ')})` : ''}. Now ${total.c} rows, ${total.a} active.`);
  db.close();
}
