/**
 * Assistant engine (POST /api/assistant). T7 owns the knowledge base (faq table content,
 * src/lib/assistant/kb/**) and the chat UI; this file is the engine.
 *
 * Order of work for one message:
 *   1. contact details given → save a messages row (kind 'assistant'), thank the visitor.
 *   2. dates in the message → live availability (rooms, or experience sessions when the
 *      message is about a tour/visit), priced by pricing.ts.
 *   3. FAQ match (accent folding, keyword phrases + token overlap, sq/en stop words).
 *   4. "recommend / what to do" → recommend() with interests read from the message.
 *   5. availability words without dates → ask for dates.
 *   6. ANTHROPIC_API_KEY set → Claude grounded on FAQ + facts (claude.ts).
 *   7. otherwise → miss: logs assistant_miss and offers a hand-off to staff.
 *
 * Copy: default strings below; T7 may override any of them by exporting `strings`
 * ({sq:{key:text}, en:{key:text}}) from src/lib/assistant/kb/strings.ts.
 */
import { z } from 'zod';
import { all, run } from '../db/index';
import { zEmail, zLine } from '../http';
import { listProducts, pname, primaryImage } from '../db/repo/products';
import { getSetting } from '../db/repo/settings';
import { roomRangeLeft, roomsVerified, sessionsMonth, type SessionInfo } from '../availability';
import { MAX_NIGHTS, quote } from '../pricing';
import { recommend } from '../recommend';
import { cleanPath, serverEvent } from '../analytics';
import { fold, stems, tokens } from '../text';
import { parseDates } from './dates';
import { askClaude, claudeEnabled } from './claude';
import { addDays, daysBetween, nowIso, today as todayStr } from '../time';
import { path, productUrl, type Lang } from '../urls';
import { money, formatDate, formatRange, nights as nightsWord } from '../../i18n/format';
import type { RouteKey } from '../../i18n/routes';

export const zAssistantBody = z.object({
  lang: z.enum(['sq', 'en']).default('sq'),
  message: z.string().trim().min(1).max(600),
  context: z
    .object({
      path: z.string().max(300).optional(),
      product: z.string().max(120).optional(),
      interests: z.array(z.string().max(30)).max(12).optional(),
      cart: z.array(z.string().max(120)).max(40).optional(),
      history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1200) })).max(12).optional(),
      sid: z.string().max(64).optional(),
    })
    .partial()
    .optional(),
  contact: z
    .object({
      name: zLine(120).optional(),
      email: zEmail.optional(),
      phone: zLine(40).optional(),
      question: z.string().trim().max(1000).optional(),
    })
    .optional(),
});
export type AssistantInput = z.infer<typeof zAssistantBody>;

export interface AssistantLink { label: string; url: string }
export interface AssistantProduct { slug: string; kind: string; name: string; url: string; image: string | null; price: number; left?: number | null; total?: number; when?: string }
export interface AssistantReply {
  reply: string; chips: string[]; links: AssistantLink[]; products: AssistantProduct[];
  intent: 'contact' | 'availability' | 'sessions' | 'faq' | 'recommend' | 'ask_dates' | 'llm' | 'handoff' | 'miss' | 'greeting';
  handoff: boolean;
  dates?: { from: string; to: string; nights: number; guests: number | null };
}

