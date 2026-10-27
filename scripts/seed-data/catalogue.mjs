/**
 * Catalogue seed (T0, 2026-10-23). Every product is grounded in research; every number a guest
 * pays or relies on that no source gives (prices, unit counts, capacities, durations, schedules,
 * stock, gift-card limits, bundle contents) is a DEMO value: products are seeded with demo = 1
 * and every such value is listed in NEEDS_VERIFICATION.md ("Catalogue T0").
 *
 * FACT SOURCES (only `verified: true` entries are used):
 *   research/SPEC.md          the hotel's own document: modern rooms, bar-restaurant, the five
 *                             activity packages, dedicated guides for flora/fauna/history.
 *   research/business.json    hotel.room_types (3 Deluxe types H, Double M), hotel.setting,
 *                             hotel.restaurant (fish, eel), services (boat trips, bike hire at the
 *                             visitor centre, Pelican Island NOT sellable), prices (magnitudes).
 *   research/heritage.json    flora-01/02, lagoon-01/12, visit-01/02/06, park-04/22/23, birds-10/25,
 *                             hist-08/09/13/14/15/16, prac-06/13 (ids are cited in each product).
 *   research/seasons.json     months for birds (pelicans Jan–Jun, migration, wintering birds),
 *                             boats keep ~180 m from Pelican Island, fire risk Jul–Aug.
 *   research/geo.json         poi ids (chart pins). "pelican-tower" is NOT used: the bird hide at
 *                             40.9504 N is tagged destroyed in OSM (survey 2025-09-24).
 *   research/photos.json      image slugs; alt text = the photo's own verified caption, so a
 *                             photo of the beach on a room card never pretends to be the room.
 *
 * Body text: plain paragraphs separated by a blank line (no markdown). Kind-specific data the
 * views may use lives in `options` (README → Back end → products.options):
 *   room        min_nights, beds_sq/en, size_m2, sleeps, features_source
 *   experience  meeting {poi, sq, en}, excludes_sq/en [], sources [{title,url,publisher,accessed}],
 *               schedule_note_sq/en (how the seed timed the sessions)
 *   gift        amount_min, amount_max, amount_step
 *   any         sources [] — SourceList items for the numbers and dates in the body
 */

export const CATEGORIES = [
  { id: 'stays', name_sq: 'Qëndrime', name_en: 'Stays', sort: 1 },
  { id: 'experiences', name_sq: 'Eksperienca', name_en: 'Experiences', sort: 2 },
  { id: 'bundles', name_sq: 'Paketa me qëndrim', name_en: 'Stay bundles', sort: 3 },
  { id: 'gifts', name_sq: 'Dhurata', name_en: 'Gifts', sort: 4 },
  // Not "local products": no local producer is documented for Divjakë (business.json
  // product-honey-oil-wine-salt-crafts). The owner adds a category in the admin when there is one.
  { id: 'trip', name_sq: 'Për udhëtimin', name_en: 'For your trip', sort: 5 },
];

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const ACCESSED = '2026-10-23';

