/**
 * Catalogue seed. FACT SOURCES: research/SPEC.md (the hotel's own document) for what exists —
 * Hotel Pelikan has modern rooms and a bar-restaurant; activity packages: cultural visits,
 * Divjakë-Karavasta National Park, Karavasta Lagoon, Pelican Observation Tower, Visitor Centre
 * with dedicated guides. EVERYTHING ELSE here (room types, unit counts, capacities, prices,
 * durations, schedules, stock, local goods, bundle, gift-card amounts) is an invented working
 * value: demo = 1 and listed in NEEDS_VERIFICATION.md. Summaries only restate SPEC facts.
 * When research/business.json has verified room types, scripts/seed.mjs uses those instead.
 */

export const CATEGORIES = [
  { id: 'stays', name_sq: 'Qëndrime', name_en: 'Stays', sort: 1 },
  { id: 'experiences', name_sq: 'Eksperienca', name_en: 'Experiences', sort: 2 },
  { id: 'bundles', name_sq: 'Paketa', name_en: 'Bundles', sort: 3 },
  { id: 'gifts', name_sq: 'Dhurata', name_en: 'Gifts', sort: 4 },
  { id: 'local', name_sq: 'Produkte vendase', name_en: 'Local products', sort: 5 },
];

const hotelLine = {
  sq: 'Hotel Pelikan ndodhet pranë detit dhe parkut me pisha.',
  en: 'Hotel Pelikan is close to the sea and the pine park.',
};

/**
 * Room types, beds, sizes and in-room features: research/business.json `hotel.room_types`
 * (Booking.com + AlbaniaVisit listings, confidence high). Base prices: the low-season rates
 * observed on Booking.com for 6–7 Nov 2026 (4 079 / 4 985 / 5 892 ALL, medium confidence),
 * rounded. Unit counts and the summer rates are DEMO (the hotel publishes neither).
 * "Double Room" is listed but was not offered, so it is left out.
 */
const ROOM_FEATURES = {
  sq: ['Ballkon', 'Pamje', 'Kondicioner', 'Banjë private', 'Televizor', 'Izolim akustik', 'Minibar', 'Wi-Fi falas'],
  en: ['Balcony', 'View', 'Air conditioning', 'Private bathroom', 'Flat-screen TV', 'Soundproofing', 'Minibar', 'Free Wi-Fi'],
};
export const ROOMS = [
  {
    slug: 'dhome-deluxe', name_sq: 'Dhomë Deluxe', name_en: 'Deluxe Room',
    summary_sq: `Dhomë moderne me një shtrat queen, rreth 17 m². ${hotelLine.sq}`, summary_en: `A modern room with one queen bed, about 17 m². ${hotelLine.en}`,
    includes_sq: ROOM_FEATURES.sq, includes_en: ROOM_FEATURES.en,
    price: 4100, units: 8, capacity: 2, tags: ['couple', 'slow', 'beach'], sort: 1, featured: true,
    options: { min_nights: 1, beds_sq: '1 shtrat queen', beds_en: '1 queen bed', size_m2: 17 },
    rates: [{ from: '07-01', to: '08-31', price: 5500 }], photoHints: ['hotel', 'room', 'pine', 'beach'],
  },
  {
    slug: 'dhome-deluxe-treshe', name_sq: 'Dhomë Deluxe treshe', name_en: 'Deluxe Triple Room',
    summary_sq: `Dhomë moderne për tre persona, me tarracë, rreth 25 m². ${hotelLine.sq}`, summary_en: `A modern room for three with a terrace, about 25 m². ${hotelLine.en}`,
    includes_sq: ['Tarracë', ...ROOM_FEATURES.sq], includes_en: ['Terrace', ...ROOM_FEATURES.en],
    price: 5000, units: 4, capacity: 3, tags: ['family', 'beach'], sort: 2,
    options: { min_nights: 1, beds_sq: '1 shtrat tek + 1 dopio', beds_en: '1 twin + 1 full bed', size_m2: 25 },
    rates: [{ from: '07-01', to: '08-31', price: 6500 }], photoHints: ['hotel', 'room', 'beach'],
  },
  {
    slug: 'dhome-deluxe-katershe', name_sq: 'Dhomë Deluxe katërshe', name_en: 'Deluxe Quadruple Room',
    summary_sq: `Dhomë moderne për familje deri në katër persona, me tarracë, rreth 25 m². ${hotelLine.sq}`, summary_en: `A modern room for families of up to four with a terrace, about 25 m². ${hotelLine.en}`,
    includes_sq: ['Tarracë', ...ROOM_FEATURES.sq], includes_en: ['Terrace', ...ROOM_FEATURES.en],
    price: 5900, units: 4, capacity: 4, tags: ['family', 'beach'], sort: 3,
    options: { min_nights: 1, beds_sq: '1 marinare + 1 shtrat queen', beds_en: '1 bunk bed + 1 queen bed', size_m2: 25 },
    rates: [{ from: '07-01', to: '08-31', price: 7500 }], photoHints: ['hotel', 'room'],
  },
];