const DEFAULT_STRINGS = {
  sq: {
    greeting: 'Përshëndetje! Pyesni për dhomat, eksperiencat në park dhe lagunë, pagesat ose rezervimet tuaja.',
    rooms_free: 'Për {range} ({nights}) kemi të lira:',
    rooms_none: 'Për {range} nuk kemi dhoma të lira online. Provoni data të tjera ose lini kontaktin dhe stafi ju shkruan.',
    sessions_free: 'Oraret me vende të lira për {date}:',
    sessions_none: 'Për {date} nuk ka orare me vende të lira online.',
    ask_dates: 'Për cilat data? Shkruani p.sh. "12–14 korrik" ose "e premte për 2 netë".',
    recommend: 'Disa ide që mund t\'ju pëlqejnë:',
    miss: 'Nuk e di përgjigjen me siguri. Dëshironi që t\'ju kontaktojë stafi i hotelit? Lini emrin dhe email-in ose telefonin.',
    handoff: 'Sigurisht. Lini emrin dhe email-in ose telefonin, dhe stafi i hotelit ju kontakton.',
    contact_saved: 'Faleminderit! Mesazhi u dërgua te stafi i Hotel Pelikan. Do t\'ju kontaktojnë sa më shpejt.',
    contact_missing: 'Na duhet një email ose numër telefoni që stafi t\'ju kontaktojë.',
    chip_rooms: 'Dhoma për fundjavën',
    chip_tours: 'Çfarë eksperiencash keni?',
    chip_pay: 'Si mund të paguaj?',
    chip_staff: 'Dua të flas me stafin',
    chip_ideas: 'Çfarë të bëj në Divjakë?',
    per_total: '{price} gjithsej',
    left: '{n} të lira',
    available: 'e lirë',
    range_long: 'Online rezervohen deri në {n} netë. Për qëndrime më të gjata ose data të largëta, lini kontaktin dhe stafi ju shkruan.',
    range_past: 'Ajo datë ka kaluar. Për cilat data të ardhshme kërkoni?',
    range_far: 'Rezervimet online pranohen deri në {n} ditë përpara. Për data më të largëta, lini kontaktin dhe stafi ju shkruan.',
    seats_left: '{n} vende',
    link_book: 'Rezervo',
    link_all_rooms: 'Të gjitha dhomat',
    link_experiences: 'Eksperiencat',
  },
  en: {
    greeting: 'Hello! Ask about rooms, experiences in the park and lagoon, payments or your bookings.',
    rooms_free: 'For {range} ({nights}) we have available:',
    rooms_none: 'For {range} there are no rooms available online. Try other dates, or leave your contact and our staff will write to you.',
    sessions_free: 'Times with free places on {date}:',
    sessions_none: 'No times with free places online on {date}.',
    ask_dates: 'For which dates? Write for example "12–14 July" or "Friday for 2 nights".',
    recommend: 'A few ideas you may like:',
    miss: 'I do not know that for sure. Would you like the hotel staff to contact you? Leave your name and e-mail or phone.',
    handoff: 'Of course. Leave your name and e-mail or phone and the hotel staff will contact you.',
    contact_saved: 'Thank you! Your message was sent to the Hotel Pelikan staff. They will contact you soon.',
    contact_missing: 'We need an e-mail or phone number so the staff can contact you.',
    chip_rooms: 'A room this weekend',
    chip_tours: 'What experiences do you have?',
    chip_pay: 'How can I pay?',
    chip_staff: 'I want to talk to the staff',
    chip_ideas: 'What to do in Divjakë?',
    per_total: '{price} in total',
    left: '{n} free',
    available: 'available',
    range_long: 'Online bookings go up to {n} nights. For longer stays or dates far ahead, leave your contact and our staff will write to you.',
    range_past: 'That date has passed. Which future dates are you looking for?',
    range_far: 'Online bookings open up to {n} days ahead. For later dates, leave your contact and our staff will write to you.',
    seats_left: '{n} places',
    link_book: 'Book',
    link_all_rooms: 'All rooms',
    link_experiences: 'Experiences',
  },
};
type StrKey = keyof typeof DEFAULT_STRINGS.sq;

const kbStrings = import.meta.glob('./kb/strings.{ts,js}', { eager: true }) as Record<string, { strings?: Partial<Record<Lang, Partial<Record<StrKey, string>>>> }>;
const OVERRIDE = Object.values(kbStrings)[0]?.strings ?? {};

function s(lang: Lang, key: StrKey, vars: Record<string, string | number> = {}): string {
  const raw = OVERRIDE[lang]?.[key] ?? DEFAULT_STRINGS[lang][key];
  return raw.replace(/\{(\w+)\}/g, (_, n: string) => String(vars[n] ?? ''));
}

const has = (folded: string, words: string[]) => words.some((w) => new RegExp(`\\b${w}`).test(folded));

const ROOM_WORDS = ['dhom', 'room', 'fjet', 'qendr', 'stay', 'nat', 'net', 'night', 'hotel', 'akomod', 'accommod', 'bed', 'shtret'];
const AVAIL_WORDS = ['lir', 'free', 'availab', 'disponuesh', 'vend', 'rezerv', 'book', 'keni', 'have', 'ka ', 'is there', 'any '];
const EXP_WORDS = ['tur', 'tour', 'vizit', 'visit', 'guid', 'udherrefy', 'pelikan', 'pelican', 'kull', 'tower', 'lagun', 'lagoon', 'park', 'eksperienc', 'experience', 'ekskursion', 'excursion', 'aktivitet', 'activit'];
const REC_WORDS = ['rekomand', 'sugjer', 'keshill', 'recommend', 'suggest', 'ide', 'idea', 'what to do', 'cfare te bej', 'cfare mund te bej', 'things to do', 'plan', 'ku te shkoj', 'where to go'];
const HANDOFF_WORDS = ['flas me', 'staf', 'njeri', 'operator', 'human', 'person real', 'real person', 'call me', 'me telefononi', 'me merrni', 'contact me', 'me kontaktoni', 'talk to'];
const GREET_WORDS = ['pershendetje', 'tung', 'mirdita', 'miredita', 'hello', 'hi', 'hey', 'good morning', 'ciao', 'pershendes'];

