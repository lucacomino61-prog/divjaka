/**
 * places.ts — the itinerary planner's knowledge base (T7). Only REAL places and activities:
 * every place is a research/geo.json POI (or a far site with its research drive time), every
 * claim points at a verified research/heritage.json fact (`facts`), and bookable activities name
 * a catalogue slug (prices, seats and times come from the database at render time).
 *
 * Never routed: pelican-island (closed to the public, park-23) and pelican-tower (the bird hide
 * on the barrier, tagged destroyed in OSM); the Godulla bird hide is held back (`unconfirmed`)
 * until the owner confirms public access. Opening hours: none of the facilities has an official
 * schedule (visit-08), so `hours: 'check'` prints "kontrolloni oraret".
 */
export type Interest = 'birds' | 'nature' | 'beach' | 'culture' | 'food' | 'active';
export type Slot = 'dawn' | 'morning' | 'afternoon' | 'sunset' | 'evening';
export type Transport = 'car' | 'bike' | 'foot';

export interface Activity {
  id: string;
  /** chart point (research/geo.json id); null for places off the chart */
  poi: string | null;
  name: { sq: string; en: string };
  slots: Slot[];
  minutes: number;
  interests: Interest[];
  /** months it makes sense (1–12) */
  months: number[];
  /** catalogue product that books it (sessions with seats come from the DB) */
  product?: string;
  /** off the chart: road distance and minutes from Divjakë town (research), plus the hotel → town leg */
  far?: { km: number; min: number; fact: string };
  /** public access not confirmed by the owner: never planned until the flag is removed */
  unconfirmed?: boolean;
  /** can be done without booking the product (the place is open to everyone) */
  selfOk?: boolean;
  /** the activity itself moves you there (a tour with transport from the hotel) */
  transportIncluded?: boolean;
  /** daylight: done on your own it ends by sunset ('sunset') or by civil dusk ('dusk', the sunset viewpoint) */
  daylight?: 'sunset' | 'dusk';
  /** opening hours: 'open' (outdoors, any time of day), 'check' (no official hours), 'session' (bookable times) */
  hours: 'open' | 'check' | 'session';
  kids: boolean;
  /** fills the whole day (morning + afternoon) */
  fullDay?: boolean;
  /** why it fits — written from the facts listed (verified ids only) */
  why: { sq: string; en: string };
  facts: string[];
  /** POIs whose OpenStreetMap entry backs the wording (cited as sources) */
  osm?: string[];
  /** extra line for some months (e.g. pelican nesting) */
  monthNote?: { months: number[]; sq: string; en: string; facts: string[] };
  base: number;
}

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const NESTING = [1, 2, 3, 4, 5, 6];