const guide = {
  sq: 'Me një person të dedikuar që shpjegon florën, faunën dhe historinë e parkut dhe të zonës.',
  en: 'With a dedicated guide who explains the flora, fauna and history of the park and the area.',
};

/** weekly: [weekday 0=Sun…6, 'HH:MM'] pairs used to generate sessions 90 days ahead. */
export const EXPERIENCES = [
  {
    slug: 'parku-kombetar-divjake-karavasta', name_sq: 'Vizitë në Parkun Kombëtar Divjakë-Karavasta', name_en: 'Divjakë-Karavasta National Park visit',
    summary_sq: `Vizitë në Parkun Kombëtar Divjakë-Karavasta. ${guide.sq}`, summary_en: `A visit to Divjakë-Karavasta National Park. ${guide.en}`,
    price: 1500, capacity: 15, duration_min: 150, tags: ['nature', 'birds', 'family', 'active'], sort: 10, featured: true,
    weekly: { days: [2, 4, 6], times: ['09:00'] }, photoHints: ['park', 'pine', 'forest'],
  },
  {
    slug: 'laguna-e-karavastase', name_sq: 'Laguna e Karavastasë', name_en: 'Karavasta Lagoon',
    summary_sq: `Vizitë në Lagunën e Karavastasë. ${guide.sq}`, summary_en: `A visit to the Karavasta Lagoon. ${guide.en}`,
    price: 2000, capacity: 12, duration_min: 180, tags: ['birds', 'nature', 'couple'], sort: 11, featured: true,
    weekly: { days: [3, 6, 0], times: ['08:30'] }, photoHints: ['lagoon', 'karavasta'],
  },
  {
    slug: 'kulla-e-vezhgimit-te-pelikaneve', name_sq: 'Kulla e Vëzhgimit të Pelikanëve', name_en: 'Pelican Observation Tower',
    summary_sq: `Vizitë në Kullën e Vëzhgimit të Pelikanëve. ${guide.sq}`, summary_en: `A visit to the Pelican Observation Tower. ${guide.en}`,
    price: 1200, capacity: 10, duration_min: 120, tags: ['birds', 'couple', 'slow'], sort: 12, featured: true,
    weekly: { days: [0, 1, 2, 3, 4, 5, 6], times: ['08:00', '16:30'] }, photoHints: ['pelican', 'tower'],
  },
  {
    slug: 'qendra-e-vizitoreve', name_sq: 'Qendra e Vizitorëve Divjakë-Karavasta', name_en: 'Divjakë-Karavasta Visitor Centre',
    summary_sq: `Vizitë e udhëhequr në Qendrën e Vizitorëve Divjakë-Karavasta. ${guide.sq}`, summary_en: `A guided visit to the Divjakë-Karavasta Visitor Centre. ${guide.en}`,
    price: 800, capacity: 20, duration_min: 60, tags: ['culture', 'family', 'rainy', 'nature'], sort: 13,
    weekly: { days: [2, 3, 4, 5, 6, 0], times: ['10:00', '14:00'] }, photoHints: ['visitor', 'centre', 'center'],
  },
  {
    slug: 'vizite-kulturore', name_sq: 'Vizitë kulturore në zonën e Divjakës', name_en: 'Cultural visit in the Divjaka area',
    summary_sq: 'Paketë kulturore në zonën e Divjakës, me një person të dedikuar. Itinerari konfirmohet nga hoteli.',
    summary_en: 'A cultural package in the Divjaka area, with a dedicated guide. The itinerary is confirmed by the hotel.',
    price: 2500, capacity: 12, duration_min: 240, tags: ['culture', 'food', 'family'], sort: 14,
    weekly: { days: [5, 0], times: ['10:00'] }, photoHints: ['culture', 'church', 'monastery', 'village'],
  },
];

