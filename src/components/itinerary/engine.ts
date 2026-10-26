/**
 * engine.ts — the itinerary planner's rules engine (T7, server side). Works from the URL alone
 * (GET form, words in the HTML): ?dite=2&mberritja=2026-11-02&persona=2&interesa=zogj,kulture
 * &ritmi=qete|normal|plot&femije=1&levizja=makine|biciklete|kembe
 *
 * For each day: slots by pace (dawn only for birds, never with children) → the best activity per
 * slot from places.ts (interest overlap, month, reach by the chosen way of moving, children) →
 * times from the sun of that date (dawn = sunrise − 20 min, sunset slot = golden hour) or from a
 * real session with places left → travel legs (chart distance × 1.35 at the mode's speed; far
 * sites use research drive times). Never invents hours or prices: hours come from the DB sessions
 * or say "check"; prices from the catalogue.
 */
import { ACTIVITIES, INTEREST_PARAM, INTEREST_VALUE, MAX_LEG, ROAD_FACTOR, SPEED, type Activity, type Interest, type Slot, type Transport } from './places';
import { HOTEL_ID, distanceKm, poi as poiOf } from '../chart/geo';
import { fact, sourcesFor, ACCESSED } from '../heritage/facts';
import type { Source } from '../site/SourceList.astro';
import { sunTimes, type SunInfo } from '../../lib/live';
import { findPublished } from '../../lib/catalog';
import { nextSessions, sessionsMonth, type SessionInfo } from '../../lib/availability';
import { tirane } from '../../lib/time';
import { addDays, daysBetween } from '../../i18n/format';
import type { Product } from '../../lib/db/repo/products';

export type Pace = 'slow' | 'normal' | 'full';
export interface PlanInput { days: number; arrival: string | null; people: number; interests: Interest[]; pace: Pace; kids: boolean; transport: Transport }

const PACE: Record<string, Pace> = { qete: 'slow', normal: 'normal', plot: 'full', slow: 'slow', full: 'full' };
const PACE_VALUE: Record<Pace, string> = { slow: 'qete', normal: 'normal', full: 'plot' };
const MOVE: Record<string, Transport> = { makine: 'car', biciklete: 'bike', kembe: 'foot', car: 'car', bike: 'bike', foot: 'foot' };
const MOVE_VALUE: Record<Transport, string> = { car: 'makine', bike: 'biciklete', foot: 'kembe' };
export const HORIZON_DAYS = 548;

/** Read the planner's URL. `submitted` = any planner parameter present. */
export function parseInput(sp: URLSearchParams, today = tirane().date): { input: PlanInput; submitted: boolean; problems: string[] } {
  const g = (k: string, alt?: string) => sp.get(k) ?? (alt ? sp.get(alt) : null);
  const problems: string[] = [];
  const keys = ['dite', 'ditë', 'mberritja', 'mbërritja', 'persona', 'interesa', 'ritmi', 'femije', 'fëmijë', 'levizja', 'lëvizja'];
  const submitted = keys.some((k) => sp.has(k));
  let days = Number.parseInt(g('dite', 'ditë') ?? '2', 10);
  if (!Number.isFinite(days) || days < 1 || days > 4) { if (sp.has('dite') || sp.has('ditë')) problems.push('days'); days = Math.min(4, Math.max(1, Number.isFinite(days) ? days : 2)); }
  let arrival = (g('mberritja', 'mbërritja') ?? '').trim() || null;
  if (arrival && (!/^\d{4}-\d{2}-\d{2}$/.test(arrival) || Number.isNaN(Date.parse(arrival)))) { problems.push('date'); arrival = null; }
  if (arrival && arrival < today) { problems.push('date_past'); arrival = null; }
  if (arrival && daysBetween(today, arrival) > HORIZON_DAYS) { problems.push('date_far'); arrival = null; }
  let people = Number.parseInt(g('persona') ?? '2', 10);
  if (!Number.isFinite(people) || people < 1) people = 2;
  people = Math.min(10, people);
  const interests = [...new Set(sp.getAll('interesa').flatMap((v) => v.split(',')).map((v) => INTEREST_PARAM[v.trim().toLowerCase()]).filter(Boolean))] as Interest[];
  const pace = PACE[(g('ritmi') ?? '').toLowerCase()] ?? 'normal';
  const kids = ['1', 'po', 'yes', 'on', 'true'].includes((g('femije', 'fëmijë') ?? '').toLowerCase());
  const transport = MOVE[(g('levizja', 'lëvizja') ?? '').toLowerCase()] ?? 'car';
  return { input: { days, arrival, people, interests, pace, kids, transport }, submitted, problems };
}