/** Interest tags read from a message (same vocabulary as products.tags). */
const TAG_WORDS: [string, string[]][] = [
  ['birds', ['zog', 'bird', 'pelikan', 'pelican', 'flamingo', 'shpend']],
  ['nature', ['natyr', 'nature', 'park', 'pisha', 'pine', 'pyll', 'forest', 'lagun', 'lagoon']],
  ['beach', ['plazh', 'beach', 'det', 'sea', 'not', 'swim']],
  ['culture', ['kultur', 'culture', 'histori', 'history', 'muze', 'museum', 'kish', 'church', 'manastir', 'monaster']],
  ['food', ['ushqim', 'food', 'restorant', 'restaurant', 'gatim', 'peshk', 'fish', 'veret', 'wine']],
  ['active', ['bicikl', 'bike', 'cycling', 'ecje', 'walk', 'hik', 'kajak', 'kayak', 'aktiv', 'active']],
  ['family', ['femij', 'child', 'kids', 'famil', 'family']],
  ['couple', ['cift', 'couple', 'romantik', 'romantic']],
  ['slow', ['qete', 'quiet', 'relaks', 'relax', 'slow', 'pushim']],
  ['rainy', ['shi', 'rain', 'rainy']],
];

function interestsFrom(folded: string): string[] {
  return TAG_WORDS.filter(([, ws]) => has(folded, ws)).map(([t]) => t);
}

interface FaqRow { id: number; q_sq: string | null; q_en: string | null; a_sq: string | null; a_en: string | null; keywords: string | null; links: string | null; sort: number }