export const GIFTS = [
  {
    slug: 'karte-dhurate', name_sq: 'Kartë dhuratë', name_en: 'Gift card',
    summary_sq: 'Kartë dhuratë për qëndrime dhe eksperienca te Hotel Pelikan.', summary_en: 'A gift card for stays and experiences at Hotel Pelikan.',
    price: 5000, tags: ['couple', 'family'], sort: 30, options: { amount_min: 2000, amount_max: 50000, amount_step: 500 }, category: 'gifts', photoHints: ['lagoon', 'pelican'],
  },
];

export const BUNDLES = [
  {
    slug: 'fundjave-me-pelikanet', name_sq: 'Fundjavë me pelikanët', name_en: 'A weekend with the pelicans',
    summary_sq: 'Dy netë në Dhomë Deluxe dhe vizitë në Kullën e Vëzhgimit të Pelikanëve për dy persona. Datat caktohen me hotelin.',
    summary_en: 'Two nights in a Deluxe Room and a Pelican Observation Tower visit for two. Dates are arranged with the hotel.',
    price: 10000, stock: 5, tags: ['birds', 'couple'], sort: 20, featured: true, // stock: DEMO cap (a bundle holds no rooms/seats until dates are set, so sales must be capped)
    items: [{ slug: 'dhome-deluxe', qty: 2 }, { slug: 'kulla-e-vezhgimit-te-pelikaneve', qty: 2 }], photoHints: ['pelican', 'lagoon'],
  },
];

export const GOODS = [
  {
    slug: 'dylbi-me-qira', name_sq: 'Dylbi me qira (1 ditë)', name_en: 'Binoculars to rent (1 day)',
    summary_sq: 'Dylbi për vëzhgimin e zogjve, merren dhe kthehen në recepsion.', summary_en: 'Binoculars for birdwatching, picked up and returned at reception.',
    price: 800, stock: 6, tags: ['birds', 'active'], sort: 40, photoHints: ['birdwatching', 'binocular'],
  },
  {
    slug: 'harta-e-lagunes', name_sq: 'Harta e lagunës (printim)', name_en: 'Lagoon chart (print)',
    summary_sq: 'Printim i hartës së Lagunës së Karavastasë.', summary_en: 'A print of the Karavasta Lagoon chart.',
    price: 1500, stock: 25, tags: ['culture', 'birds'], sort: 41, photoHints: ['map', 'lagoon'],
  },
  // No local producers are documented yet (research/business.json ask_owner), so no food
  // products are seeded; the owner adds them in the admin once real producers are confirmed.
];

/** Automatic offer + promo code (demo). */
export const OFFERS = [
  { name_sq: 'Qëndrim i gjatë: −10% nga 3 netë', name_en: 'Longer stay: −10% from 3 nights', type: 'percent', value: 10, scope: { kinds: ['room'] }, min_nights: 3, code: null },
  { name_sq: 'Kod mirëseardhjeje', name_en: 'Welcome code', type: 'percent', value: 10, scope: {}, min_total: 5000, code: 'MIRESEVINI10', max_uses: 200 },
];

/**
 * FAQ seed — only facts from SPEC.md and how this platform works. T7 extends it through
 * src/lib/assistant/kb/faq.json (array of {q_sq,q_en,a_sq,a_en,keywords,links,sort}) which
 * the seed loads instead when it exists.
 */