/** Sources (SourceList items). */
const S = {
  booking: { title: 'Hotel Pelikan, Divjakë', publisher: 'Booking.com', url: 'https://www.booking.com/hotel/al/pelikan-divjake.en-gb.html', accessed: ACCESSED },
  albaniavisit: { title: 'Hotel Pelikan', publisher: 'AlbaniaVisit', url: 'https://stay.albaniavisit.com/hotel-pelikan/', accessed: ACCESSED },
  atg: { title: 'Divjakë-Karavasta', publisher: 'Albania Travel Guide', url: 'https://albaniatravelguide.net/durres/divjake-karavasta/', accessed: ACCESSED },
  aktPine: { title: 'Divjaka coastal pine forest', publisher: 'Agjencia Kombëtare e Turizmit', url: 'https://akt.gov.al/en/attractions/Divjaka-coastal-pine-forest/', accessed: ACCESSED },
  aktPark: { title: 'Divjakë–Karavasta National Park', publisher: 'Agjencia Kombëtare e Turizmit', url: 'https://akt.gov.al/en/attractions/Divjake-Karavasta-National-Park/', accessed: ACCESSED },
  aktLagoon: { title: 'Karavasta lagoon', publisher: 'Agjencia Kombëtare e Turizmit', url: 'https://akt.gov.al/en/attractions/lagoon-of-karavasta/', accessed: ACCESSED },
  aktPelican: { title: 'Pelican Island', publisher: 'Agjencia Kombëtare e Turizmit', url: 'https://akt.gov.al/en/attractions/Pelican-Island/', accessed: ACCESSED },
  ramsar: { title: 'Ramsar Information Sheet, Karavasta lagoon ecosystem (1995)', publisher: 'Ramsar Convention', url: 'https://rsis.ramsar.org/RISapp/files/RISrep/AL781RIS.pdf', accessed: ACCESSED },
  osmVc: { title: 'NP Divjake-Karavasta Visitors Centre', publisher: 'OpenStreetMap', url: 'https://www.openstreetmap.org/way/292705751', accessed: ACCESSED },
  osmTower: { title: 'Kulla 360° (observation tower, height 35 m)', publisher: 'OpenStreetMap', url: 'https://www.openstreetmap.org/way/1124509421', accessed: ACCESSED },
  aosMarch: { title: 'Ornithological Friday in Divjaka-Karavasta National Park', publisher: 'Albanian Ornithological Society', url: 'https://aos-alb.org/ornithological-friday-in-divjaka-karavasta-national-park/', accessed: ACCESSED },
  aosCensus: { title: 'International Waterbird Census 2020 in Albania', publisher: 'Albanian Ornithological Society', url: 'https://aos-alb.org/completed-international-waterbirds-census-2020-in-albania-%e2%9c%94%ef%b8%8f/', accessed: ACCESSED },
  law81: { title: 'Ligji Nr. 81/2017 "Për zonat e mbrojtura"', publisher: 'IKMT', url: 'https://ikmt.gov.al/wp-content/uploads/2024/03/LIGJ_Nr_81_2017_Per_zonat_e_mbrojtura_1.pdf', accessed: ACCESSED },
  akt7: { title: 'The 7 churches of Karavasta', publisher: 'Agjencia Kombëtare e Turizmit', url: 'https://akt.gov.al/en/attractions/The-7-churches-of-Karavasta/', accessed: ACCESSED },
  medwet: { title: 'Karavasta Lagoon Ecosystem', publisher: 'MedWet Managers Network', url: 'https://medwetmanagers.net/marine-and-coastal-wetlands/karavasta-lagoon-ecosystem/', accessed: ACCESSED },
  wikiArdenica: { title: 'Ardenica Monastery', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Ardenica_Monastery', accessed: ACCESSED },
  aktArdenica: { title: 'Ardenica Monastery', publisher: 'Agjencia Kombëtare e Turizmit', url: 'https://akt.gov.al/en/attractions/Ardenice-Monastery-3/', accessed: ACCESSED },
  wikiApollonia: { title: 'Apollonia (Illyria)', publisher: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Apollonia_(Illyria)', accessed: ACCESSED },
  fish2023: { title: 'Overfishing and recent risk for collapse of fishery in Karavasta lagoon (Fisheries and Aquatic Sciences, 2023)', publisher: 'KoreaScience', url: 'https://koreascience.kr/article/JAKO202317843241828.do', accessed: ACCESSED },
  osm: { title: 'OpenStreetMap copyright and licence', publisher: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright', accessed: ACCESSED },
};

const HOTEL_MEET = { poi: 'hotel-pelikan', sq: 'Recepsioni i Hotel Pelikan', en: 'Hotel Pelikan reception' };
const VC_MEET = { poi: 'visitor-centre', sq: 'Hyrja e Qendrës së Vizitorëve Divjakë-Karavasta', en: 'Entrance of the Divjakë-Karavasta Visitor Centre' };

/* ------------------------------------------------------------------ rooms */

/**
 * research/business.json hotel.room_types (Booking.com + AlbaniaVisit, verified, high for the
 * three Deluxe types). Beds, sizes and features as listed; capacity = the room's name/beds
 * ("sleeps 4" is listed for the Quadruple). Base price = rounded low-season rate observed on
 * Booking.com for 6–7 Nov 2026 (4 079 / 4 985 / 5 892 ALL, breakfast included there). Unit
 * counts, the Double's price and every summer rate are DEMO.
 * `images`: photos of the setting (the hotel publishes no licensed room photos); their alt is
 * the photo's own caption.
 */
const FEATURES = {
  sq: ['Banjë private', 'Kondicioner', 'Televizor me ekran të sheshtë', 'Izolim akustik', 'Minibar', 'Wi-Fi falas'],
  en: ['Private bathroom', 'Air conditioning', 'Flat-screen TV', 'Soundproofing', 'Minibar', 'Free Wi-Fi'],
};
const SETTING_SQ = 'Hotel Pelikan ndodhet pranë detit dhe parkut me pisha, në skaj të Parkut Kombëtar Divjakë-Karavasta.';
const SETTING_EN = 'Hotel Pelikan is close to the sea and the pine park, on the edge of Divjakë-Karavasta National Park.';

/** High-season window used for the demo summer rates (month-day, inclusive). */
export const HIGH_SEASON = { from: '06-15', to: '09-15' };

export const ROOMS = [
  {
    slug: 'dhome-deluxe', name_sq: 'Dhomë Deluxe', name_en: 'Deluxe Room',
    summary_sq: 'Rreth 17 m², me një shtrat dopio të madh (queen) dhe ballkon me pamje, për dy persona.',
    summary_en: 'About 17 m² with a queen bed and a balcony with a view, for two.',
    body_sq: `Dhoma Deluxe ka një shtrat dopio të madh (queen), ballkon me pamje dhe banjë private, me kondicioner, televizor, minibar, izolim akustik dhe Wi-Fi falas.\n\n${SETTING_SQ}`,
    body_en: `The Deluxe Room has a queen bed, a balcony with a view and a private bathroom, with air conditioning, a flat-screen TV, a minibar, soundproofing and free Wi-Fi.\n\n${SETTING_EN}`,
    includes_sq: ['Ballkon me pamje', ...FEATURES.sq], includes_en: ['Balcony with a view', ...FEATURES.en],
    price: 4100, high: 6000, units: 8, capacity: 2, tags: ['couple', 'slow', 'beach'], sort: 1, featured: true, poi: 'hotel-pelikan',
    options: { min_nights: 1, beds_sq: '1 shtrat dopio i madh (queen)', beds_en: '1 queen bed', size_m2: 17, sleeps: 2, sources: [S.booking, S.albaniavisit] },
    images: ['beach-shelters', 'pine-forest-light'],
  },
  {
    slug: 'dhome-deluxe-treshe', name_sq: 'Dhomë Deluxe treshe', name_en: 'Deluxe Triple Room',
    summary_sq: 'Rreth 25 m², me dy shtretër, ballkon dhe tarracë, për tre persona.',
    summary_en: 'About 25 m² with two beds, a balcony and a terrace, for three.',
    body_sq: `Dhoma Deluxe treshe ka një shtrat njëvendësh dhe një shtrat dopio, ballkon, tarracë dhe banjë private, me kondicioner, televizor, minibar, izolim akustik dhe Wi-Fi falas.\n\n${SETTING_SQ}`,
    body_en: `The Deluxe Triple has a twin bed and a full-size double bed, a balcony, a terrace and a private bathroom, with air conditioning, a flat-screen TV, a minibar, soundproofing and free Wi-Fi.\n\n${SETTING_EN}`,
    includes_sq: ['Ballkon dhe tarracë', ...FEATURES.sq], includes_en: ['Balcony and terrace', ...FEATURES.en],
    price: 5000, high: 7000, units: 4, capacity: 3, tags: ['family', 'beach'], sort: 2, poi: 'hotel-pelikan',
    options: { min_nights: 1, beds_sq: '1 shtrat njëvendësh dhe 1 shtrat dopio', beds_en: '1 twin bed and 1 full bed', size_m2: 25, sleeps: 3, sources: [S.booking, S.albaniavisit] },
    images: ['beach-dunes', 'pine-forest-from-above'],
  },
  {
    slug: 'dhome-deluxe-katershe', name_sq: 'Dhomë Deluxe katërshe', name_en: 'Deluxe Quadruple Room',
    summary_sq: 'Rreth 25 m², me shtrat marinari dhe shtrat dopio të madh (queen), ballkon dhe tarracë, deri në katër persona.',
    summary_en: 'About 25 m² with a bunk bed and a queen bed, a balcony and a terrace, for up to four.',
    body_sq: `Dhoma Deluxe katërshe ka një shtrat marinari dhe një shtrat dopio të madh (queen), ballkon, tarracë dhe banjë private, me kondicioner, televizor, minibar, izolim akustik dhe Wi-Fi falas. Ka vend për deri në katër persona.\n\n${SETTING_SQ}`,
    body_en: `The Deluxe Quadruple has a bunk bed and a queen bed, a balcony, a terrace and a private bathroom, with air conditioning, a flat-screen TV, a minibar, soundproofing and free Wi-Fi. It sleeps up to four.\n\n${SETTING_EN}`,
    includes_sq: ['Ballkon dhe tarracë', ...FEATURES.sq], includes_en: ['Balcony and terrace', ...FEATURES.en],
    price: 5900, high: 8000, units: 4, capacity: 4, tags: ['family', 'beach'], sort: 3, poi: 'hotel-pelikan',
    options: { min_nights: 1, beds_sq: '1 shtrat marinari dhe 1 shtrat dopio i madh (queen)', beds_en: '1 bunk bed and 1 queen bed', size_m2: 25, sleeps: 4, sources: [S.booking, S.albaniavisit] },
    images: ['beach-from-tower', 'pine-forest-wetland'],
  },
  {
    // Listed on Booking.com with one full bed (medium confidence); not offered for 6–7 Nov 2026,
    // present on the summer 2027 grid; no size, features or price published. Seeded as a DRAFT:
    // the owner publishes it (with a real price) once they confirm it.
    slug: 'dhome-dyshe', name_sq: 'Dhomë dyshe', name_en: 'Double Room', status: 'draft',
    summary_sq: 'Dhomë për dy persona, me një shtrat dopio.',
    summary_en: 'A room for two with one full-size double bed.',
    body_sq: `Dhoma dyshe ka një shtrat dopio.\n\n${SETTING_SQ}`,
    body_en: `The Double Room has one full-size double bed.\n\n${SETTING_EN}`,
    includes_sq: [], includes_en: [],
    price: 3700, high: 5500, units: 2, capacity: 2, tags: ['couple', 'beach'], sort: 4, poi: 'hotel-pelikan',
    options: { min_nights: 1, beds_sq: '1 shtrat dopio', beds_en: '1 full bed', sleeps: 2, sources: [S.booking] },
    images: ['beach-shelters'],
  },
];

/* ------------------------------------------------------------ experiences */

/**
 * `schedule`: rules the seed turns into sessions 90 days ahead (Europe/Tirane wall clock).
 *   { days: [0=Sun…6], months?: [1–12] (default: the product's seasons), times: [slot…] }
 *   slot = 'HH:MM' | { sun: 'rise'|'set', offset: minutes, note: 'sunrise'|'sunset' }
 * Light-linked slots are computed for the hotel's position (business.json coordinates) and
 * rounded to 15 minutes; their session `note` is the machine key 'sunrise' / 'sunset'.
 */
export const EXPERIENCES = [
  {
    // SPEC: visits to Divjakë-Karavasta National Park with dedicated guides (flora, fauna, history).
    slug: 'parku-kombetar-me-guide', name_sq: 'Parku Kombëtar Divjakë-Karavasta me guidë', name_en: 'Divjakë-Karavasta National Park with a guide',
    summary_sq: 'Një mëngjes në park me një guidë të dedikuar: flora, fauna dhe historia e pyllit me pisha dhe e lagunës.',
    summary_en: 'A morning in the park with a dedicated guide: the flora, fauna and history of the pine forest and the lagoon.',
    body_sq: 'Guida ju takon në recepsionin e hotelit dhe vizita kalon nëpër pyllin me pisha deri te Qendra e Vizitorëve. Ky është i vetmi pyll natyror me pisha bregdetare në Shqipëri: pishë e butë vendase, me pishë të egër të sjellë nga Italia në fillim të shekullit XX.\n\nGjatë rrugës guida shpjegon florën, faunën dhe historinë e parkut dhe të zonës. Laguna e Karavastasë, rreth 42 km², është laguna më e madhe në Shqipëri dhe ndahet nga deti me një brez të gjatë ranor.',
    body_en: 'Your guide meets you at the hotel reception, and the visit leads through the pine forest to the Visitor Centre. This is the only natural coastal pine forest in Albania: native stone pine, with Aleppo pine brought from Italy early in the 20th century.\n\nOn the way the guide explains the flora, fauna and history of the park and the area. The Karavasta Lagoon, about 42 km², is the largest lagoon in Albania, cut off from the sea by a long strip of sand.',
    includes_sq: ['Guidë e dedikuar', 'Takimi në recepsionin e hotelit'], includes_en: ['A dedicated guide', 'Meeting at the hotel reception'],
    price: 1800, capacity: 12, duration_min: 150, tags: ['nature', 'family', 'culture', 'birds'], seasons: ALL_MONTHS, sort: 10, featured: true, poi: 'visitor-centre',
    options: {
      meeting: HOTEL_MEET,
      excludes_sq: ['Bileta e hyrjes në park, nëse kërkohet'], excludes_en: ['The park entrance ticket, where one is charged'],
      sources: [S.aktPine, S.ramsar, S.aktLagoon],
    },
    images: ['pine-forest-light', 'visitor-centre-garden'],
    schedule: [{ days: [2, 4, 6], times: ['09:30'] }],
  },
  {
    // SPEC: the Visitor Centre with dedicated guides. Kulla 360° (geo tower-360, high) stands
    // beside it; height 35 m (OSM) or 36 m (AKT): shown as a range. Best at sunset (AKT, visit-02).
    slug: 'qendra-e-vizitoreve-dhe-kulla-360', name_sq: 'Qendra e Vizitorëve dhe Kulla 360°', name_en: 'The Visitor Centre and the 360° Tower',
    summary_sq: 'Qendra e Vizitorëve e parkut dhe kulla panoramike prej druri: pamje 360° mbi pyllin, lagunën dhe detin.',
    summary_en: 'The park’s Visitor Centre and the wooden panoramic tower: a 360° view over the forest, the lagoon and the sea.',
    body_sq: 'Në Qendrën e Vizitorëve Divjakë-Karavasta njiheni me florën dhe faunën e parkut, me një person të dedikuar që shpjegon edhe historinë e zonës. Qendra ndodhet në rrugën e parkut, rreth 4 km në perëndim të qytetit të Divjakës.\n\nPranë saj ngrihet Kulla 360°, kullë vrojtimi prej druri 35–36 m e lartë (burimet japin shifra pak të ndryshme). Nga lart shihen pylli, laguna dhe deti. Pamja është më e bukura në perëndim të diellit, prandaj orari i mbrëmjes nis pak para tij.',
    body_en: 'At the Divjakë-Karavasta Visitor Centre you get to know the park’s flora and fauna, with a dedicated guide who also explains the history of the area. The centre is on the park road, about 4 km west of Divjakë town.\n\nBeside it stands the 360° Tower, a wooden lookout 35–36 m high (sources give slightly different figures). From the top you see the forest, the lagoon and the sea. The view is at its best at sunset, so the evening slot starts a little before it.',
    includes_sq: ['Guidë e dedikuar'], includes_en: ['A dedicated guide'],
    price: 900, capacity: 15, duration_min: 90, tags: ['nature', 'family', 'couple', 'slow', 'rainy'], seasons: ALL_MONTHS, sort: 11, featured: true, poi: 'tower-360',
    options: {
      meeting: VC_MEET,
      excludes_sq: ['Bileta e kullës, nëse kërkohet në vend'], excludes_en: ['The tower ticket, where one is charged on site'],
      sources: [S.osmVc, S.aktPark, S.osmTower],
      schedule_note_sq: 'Orari i mbrëmjes nis rreth një orë e një çerek para perëndimit të diellit.',
      schedule_note_en: 'The evening slot starts about an hour and a quarter before sunset.',
    },
    images: ['tower-360', 'beach-from-tower'],
    schedule: [
      { days: [2, 3, 4, 5, 6, 0], times: ['10:30'] },
      { days: [5, 6, 0], times: [{ sun: 'set', offset: -75, note: 'sunset' }] },
    ],
  },
  {
    // SPEC: Pelican Observation Tower → birdwatching. Pelican Island is closed (park-23); pelicans
    // nest Jan–Jun (birds-10); early morning is best (prac-13). Not run Jul–Aug (heat, fire watch,
    // young pelicans disperse; seasons.json). Viewpoints named: Kulla 360° and the boardwalk. The
    // Godulla bird hide is not named until the owner confirms it is open to the public
    // (NEEDS_VERIFICATION T7). The bird hide at 40.9504 N is destroyed (OSM) — never used.
    slug: 'shpendet-e-lagunes-ne-agim', name_sq: 'Shpendët e lagunës në agim', name_en: 'Lagoon birds at dawn',
    summary_sq: 'Vëzhgim shpendësh me guidë në agim, me dylbi. Nga janari në qershor, edhe pelikanët kaçurrelë, nga larg.',
    summary_en: 'Guided birdwatching at dawn, binoculars included. From January to June, Dalmatian pelicans too, from a distance.',
    body_sq: 'Nisemi pak para lindjes së diellit, kur uji është i qetë dhe drita e butë. Guida zgjedh pikat e vëzhgimit sipas stinës, si Kulla 360° ose shtegu prej druri mbi ujë.\n\nNga janari në qershor pelikanët kaçurrelë folezojnë në Ishullin e Pelikanit. Ishulli është gjithmonë i mbyllur për vizitorët, prandaj pelikanët i shohim vetëm nga larg, me dylbi, pa i shqetësuar. Në pranverë dhe në vjeshtë kalojnë shpendët shtegtarë, ndërsa në dimër laguna mbledh dhjetëra mijëra shpendë uji: 42 000 në numërimin e janarit 2020. Në mars 2020 vëzhguesit panë këtu flamingo, çafka, karabullakë të vegjël, huta të kënetës, rosa dhe shpendë bregujorë.\n\nNë korrik dhe në gusht ky tur nuk ofrohet.',
    body_en: 'We set off just before sunrise, when the water is calm and the light soft. The guide picks the viewpoints for the season, such as the 360° Tower or the wooden boardwalk over the water.\n\nFrom January to June Dalmatian pelicans nest on Pelican Island. The island is always closed to visitors, so we watch the pelicans only from a distance, through binoculars, without disturbing them. In spring and autumn migrants pass through, and in winter the lagoon gathers tens of thousands of waterbirds: 42,000 in the January 2020 census. In March 2020 birdwatchers saw flamingos, herons, pygmy cormorants, marsh harriers, ducks and waders here.\n\nThis tour does not run in July and August.',
    includes_sq: ['Guidë e dedikuar', 'Dylbi në përdorim gjatë turit', 'Takimi në recepsionin e hotelit'], includes_en: ['A dedicated guide', 'Binoculars for the tour', 'Meeting at the hotel reception'],
    price: 2200, capacity: 8, duration_min: 150, tags: ['birds', 'nature', 'couple', 'slow'], seasons: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12], sort: 12, featured: true, poi: 'tower-360',
    options: {
      meeting: HOTEL_MEET,
      excludes_sq: ['Bileta e hyrjes në park, nëse kërkohet'], excludes_en: ['The park entrance ticket, where one is charged'],
      sources: [S.aktPelican, S.aosCensus, S.aosMarch],
      schedule_note_sq: 'Ora e nisjes ndjek lindjen e diellit dhe ndryshon me stinën.',
      schedule_note_en: 'The start time follows sunrise and changes with the season.',
    },
    images: ['pelicans-karavasta', 'flamingos-flight'],
    schedule: [{ days: [3, 6, 0], times: [{ sun: 'rise', offset: -20, note: 'sunrise' }] }],
  },
  {
    // SPEC: the Karavasta Lagoon. Boat trips documented (AKT visit-06; ATG ~30 min ride from the
    // channel ~1 km east of the visitor centre; geo lagoon-boat-trips). Boats keep ~180 m from
    // Pelican Island (seasons year_round); boating is forbidden in the strictest core zone
    // (park-22). Price magnitude: ATG 300 ALL pp (6–10 people) or 1 500 ALL per boat (1–5).
    slug: 'shetitje-me-varke-ne-lagune', name_sq: 'Shëtitje me varkë në lagunë', name_en: 'Boat trip on the lagoon',
    summary_sq: 'Rreth 30 minuta në ujë, nëpër kanalet dhe ishujt me kallamishte të Lagunës së Karavastasë.',
    summary_en: 'About 30 minutes on the water, through the channels and reed islets of the Karavasta Lagoon.',
    body_sq: 'Varkat nisen nga pika e varkave në kanal, rreth 1 km në lindje të Qendrës së Vizitorëve. Shëtitja zgjat rreth 30 minuta dhe kalon nëpër kanale të fshehura e ishuj të mbuluar me kallamishte.\n\nVarka nuk i afrohet Ishullit të Pelikanit: ishulli është zonë e mbyllur dhe varkat qëndrojnë rreth 180 m larg. Në pjesët më të mbrojtura të parkut lundrimi është i ndaluar me ligj, prandaj varka ndjek vetëm ujërat ku lejohet.',
    body_en: 'The boats leave from the boat point on the canal, about 1 km east of the Visitor Centre. The trip lasts about 30 minutes and winds through hidden channels and reed-covered islets.\n\nThe boat does not approach Pelican Island: the island is a closed zone and boats stay about 180 m away. Boating is forbidden by law in the most protected parts of the park, so the boat keeps to the waters where it is allowed.',
    includes_sq: ['Shëtitja me varkë, rreth 30 minuta'], includes_en: ['The boat trip, about 30 minutes'],
    price: 500, capacity: 10, duration_min: 60, tags: ['nature', 'birds', 'family', 'couple'], seasons: [4, 5, 6, 7, 8, 9, 10], sort: 13, featured: true, poi: 'lagoon-boat-trips',
    options: {
      meeting: { poi: 'lagoon-boat-trips', sq: 'Pika e varkave në kanal, rreth 1 km në lindje të Qendrës së Vizitorëve', en: 'The boat point on the canal, about 1 km east of the Visitor Centre' },
      sources: [S.aktLagoon, S.atg, S.aktPelican, S.law81],
    },
    images: ['lagoon-boat-trips', 'lagoon-islets'],
    // Afternoon boat follows the sun: it starts 90 min before sunset and is back (60 min) before
    // dark — a fixed 17:00 slot was after sunset (16:45) in late October.
    schedule: [{ days: [0, 1, 2, 3, 4, 5, 6], times: ['10:00', { sun: 'set', offset: -90, note: 'sunset' }] }],
  },
  {
    // Cycling: AKT "paths for walking and cycling" (flora-02); bikes "can be rented in the
    // visitor's centre" (ATG, verified). The hotel's own bikes are not documented, so hire is
    // excluded and paid at the centre. Shaded paths (seasons year_round); shade to sea in a few
    // minutes (coast-03).
    slug: 'me-biciklete-neper-pyllin-me-pisha', name_sq: 'Me biçikletë nëpër pyllin me pisha', name_en: 'Cycling the pine forest',
    summary_sq: 'Një xhiro me guidë në shtigjet me hije të pyllit me pisha; biçikletat merren me qira në Qendrën e Vizitorëve.',
    summary_en: 'A guided ride on the shaded paths of the pine forest; bikes are hired at the park’s Visitor Centre.',
    body_sq: 'Pylli bregdetar i Divjakës, i vetmi pyll natyror me pisha bregdetare në Shqipëri, shtrihet përgjatë plazhit dhe ka shtigje me hije për ecje dhe biçikletë. Nga pylli deti është vetëm pak minuta larg.\n\nTakohemi te Qendra e Vizitorëve, ku biçikletat merren me qira; qiraja paguhet atje. Guida zgjedh rrugën sipas stinës dhe motit.',
    body_en: 'Divjaka’s coastal pine forest, the only natural coastal pine forest in Albania, runs along the beach and has shaded paths for walking and cycling. From the forest the sea is only a few minutes away.\n\nWe meet at the Visitor Centre, where bikes are hired; you pay the hire there. The guide picks the route for the season and the weather.',
    includes_sq: ['Guidë e dedikuar', 'Rruga e zgjedhur sipas stinës'], includes_en: ['A dedicated guide', 'A route chosen for the season'],
    price: 1500, capacity: 8, duration_min: 150, tags: ['active', 'nature', 'family'], seasons: [3, 4, 5, 6, 7, 8, 9, 10, 11], sort: 14, poi: 'infopoint',
    options: {
      meeting: VC_MEET,
      excludes_sq: ['Qiraja e biçikletës, që paguhet në Qendrën e Vizitorëve'], excludes_en: ['Bike hire, paid at the Visitor Centre'],
      sources: [S.aktPine, S.atg],
    },
    images: ['pine-forest-from-above', 'wooden-bridges-park'],
    schedule: [
      { days: [3, 6, 0], months: [3, 4, 5, 9, 10, 11], times: ['09:30'] },
      // Summer: earlier, out of the midday heat (July–August is also the peak fire-watch period).
      { days: [3, 6, 0], months: [6, 7, 8], times: ['08:00'] },
    ],
  },
  {
    // SPEC: cultural packages. 7 Churches of Karavasta e Re (hist-09, H); St Athanasius 1778
    // (hist-08, M); Ardenica 237 m, ~35 km (hist-13), founding date conflict shown as a range
    // (hist-15), Skanderbeg's wedding 21 Apr 1451 (hist-14); Apollonia ~52 km, ~600 BC (hist-16).
    slug: 'dite-kulturore-karavaste-ardenice-apoloni', name_sq: 'Ditë kulturore: Karavasta, Ardenica, Apolonia', name_en: 'A cultural day: Karavasta, Ardenica, Apollonia',
    summary_sq: 'Kishat e Karavastasë, Manastiri i Ardenicës dhe Apolonia antike: një ditë me guidë dhe transport nga hoteli.',
    summary_en: 'Karavasta’s churches, Ardenica Monastery and ancient Apollonia: one day with a guide and transport from the hotel.',
    body_sq: 'Ndalesa e parë është Karavasta e Re, me 7 kishat e Karavastasë të shekullit XVIII: arkitekturë e thjeshtë vendase dhe ikona me ndikime bizantine e ortodokse. Kisha e Shën Thanasit në Karavasta u ndërtua në vitin 1778.\n\nPastaj Manastiri i Ardenicës, mbi një kodër 237 m pranë rrugës Lushnjë–Fier, rreth 35 km nga Divjaka. Burimet nuk pajtohen për vitin e themelimit (nga shekulli XIII deri në vitin 1600), por pajtohen që këtu u martua Skënderbeu me Andronika Arianitin, më 21 prill 1451.\n\nDita mbyllet në Apoloni, pranë Pojanit, rreth 52 km nga Divjaka: qytet i themeluar rreth vitit 600 p.e.s. nga kolonë grekë, që më vonë lulëzoi si qytet romak dhe ku studioi i riu Augusti.',
    body_en: 'The first stop is Karavasta e Re and the 7 Churches of Karavasta, built in the 18th century: simple local architecture and icons with Byzantine and Orthodox influences. The Church of Saint Athanasius in Karavasta was built in 1778.\n\nNext comes Ardenica Monastery, on a 237 m hill by the Lushnjë–Fier road, about 35 km from Divjakë. Sources disagree on when it was founded (anywhere from the 13th century to 1600), but agree that Skanderbeg married Andronika Arianiti here on 21 April 1451.\n\nThe day ends at Apollonia, near Pojan, about 52 km from Divjakë: a city founded around 600 BC by Greek colonists that later flourished as a Roman city, where the young Augustus studied.',
    includes_sq: ['Guidë e dedikuar', 'Transport nga hoteli dhe kthim'], includes_en: ['A dedicated guide', 'Transport from the hotel and back'],
    price: 4000, capacity: 8, duration_min: 480, tags: ['culture', 'family', 'slow'], seasons: ALL_MONTHS, sort: 15, featured: true, poi: 'karavasta-village',
    options: {
      meeting: HOTEL_MEET,
      excludes_sq: ['Biletat e hyrjes në Ardenicë dhe Apoloni', 'Dreka'], excludes_en: ['Entrance tickets at Ardenica and Apollonia', 'Lunch'],
      sources: [S.akt7, S.medwet, S.wikiArdenica, S.aktArdenica, S.wikiApollonia],
    },
    images: ['ardenica-monastery', 'apollonia'],
    schedule: [{ days: [4, 0], times: ['09:00'] }],
  },
  {
    // SPEC: bar-restaurant. business.json hotel.restaurant (verified): "fish, eel and other local
    // specialities" (ATG). Lagoon species: lagoon-12. Whether the hotel's fish comes from the
    // lagoon is NOT confirmed, so the name does not claim it.
    slug: 'darke-me-peshk-ne-restorantin-e-hotelit', name_sq: 'Darkë me peshk në restorantin e hotelit', name_en: 'Fish dinner at the hotel restaurant',
    summary_sq: 'Një tavolinë në restorantin e Hotel Pelikan për një darkë me peshk dhe specialitete vendase.',
    summary_en: 'A table at the Hotel Pelikan restaurant for a dinner of fish and local specialities.',
    body_sq: 'Restoranti i hotelit shërben peshk, ngjalë dhe specialitete të tjera vendase. Llojet kryesore që peshkohen në Lagunën e Karavastasë janë ngjala, qefujt, koca dhe levreku.\n\nRezervimi ju mban tavolinën për orarin e zgjedhur. Menynë dhe çmimet e saj i konfirmon restoranti.',
    body_en: 'The hotel restaurant serves fish, eel and other local specialities. The main species caught in the Karavasta Lagoon are eel, grey mullet, gilthead seabream and sea bass.\n\nThe booking holds your table for the time you choose. The restaurant confirms the menu and its prices.',
    includes_sq: ['Darkë me peshk', 'Tavolinë e rezervuar'], includes_en: ['A fish dinner', 'A reserved table'],
    price: 2000, capacity: 20, duration_min: 120, tags: ['food', 'couple', 'family', 'slow', 'rainy'], seasons: ALL_MONTHS, sort: 16, poi: 'hotel-pelikan',
    options: {
      meeting: { poi: 'hotel-pelikan', sq: 'Restoranti i Hotel Pelikan', en: 'The Hotel Pelikan restaurant' },
      excludes_sq: ['Pijet'], excludes_en: ['Drinks'],
      sources: [S.atg, S.fish2023],
    },
    images: ['lagoon-fishing-boats', 'lagoon-fishermen-house'],
    schedule: [
      { days: [0, 1, 2, 3, 4, 5, 6], months: [1, 2, 3, 4, 5, 10, 11, 12], times: ['19:30'] },
      { days: [0, 1, 2, 3, 4, 5, 6], months: [6, 7, 8, 9], times: ['20:00'] },
    ],
  },
];

/* ---------------------------------------------------------------- gifts */

export const GIFTS = [
  {
    slug: 'karte-dhurate', name_sq: 'Kartë dhuratë', name_en: 'Gift card',
    summary_sq: 'Një kartë dhuratë për qëndrime dhe eksperienca te Hotel Pelikan. Vlerën e zgjidhni ju.',
    summary_en: 'A gift card for stays and experiences at Hotel Pelikan. You choose the value.',
    body_sq: 'Karta dhuratë përdoret te Hotel Pelikan për qëndrime dhe eksperienca.',
    body_en: 'The gift card is used at Hotel Pelikan for stays and experiences.',
    price: 5000, tags: ['couple', 'family'], seasons: ALL_MONTHS, sort: 30, category: 'gifts',
    options: { amount_min: 2000, amount_max: 50000, amount_step: 500 },
    images: ['lagoon-sunset'],
  },
];

/* -------------------------------------------------------------- bundles */

/**
 * A bundle holds no rooms or seats until dates are agreed with the hotel, so it is capped by
 * `stock` (T1 rule). Prices are DEMO, a little under the sum of their parts at base prices.
 */
export const BUNDLES = [
  {
    slug: 'fundjave-me-pelikanet', name_sq: 'Fundjavë me pelikanët', name_en: 'A weekend with the pelicans',
    summary_sq: 'Dy netë në Dhomë Deluxe për dy, shpendët e lagunës në agim dhe parku me guidë. Datat i caktoni me hotelin.',
    summary_en: 'Two nights in a Deluxe Room for two, lagoon birds at dawn and the park with a guide. You agree the dates with the hotel.',
    body_sq: 'Paketa përfshin dy netë në Dhomë Deluxe për dy persona, turin «Shpendët e lagunës në agim» për dy dhe vizitën «Parku Kombëtar Divjakë-Karavasta me guidë» për dy.\n\nNga janari në qershor pelikanët kaçurrelë folezojnë në lagunë: i shohim vetëm nga larg, sepse ishulli i tyre është i mbyllur. Pas porosisë hoteli ju kontakton për të caktuar datat.',
    body_en: 'The bundle includes two nights in a Deluxe Room for two, the “Lagoon birds at dawn” tour for two and the “Divjakë-Karavasta National Park with a guide” visit for two.\n\nFrom January to June Dalmatian pelicans nest on the lagoon: we watch them only from a distance, because their island is closed. After you order, the hotel contacts you to agree the dates.',
    price: 14900, stock: 5, tags: ['birds', 'couple', 'nature'], seasons: [1, 2, 3, 4, 5, 6], sort: 20, featured: true, poi: 'hotel-pelikan',
    options: { sources: [S.aktPelican] },
    items: [{ slug: 'dhome-deluxe', qty: 2 }, { slug: 'shpendet-e-lagunes-ne-agim', qty: 2 }, { slug: 'parku-kombetar-me-guide', qty: 2 }],
    images: ['pelicans-karavasta', 'lagoon-dusk'],
  },
  {
    slug: 'tri-dite-laguna-dhe-historia', name_sq: 'Tri ditë: laguna dhe historia', name_en: 'Three days: the lagoon and its history',
    summary_sq: 'Tri netë në Dhomë Deluxe për dy, shëtitje me varkë, një ditë kulturore dhe darkë me peshk. Datat i caktoni me hotelin.',
    summary_en: 'Three nights in a Deluxe Room for two, a boat trip, a cultural day and a fish dinner. You agree the dates with the hotel.',
    body_sq: 'Paketa përfshin tri netë në Dhomë Deluxe për dy persona dhe, për dy persona: shëtitjen me varkë në lagunë, ditën kulturore në Karavastë, Ardenicë dhe Apoloni, dhe një darkë me peshk në restorantin e hotelit.\n\nShëtitjet me varkë bëhen nga prilli në tetor. Pas porosisë hoteli ju kontakton për të caktuar datat.',
    body_en: 'The bundle includes three nights in a Deluxe Room for two and, for two people: the boat trip on the lagoon, the cultural day at Karavasta, Ardenica and Apollonia, and a fish dinner at the hotel restaurant.\n\nBoat trips run from April to October. After you order, the hotel contacts you to agree the dates.',
    price: 23500, stock: 3, tags: ['culture', 'nature', 'couple', 'food'], seasons: [4, 5, 6, 7, 8, 9, 10], sort: 21, poi: 'hotel-pelikan',
    items: [{ slug: 'dhome-deluxe', qty: 3 }, { slug: 'shetitje-me-varke-ne-lagune', qty: 2 }, { slug: 'dite-kulturore-karavaste-ardenice-apoloni', qty: 2 }, { slug: 'darke-me-peshk-ne-restorantin-e-hotelit', qty: 2 }],
    images: ['lagoon-sunset-footbridge', 'ardenica-monastery'],
  },
];

/* ---------------------------------------------------------------- goods */

export const GOODS = [
  {
    slug: 'dylbi-me-qira', name_sq: 'Dylbi me qira (1 ditë)', name_en: 'Binoculars to rent (1 day)',
    summary_sq: 'Dylbi për vëzhgimin e shpendëve, për një ditë. Merren dhe kthehen në recepsion.',
    summary_en: 'Binoculars for birdwatching, for one day. Picked up and returned at reception.',
    body_sq: 'Dylbitë merren në recepsionin e hotelit dhe kthehen po atë ditë. Turi «Shpendët e lagunës në agim» i ka dylbitë të përfshira.',
    body_en: 'Pick the binoculars up at the hotel reception and return them the same day. The “Lagoon birds at dawn” tour already includes binoculars.',
    price: 800, stock: 6, tags: ['birds', 'nature'], seasons: ALL_MONTHS, sort: 40,
    images: ['egret-lagoon'],
  },
  {
    slug: 'harta-e-lagunes', name_sq: 'Harta e Lagunës (printim)', name_en: 'The Lagoon Chart (print)',
    summary_sq: 'Printim i hartës sonë të Lagunës së Karavastasë: bregu, laguna, pylli dhe pikat kryesore të parkut.',
    summary_en: 'A print of our chart of the Karavasta Lagoon: the coast, the lagoon, the forest and the park’s main places.',
    body_sq: 'E njëjta hartë që shihni në këtë faqe, e vizatuar nga të dhënat e OpenStreetMap (© kontribuuesit e OpenStreetMap, ODbL). Merret në recepsion.',
    body_en: 'The same chart you see on this site, drawn from OpenStreetMap data (© OpenStreetMap contributors, ODbL). Collect it at reception.',
    price: 1500, stock: 25, tags: ['culture', 'birds', 'nature'], seasons: ALL_MONTHS, sort: 41,
    options: { sources: [S.osm] },
    images: ['lagoon-view-from-above'],
  },
  // No food or craft products: none is documented for Divjakë (business.json); the owner adds
  // them in the admin once real producers are confirmed.
];

/* --------------------------------------------------------------- offers */

/**
 * DEMO offers. The automatic one applies to room arrivals in the off-season window that the
 * seed computes (the current or next 1 Nov – 31 Mar). The promo code starts INACTIVE.
 */
export const OFFERS = [
  {
    name_sq: 'Jashtë sezonit: −10% nga 3 netë', name_en: 'Off-season: −10% from 3 nights',
    type: 'percent', value: 10, scope: { kinds: ['room'] }, min_nights: 3, code: null, window: 'off-season',
  },
  { name_sq: 'Kod mirëseardhjeje', name_en: 'Welcome code', type: 'percent', value: 10, scope: {}, min_total: 5000, code: 'MIRESEVINI10', max_uses: 200 },
];

/**
 * Third-party score shown as social proof (settings.proof). Verified in research/business.json
 * hotel.ratings (Booking.com 9.5, 601 reviews, re-observed 2026-10-23). Sub-scores are NOT
 * published (they conflict between feeds). Never quote review text.
 */
export const PROOF = {
  show: true,
  items: [
    {
      label_sq: 'Vlerësimi i mysafirëve në Booking.com', label_en: 'Guest score on Booking.com',
      value: '9.5/10', score: 9.5, scale: 10, count: 601,
      source_url: 'https://www.booking.com/hotel/al/pelikan-divjake.en-gb.html', date: '2026-10-23',
    },
  ],
};

/**
 * FAQ fallback — only facts from SPEC.md and how this platform works. T7 owns the real list in
 * scripts/seed-data/faq.mjs (default export or `FAQ`: [{q_sq,q_en,a_sq,a_en,keywords,links,sort}]);
 * the seed prefers it, then src/lib/assistant/kb/faq.json, then this.
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
    a_sq: 'Parkun Kombëtar Divjakë-Karavasta me guidë, Qendrën e Vizitorëve dhe Kullën 360°, shpendët e lagunës në agim, shëtitje me varkë në lagunë, biçikletë në pyllin me pisha, një ditë kulturore në Karavastë, Ardenicë dhe Apoloni, dhe darkë me peshk në restorantin e hotelit.',
    a_en: 'Divjakë-Karavasta National Park with a guide, the Visitor Centre and the 360° Tower, lagoon birds at dawn, a boat trip on the lagoon, cycling in the pine forest, a cultural day at Karavasta, Ardenica and Apollonia, and a fish dinner at the hotel restaurant.',
    keywords: 'paketa, aktivitete, eksperienca, ture, tours, activities, packages, experiences, guide, guida, varke, boat, biciklete, bike, zogj, birds', links: [{ key: 'experiences', label_sq: 'Eksperiencat', label_en: 'Experiences' }], sort: 2,
  },
  {
    q_sq: 'A mund të shkoj në Ishullin e Pelikanit?', q_en: 'Can I visit Pelican Island?',
    a_sq: 'Jo. Ishulli i Pelikanit është gjithmonë i mbyllur për vizitorët dhe varkat qëndrojnë rreth 180 m larg. Pelikanët shihen nga larg, sidomos nga janari në qershor, kur folezojnë.',
    a_en: 'No. Pelican Island is always closed to visitors and boats stay about 180 m away. You can watch the pelicans from a distance, especially from January to June, when they nest.',
    keywords: 'ishulli i pelikanit, pelican island, pelikan, pelican, ishull, island, vizite, visit', links: [{ key: 'experiences', label_sq: 'Eksperiencat', label_en: 'Experiences' }], sort: 3,
  },
  {
    q_sq: 'Si mund të paguaj?', q_en: 'How can I pay?',
    a_sq: 'Në arkë zgjidhni: pagesë në hotel, transferim bankar ose kartë. Mënyrat që ofrohen tani shfaqen në hapin e pagesës.',
    a_en: 'At checkout you choose: pay at the hotel, bank transfer or card. The methods offered right now are shown in the payment step.',
    keywords: 'pagese, paguaj, karte, kartë, transferte, transferim, banke, iban, pay, payment, card, bank transfer, cash', links: [{ key: 'checkout', label_sq: 'Arka', label_en: 'Checkout' }], sort: 4,
  },
  {
    q_sq: 'Si e gjej rezervimin tim?', q_en: 'How do I find my booking?',
    a_sq: 'Hapni «Rezervimet e mia» dhe shkruani kodin e porosisë (p.sh. DV-7K3Q9) dhe emailin që përdorët.',
    a_en: 'Open “My bookings” and enter your order code (e.g. DV-7K3Q9) and the email you used.',
    keywords: 'rezervimi im, porosia ime, kodi, gjej rezervimin, my booking, find booking, order code, booking code', links: [{ key: 'account', label_sq: 'Rezervimet e mia', label_en: 'My bookings' }], sort: 5,
  },
  {
    q_sq: 'Si mund të anuloj ose ndryshoj një rezervim?', q_en: 'How can I cancel or change a booking?',
    a_sq: 'Shkruajini stafit nga faqja e kontaktit me kodin e porosisë. Kushtet e anulimit janë te faqja «Kushtet».',
    a_en: 'Write to the staff from the contact page with your order code. The cancellation terms are on the “Terms” page.',
    keywords: 'anulim, anuloj, ndryshim, ndryshoj, cancel, cancellation, change booking, modify, rimbursim, refund', links: [{ key: 'terms', label_sq: 'Kushtet', label_en: 'Terms' }, { key: 'contact', label_sq: 'Kontakt', label_en: 'Contact' }], sort: 6,
  },
  {
    q_sq: 'Si është moti tani në Divjakë?', q_en: 'What is the weather like in Divjakë now?',
    a_sq: 'Faqja «Tani» tregon motin dhe erën nga MET Norway, temperaturën e detit nga NASA JPL MUR, dhe lindjen e perëndimin e diellit, të llogaritura për vendndodhjen e hotelit.',
    a_en: 'The “Now” page shows the weather and wind from MET Norway, the sea temperature from NASA JPL MUR, and sunrise and sunset, calculated for the hotel’s location.',
    keywords: 'moti, mot, temperatura, era, deti, weather, temperature, wind, sea temperature, sunset, perendimi', links: [{ key: 'now', label_sq: 'Tani', label_en: 'Now' }], sort: 7,
  },
  {
    q_sq: 'A mund të planifikoj disa ditë në Divjakë?', q_en: 'Can I plan a few days in Divjakë?',
    a_sq: 'Po. Planifikuesi i itinerarit ndërton një program ditë pas dite sipas interesave tuaja, dhe mund të shtoni në shportë çdo gjë që rezervohet.',
    a_en: 'Yes. The itinerary planner builds a day-by-day plan from your interests, and you can add anything bookable to your cart.',
    keywords: 'itinerar, plan, program, dite, itinerary, plan my trip, days, schedule', links: [{ key: 'itinerary', label_sq: 'Itinerari', label_en: 'Itinerary' }], sort: 8,
  },
  {
    q_sq: 'A ofroni karta dhuratë?', q_en: 'Do you offer gift cards?',
    a_sq: 'Po, kartat dhuratë blihen në dyqan dhe vlerën e zgjidhni ju.',
    a_en: 'Yes, gift cards are sold in the shop and you choose the value.',
    keywords: 'karte dhurate, dhurate, gift card, voucher, present, gift', links: [{ key: 'shop', label_sq: 'Dyqani', label_en: 'Shop' }], sort: 9,
  },
];