/** Score every active FAQ against the message. */
export function matchFaq(message: string): { faq: FaqRow; score: number }[] {
  const folded = ' ' + fold(message).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const qs = new Set(stems(message));
  if (!qs.size && !folded.trim()) return [];
  const rows = all<FaqRow>('SELECT id, q_sq, q_en, a_sq, a_en, keywords, links, sort FROM faq WHERE active = 1');
  return rows
    .map((f) => {
      let score = 0;
      for (const kw of (f.keywords ?? '').split(',').map((k) => fold(k).trim()).filter(Boolean)) {
        const words = kw.split(/\s+/);
        const hit = words.length > 1 ? folded.includes(` ${kw}`) : new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(folded);
        if (hit) score += words.length > 1 ? 4 : 3;
      }
      const fq = new Set(stems(`${f.q_sq ?? ''} ${f.q_en ?? ''}`));
      let overlap = 0;
      for (const t of qs) if (fq.has(t) || [...fq].some((x) => x.length >= 4 && t.length >= 4 && (x.startsWith(t) || t.startsWith(x)))) overlap++;
      score += (overlap / Math.max(2, qs.size)) * 4;
      return { faq: f, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.faq.sort - b.faq.sort);
}

function faqLinks(f: FaqRow, lang: Lang): AssistantLink[] {
  try {
    const arr = JSON.parse(f.links || '[]') as { key?: string; url?: string; params?: Record<string, string>; label_sq?: string; label_en?: string }[];
    return arr
      .map((l) => {
        let url = l.url ?? '';
        if (!url && l.key) {
          try { url = path(l.key as RouteKey, lang, l.params ?? {}); } catch { url = ''; }
        }
        return { label: (lang === 'en' ? l.label_en : l.label_sq) ?? l.label_sq ?? l.label_en ?? url, url };
      })
      // Only same-site paths and https links (admin-schemas refuses the rest on save; rows from
      // the seed or older saves are filtered here too).
      .filter((l) => /^\/(?![/\\])/.test(l.url) || /^https:\/\/[^\s/]+/i.test(l.url));
  } catch {
    return [];
  }
}

const defaultChips = (lang: Lang) => [s(lang, 'chip_rooms'), s(lang, 'chip_tours'), s(lang, 'chip_pay'), s(lang, 'chip_staff')];

function roomAvailability(lang: Lang, from: string, to: string, guests: number | null): AssistantReply {
  const rooms = listProducts({ kind: 'room' });
  const n = daysBetween(from, to);
  const range = formatRange(from, to, lang);
  // Unit counts are only stated once the owner saved real ones (same rule as /api/live).
  const counts = roomsVerified();
  const products: AssistantProduct[] = [];
  for (const p of rooms) {
    const left = roomRangeLeft(p, from, to);
    if (left <= 0) continue;
    const roomsNeeded = guests && p.capacity ? Math.max(1, Math.ceil(guests / p.capacity)) : 1;
    if (roomsNeeded > left) continue;
    const q = quote({ lang, items: [{ key: p.slug, slug: p.slug, kind: 'room', qty: roomsNeeded, from, to, guests: guests ?? undefined }] });
    if (q.lines[0]?.problem) continue;
    products.push({ slug: p.slug, kind: p.kind, name: pname(p, lang), url: `${productUrl(p.kind, p.slug, lang)}?nga=${from}&deri=${to}${guests ? `&persona=${guests}` : ''}`, image: primaryImage(p), price: p.price, left: counts ? left : null, total: q.total, when: range });
  }
  const lines = products.map((x) => `• ${x.name} — ${x.left != null ? s(lang, 'left', { n: x.left }) : s(lang, 'available')}, ${s(lang, 'per_total', { price: money(x.total ?? 0, lang) })}`);
  const reply = products.length ? `${s(lang, 'rooms_free', { range, nights: nightsWord(n, lang) })}\n${lines.join('\n')}` : s(lang, 'rooms_none', { range });
  return {
    reply, chips: products.length ? [s(lang, 'chip_tours'), s(lang, 'chip_pay')] : [s(lang, 'chip_staff'), s(lang, 'chip_rooms')],
    links: [{ label: s(lang, 'link_all_rooms'), url: path('stay', lang) }], products,
    intent: 'availability', handoff: !products.length, dates: { from, to, nights: n, guests },
  };
}

function sessionAvailability(lang: Lang, date: string, folded: string, guests: number | null): AssistantReply {
  const exps = listProducts({ kind: 'experience' });
  // Which experience is the visitor asking about? Count distinctive name words (5-letter
  // prefixes, so "lagunë/lagune/laguna/lagoon" meet) and keep the best-matching products.
  const GENERIC = new Set(['vizit', 'visit', 'divja', 'karav', 'kombe', 'natio', 'zonen', 'area', 'cultu', 'kultu']);
  const scored = exps.map((p) => {
    const words = new Set(tokens(`${p.name_sq} ${p.name_en}`).filter((t) => t.length >= 5).map((t) => t.slice(0, 5)).filter((t) => !GENERIC.has(t)));
    return { p, n: [...words].filter((w) => folded.includes(w)).length };
  });
  const best = Math.max(0, ...scored.map((x) => x.n));
  const list = best > 0 ? scored.filter((x) => x.n === best).map((x) => x.p) : exps;
  const products: AssistantProduct[] = [];
  for (const p of list) {
    const sessions: SessionInfo[] = sessionsMonth(p, date.slice(0, 7)).filter((x) => x.date === date && x.status === 'open' && x.left >= (guests ?? 1));
    for (const ses of sessions) {
      products.push({ slug: p.slug, kind: p.kind, name: pname(p, lang), url: `${productUrl(p.kind, p.slug, lang)}?sesioni=${ses.id}`, image: primaryImage(p), price: p.price, left: ses.left, when: ses.time });
    }
  }
  const label = formatDate(date, lang, 'long');
  const reply = products.length
    ? `${s(lang, 'sessions_free', { date: label })}\n${products.map((x) => `• ${x.when} — ${x.name} (${s(lang, 'seats_left', { n: x.left ?? 0 })}, ${money(x.price, lang)})`).join('\n')}`
    : s(lang, 'sessions_none', { date: label });
  return { reply, chips: [s(lang, 'chip_rooms'), s(lang, 'chip_staff')], links: [{ label: s(lang, 'link_experiences'), url: path('experiences', lang) }], products, intent: 'sessions', handoff: !products.length };
}

/** Facts for Claude: SPEC facts about the hotel, settings that are filled in, catalogue, FAQ. */
function factsText(lang: Lang): string {
  const b = getSetting('business');
  const pay = getSetting('payments');
  const lines: string[] = [
    'Hotel Pelikan: over 20 years in hotel-tourism in the Divjaka area; near the sea and the pine park; modern rooms; bar-restaurant; sustainable tourism, personalised service. (Source: the hotel)',
    'Activity packages bookable on this site: cultural visits, Divjakë-Karavasta National Park, Karavasta Lagoon, Pelican Observation Tower, Divjakë-Karavasta Visitor Centre with dedicated guides on flora, fauna and history.',
    `Payment methods: ${Object.entries(pay.methods).filter(([, v]) => v).map(([k]) => ({ hotel: 'pay at the hotel', bank: 'bank transfer', card: 'card' }[k])).join(', ')}.`,
    `Bookings are looked up with the order code and e-mail at ${path('account', lang)}.`,
  ];
  for (const [k, v] of Object.entries(b)) {
    if (k === 'placeholders' || !v || (b.placeholders ?? []).includes(k)) continue;
    lines.push(`${k}: ${v}`);
  }
  for (const p of listProducts()) lines.push(`Product "${pname(p, lang)}" (${p.kind}): ${p.price} lek ${p.kind === 'room' ? 'per night' : p.kind === 'experience' ? 'per person' : ''}.`);
  for (const f of all<FaqRow>('SELECT * FROM faq WHERE active = 1 ORDER BY sort LIMIT 60')) {
    lines.push(`Q: ${lang === 'en' ? f.q_en : f.q_sq}\nA: ${lang === 'en' ? f.a_en : f.a_sq}`);
  }
  return lines.join('\n');
}

function saveContact(input: AssistantInput, lang: Lang): AssistantReply {
  const c = input.contact!;
  if (!c.email && !c.phone) {
    return { reply: s(lang, 'contact_missing'), chips: [], links: [], products: [], intent: 'handoff', handoff: true };
  }
  const history = (input.context?.history ?? []).map((h) => `${h.role === 'user' ? '>' : '<'} ${h.content}`).join('\n');
  // The page path is kept for staff, without its query string (order tokens) or order code.
  const page = cleanPath(input.context?.path);
  const body = [c.question || input.message, history ? `\n---\n${history}` : '', page ? `\n[${page}]` : ''].join('').slice(0, 4000);
  run(
    "INSERT INTO messages (kind, name, email, phone, lang, subject, body, status, created_at) VALUES ('assistant', ?, ?, ?, ?, ?, ?, 'new', ?)",
    c.name || null, c.email || null, c.phone || null, lang, (c.question || input.message).slice(0, 120), body, nowIso(),
  );
  return { reply: s(lang, 'contact_saved'), chips: [], links: [], products: [], intent: 'contact', handoff: false };
}

export async function answer(input: AssistantInput, meta: { ua: string | null; ip?: string } = { ua: null }): Promise<AssistantReply> {
  const lang: Lang = input.lang === 'en' ? 'en' : 'sq';
  const msg = input.message;
  const folded = ' ' + fold(msg).replace(/[^a-z0-9 ./-]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const sid = input.context?.sid ?? null;
  const log = (intent: string, hit: boolean, extra: Record<string, unknown> = {}) =>
    serverEvent('assistant_q', { lang, sid, path: input.context?.path, ua: meta.ua, ip: meta.ip, meta: { q: msg.slice(0, 200), intent, hit, ...extra } });

  if (input.contact) {
    const r = saveContact(input, lang);
    log('contact', true);
    return r;
  }

  const wordCount = tokens(msg, { keepStop: true, min: 1 }).length;
  if (wordCount <= 3 && has(folded, GREET_WORDS) && !has(folded, [...ROOM_WORDS, ...EXP_WORDS])) {
    log('greeting', true);
    return { reply: s(lang, 'greeting'), chips: defaultChips(lang), links: [], products: [], intent: 'greeting', handoff: false };
  }

  if (has(folded, HANDOFF_WORDS)) {
    log('handoff', true);
    return { reply: s(lang, 'handoff'), chips: [], links: [{ label: lang === 'en' ? 'Contact' : 'Kontakt', url: path('contact', lang) }], products: [], intent: 'handoff', handoff: true };
  }

  const today = todayStr();
  const d = parseDates(msg, today);
  const aboutExp = has(folded, EXP_WORDS) && !has(folded, ['dhom', 'room', 'net ', 'nete', 'night']);
  if (d.problem) {
    // A date that does not exist, an end not after the start, or a start in the past: ask again,
    // never answer for other dates than the guest wrote.
    const key: StrKey = d.problem === 'past' ? 'range_past' : 'ask_dates';
    log('range_refused', false, d.from ? { from: d.from } : {});
    return { reply: s(lang, key), chips: [s(lang, 'chip_rooms')], links: [], products: [], intent: 'ask_dates', handoff: false };
  }
  if (d.from && d.to) {
    // Same limits as a cart line (pricing.ts), checked BEFORE any availability work: a range
    // like 0001-01-01..9999-12-31 must never be expanded night by night.
    const horizon = getSetting('inventory').booking_horizon_days || 548;
    const tooLong = !aboutExp && daysBetween(d.from, d.to) > MAX_NIGHTS;
    const key: StrKey | null = d.from < today ? 'range_past' : d.from > addDays(today, horizon) ? 'range_far' : tooLong ? 'range_long' : null;
    if (key) {
      log('range_refused', false, { from: d.from, to: d.to });
      return {
        reply: s(lang, key, { n: key === 'range_far' ? horizon : MAX_NIGHTS }), chips: [s(lang, 'chip_staff'), s(lang, 'chip_rooms')],
        links: [{ label: lang === 'en' ? 'Contact' : 'Kontakt', url: path('contact', lang) }], products: [], intent: 'ask_dates', handoff: key !== 'range_past',
      };
    }
    const r = aboutExp ? sessionAvailability(lang, d.from, folded, d.guests) : roomAvailability(lang, d.from, d.to, d.guests);
    log(r.intent, r.products.length > 0, { from: d.from, to: d.to });
    return r;
  }

  const faq = matchFaq(msg);
  const best = faq[0];
  if (best && best.score >= 3 && (!faq[1] || best.score >= faq[1].score * 1.15 || best.score >= 6)) {
    const f = best.faq;
    log('faq', true, { faq: f.id, score: Math.round(best.score * 10) / 10 });
    return {
      reply: (lang === 'en' ? f.a_en : f.a_sq) || f.a_sq || f.a_en || '',
      chips: faq.slice(1, 3).map((x) => (lang === 'en' ? x.faq.q_en : x.faq.q_sq) || '').filter(Boolean),
      links: faqLinks(f, lang), products: [], intent: 'faq', handoff: false,
    };
  }

  if (has(folded, REC_WORDS)) {
    const interests = [...new Set([...interestsFrom(folded), ...(input.context?.interests ?? [])])];
    const items = recommend({ lang, interests, cart: input.context?.cart, limit: 3 });
    log('recommend', items.length > 0, { interests });
    return {
      reply: `${s(lang, 'recommend')}\n${items.map((x) => `• ${x.name}`).join('\n')}`,
      chips: [s(lang, 'chip_rooms'), s(lang, 'chip_staff')], links: [],
      products: items.map((x) => ({ slug: x.slug, kind: x.kind, name: x.name, url: x.url, image: x.image, price: x.price })),
      intent: 'recommend', handoff: false,
    };
  }

  if (has(folded, AVAIL_WORDS) && has(folded, [...ROOM_WORDS, ...EXP_WORDS])) {
    log('ask_dates', true);
    return { reply: s(lang, 'ask_dates'), chips: [s(lang, 'chip_rooms')], links: [], products: [], intent: 'ask_dates', handoff: false };
  }

  const st = getSetting('assistant');
  if (claudeEnabled() && st.use_claude !== false) {
    // Spend limits live in claude.ts (daily cap for the site, per-address hourly cap, answer cache).
    const text = await askClaude({ lang, question: msg, facts: factsText(lang), history: input.context?.history, client: meta.ip ?? 'unknown', dailyCap: st.daily_cap ?? 300 });
    if (text) {
      log('llm', true);
      return { reply: text, chips: defaultChips(lang).slice(0, 3), links: [], products: [], intent: 'llm', handoff: false };
    }
  }

  serverEvent('assistant_miss', { lang, sid, path: input.context?.path, ua: meta.ua, ip: meta.ip, meta: { q: msg.slice(0, 200) } });
  log('miss', false);
  return { reply: s(lang, 'miss'), chips: [s(lang, 'chip_staff'), ...defaultChips(lang).slice(0, 2)], links: [{ label: lang === 'en' ? 'Contact' : 'Kontakt', url: path('contact', lang) }], products: [], intent: 'miss', handoff: true };
}

export { parseDates };
