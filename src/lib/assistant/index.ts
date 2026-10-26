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
import { nextSessions, roomRangeLeft, roomsVerified, sessionsMonth, type SessionInfo } from '../availability';
import { MAX_NIGHTS, quote } from '../pricing';
import { recommend } from '../recommend';
import { cleanPath, serverEvent } from '../analytics';
import { fold, stems, tokens } from '../text';
import { parseDates } from './dates';
import { faqText } from './holds';
import { getLive, type LivePayload } from '../live';
import { askClaude, claudeEnabled } from './claude';
import { addDays, daysBetween, nowIso, today as todayStr } from '../time';
import { path, productUrl, type Lang } from '../urls';
import { money, formatDate, formatRange, nights as nightsWord, parseYMD, weekdayIndex } from '../../i18n/format';
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
      website: z.string().max(200).optional(), // honeypot (same pattern as /api/contact)
      elapsed_ms: z.number().int().min(0).max(864e5).optional(), // time trap: ms since the form opened
    })
    .optional(),
});
export type AssistantInput = z.infer<typeof zAssistantBody>;

export interface AssistantLink { label: string; url: string }
export interface AssistantProduct {
  slug: string; kind: string; name: string; url: string; image: string | null; price: number;
  /** free places / rooms: only for products with real counts (demo = 0); null otherwise */
  left?: number | null; total?: number; when?: string;
  /** rooms of this type the party needs (total covers all of them) */
  rooms?: number;
  /** 'person': the price is per person (experiences); total, when present, is for the party */
  per?: 'person';
  /** the party size the total is for */
  party?: number;
}
export interface AssistantReply {
  reply: string; chips: string[]; links: AssistantLink[]; products: AssistantProduct[];
  intent: 'contact' | 'availability' | 'sessions' | 'faq' | 'recommend' | 'ask_dates' | 'llm' | 'handoff' | 'miss' | 'greeting' | 'weather';
  handoff: boolean;
  dates?: { from: string; to: string; nights: number; guests: number | null };
}