/** The canonical (shareable) query for a plan. */
export function toQuery(i: PlanInput): string {
  const q = new URLSearchParams();
  q.set('dite', String(i.days));
  if (i.arrival) q.set('mberritja', i.arrival);
  q.set('persona', String(i.people));
  if (i.interests.length) q.set('interesa', i.interests.map((x) => INTEREST_VALUE[x]).join(','));
  q.set('ritmi', PACE_VALUE[i.pace]);
  if (i.kids) q.set('femije', '1');
  q.set('levizja', MOVE_VALUE[i.transport]);
  return q.toString().replace(/%2C/g, ',');
}

export interface Travel { min: number; km: number; mode: Transport; far: boolean }
export interface Stop {
  act: Activity; slot: Slot; start: string; end: string;
  travel: Travel | null;
  product: Product | null;
  session: SessionInfo | null;
  next: SessionInfo | null;
  /** a date was given but no session with enough places that day */
  noSession: boolean;
  note: { sq: string; en: string } | null;
  refs: number[];
  label: string;
}
export interface Day { n: number; date: string | null; sun: SunInfo | null; stops: Stop[] }
export interface PlanNote { key: string; sq: string; en: string; refs: number[] }
export interface Plan {
  input: PlanInput; days: Day[];
  route: string[]; legDays: number[];
  pins: { id: string; n: string; day: number }[];
  sources: Source[]; notes: PlanNote[];
  bookable: number; empty: boolean;
}

