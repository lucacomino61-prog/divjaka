/**
 * The five stops of the signature chart ("Laguna vizatohet", DESIGN §4), chosen from
 * research/geo.json high/medium-confidence places so the camera travels north from the hotel
 * through the forest to the Visitor Centre, east to the lagoon, then south-east to the
 * closed Pelican Island (a fact, not a destination: no route leg goes there).
 * Each sentence is ONE verified fact (research/heritage.json ids in `facts`).
 */
import { fromHotelKm, kmLabel, poi } from '../chart/geo';
import { ACCESSED, sourcesFor, type Lang } from '../heritage/facts';
import { findPublished } from '../../lib/catalog';
import { pname } from '../../lib/db/repo/products';
import { path } from '../../i18n/routes';
import { productUrl } from '../../lib/urls';
import { t } from '../../i18n/ui';
import type { Source } from '../site/SourceList.astro';

interface StopDef {
  key: string; poi: string; photo: string; facts: string[];
  /** camera radius around the stop in chart units */
  r: number;
  cta: { product?: string; route?: 'stay' | 'heritage-article'; slug?: string; label?: string };
  closed?: boolean;
  side?: 'left' | 'right';
  /** further sources; a title may differ by language */
  extra?: (Omit<Source, 'title'> & { title: string | Record<Lang, string> })[];
  /** the forest runs along the beach right behind the hotel (SPEC): no km to a chart spot */
  behind?: boolean;
}

const DEFS: StopDef[] = [
  { key: 'hotel', poi: 'hotel-pelikan', photo: 'beach-shelters', facts: ['coast-01'], r: 130, cta: { route: 'stay', label: 'home.stop.hotel.cta' }, side: 'left' },
  { key: 'forest', poi: 'pine-forest', photo: 'pine-forest-from-above', facts: ['flora-02'], r: 130, cta: { product: 'me-biciklete-neper-pyllin-me-pisha' }, side: 'right', behind: true },
  { key: 'tower', poi: 'tower-360', photo: 'tower-360', facts: ['visit-02'], extra: [{ title: { sq: 'Kulla 360° (OSM way 1124509421: lartësia 35 m, dru)', en: 'Kulla 360° (OSM way 1124509421: height 35 m, wood)' }, url: 'https://www.openstreetmap.org/way/1124509421', publisher: 'OpenStreetMap', accessed: ACCESSED }], r: 130, cta: { product: 'qendra-e-vizitoreve-dhe-kulla-360' }, side: 'left' },
  { key: 'lagoon', poi: 'lagoon-boat-trips', photo: 'lagoon-boat-trips', facts: ['lagoon-01', 'visit-06'], r: 150, cta: { product: 'shetitje-me-varke-ne-lagune' }, side: 'right' },
  { key: 'island', poi: 'pelican-island', photo: 'pelicans-karavasta', facts: ['birds-10', 'park-23'], r: 210, cta: { route: 'heritage-article', slug: 'pelikani-kacurrel', label: 'home.stop.island.cta' }, closed: true, side: 'right' },
];

export interface Stop {
  key: string; n: string; poi: string; x: number; y: number; r: number;
  name: string; kicker: string; text: string; photo: string;
  km: number | null; distance: string; /** a measured straight line (adds 'as the crow flies') */ crow: boolean; approx: boolean; closed: boolean; side: 'left' | 'right';
  cta: { href: string; label: string };
  sources: Source[];
}

export function stops(lang: Lang): Stop[] {
  const out: Stop[] = [];
  DEFS.forEach((d) => {
    const p = poi(d.poi);
    if (!p) return; // never invent a position
    let href = path('experiences', lang), label = '';
    if (d.cta.route === 'stay') { href = path('stay', lang); label = t(lang, d.cta.label!); }
    else if (d.cta.route === 'heritage-article' && d.cta.slug) { href = path('article', lang, { slug: d.cta.slug }); label = t(lang, d.cta.label!); }
    else if (d.cta.product) {
      const prod = findPublished(d.cta.product);
      if (prod) { href = productUrl(prod.kind, prod.slug, lang); label = pname(prod, lang); }
      else label = t(lang, 'home.exp.all');
    }
    const km = d.key === 'hotel' ? 0 : d.behind ? null : fromHotelKm(d.poi);
    const distance = d.key === 'hotel' ? t(lang, 'home.sig.start') : d.behind ? t(lang, 'home.sig.behind') : t(lang, 'home.sig.from', { km: kmLabel(km, lang) });
    out.push({
      key: d.key, n: String(out.length + 1).padStart(2, '0'), poi: d.poi, x: p.x, y: p.y, r: d.r,
      name: t(lang, `home.stop.${d.key}.name`), kicker: t(lang, `home.stop.${d.key}.kicker`), text: t(lang, `home.stop.${d.key}.text`),
      photo: d.photo, km, distance, crow: d.key !== 'hotel' && km != null,
      approx: km != null && p.confidence === 'low', closed: !!d.closed, side: d.side ?? 'right',
      cta: { href, label }, sources: [...sourcesFor(d.facts), ...(d.extra ?? []).map((x) => ({ ...x, title: typeof x.title === 'string' ? x.title : x.title[lang] }))],
    });
  });
  return out;
}