const DEFAULT_STRINGS = {
  sq: {
    greeting: 'Përshëndetje! Pyesni për dhomat, eksperiencat në park dhe lagunë, pagesat ose rezervimet tuaja.',
    rooms_free: 'Për {range} ({nights}) kemi të lira:',
    rooms_none: 'Për {range} nuk kemi dhoma të lira online. Provoni data të tjera ose lini kontaktin dhe stafi ju shkruan.',
    sessions_free: '{Date}, ka këto orare me vende të lira:',
    sessions_none: '{Date}, nuk ka orare me vende të lira online.',
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
    rooms_n: '{n} dhoma',
    left: '{n} të lira',
    available: 'e disponueshme',
    range_long: 'Online rezervohen deri në {n} netë. Për qëndrime më të gjata ose data të largëta, lini kontaktin dhe stafi ju shkruan.',
    range_past: 'Ajo datë ka kaluar. Për cilat data të ardhshme kërkoni?',
    range_far: 'Rezervimet online pranohen deri në {n} ditë përpara. Për data më të largëta, lini kontaktin dhe stafi ju shkruan.',
    seats_left: '{n} vende',
    per_person: '{price} për person',
    party_total: '{price} për {n} veta',
    sessions_next: 'Orari i radhës me vende të lira:',
    link_book: 'Rezervo',
    link_all_rooms: 'Të gjitha dhomat',
    link_experiences: 'Eksperiencat',
    weather_now: 'Moti në Divjakë, ora {time}: {temp} °C, {label}; era {wind} km/h.',
    weather_day: '{day}: {lo}–{hi} °C, {label}.',
    weather_far: 'Parashikimi shkon vetëm 7 ditë përpara; për {day} shikojeni sërish më afër datës.',
    weather_more: 'Të dhënat: MET Norway (CC BY 4.0). Leximet e plota, parashikimi për 7 ditë, dielli dhe stina: "Tani në Divjakë".',
    weather_none: 'Tani nuk kemi lexime të freskëta të motit. Te "Tani në Divjakë" janë dielli, stina dhe, sapo të vijnë, leximet e reja.',
    link_now: 'Tani në Divjakë',
    chip_plan: 'Më ndihmo me itinerarin',
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
    rooms_n: '{n} rooms',
    left: '{n} free',
    available: 'available',
    range_long: 'Online bookings go up to {n} nights. For longer stays or dates far ahead, leave your contact and our staff will write to you.',
    range_past: 'That date has passed. Which future dates are you looking for?',
    range_far: 'Online bookings open up to {n} days ahead. For later dates, leave your contact and our staff will write to you.',
    seats_left: '{n} places',
    per_person: '{price} per person',
    party_total: '{price} for {n}',
    sessions_next: 'The next time with free places:',
    link_book: 'Book',
    link_all_rooms: 'All rooms',
    link_experiences: 'Experiences',
    weather_now: 'Weather in Divjakë at {time}: {temp} °C, {label}; wind {wind} km/h.',
    weather_day: '{day}: {lo}–{hi} °C, {label}.',
    weather_far: 'The forecast only goes 7 days ahead; check again closer to {day}.',
    weather_more: 'Data: MET Norway (CC BY 4.0). Full readings, the 7-day forecast, the sun and the season: "Now in Divjakë".',
    weather_none: 'There are no fresh weather readings right now. "Now in Divjakë" has the sun, the season and, as soon as they arrive, the new readings.',
    link_now: 'Now in Divjakë',
    chip_plan: 'Help me plan my days',
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

const ROOM_WORDS = ['dhom', 'room', 'fjet', 'qendrim', 'stay', 'nat[ae]n?\\b', 'net[e]?\\b', 'night', 'hotel', 'akomod', 'accommod', 'bed', 'shtret'];
/** Words that make a dated question about rooms (not "hotel", which every question may name). */
const ROOM_ONLY = ['dhom', 'room', 'fjet', 'qendrim', 'stay', 'nat[ae]n?\\b', 'net[e]?\\b', 'night', 'akomod', 'accommod', 'bed', 'shtret', 'suite', 'apartament'];
const AVAIL_WORDS = ['lir', 'free', 'availab', 'disponuesh', 'vend', 'rezerv', 'book', 'keni', 'have', 'ka ', 'is there', 'any '];
/** Words that really ask about free places or a booking ("ka" / "have" alone do not: "a ka wifi në dhoma?"). */
const STRONG_AVAIL = ['lir', 'free', 'availab', 'disponuesh', 'vend', 'rezerv', 'book'];
// Experiences: tours, the park, the boat, birds at dawn, cycling, the cultural day, the fish dinner
// (sq + en, folded, so "varkë/varke", "darkë/darke", "zogj/zog" all meet).
const EXP_WORDS = [
  'tur', 'tour', 'vizit', 'visit', 'guid', 'udherrefy', 'pelikan', 'pelican', 'kull', 'tower', 'lagun', 'lagoon', 'park', 'eksperienc', 'experience',
  'ekskursion', 'excursion', 'aktivitet', 'activit', 'varke', 'varka', 'varken', 'boat', 'lundrim', 'shetitj', 'cruise', 'zog', 'shpend', 'bird',
  'agim', 'dawn', 'sunrise', 'biciklet', 'bike', 'cycling', 'kajak', 'kayak', 'darke', 'darka', 'darken', 'dinner', 'kulturor', 'cultural', 'ardenic', 'apoloni', 'apolloni',
];
/** Weather questions are answered from the live logbook (getLive), never from a date route. */
const WEATHER_WORDS = ['mot(i|in|it)?\\b', 'weather', 'wether', 'wheather', 'temperatur', 'forecast', 'parashikim', 'sa grade', 'degrees', 'how hot', 'how cold', 'sa ftohte', 'sa nxehte', 'ere\\b', 'era\\b', 'windy', 'wind\\b'];
const REC_WORDS = ['rekomand', 'sugjer', 'keshill', 'recommend', 'suggest', 'ide', 'idea', 'what to do', 'cfare te bej', 'cfare mund te bej', 'things to do', 'plan', 'ku te shkoj', 'where to go'];
/**
 * "njeri" alone is how Albanians count people ("dhomë për një njeri"): only phrases that ask for a
 * person to talk to are a hand-off.
 */
const HANDOFF_WORDS = ['flas me', 'staf', 'njeri real', 'me nje njeri\\b', 'njeri te stafit', 'njeri nga stafi', 'operator', 'human', 'person real', 'real person', 'call me', 'me telefononi', 'me merrni', 'contact me', 'me kontaktoni', 'talk to'];
/** "Is this a bot?": the FAQ row about the assistant answers, before the hand-off words ("real person"). */
const BOT_WORDS = ['bot\\b', 'robot', 'chatbot', 'inteligjenc', 'artificial', 'are you (a )?(human|real|person)', 'is this (a )?(bot|human|real|person)', 'a je njeri', 'je njeri', 'po flas me (nje )?(njeri|robot|bot)', 'talking to a (person|human|bot|machine|real)'];
/**
 * Words that turn a weather word into a policy question ("is the boat trip cancelled in bad
 * weather?"): the FAQ answers, not today's forecast.
 */
const POLICY_WORDS = ['anul', 'cancel', 'refund', 'rimburs', 'shtyhet', 'shtyhen', 'postpon', 'called off', 'nese\\b', 'if the', 'if it', 'in bad', 'mot i keq', 'mot te keq', 'moti eshte i keq', 'ne rast', 'in case', 'what happens', 'cfare ndodh'];
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

/**
 * Words that carry no topic, on top of the stop lists in text.ts: "do you have a spa?" must not
 * meet "Do you have a restaurant?" on "do/you/have". Compared on the folded token.
 */
const FILLER = new Set([
  'keni', 'ka', 'kam', 'kemi', 'ju', 'juve', 'jush', 'do', 'you', 'have', 'has', 'is', 'there', 'a', 'hotel', 'hoteli', 'hotelit', 'hotelin', 'hotelet',
  'offer', 'ofroni', 'ofron', 'can', 'could', 'may', 'mund', 'get', 'go', 'sa', 'how', 'much', 'many', 'eshte', 'jane', 'bej', 'beni', 'dua', 'duam',
  'want', 'need', 'nevoje', 'nevojitet', 'tell', 'know', 'di', 'dini', 'about', 'rreth', 'here', 'ketu', 'atje', 'any', 'some', 'also', 'gjithashtu',
  'vete', 'veta', 'people', 'persona', 'per', 'for', 'eshte', 'it', 'its', 'are', 'gjeni', 'find', 'see', 'shoh', 'shohim', 'mire', 'good', 'nice',
  'ok', 'okay', 'lutem', 'please', 'faleminderit', 'pershendetje', 'hello', 'hi', 'dear', 'te', 'qe', 'ne', 'me', 'nje', 'one',
]);
const contentStems = (s: string): string[] => {
  const out: string[] = [];
  for (const t of tokens(s)) {
    if (FILLER.has(t)) continue;
    const st = stems(t)[0];
    if (st && !FILLER.has(st) && !/^\d+$/.test(st)) out.push(st);
  }
  return [...new Set(out)];
};
/**
 * One typo apart (typed questions: hotle, iland, resturant, airprot): an adjacent swap, one
 * letter missing or one extra for words of 5+ letters; a changed letter only from 7 letters up,
 * so real short words never meet ("banja" bathroom ≠ "banka" bank).
 */
export function typo1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.min(la, lb) < 4 || Math.max(la, lb) < 5 || Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) return true;
    return la >= 7 && a.slice(i + 1) === b.slice(i + 1);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
/** Two stems meet when equal, (both ≥ 4 letters) one starts the other: pelikan/pelikanet, or one typo apart. */
const meet = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) || typo1(a, b);
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface FaqHit { faq: FaqRow; score: number; kw: number; coverage: number; overlap: number; ok: boolean }