const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const toHm = (m: number) => { const x = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
const round5 = (m: number) => Math.round(m / 5) * 5;

/** Straight-line km between two POIs (hotel when null). */
function km(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return distanceKm(a, b);
}

function leg(from: string, act: Activity, mode: Transport): Travel | null {
  if (act.transportIncluded) return null;
  if (act.far) {
    // hotel → Divjakë town on the chart, then the research drive time from town
    const town = km(from, 'divjake-centre') ?? 5;
    const min = (town * ROAD_FACTOR) / SPEED.car * 60 + act.far.min;
    return { min: round5(min), km: Math.round(town * ROAD_FACTOR + act.far.km), mode: 'car', far: true };
  }
  if (!act.poi || act.poi === from) return null;
  const d = km(from, act.poi);
  if (d == null || d < 0.15) return null;
  const road = d * ROAD_FACTOR;
  return { min: Math.max(5, round5((road / SPEED[mode]) * 60)), km: Math.round(road * 10) / 10, mode, far: false };
}

/** Can this way of moving reach the activity from the hotel? */
function reachable(a: Activity, mode: Transport): boolean {
  if (a.transportIncluded) return true;
  if (a.far) return mode === 'car';
  if (!a.poi) return false;
  const d = km(HOTEL_ID, a.poi);
  return d != null && d <= MAX_LEG[mode];
}

const EXCLUSIVE: string[][] = [
  ['dawn-birds', 'bird-hide'],
  ['cultural-day', 'karavasta'], ['cultural-day', 'ardenica'], ['cultural-day', 'apollonia'],
  ['guided-park', 'visitor-centre'],
];
/** pairs that never share a day (the tower visit is part of the Visitor Centre visit) */
const SAME_DAY: string[][] = [['visitor-centre', 'tower-sunset']];
const clashDay = (id: string, day: Set<string>) => SAME_DAY.some(([a, b]) => (a === id && day.has(b)) || (b === id && day.has(a)));
const clash = (id: string, used: Set<string>) => EXCLUSIVE.some(([a, b]) => (a === id && used.has(b)) || (b === id && used.has(a)));

function slotsFor(i: PlanInput): Slot[] {
  const s: Slot[] = i.pace === 'slow' ? ['morning', 'sunset'] : i.pace === 'normal' ? ['morning', 'afternoon', 'sunset'] : ['dawn', 'morning', 'afternoon', 'sunset'];
  if (i.pace === 'normal' && i.interests.includes('birds') && !i.kids) s.unshift('dawn');
  if (i.kids) return [...s.filter((x) => x !== 'dawn'), 'evening'];
  return [...s, 'evening'];
}

const productCache = new Map<string, Product | null>();
function product(slug?: string): Product | null {
  if (!slug) return null;
  if (!productCache.has(slug)) productCache.set(slug, findPublished(slug) ?? null);
  return productCache.get(slug) ?? null;
}


export function buildPlan(input: PlanInput, today = tirane().date): Plan {
  productCache.clear();
  const used = new Set<string>();
  const factIds: string[] = [];
  const osmIds: string[] = [];
  const refsFor = (a: { facts: string[]; osm?: string[] }, extra: string[] = []) => {
    const out: number[] = [];
    for (const id of [...a.facts, ...extra]) {
      if (!fact(id)) continue;
      if (!factIds.includes(id)) factIds.push(id);
      out.push(factIds.indexOf(id));
    }
    for (const id of a.osm ?? []) {
      if (!osmIds.includes(id)) osmIds.push(id);
      out.push(1000 + osmIds.indexOf(id));
    }
    return out;
  };
  const slots = slotsFor(input);
  const days: Day[] = [];
  let dinners = 0;
  const uses = new Map<string, number>();
  let prevDay = new Set<string>();
  for (let n = 1; n <= input.days; n++) {
    const date = input.arrival ? addDays(input.arrival, n - 1) : null;
    const sunDate = date ?? addDays(today, n - 1);
    const month = Number(sunDate.slice(5, 7));
    const sun = sunTimes(sunDate);
    const stops: Stop[] = [];
    let fullDay = false;
    const busy: [number, number][] = [];
    const dayUsed = new Set<string>();
    for (const slot of slots) {
      if (fullDay && (slot === 'morning' || slot === 'afternoon')) continue;
      if (slot === 'evening') {
        const wantDinner = input.interests.includes('food') ? dinners < Math.min(2, input.days) : n === input.days && input.pace !== 'slow' && dinners === 0;
        if (!wantDinner) continue;
      }
      const cands = ACTIVITIES.filter((a) =>
        a.slots.includes(slot) && a.months.includes(month) && (!used.has(a.id) || (a.hours === 'open' && !dayUsed.has(a.id) && (uses.get(a.id) ?? 0) < 2 && !prevDay.has(a.id))) && !clash(a.id, used) && !clashDay(a.id, dayUsed)
        && (!input.kids || a.kids) && reachable(a, input.transport)
        && (!a.product || product(a.product))
        && !(a.fullDay && (slot !== 'morning' || !slots.includes('morning')))
        // the far sites only with a car, and only for culture lovers
        && !(a.far && !input.interests.includes('culture')),
      );
      const ranked: { a: Activity; score: number }[] = [];
      for (const a of cands) {
        const overlap = a.interests.filter((x) => input.interests.includes(x)).length;
        if (input.interests.length && !overlap && !(slot === 'sunset' || slot === 'evening')) continue;
        let score = a.base + overlap * 3;
        if (used.has(a.id)) score -= 5; // an open-air place again, only when nothing new fits
        if (a.fullDay && input.pace === 'full') score -= 2;
        if (a.fullDay && input.days === 1 && input.interests.length > 1) score -= 3;
        if (a.id === 'beach' && ![6, 7, 8, 9].includes(month) && input.interests.includes('beach')) score -= 1;
        ranked.push({ a, score });
      }
      ranked.sort((x, y) => y.score - x.score);

      const sunrise = sun ? toMin(sun.sunrise) : 420;
      const golden = sun ? toMin(sun.golden_start) : 1020;
      const free = (from: number, to: number) => busy.every(([b0, b1]) => to + 15 <= b0 || from >= b1 + 15);
      let placed: Stop | null = null;
      for (const { a: best } of ranked) {
        const p = product(best.product);
        const minutes = p?.duration_min ?? best.minutes;
        const target = slot === 'dawn' ? sunrise - 20 : slot === 'morning' ? 570 : slot === 'afternoon' ? Math.min(900, golden - 30 - minutes - 45) : slot === 'sunset' ? golden - 20 : 1170;
        let session: SessionInfo | null = null;
        let next: SessionInfo | null = null;
        let noSession = false;
        if (p && date) {
          const list = sessionsMonth(p, date.slice(0, 7)).filter((x) => x.date === date && x.status === 'open' && x.left >= input.people && free(toMin(x.time), toMin(x.time) + minutes));
          // a session must belong to this part of the day (± 2 h), else it is another slot's
          session = list.filter((x) => Math.abs(toMin(x.time) - target) <= 150).sort((x, y) => Math.abs(toMin(x.time) - target) - Math.abs(toMin(y.time) - target))[0] ?? null;
          if (!session) { if (!best.selfOk) continue; noSession = true; }
        } else if (p) {
          next = nextSessions(p.id, 1)[0] ?? null;
        }
        const begin = session ? toMin(session.time) : round5(target);
        if (!free(begin, begin + minutes)) continue;
        const note = best.monthNote && best.monthNote.months.includes(month) ? { sq: best.monthNote.sq, en: best.monthNote.en } : null;
        const refs = refsFor(best, [...(note ? best.monthNote!.facts : []), ...(best.far ? [best.far.fact] : [])]);
        placed = { act: best, slot, start: toHm(begin), end: toHm(begin + minutes), travel: null, product: p, session, next, noSession, note, refs, label: '' };
        busy.push([begin, begin + minutes]);
        break;
      }
      if (!placed) continue;
      const best = placed.act;
      used.add(best.id);
      dayUsed.add(best.id);
      uses.set(best.id, (uses.get(best.id) ?? 0) + 1);
      if (best.id === 'dinner') dinners++;
      if (best.fullDay) fullDay = true;
      stops.push(placed);
    }
    // keep the day in time order (a sunset session may sit before an afternoon slot in winter)
    stops.sort((a, b) => toMin(a.start) - toMin(b.start));
    stops.forEach((s, i) => { s.label = `${n}.${i + 1}`; });
    // travel legs follow the final order
    let from: string = HOTEL_ID;
    for (const s of stops) {
      s.travel = leg(from, s.act, input.transport);
      if (s.act.poi && !s.act.transportIncluded) from = s.act.poi;
      else if (s.act.transportIncluded) from = HOTEL_ID;
    }
    days.push({ n, date, sun, stops });
    prevDay = dayUsed;
  }

  // the route on the chart: hotel → the day's stops → hotel, day after day
  const route: string[] = [];
  const legDays: number[] = [];
  const pins: Plan['pins'] = [];
  for (const d of days) {
    const seq = [HOTEL_ID, ...d.stops.map((s) => (s.act.far ? null : s.act.poi)).filter((x): x is string => !!x && !!poiOf(x)), HOTEL_ID]
      .filter((id, i, a) => i === 0 || id !== a[i - 1]);
    if (!route.length) route.push(seq[0]);
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === route[route.length - 1]) continue;
      route.push(seq[i]);
      legDays.push(d.n);
    }
    // one pin per place; stops within 600 m of a pin share it ("1.2 · 3.1"), so labels never pile up
    d.stops.forEach((s) => {
      if (!s.act.poi || s.act.far || s.act.poi === HOTEL_ID || !poiOf(s.act.poi)) return;
      const near = pins.find((p) => p.id === s.act.poi || (distanceKm(p.id, s.act.poi!) ?? 9) < 0.6);
      if (near) { if (!near.n.split(' · ').includes(s.label)) near.n += ` · ${s.label}`; }
      else pins.push({ id: s.act.poi, n: s.label, day: d.n });
    });
  }

  // sources: verified facts first, then the OpenStreetMap entries
  const sources: Source[] = [...sourcesForIds(factIds)];
  for (const id of osmIds) {
    const q = poiOf(id);
    if (q?.osmUrl) sources.push({ title: `${q.name.sq} / ${q.name.en}`, url: q.osmUrl, publisher: 'OpenStreetMap', accessed: ACCESSED });
  }
  // map every stop's refs to 1-based positions in `sources`
  const urlIndex = (u: string) => sources.findIndex((s) => s.url === u);
  for (const d of days) for (const s of d.stops) {
    s.refs = [...new Set(s.refs.map((r) => {
      if (r >= 1000) { const q = poiOf(osmIds[r - 1000]); return q?.osmUrl ? urlIndex(q.osmUrl) + 1 : 0; }
      const f = fact(factIds[r]);
      return f ? urlIndex(f.source.url) + 1 : 0;
    }).filter((x) => x > 0))].sort((a, b) => a - b);
  }

  // practical notes for the month(s) of the trip
  const months = new Set(days.map((d) => Number((d.date ?? addDays(today, d.n - 1)).slice(5, 7))));
  const notes: PlanNote[] = [];
  const note = (key: string, ids: string[], sq: string, en: string) => {
    const refs = ids.map((id) => { const f = fact(id); if (!f) return 0; let i = urlIndex(f.source.url); if (i < 0) { sources.push(f.source); i = sources.length - 1; } return i + 1; }).filter((x) => x > 0);
    notes.push({ key, sq, en, refs });
  };
  if (days.some((d) => d.stops.some((s) => s.act.hours === 'check'))) {
    note('hours', ['visit-08'], 'Qendra e Vizitorëve, kullat dhe muzetë nuk kanë orar zyrtar të publikuar: kontrolloni oraret në vend ose pyesni në recepsion.', 'The Visitor Centre, the towers and the museums have no published official hours: check on the spot or ask at reception.');
  }
  note('ticket', ['park-19'], 'Ministria ka njoftuar biletë hyrjeje 50 lekë për turistët në rrugën e parkut; nuk e kemi verifikuar nëse merret sot.', 'The Ministry announced a 50-lekë entrance ticket for tourists on the park road; we have not verified whether it is collected today.');
  if (input.interests.includes('birds') || days.some((d) => d.stops.some((s) => ['dawn-birds', 'bird-hide', 'boat'].includes(s.act.id)))) {
    note('island', ['park-23'], 'Ishulli i Pelikanit është i mbyllur për publikun: pelikanët shihen nga kullat dhe nga varkat, nga larg.', 'Pelican Island is closed to the public: you watch the pelicans from the towers and the boats, from a distance.');
  }
  if ([6, 7, 8, 9].some((m) => months.has(m))) {
    note('fire', ['prac-10', 'park-22'], 'Vera është stina më e rrezikshme për zjarre në pyll: mos ndizni zjarr dhe mos lini mbeturina jashtë vendeve të caktuara.', 'Summer is the worst season for forest fires: light no fires and leave no waste outside the places set aside for it.');
  }
  if (input.transport === 'bike') {
    note('bike', ['prac-12'], 'Me biçikletë: mbi shtegun prej druri këshillohet ta shtyni biçikletën; shtegu mes lagunës dhe plazhit mund të mos kalohet pas shirave të dendura.', 'By bike: you are asked to push it over the wooden boardwalk; the path between lagoon and beach can be impassable after heavy rain.');
  }

  const bookable = days.reduce((n, d) => n + d.stops.filter((s) => s.session).length, 0);
  return { input, days, route, legDays, pins, sources, notes, bookable, empty: days.every((d) => !d.stops.length) };
}

const sourcesForIds = (ids: string[]): Source[] => sourcesFor(ids);
