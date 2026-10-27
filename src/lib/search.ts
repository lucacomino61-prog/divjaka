/**
 * Site search across products, FAQ, heritage articles and the main pages.
 * Accent-folded (ë→e, ç→c), case-insensitive, token + prefix matching with light stemming.
 */
import { all } from './db/index';
import { listProducts, pname, psummary } from './db/repo/products';
import { articles } from './content';
import { fold, snippet, stem, tokens } from './text';
import { path, productUrl, type Lang } from './urls';
import type { RouteKey } from '../i18n/routes';
import { faqText } from './assistant/holds';

export interface SearchResult { type: 'product' | 'article' | 'faq' | 'page'; title: string; url: string; snippet: string; score?: number }

/** Page names for search (navigation labels from PLAN §4). */
const PAGES: { key: RouteKey; sq: string; en: string; kw: string }[] = [
  { key: 'stay', sq: 'Qëndrimi — Hotel Pelikan', en: 'Stay — Hotel Pelikan', kw: 'hotel dhoma dhome rooms room stay qendrim fjetje bar restorant restaurant' },
  { key: 'experiences', sq: 'Eksperienca', en: 'Experiences', kw: 'eksperienca ture tur vizita guide guida park laguna lagoon pelikan tower kulla' },
  { key: 'shop', sq: 'Dyqani', en: 'Shop', kw: 'dyqan shop blej buy produkte products dhurate gift karte card' },
  { key: 'itinerary', sq: 'Itinerari', en: 'Itinerary planner', kw: 'itinerar itinerary plan planner dite days program' },
  { key: 'heritage', sq: 'Trashëgimia', en: 'Heritage', kw: 'trashegimi heritage natyre nature histori history zogj birds flora fauna' },
  { key: 'now', sq: 'Tani në Divjakë', en: 'Divjakë now', kw: 'tani now mot weather moti era wind deti sea temperature temperatura live' },
  { key: 'contact', sq: 'Kontakt', en: 'Contact', kw: 'kontakt contact telefon phone email adresa address harta map' },
  { key: 'account', sq: 'Rezervimet e mia', en: 'My bookings', kw: 'rezervim rezervimet booking bookings porosi order kod code' },
  { key: 'terms', sq: 'Kushtet', en: 'Terms', kw: 'kushte terms anulim cancellation politika policy' },
  { key: 'privacy', sq: 'Privatësia', en: 'Privacy', kw: 'privatesi privacy te dhena data' },
  { key: 'credits', sq: 'Kreditet', en: 'Credits', kw: 'kredite credits foto photo licenca license' },
];

interface Doc { type: SearchResult['type']; title: string; url: string; fields: { text: string; w: number }[]; snipFrom: string; snipLen?: number }

/**
 * Where an FAQ result leads. No public page lists the FAQ (it is the assistant's knowledge base),
 * so the result card carries the whole answer as its snippet and the link goes to the first
 * same-site page the row itself names ("links", as the assistant shows them), else to Contact.
 * Never a #fragment that no page renders.
 */
function faqUrl(links: string | null, lang: Lang): string {
  try {
    for (const l of JSON.parse(links || '[]') as { key?: string; url?: string; params?: Record<string, string> }[]) {
      let url = l.url ?? '';
      if (!url && l.key) { try { url = path(l.key as RouteKey, lang, l.params ?? {}); } catch { url = ''; } }
      if (/^\/(?![/\\])/.test(url)) return url;
    }
  } catch { /* malformed links: fall back */ }
  return path('contact', lang);
}

function scoreDoc(doc: Doc, qt: string[], qStems: string[], phrase: string): number {
  let score = 0;
  for (const f of doc.fields) {
    const ft = fold(f.text);
    if (phrase.length >= 3 && ft.includes(phrase)) score += 4 * f.w;
    const words = ft.split(/[^a-z0-9]+/).filter(Boolean);
    const wordStems = new Set(words.map(stem));
    qt.forEach((t, i) => {
      if (words.includes(t)) score += 2 * f.w;
      else if (wordStems.has(qStems[i])) score += 1.5 * f.w;
      else if (t.length >= 3 && words.some((w) => w.startsWith(t))) score += 1 * f.w;
    });
  }
  return score;
}

export function search(q: string, lang: Lang, limit = 20): SearchResult[] {
  const qt = tokens(q, { min: 2 });
  if (!qt.length) return [];
  const qStems = qt.map(stem);
  const phrase = fold(q).trim();
  const docs: Doc[] = [];

  for (const p of listProducts()) {
    const name = pname(p, lang);
    docs.push({
      type: 'product', title: name, url: productUrl(p.kind, p.slug, lang),
      fields: [
        { text: `${p.name_sq} ${p.name_en}`, w: 3 },
        { text: `${p.tags.join(' ')} ${p.kind} ${p.category ?? ''}`, w: 2 },
        { text: `${p.summary_sq ?? ''} ${p.summary_en ?? ''}`, w: 1.2 },
        { text: `${lang === 'en' ? p.body_en ?? '' : p.body_sq ?? ''}`, w: 0.6 },
      ],
      snipFrom: psummary(p, lang) || (lang === 'en' ? p.body_en : p.body_sq) || '',
    });
  }

  const faq = all<{ id: number; q_sq: string; q_en: string; a_sq: string; a_en: string; keywords: string | null; links: string | null }>('SELECT * FROM faq WHERE active = 1');
  for (const f of faq) {
    docs.push({
      type: 'faq', title: (lang === 'en' ? f.q_en : f.q_sq) || f.q_sq || f.q_en, url: faqUrl(f.links, lang),
      fields: [{ text: `${f.q_sq ?? ''} ${f.q_en ?? ''}`, w: 2.5 }, { text: f.keywords ?? '', w: 2 }, { text: faqText(lang === 'en' ? f.a_en ?? '' : f.a_sq ?? ''), w: 1 }],
      snipFrom: faqText((lang === 'en' ? f.a_en : f.a_sq) ?? ''), snipLen: 400,
    });
  }

  for (const a of articles().filter((x) => x.lang === lang)) {
    docs.push({
      type: 'article', title: a.title, url: path('article', lang, { slug: a.slug }),
      fields: [{ text: a.title, w: 3 }, { text: a.description, w: 1.5 }, { text: a.body, w: 0.5 }],
      snipFrom: a.description || a.body,
    });
  }

  for (const pg of PAGES) {
    docs.push({ type: 'page', title: pg[lang], url: path(pg.key, lang), fields: [{ text: `${pg.sq} ${pg.en}`, w: 2.5 }, { text: pg.kw, w: 1.5 }], snipFrom: '' });
  }

  return docs
    .map((d) => ({ d, s: scoreDoc(d, qt, qStems, phrase) }))
    .filter((x) => x.s >= 1.5)
    .sort((a, b) => b.s - a.s || a.d.title.localeCompare(b.d.title))
    .slice(0, limit)
    .map(({ d, s }) => ({ type: d.type, title: d.title, url: d.url, snippet: d.snipFrom ? snippet(d.snipFrom, qt, d.snipLen) : '', score: Math.round(s * 10) / 10 }));
}