export const FAQ = [
  {
    q_sq: 'Çfarë është Hotel Pelikan?', q_en: 'What is Hotel Pelikan?',
    a_sq: 'Hotel Pelikan është një strukturë akomoduese me mbi 20 vite eksperiencë në zonën e Divjakës, pranë detit dhe parkut me pisha, me dhoma moderne dhe shërbime bar-restoranti.',
    a_en: 'Hotel Pelikan is an accommodation business with over 20 years of experience in the Divjaka area, close to the sea and the pine park, with modern rooms and a bar-restaurant.',
    keywords: 'hotel pelikan, hotel, rreth jush, about, kush jeni, who are you, pervoje, experience years', links: [{ key: 'stay', label_sq: 'Qëndrimi', label_en: 'Stay' }], sort: 1,
  },
  {
    q_sq: 'Çfarë paketash aktivitetesh ofroni?', q_en: 'Which activity packages do you offer?',
    a_sq: 'Vizita kulturore, vizita në Parkun Kombëtar Divjakë-Karavasta, në Lagunën e Karavastasë, në Kullën e Vëzhgimit të Pelikanëve dhe në Qendrën e Vizitorëve, me persona të dedikuar që shpjegojnë florën, faunën dhe historinë e zonës.',
    a_en: 'Cultural visits and visits to Divjakë-Karavasta National Park, the Karavasta Lagoon, the Pelican Observation Tower and the Visitor Centre, with dedicated guides who explain the flora, fauna and history of the area.',
    keywords: 'paketa, aktivitete, eksperienca, ture, tours, activities, packages, experiences, guide, guida', links: [{ key: 'experiences', label_sq: 'Eksperiencat', label_en: 'Experiences' }], sort: 2,
  },
  {
    q_sq: 'Si mund të paguaj?', q_en: 'How can I pay?',
    a_sq: 'Në arkë zgjidhni: pagesë në hotel, transfertë bankare ose kartë. Mënyrat që ofrohen tani shfaqen në hapin e pagesës.',
    a_en: 'At checkout you choose: pay at the hotel, bank transfer or card. The methods offered right now are shown in the payment step.',
    keywords: 'pagese, paguaj, karte, kartë, transferte, banke, iban, pay, payment, card, bank transfer, cash', links: [{ key: 'checkout', label_sq: 'Arka', label_en: 'Checkout' }], sort: 3,
  },
  {
    q_sq: 'Si e gjej rezervimin tim?', q_en: 'How do I find my booking?',
    a_sq: 'Hapni "Rezervimet e mia" dhe shkruani kodin e porosisë (p.sh. DV-7K3Q9) dhe email-in që përdorët.',
    a_en: 'Open "My bookings" and enter your order code (e.g. DV-7K3Q9) and the e-mail you used.',
    keywords: 'rezervimi im, porosia ime, kodi, gjej rezervimin, my booking, find booking, order code, booking code', links: [{ key: 'account', label_sq: 'Rezervimet e mia', label_en: 'My bookings' }], sort: 4,
  },
  {
    q_sq: 'Si mund të anuloj ose ndryshoj një rezervim?', q_en: 'How can I cancel or change a booking?',
    a_sq: 'Shkruani stafit nga faqja e kontaktit me kodin e porosisë. Kushtet e anulimit janë te faqja "Kushtet".',
    a_en: 'Write to the staff from the contact page with your order code. The cancellation terms are on the "Terms" page.',
    keywords: 'anulim, anuloj, ndryshim, ndryshoj, cancel, cancellation, change booking, modify, rimbursim, refund', links: [{ key: 'terms', label_sq: 'Kushtet', label_en: 'Terms' }, { key: 'contact', label_sq: 'Kontakt', label_en: 'Contact' }], sort: 5,
  },
  {
    q_sq: 'Si është moti tani në Divjakë?', q_en: 'What is the weather like in Divjakë now?',
    a_sq: 'Faqja "Tani" tregon motin, erën, temperaturën e detit, lindjen dhe perëndimin e diellit, të përditësuara nga Open-Meteo.',
    a_en: 'The "Now" page shows the weather, wind, sea temperature, sunrise and sunset, updated from Open-Meteo.',
    keywords: 'moti, mot, temperatura, era, deti, weather, temperature, wind, sea temperature, sunset, perendimi', links: [{ key: 'now', label_sq: 'Tani', label_en: 'Now' }], sort: 6,
  },
  {
    q_sq: 'A mund të planifikoj disa ditë në Divjakë?', q_en: 'Can I plan a few days in Divjakë?',
    a_sq: 'Po. Planifikuesi i itinerarit ndërton një program ditë pas dite sipas interesave tuaja, dhe mund të shtoni në shportë çdo gjë që rezervohet.',
    a_en: 'Yes. The itinerary planner builds a day-by-day plan from your interests, and you can add anything bookable to your cart.',
    keywords: 'itinerar, plan, program, dite, itinerary, plan my trip, days, schedule', links: [{ key: 'itinerary', label_sq: 'Itinerari', label_en: 'Itinerary' }], sort: 7,
  },
  {
    q_sq: 'A ofroni karta dhuratë?', q_en: 'Do you offer gift cards?',
    a_sq: 'Po, kartat dhuratë blihen në dyqan dhe vlera zgjidhet nga ju.',
    a_en: 'Yes, gift cards are sold in the shop and you choose the value.',
    keywords: 'karte dhurate, dhurate, gift card, voucher, present, gift', links: [{ key: 'shop', label_sq: 'Dyqani', label_en: 'Shop' }], sort: 8,
  },
];