export const ACTIVITIES: Activity[] = [
  {
    // the product's own poi (catalogue: Kulla 360°), so the plan's map and the product page agree
    id: 'dawn-birds', daylight: 'sunset', poi: 'tower-360', product: 'shpendet-e-lagunes-ne-agim',
    name: { sq: 'Shpendët e lagunës në agim', en: 'Lagoon birds at dawn' },
    slots: ['dawn'], minutes: 150, interests: ['birds', 'nature'], months: [1, 2, 3, 4, 5, 6, 9, 10, 11, 12],
    hours: 'session', kids: false, base: 3,
    why: {
      sq: 'Herët në mëngjes uji është i qetë dhe drita e mirë: kështu e rekomandojnë guidat për vëzhgimin e shpendëve.',
      en: 'Early in the morning the water is calm and the light good: that is when guides recommend watching the birds.',
    },
    facts: ['prac-13'],
    monthNote: { months: NESTING, sq: 'Janar–qershor pelikanët folezojnë në Ishullin e Pelikanit; shihen vetëm nga larg, ishulli është i mbyllur.', en: 'January–June the pelicans nest on Pelican Island; you watch them from a distance only, the island is closed.', facts: ['birds-10', 'park-23'] },
  },
  {
    // Held back: nothing verified says the hide is open to the public, and the catalogue does not
    // name it either. Remove `unconfirmed` once the owner confirms access (NEEDS_VERIFICATION).
    id: 'bird-hide', poi: 'bird-hide-godulla', unconfirmed: true,
    name: { sq: 'Vendvëzhgimi i zogjve te Godulla', en: 'The bird hide at Godulla' },
    slots: ['dawn', 'morning', 'afternoon'], minutes: 75, interests: ['birds'], months: ALL,
    hours: 'check', daylight: 'sunset', kids: true, base: 2,
    why: {
      sq: 'OpenStreetMap shënon një vendvëzhgim zogjsh pranë molit të Godullës; aksesin dhe oraret kontrollojini në vend. Merrni dylbitë dhe qëndroni të qetë.',
      en: 'OpenStreetMap marks a bird hide by the Godulla pier; check access and hours on the spot. Bring binoculars and keep quiet.',
    },
    facts: [], osm: ['bird-hide-godulla', 'pier-godulla'],
    monthNote: { months: NESTING, sq: 'Në këtë stinë pelikanët janë në ishull (janar–qershor); mbani distancë nga ujërat e mbrojtura.', en: 'In this season the pelicans are on their island (January–June); keep away from the protected waters.', facts: ['birds-10'] },
  },
  {
    id: 'visitor-centre', poi: 'visitor-centre', product: 'qendra-e-vizitoreve-dhe-kulla-360', selfOk: true,
    name: { sq: 'Qendra e Vizitorëve dhe Kulla 360°', en: 'The Visitor Centre and the 360° Tower' },
    slots: ['morning', 'afternoon'], minutes: 90, interests: ['nature', 'birds', 'culture'], months: ALL,
    hours: 'check', kids: true, base: 3,
    why: {
      sq: 'Qendra e parkut, rreth 4 km me rrugë nga qyteti, ju njeh me florën dhe faunën e tij; pranë saj ngrihet kulla panoramike prej druri.',
      en: 'The park’s centre, about 4 km by road from town, introduces its flora and fauna; the wooden panoramic tower stands beside it.',
    },
    facts: ['visit-01'], osm: ['tower-360'],
  },
  {
    id: 'tower-sunset', daylight: 'dusk', poi: 'tower-360', product: 'qendra-e-vizitoreve-dhe-kulla-360', selfOk: true,
    name: { sq: 'Perëndimi nga Kulla 360°', en: 'Sunset from the 360° Tower' },
    slots: ['sunset'], minutes: 75, interests: ['nature', 'birds'], months: ALL,
    hours: 'check', kids: true, base: 4,
    why: {
      sq: 'Nga kulla 35–36 m shihen pylli, laguna dhe deti njëherësh; pamja më e bukur është në perëndim të diellit.',
      en: 'From the 35–36 m tower you see the forest, the lagoon and the sea at once; the view is best at sunset.',
    },
    facts: ['visit-02'],
  },
  {
    id: 'boardwalk', daylight: 'sunset', poi: 'boardwalk',
    name: { sq: 'Shtegu prej druri mbi ujë', en: 'The wooden boardwalk' },
    slots: ['morning', 'afternoon'], minutes: 45, interests: ['nature', 'birds'], months: ALL,
    hours: 'open', kids: true, base: 1,
    why: {
      sq: 'Shtegu prej druri lidh Qendrën e Vizitorëve me kanalin e varkave; me biçikletë, këshillohet ta shtyni mbi dërrasa.',
      en: 'The boardwalk links the Visitor Centre with the boat canal; on a bike you are asked to push it over the planks.',
    },
    facts: ['prac-12'], osm: ['boardwalk'],
  },
  {
    id: 'boat', daylight: 'sunset', poi: 'lagoon-boat-trips', product: 'shetitje-me-varke-ne-lagune',
    name: { sq: 'Shëtitje me varkë në lagunë', en: 'A boat trip on the lagoon' },
    slots: ['morning', 'afternoon'], minutes: 60, interests: ['nature', 'birds'], months: [4, 5, 6, 7, 8, 9, 10],
    hours: 'session', kids: true, base: 3,
    why: {
      sq: 'Varkat çojnë në ujërat e qeta të lagunës, nëpër kanale dhe ishuj me kallamishte.',
      en: 'The boats take you onto the lagoon’s calm water, through channels and reed islets.',
    },
    facts: ['visit-06'],
    monthNote: { months: NESTING, sq: 'Ishulli i Pelikanit është i mbyllur për publikun; pelikanët, që folezojnë atje deri në qershor, shihen nga turet me varkë aty pranë, nga larg.', en: 'Pelican Island is closed to the public; the pelicans, which nest there until June, are watched from the boat tours nearby, from a distance.', facts: ['park-23', 'birds-10'] },
  },
  {
    id: 'pines-walk', daylight: 'sunset', poi: 'pine-forest',
    name: { sq: 'Ecje nëpër pyllin me pisha', en: 'A walk in the pine forest' },
    slots: ['morning', 'afternoon'], minutes: 90, interests: ['nature', 'active'], months: ALL,
    hours: 'open', kids: true, base: 2,
    why: {
      sq: 'I vetmi pyll natyror me pisha bregdetare në Shqipëri, me shtigje për ecje dhe biçikletë përgjatë plazhit.',
      en: 'Albania’s only natural coastal pine forest, with paths for walking and cycling along the beach.',
    },
    facts: ['flora-02', 'flora-01'],
  },
  {
    id: 'bike-tour', daylight: 'sunset', poi: 'infopoint', product: 'me-biciklete-neper-pyllin-me-pisha',
    name: { sq: 'Me biçikletë nëpër pyllin me pisha', en: 'By bike through the pine forest' },
    slots: ['morning'], minutes: 150, interests: ['active', 'nature'], months: [3, 4, 5, 6, 7, 8, 9, 10, 11],
    hours: 'session', kids: true, base: 2,
    why: {
      sq: 'Pylli ka shtigje për biçikletë. Çiklistët kanë hartuar një xhiro të lehtë rreth lagunës nga Divjaka dhe një më të gjatë nga Qendra e Vizitorëve.',
      en: 'The forest has cycling paths. Cyclists have mapped an easy loop round the lagoon from Divjakë and a longer one from the Visitor Centre.',
    },
    facts: ['flora-02', 'prac-12'],
  },
  {
    id: 'guided-park', daylight: 'sunset', poi: 'visitor-centre', product: 'parku-kombetar-me-guide',
    name: { sq: 'Parku Kombëtar me guidë', en: 'The National Park with a guide' },
    slots: ['morning'], minutes: 150, interests: ['nature', 'birds', 'culture'], months: ALL,
    hours: 'session', kids: true, base: 2,
    why: {
      sq: 'Një guidë ju tregon florën, faunën dhe historinë e parkut, siç i përshkruan hoteli paketat e tij.',
      en: 'A guide explains the park’s flora, fauna and history, as the hotel describes its packages.',
    },
    facts: ['visit-01'],
  },
  {
    id: 'beach', daylight: 'sunset', poi: 'divjaka-beach',
    name: { sq: 'Plazhi i Divjakës', en: 'Divjaka beach' },
    slots: ['afternoon', 'morning', 'sunset'], minutes: 120, interests: ['beach', 'nature'], months: ALL,
    hours: 'open', kids: true, base: 3,
    why: {
      sq: 'Rërë e imët dhe ujë i qetë brenda parkut, me pishat pas shpine: nga hija te deti brenda pak minutash.',
      en: 'Fine sand and calm water inside the park, with the pines behind you: from shade to the sea in a few minutes.',
    },
    facts: ['coast-01', 'coast-03'],
  },
  {
    id: 'town', poi: 'divjake-centre',
    name: { sq: 'Qyteti i Divjakës', en: 'Divjakë town' },
    slots: ['morning', 'afternoon'], minutes: 75, interests: ['culture'], months: ALL,
    hours: 'check', kids: true, base: 1,
    why: {
      sq: 'Qyteti, rreth 5 km nga deti, përmendet në dokumentet osmane të viteve 1441–1445. Aty është edhe Koleksioni Natyror i Altinit, muze privat.',
      en: 'The town, about 5 km from the sea, appears in Ottoman records of 1441–1445. Altin’s Nature Collection, a private museum, is there too.',
    },
    facts: ['hist-02', 'hist-03'], osm: ['altin-nature-collection'],
  },
  {
    id: 'karavasta', daylight: 'sunset', poi: 'karavasta-village',
    name: { sq: 'Kishat e Karavastasë', en: 'The churches of Karavasta' },
    slots: ['morning', 'afternoon'], minutes: 90, interests: ['culture'], months: ALL,
    hours: 'check', kids: true, base: 2,
    why: {
      sq: '"7 kishat e Karavastasë" në Karavasta e Re janë të shekullit XVIII; kisha e Shën Thanasit në Karavasta u ndërtua më 1778.',
      en: 'The "7 Churches of Karavasta" in Karavasta e Re date from the 18th century; St Athanasius in Karavasta was built in 1778.',
    },
    facts: ['hist-09', 'hist-08'],
  },
  {
    id: 'cultural-day', poi: 'karavasta-village', product: 'dite-kulturore-karavaste-ardenice-apoloni', transportIncluded: true, fullDay: true,
    name: { sq: 'Ditë kulturore: Karavasta, Ardenica, Apolonia', en: 'Cultural day: Karavasta, Ardenica, Apollonia' },
    slots: ['morning'], minutes: 480, interests: ['culture'], months: ALL,
    hours: 'session', kids: true, base: 3,
    why: {
      sq: 'Një ditë me transport nga hoteli: kishat e Karavastasë, Manastiri i Ardenicës ku u martua Skënderbeu më 1451, dhe Apolonia e themeluar rreth vitit 600 p.e.s.',
      en: 'A day with transport from the hotel: the churches of Karavasta, Ardenica Monastery where Skanderbeg married in 1451, and Apollonia, founded around 600 BC.',
    },
    facts: ['hist-09', 'hist-14', 'hist-16'],
  },
  {
    id: 'ardenica', daylight: 'sunset', poi: null, far: { km: 35, min: 40, fact: 'hist-13' },
    name: { sq: 'Manastiri i Ardenicës', en: 'Ardenica Monastery' },
    slots: ['morning', 'afternoon'], minutes: 75, interests: ['culture'], months: ALL,
    hours: 'check', kids: true, base: 2,
    why: {
      sq: 'Mbi një kodër 237 m buzë rrugës Lushnjë–Fier; këtu u martua Skënderbeu më 21 prill 1451. Data e themelimit ndryshon sipas burimeve (shek. XIII–1600).',
      en: 'On a 237 m hill by the Lushnjë–Fier road; Skanderbeg married here on 21 April 1451. Its founding date differs by source (13th century to 1600).',
    },
    facts: ['hist-13', 'hist-14', 'hist-15'],
  },
  {
    id: 'apollonia', daylight: 'sunset', poi: null, far: { km: 52, min: 55, fact: 'hist-16' },
    name: { sq: 'Apolonia', en: 'Apollonia' },
    slots: ['morning', 'afternoon'], minutes: 150, interests: ['culture'], months: ALL,
    hours: 'check', kids: true, base: 2,
    why: {
      sq: 'Qytet i themeluar rreth vitit 600 p.e.s. nga kolonë grekë, më vonë qytet romak ku studioi i riu Augusti.',
      en: 'A city founded around 600 BC by Greek colonists, later a Roman city where the young Augustus studied.',
    },
    facts: ['hist-16'],
  },
  {
    id: 'dinner', poi: 'hotel-pelikan', product: 'darke-me-peshk-ne-restorantin-e-hotelit',
    name: { sq: 'Darkë me peshk në hotel', en: 'Fish dinner at the hotel' },
    slots: ['evening'], minutes: 120, interests: ['food'], months: ALL,
    hours: 'session', kids: true, base: 2,
    why: {
      sq: 'Kuzhina e Divjakës ndërthur detin dhe tokën: ngjalë, levrek dhe karkaleca nga laguna dhe Adriatiku.',
      en: 'Divjaka cooking mixes sea and land: eel, sea bass and shrimp from the lagoon and the Adriatic.',
    },
    facts: ['hist-21', 'lagoon-12'],
  },
];

/** Interests in the URL (Albanian values, same vocabulary as the shop's ?interes=). */
export const INTEREST_PARAM: Record<string, Interest> = {
  zogj: 'birds', natyre: 'nature', plazh: 'beach', kulture: 'culture', ushqim: 'food', aktiv: 'active',
  birds: 'birds', nature: 'nature', beach: 'beach', culture: 'culture', food: 'food', active: 'active',
};
export const INTEREST_VALUE: Record<Interest, string> = { birds: 'zogj', nature: 'natyre', beach: 'plazh', culture: 'kulture', food: 'ushqim', active: 'aktiv' };

/** Travel speeds (km/h) and the road factor on straight-line chart distances. */
export const SPEED: Record<Transport, number> = { car: 35, bike: 12, foot: 4.5 };
export const ROAD_FACTOR = 1.35;
/** Longest single leg we plan for each way of moving (km, straight line). */
export const MAX_LEG: Record<Transport, number> = { car: 999, bike: 14, foot: 4 };