/**
 * Score every active FAQ against the message. A row is acceptable (`ok`) only when the question
 * shares a TOPIC with it: at least one keyword hit that covers half of the question's content
 * words, two keyword hits, or (no keyword) most of its content words found in the FAQ question.
 * Short keywords (≤ 3 letters) match whole words only, longer ones allow an inflected ending
 * (≤ 4 letters: pelikan → pelikanet), so "ha" (eat) never meets "have".
 */
export function matchFaq(message: string): FaqHit[] {
  const folded = ' ' + fold(message).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const qs = contentStems(message);
  if (!qs.length && !folded.trim()) return [];
  // the question's words with their positions, for typo-tolerant keyword matching
  const qWords = [...folded.matchAll(/[a-z0-9]+/g)].map((m) => ({ w: m[0], at: m.index ?? 0 }));
  /** a keyword phrase, word by word, where a long word may carry one typo */
  const fuzzyPhrase = (ks: string[]): number => {
    for (let i = 0; i + ks.length <= qWords.length; i++) {
      if (ks.every((k, j) => qWords[i + j].w === k || (k.length >= 5 && typo1(qWords[i + j].w, k)))) return qWords[i].at;
    }
    return -1;
  };
  const rows = all<FaqRow>('SELECT id, q_sq, q_en, a_sq, a_en, keywords, links, sort FROM faq WHERE active = 1');
  const kwList = (f: FaqRow) => (f.keywords ?? '').split(',').map((x) => fold(x).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  // How many rows carry each keyword: a word only one row has ("drone", "flamingo") is that row's
  // own topic and may decide a long question by itself.
  const kwRows = new Map<string, number>();
  for (const f of rows) for (const k of new Set(kwList(f))) kwRows.set(k, (kwRows.get(k) ?? 0) + 1);
  return rows
    .map((f) => {
      let kwScore = 0;
      let kw = 0;
      let strong = false;
      const kwStems: string[] = [];
      // one question word counts once per row: "pelican" and "pelicans" both hitting "pelicans"
      // must not double the score
      const seenAt = new Set<number>();
      for (const k of kwList(f)) {
        const words = k.split(' ');
        for (const w of words) for (const st of stems(w)) kwStems.push(st);
        if (words.length > 1) {
          if (folded.includes(` ${k}`) || fuzzyPhrase(words) >= 0) { kw++; kwScore += 4; }
          continue;
        }
        const m = new RegExp(k.length <= 3 ? `\\b${escRe(k)}\\b` : `\\b${escRe(k)}[a-z]{0,4}\\b`).exec(folded);
        const at = m ? m.index : k.length >= 5 ? fuzzyPhrase([k]) : -1;
        if (at >= 0 && !seenAt.has(at)) {
          seenAt.add(at); kw++; kwScore += 3;
          if (k.length >= 5 && kwRows.get(k) === 1) strong = true;
        }
      }
      const fq = contentStems(`${f.q_sq ?? ''} ${f.q_en ?? ''}`);
      let overlap = 0;
      let covered = 0;
      for (const t of qs) {
        const inQ = fq.some((x) => meet(x, t));
        if (inQ) overlap++;
        if (inQ || kwStems.some((x) => meet(x, t))) covered++;
      }
      const n = Math.max(1, qs.length);
      const coverage = qs.length ? covered / n : kw ? 1 : 0;
      // a single keyword in a longer question must cover two thirds of it: "do you have parking
      // for a bus and a trailer" is not "is there parking?"
      // ... unless that keyword is the row's own (no other row has it): "can I fly a drone in the
      // national park" is the park-rules row
      const ok = (kw === 1 && (qs.length <= 1 || coverage >= (strong ? 0.25 : qs.length > 2 ? 0.66 : 0.5)))
        || (kw >= 2 && coverage >= 0.34) || (overlap >= 2 && overlap / n >= 0.6);
      const score = kwScore + (overlap / Math.max(2, n)) * 4 + coverage * 3;
      return { faq: f, score, kw, coverage, overlap, ok };
    })
    .filter((x) => x.ok)
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
    products.push({ slug: p.slug, kind: p.kind, name: pname(p, lang), url: `${productUrl(p.kind, p.slug, lang)}?nga=${from}&deri=${to}${roomsNeeded > 1 ? `&dhoma=${roomsNeeded}` : ''}${guests ? `&persona=${guests}` : ''}`, image: primaryImage(p), price: p.price, left: counts ? left : null, total: q.total, when: range, ...(roomsNeeded > 1 ? { rooms: roomsNeeded } : {}) });
  }
  const lines = products.map((x) => `• ${x.name}${x.rooms ? ` × ${s(lang, 'rooms_n', { n: x.rooms })}` : ''} — ${x.left != null ? s(lang, 'left', { n: x.left }) : s(lang, 'available')}, ${s(lang, 'per_total', { price: money(x.total ?? 0, lang) })}`);
  const reply = products.length ? `${s(lang, 'rooms_free', { range, nights: nightsWord(n, lang) })}\n${lines.join('\n')}` : s(lang, 'rooms_none', { range });
  return {
    reply, chips: products.length ? [s(lang, 'chip_tours'), s(lang, 'chip_pay')] : [s(lang, 'chip_staff'), s(lang, 'chip_rooms')],
    links: [{ label: s(lang, 'link_all_rooms'), url: path('stay', lang) }], products,
    intent: 'availability', handoff: !products.length, dates: { from, to, nights: n, guests },
  };
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
/** Albanian weekday after a verb or a preposition takes the accusative: "të hënën, 26 tetor 2026". */
const WEEKDAY_ACC_SQ = ['të hënën', 'të martën', 'të mërkurën', 'të enjten', 'të premten', 'të shtunën', 'të dielën'];
function datePhrase(date: string, lang: Lang): string {
  const p = parseYMD(date);
  if (lang !== 'sq' || !p) return formatDate(date, lang, 'long');
  return `${WEEKDAY_ACC_SQ[weekdayIndex(p)]}, ${formatDate(date, lang, 'medium')}`;
}

/**
 * One session as a card. A product with demo = 1 (seeded capacity) never shows a free-place count:
 * the site rule (HANDOFF T3/T4/T5, /tani/), PLAN §2 and DESIGN §10 (no fake scarcity).
 */
function sessionCard(p: ReturnType<typeof listProducts>[number], ses: SessionInfo, lang: Lang, guests: number | null, when: string): AssistantProduct {
  return {
    slug: p.slug, kind: p.kind, name: pname(p, lang), image: primaryImage(p), price: p.price, when, per: 'person',
    url: `${productUrl(p.kind, p.slug, lang)}?data=${ses.date}&orari=${ses.id}${guests ? `&persona=${guests}` : ''}`,
    left: p.demo ? null : ses.left,
    ...(guests && guests > 1 ? { total: p.price * guests, party: guests } : {}),
  };
}
/** "500 lekë për person" (and "1 000 lekë për 2 veta" for a party); a real count first when there is one. */
function sessionPrice(x: AssistantProduct, lang: Lang, guests: number | null): string {
  const parts: string[] = [];
  if (x.left != null) parts.push(s(lang, 'seats_left', { n: x.left }));
  parts.push(s(lang, 'per_person', { price: money(x.price, lang) }));
  if (x.total != null && guests && guests > 1) parts.push(s(lang, 'party_total', { price: money(x.total, lang), n: guests }));
  return parts.join(', ');
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
  // Words a visitor uses that are not in the product names ("boat", "dawn birdwatching",
  // "dinner"): matched to a slug fragment, and they decide before the name words do.
  const TOPIC: [RegExp, string][] = [
    [/\b(varke|varka|varken|boat|lundrim|cruise)/, 'varke'], [/\b(agim|dawn|sunrise|zog|shpend|bird)/, 'shpendet'],
    [/\b(biciklet|bike|cycling)/, 'biciklete'], [/\b(darke|darka|darken|dinner|peshk|fish)/, 'darke'],
    [/\b(kulturor|cultural|ardenic|apoloni|apolloni)/, 'kulturore'], [/\b(qendr\w* e vizitor|visitor cent|kulla 360|360)/, 'qendra'],
    [/\b(guid\w*|udherrefy\w*)\b.*\bpark|\bpark\w*\b.*\b(guid|tour|tur)/, 'parku'],
  ];
  const topical = TOPIC.filter(([re]) => re.test(folded)).map(([, frag]) => frag);
  const byTopic = topical.length ? exps.filter((p) => topical.some((frag) => p.slug.includes(frag))) : [];
  const best = Math.max(0, ...scored.map((x) => x.n));
  const list = byTopic.length ? byTopic : best > 0 ? scored.filter((x) => x.n === best).map((x) => x.p) : exps;
  const products: AssistantProduct[] = [];
  for (const p of list) {
    const sessions: SessionInfo[] = sessionsMonth(p, date.slice(0, 7)).filter((x) => x.date === date && x.status === 'open' && x.left >= (guests ?? 1));
    for (const ses of sessions) products.push(sessionCard(p, ses, lang, guests, ses.time));
  }
  const label = datePhrase(date, lang);
  const Label = cap(label);
  const chips = [s(lang, 'chip_rooms'), s(lang, 'chip_staff')];
  const links = [{ label: s(lang, 'link_experiences'), url: path('experiences', lang) }];
  const lineOf = (x: AssistantProduct) => `• ${x.when} — ${x.name} (${sessionPrice(x, lang, guests)})`;
  if (products.length) {
    return { reply: `${s(lang, 'sessions_free', { date: label, Date: Label })}\n${products.map(lineOf).join('\n')}`, chips, links, products, intent: 'sessions', handoff: false };
  }
  // Nothing that day: when the guest named a tour, offer its next open time after that date.
  const named = byTopic.length ? byTopic : best > 0 ? list : [];
  const later: AssistantProduct[] = [];
  for (const p of named.slice(0, 3)) {
    const ses = nextSessions(p.id, 60).find((x) => x.date > date && x.left >= (guests ?? 1));
    if (ses) later.push(sessionCard(p, ses, lang, guests, `${formatDate(ses.date, lang, 'day-month')}, ${ses.time}`));
  }
  const none = s(lang, 'sessions_none', { date: label, Date: Label });
  const reply = later.length ? `${none}\n${s(lang, 'sessions_next')}\n${later.map(lineOf).join('\n')}` : none;
  return { reply, chips, links, products: later, intent: 'sessions', handoff: !later.length };
}

/** Weather from the live logbook (MET Norway via lib/live.ts); a date within the 7-day forecast adds that day. */
async function weatherReply(lang: Lang, date: string | null): Promise<AssistantReply> {
  let live: LivePayload | null = null;
  try {
    live = await Promise.race([getLive(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
  } catch { live = null; }
  const links = [{ label: s(lang, 'link_now'), url: path('now', lang) }];
  const chips = [s(lang, 'chip_ideas'), s(lang, 'chip_tours')];
  const w = live && !live.stale ? live.weather : null;
  if (!w) return { reply: s(lang, 'weather_none'), chips, links, products: [], intent: 'weather', handoff: false };
  const low = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
  const lines = [s(lang, 'weather_now', {
    // the hour the reading is valid for (MET's forecast hour), not the moment the server checked
    time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tirane', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(w.valid_at || live!.updated_at)),
    temp: Math.round(w.temp), label: low(lang === 'en' ? w.label_en : w.label_sq), wind: Math.round(w.wind_kmh),
  })];
  const want = date && date !== todayStr() ? date : null;
  const day = live!.daily.find((x) => x.date === (want ?? todayStr()));
  if (day) {
    lines.push(s(lang, 'weather_day', {
      day: want ? cap(formatDate(day.date, lang, 'weekday')) : (lang === 'en' ? 'Today' : 'Sot'),
      lo: Math.round(day.tmin), hi: Math.round(day.tmax), label: low(lang === 'en' ? day.label_en : day.label_sq),
    }));
  } else if (want) {
    lines.push(s(lang, 'weather_far', { day: formatDate(want, lang, 'day-month') }));
  }
  lines.push(s(lang, 'weather_more'));
  return { reply: lines.join('\n'), chips, links, products: [], intent: 'weather', handoff: false };
}

/** Facts for Claude: SPEC facts about the hotel, settings that are filled in, catalogue, FAQ. */
function factsText(lang: Lang): string {
  const b = getSetting('business');
  const pay = getSetting('payments');
  // Only what the catalogue really sells (names from the products table), never a place the SPEC
  // names but nobody offers (the "Pelican Observation Tower" bird hide is mapped as destroyed).
  const exps = listProducts({ kind: 'experience' }).map((p) => pname(p, lang));
  const lines: string[] = [
    'Hotel Pelikan: over 20 years in hotel-tourism in the Divjaka area; near the sea and the pine park; modern rooms; bar-restaurant; sustainable tourism, personalised service. (Source: the hotel)',
    `Experiences bookable on this site: ${exps.join('; ') || 'none published yet'}.`,
    'Pelican Island is closed to the public. The old bird hide on the barrier ("pelican tower") is mapped as destroyed in OpenStreetMap: never say it can be visited or booked; the 35–36 m 360° Tower by the Visitor Centre is a different tower.',
    `Payment methods: ${Object.entries(pay.methods).filter(([, v]) => v).map(([k]) => ({ hotel: 'pay at the hotel', bank: 'bank transfer', card: 'card' }[k])).join(', ')}.`,
    `Bookings are looked up with the order code and e-mail at ${path('account', lang)}.`,
  ];
  for (const [k, v] of Object.entries(b)) {
    if (k === 'placeholders' || !v || (b.placeholders ?? []).includes(k)) continue;
    lines.push(`${k}: ${v}`);
  }
  for (const p of listProducts()) lines.push(`Product "${pname(p, lang)}" (${p.kind}): ${p.price} lek ${p.kind === 'room' ? 'per night' : p.kind === 'experience' ? 'per person' : ''}.`);
  for (const f of all<FaqRow>('SELECT * FROM faq WHERE active = 1 ORDER BY sort LIMIT 60')) {
    lines.push(`Q: ${lang === 'en' ? f.q_en : f.q_sq}\nA: ${faqText((lang === 'en' ? f.a_en : f.a_sq) ?? '')}`);
  }
  return lines.join('\n');
}

function saveContact(input: AssistantInput, lang: Lang): AssistantReply {
  const c = input.contact!;
  if (!c.email && !c.phone) {
    return { reply: s(lang, 'contact_missing'), chips: [], links: [], products: [], intent: 'handoff', handoff: true };
  }
  // Spam guard, as /api/contact: a filled honeypot, or a form sent under 2.5 s after it opened (or
  // without the timing, i.e. not from the panel), gets the same thanks and is not stored.
  if (c.website || c.elapsed_ms == null || c.elapsed_ms < 2500) {
    return { reply: s(lang, 'contact_saved'), chips: [], links: [], products: [], intent: 'contact', handoff: false };
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

export async function answer(input: AssistantInput, meta: { ua: string | null; ip?: string; noTrack?: boolean } = { ua: null }): Promise<AssistantReply> {
  // noTrack: a signed-in admin's test question (admin Asistenti test box) is not counted in analytics.
  const track: typeof serverEvent = meta.noTrack ? () => {} : serverEvent;
  const lang: Lang = input.lang === 'en' ? 'en' : 'sq';
  const msg = input.message;
  const folded = ' ' + fold(msg).replace(/[^a-z0-9 ./-]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const sid = input.context?.sid ?? null;
  const log = (intent: string, hit: boolean, extra: Record<string, unknown> = {}) =>
    track('assistant_q', { lang, sid, path: input.context?.path, ua: meta.ua, ip: meta.ip, meta: { q: msg.slice(0, 200), intent, hit, ...extra } });

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

  // "Is this a bot or a real person?" asks about the assistant: its FAQ row answers, not the hand-off.
  if (has(folded, BOT_WORDS)) {
    const hit = matchFaq(msg)[0];
    if (hit) {
      log('faq', true, { faq: hit.faq.id, bot: true });
      return { reply: faqText((lang === 'en' ? hit.faq.a_en : hit.faq.a_sq) || hit.faq.a_sq || hit.faq.a_en || ''), chips: [s(lang, 'chip_staff')], links: faqLinks(hit.faq, lang), products: [], intent: 'faq', handoff: false };
    }
  }

  if (has(folded, HANDOFF_WORDS)) {
    log('handoff', true);
    return { reply: s(lang, 'handoff'), chips: [], links: [{ label: lang === 'en' ? 'Contact' : 'Kontakt', url: path('contact', lang) }], products: [], intent: 'handoff', handoff: true };
  }

  const today = todayStr();
  const d = parseDates(msg, today);

  // Weather ("si është moti sot", "weather tomorrow"): the live logbook, with a link to /tani/.
  // "Çfarë të bëj kur bie shi?" stays a FAQ (things to do), so rain words alone do not route here.
  // "Is the boat trip cancelled in bad weather?" is a policy question: the FAQ (and hand-off) answer.
  if (has(folded, WEATHER_WORDS) && !has(folded, POLICY_WORDS)) {
    const r = await weatherReply(lang, d.problem ? null : d.from);
    log('weather', r.products.length > 0 || r.intent === 'weather');
    return r;
  }

  const roomWord = has(folded, ROOM_ONLY);
  const aboutExp = has(folded, EXP_WORDS) && !roomWord;
  // A date alone ("sot", "e shtunë") is not a room request: rooms only with a room word, a night
  // range ("7–9 nëntor", "për 2 netë") or an availability word ("a keni vende të lira …").
  const datedRooms = roomWord || d.range || has(folded, AVAIL_WORDS);
  // a date that cannot be (30 shkurt, an empty range) is always asked again; "dje / yesterday" only
  // in a booking question ("dje pashë pelikanë…" is not one)
  // A past day only matters in a booking question: "I saw pelicans yesterday, which species?" is a
  // question about birds (it names an experience word, but asks for no booking).
  if (d.problem && (d.problem !== 'past' || roomWord || d.range || has(folded, STRONG_AVAIL))) {
    // A date that does not exist, an end not after the start, or a start in the past: ask again,
    // never answer for other dates than the guest wrote.
    const key: StrKey = d.problem === 'past' ? 'range_past' : 'ask_dates';
    log('range_refused', false, d.from ? { from: d.from } : {});
    return { reply: s(lang, key), chips: [s(lang, 'chip_rooms')], links: [], products: [], intent: 'ask_dates', handoff: false };
  }
  if (d.from && d.to && !d.problem && (aboutExp || datedRooms)) {
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

  // Only rows that share a topic with the question are candidates (matchFaq `ok`). When two are
  // nearly tied, the higher one answers and the other is offered first as a chip ("a ka wifi në
  // dhoma?": the Wi-Fi row and the room-contents row both fit).
  const faq = matchFaq(msg);
  const best = faq[0];
  if (best) {
    const f = best.faq;
    const tied = !!faq[1] && !(best.score >= faq[1].score * 1.15 || best.score - faq[1].score >= 2.5);
    log('faq', true, { faq: f.id, score: Math.round(best.score * 10) / 10, ...(tied ? { tied: faq[1].faq.id } : {}) });
    return {
      reply: faqText((lang === 'en' ? f.a_en : f.a_sq) || f.a_sq || f.a_en || ''),
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

  // "Do you have rooms?" asks for dates; "a ka wifi falas në dhoma?" does not (it has other topics)
  const topicOnly = contentStems(msg).every((st) => has(` ${st} `, [...ROOM_WORDS, ...EXP_WORDS]));
  if ((has(folded, STRONG_AVAIL) || (has(folded, AVAIL_WORDS) && topicOnly)) && has(folded, [...ROOM_WORDS, ...EXP_WORDS])) {
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

  track('assistant_miss', { lang, sid, path: input.context?.path, ua: meta.ua, ip: meta.ip, meta: { q: msg.slice(0, 200) } });
  log('miss', false);
  return { reply: s(lang, 'miss'), chips: [s(lang, 'chip_staff'), ...defaultChips(lang).slice(0, 2)], links: [{ label: lang === 'en' ? 'Contact' : 'Kontakt', url: path('contact', lang) }], products: [], intent: 'miss', handoff: true };
}

export { parseDates };
