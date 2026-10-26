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
import { HOTEL_ID, distanceKm, poi as poiOf, parsePath, resolvePoint, KM_PER_UNIT, type Pt, type PointLike } from '../chart/geo';
import { readResearch } from '../site/site-data';
import { fact, sourcesFor, ACCESSED } from '../heritage/facts';
import type { Source } from '../site/SourceList.astro';
import { sunTimes, type SunInfo } from '../../lib/live';
import { findPublished } from '../../lib/catalog';
import { nextSessions, sessionsMonth, type SessionInfo } from '../../lib/availability';
import { tirane } from '../../lib/time';
import { addDays, daysBetween } from '../../i18n/format';
import type { Product } from '../../lib/db/repo/products';
import { getSetting } from '../../lib/db/repo/settings';

export type Pace = 'slow' | 'normal' | 'full';
export interface PlanInput { days: number; arrival: string | null; people: number; interests: Interest[]; pace: Pace; kids: boolean; transport: Transport }

const PACE: Record<string, Pace> = { qete: 'slow', normal: 'normal', plot: 'full', slow: 'slow', full: 'full' };
const PACE_VALUE: Record<Pace, string> = { slow: 'qete', normal: 'normal', full: 'plot' };
const MOVE: Record<string, Transport> = { makine: 'car', biciklete: 'bike', kembe: 'foot', car: 'car', bike: 'bike', foot: 'foot' };
const MOVE_VALUE: Record<Transport, string> = { car: 'makine', bike: 'biciklete', foot: 'kembe' };
/** How far ahead a date may be: the owner's booking horizon (settings.inventory), same as checkout. */
export function horizonDays(): number {
  try { return getSetting('inventory').booking_horizon_days || 548; } catch { return 548; }
}

/** Read the planner's URL. `submitted` = any planner parameter present. */
export function parseInput(sp: URLSearchParams, today = tirane().date): { input: PlanInput; submitted: boolean; problems: string[] } {
  const g = (k: string, alt?: string) => sp.get(k) ?? (alt ? sp.get(alt) : null);
  const problems: string[] = [];
  const keys = ['dite', 'ditë', 'mberritja', 'mbërritja', 'persona', 'interesa', 'ritmi', 'femije', 'fëmijë', 'levizja', 'lëvizja'];
  const submitted = keys.some((k) => sp.has(k));
  let days = Number.parseInt(g('dite', 'ditë') ?? '2', 10);
  if (!Number.isFinite(days) || days < 1 || days > 4) { if (sp.has('dite') || sp.has('ditë')) problems.push('days'); days = Math.min(4, Math.max(1, Number.isFinite(days) ? days : 2)); }
  let arrival = (g('mberritja', 'mbërritja') ?? '').trim() || null;
  // a real calendar day only: Date.parse('2027-02-30') rolls over to 2 March, so round-trip it
  const realDay = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  };
  if (arrival && !realDay(arrival)) { problems.push('date'); arrival = null; }
  if (arrival && arrival < today) { problems.push('date_past'); arrival = null; }
  if (arrival && daysBetween(today, arrival) > horizonDays()) { problems.push('date_far'); arrival = null; }
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
  /** a guided tour: where the group meets (the leg goes there, not to the tour's own place) */
  meet: { poi: string; sq: string; en: string } | null;
  note: { sq: string; en: string } | null;
  refs: number[];
  label: string;
}
/** home: the leg back to the hotel after the last stop (null when the day ends there); km: the day's road km */
export interface Day { n: number; date: string | null; sun: SunInfo | null; stops: Stop[]; home: Travel | null; km: number }
export interface PlanNote { key: string; sq: string; en: string; refs: number[] }
export interface Plan {
  input: PlanInput; days: Day[];
  /** chart points: POI ids, plus road vertices where a straight leg would cross the lagoon */
  route: PointLike[]; legDays: number[];
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

/* ---------- roads round the lagoon ----------
 * A straight leg is fine on the barrier, but a leg that would cross the lagoon (the hotel → the
 * Karavasta churches) goes along the mapped roads instead (research/geo.json paths.roads, OSM):
 * shortest path over the road vertices, joined to both ends by a short straight connector. */
type Net = { pts: Pt[]; adj: { to: number; d: number }[][]; shore: [number, number][] };
let NET: Net | null | undefined;
function roadNet(): Net | null {
  if (NET !== undefined) return NET;
  const g = readResearch<{ paths?: { lagoon?: string; roads?: { d?: string }[] } }>('geo.json');
  const shore = g?.paths?.lagoon ? parsePath(g.paths.lagoon)[0] ?? [] : [];
  const roads = Array.isArray(g?.paths?.roads) ? g!.paths!.roads! : [];
  if (!shore.length || !roads.length) return (NET = null);
  const pts: Pt[] = [];
  const adj: Net['adj'] = [];
  const idx = (x: number, y: number) => {
    // vertices closer than 1.5 units are the same junction (the roads meet in Divjakë town)
    let i = pts.findIndex((p) => Math.hypot(p.x - x, p.y - y) < 1.5);
    if (i < 0) { i = pts.push({ x, y }) - 1; adj.push([]); }
    return i;
  };
  for (const r of roads) for (const ring of parsePath(String(r.d ?? ''))) {
    let prev = -1;
    for (const [x, y] of ring) {
      const i = idx(x, y);
      if (prev >= 0 && prev !== i) {
        const d = Math.hypot(pts[i].x - pts[prev].x, pts[i].y - pts[prev].y);
        adj[i].push({ to: prev, d }); adj[prev].push({ to: i, d });
      }
      prev = i;
    }
  }
  return (NET = { pts, adj, shore });
}
function inLagoon(shore: [number, number][], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = shore.length - 1; i < shore.length; j = i++) {
    const [xi, yi] = shore[i], [xj, yj] = shore[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const crosses = (n: Net, a: Pt, b: Pt) => {
  for (let k = 1; k < 60; k++) { const t = k / 60; if (inLagoon(n.shore, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return true; }
  return false;
};
const roadCache = new Map<string, { via: Pt[]; km: number } | null>();
/** The road way between two chart places when the straight line would cross the lagoon (else null). */
function roadRoute(a: string, b: string): { via: Pt[]; km: number } | null {
  const key = `${a}|${b}`;
  if (roadCache.has(key)) return roadCache.get(key)!;
  let out: { via: Pt[]; km: number } | null = null;
  const n = roadNet(), A = resolvePoint(a), B = resolvePoint(b);
  if (n && A && B && crosses(n, A, B)) {
    const near = (p: Pt) => n.pts.reduce((best, q, i) => (Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(n.pts[best].x - p.x, n.pts[best].y - p.y) ? i : best), 0);
    const s = near(A), e = near(B);
    const dist = n.pts.map(() => Infinity), prev = n.pts.map(() => -1), done = n.pts.map(() => false);
    dist[s] = 0;
    for (;;) {
      let u = -1;
      for (let i = 0; i < dist.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || u === e) break;
      done[u] = true;
      for (const { to, d } of n.adj[u]) if (dist[u] + d < dist[to]) { dist[to] = dist[u] + d; prev[to] = u; }
    }
    if (Number.isFinite(dist[e])) {
      const path: number[] = [];
      for (let i = e; i >= 0; i = prev[i]) path.unshift(i);
      const via = path.map((i) => n.pts[i]);
      const ends = Math.hypot(via[0].x - A.x, via[0].y - A.y) + Math.hypot(B.x - via[via.length - 1].x, B.y - via[via.length - 1].y);
      out = { via, km: (dist[e] + ends * ROAD_FACTOR) * KM_PER_UNIT() };
    }
  }
  roadCache.set(key, out);
  return out;
}
/** Road km between two chart places: along the roads round the lagoon, else straight × road factor. */
function roadKm(a: string, b: string): number | null {
  const r = roadRoute(a, b);
  if (r) return r.km;
  const d = km(a, b);
  return d == null ? null : d * ROAD_FACTOR;
}

/**
 * Where a stop is: a chart POI id, or `far:<activity id>` for the sites off the chart (their
 * research drive time from Divjakë town). A tour with transport starts and ends at the hotel; a
 * guided tour is where its group meets (products.options.meeting: the hotel reception for the
 * dawn birds and the guided park), so the guest's leg goes there, never to the tour's own place.
 */
type Loc = string;
const FAR = 'far:';
function meetOf(a: Activity): Stop['meet'] {
  const m = product(a.product)?.options?.meeting as { poi?: unknown; sq?: unknown; en?: unknown } | undefined;
  if (!m || typeof m !== 'object' || typeof m.poi !== 'string' || !poiOf(m.poi)) return null;
  return { poi: m.poi, sq: String(m.sq ?? ''), en: String(m.en ?? m.sq ?? '') };
}
function locOf(a: Activity): Loc {
  if (a.transportIncluded) return HOTEL_ID;
  if (a.far) return FAR + a.id;
  if (a.product && !a.selfOk) { const m = meetOf(a); if (m) return m.poi; }
  return a.poi ?? HOTEL_ID;
}
const farOf = (loc: Loc) => (loc.startsWith(FAR) ? ACTIVITIES.find((x) => x.id === loc.slice(FAR.length))?.far ?? null : null);

/** chart point ↔ far site: the chart leg to Divjakë town, then the research drive time from town */
function viaTown(chart: Loc, far: { km: number; min: number }): Travel {
  const town = roadKm(chart, 'divjake-centre') ?? 5 * ROAD_FACTOR;
  return { min: round5((town / SPEED.car) * 60 + far.min), km: Math.round(town + far.km), mode: 'car', far: true };
}

/** The leg between two places (null when they are the same place, or under 150 m apart). */
function travel(from: Loc, to: Loc, mode: Transport): Travel | null {
  if (from === to) return null;
  const fa = farOf(from), fb = farOf(to);
  // two far sites never share a day (SAME_DAY); through town as an upper bound if they ever do
  if (fa && fb) return { min: round5(fa.min + fb.min), km: Math.round(fa.km + fb.km), mode: 'car', far: true };
  if (fb) return viaTown(from, fb);
  if (fa) return viaTown(to, fa);
  const d = km(from, to);
  if (d == null || d < 0.15) return null;
  const road = roadKm(from, to) ?? d * ROAD_FACTOR;
  return { min: Math.max(5, round5((road / SPEED[mode]) * 60)), km: Math.round(road * 10) / 10, mode, far: false };
}

/** Longest day we plan for the slow ways of moving, return leg to the hotel included (road km). */
const DAY_MAX_KM: Record<Transport, number> = { car: Infinity, bike: 40, foot: 12 };
/** minutes kept between arriving and the next stop's start (parking, tickets, a breath) */
const GAP = 10;

/** Can this way of moving reach the activity from the hotel? */
function reachable(a: Activity, mode: Transport): boolean {
  if (a.far) return mode === 'car';
  if (!a.poi && !a.transportIncluded) return false;
  const loc = locOf(a);
  if (loc === HOTEL_ID) return true;
  // MAX_LEG is straight-line km: compare the road km on the same footing
  const d = roadKm(HOTEL_ID, loc);
  return d != null && d / ROAD_FACTOR <= MAX_LEG[mode];
}

const EXCLUSIVE: string[][] = [
  ['dawn-birds', 'bird-hide'],
  ['cultural-day', 'karavasta'], ['cultural-day', 'ardenica'], ['cultural-day', 'apollonia'],
  ['guided-park', 'visitor-centre'],
];
/** pairs that never share a day (the tower visit is part of the Visitor Centre visit) */
const SAME_DAY: string[][] = [['visitor-centre', 'tower-sunset'], ['ardenica', 'apollonia']];
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
  /** products that already have a booking box in this plan: one paid visit is offered once per trip */
  const shown = new Set<string>();
  for (let n = 1; n <= input.days; n++) {
    const date = input.arrival ? addDays(input.arrival, n - 1) : null;
    const sunDate = date ?? addDays(today, n - 1);
    const month = Number(sunDate.slice(5, 7));
    const sun = sunTimes(sunDate);
    const stops: Stop[] = [];
    let fullDay = false;
    const dayUsed = new Set<string>();
    const mode = input.transport;
    const sunrise = sun ? toMin(sun.sunrise) : 420;
    const golden = sun ? toMin(sun.golden_start) : 1020;
    const sunset = sun ? toMin(sun.sunset) : 1080;
    const dusk = sun ? toMin(sun.civil_dusk) : 1110;
    /**
     * Does a stop fit at [b, e]? No overlap, and the travel from the stop before (hotel for the
     * first) and to the stop after both fit in the gaps, plus GAP minutes.
     */
    const fits = (a: Activity, b: number, e: number) => {
      if (stops.some((s) => b < toMin(s.end) && e > toMin(s.start))) return false;
      const before = stops.filter((s) => toMin(s.start) < b).sort((x, y) => toMin(y.end) - toMin(x.end))[0];
      const after = stops.filter((s) => toMin(s.start) >= b).sort((x, y) => toMin(x.start) - toMin(y.start))[0];
      if (before) {
        const legIn = travel(locOf(before.act), locOf(a), mode);
        if (b < toMin(before.end) + (legIn?.min ?? 0) + GAP) return false;
      }
      if (after) {
        const legOut = travel(locOf(a), locOf(after.act), mode);
        if (e + (legOut?.min ?? 0) + GAP > toMin(after.start)) return false;
      }
      return true;
    };
    const unuse = (id: string) => {
      const left = (uses.get(id) ?? 1) - 1;
      if (left > 0) uses.set(id, left); else { uses.delete(id); used.delete(id); }
      dayUsed.delete(id);
      if (id === 'dinner') dinners--;
    };

    for (const slot of slots) {
      if (fullDay && (slot === 'morning' || slot === 'afternoon')) continue;
      if (slot === 'evening') {
        const wantDinner = input.interests.includes('food') ? dinners < Math.min(2, input.days) : n === input.days && input.pace !== 'slow' && dinners === 0;
        if (!wantDinner) continue;
      }
      // an open-air place again: at most twice and not two days running — except the beach in
      // the beach months for someone who came for the beach
      const again = (a: Activity) => a.hours === 'open' && !dayUsed.has(a.id)
        && (((uses.get(a.id) ?? 0) < 2 && !prevDay.has(a.id)) || (a.id === 'beach' && input.interests.includes('beach') && [6, 7, 8, 9].includes(month)));
      const cands = ACTIVITIES.filter((a) =>
        a.slots.includes(slot) && a.months.includes(month) && (!used.has(a.id) || again(a)) && !clash(a.id, used) && !clashDay(a.id, dayUsed)
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

      // the part of the day each slot may use (minutes after midnight)
      const win: Record<Slot, [number, number]> = {
        dawn: [sunrise - 60, sunrise + 30], morning: [450, 720], afternoon: [750, Math.max(750, golden - 30)],
        sunset: [golden - 60, golden + 10], evening: [1110, 1260],
      };
      let placed: Stop | null = null;
      for (const { a: best } of ranked) {
        let p = product(best.product);
        if (p && shown.has(p.slug)) {
          // the same paid visit is never offered twice in one trip: a place open to everyone stays
          // as a visit on your own (no booking box), a guided-only tour gives way to another stop
          if (!best.selfOk) continue;
          p = null;
        }
        const minutes = p?.duration_min ?? best.minutes;
        const target = slot === 'dawn' ? sunrise - 20 : slot === 'morning' ? 570 : slot === 'afternoon' ? Math.min(900, golden - 30 - minutes - 45) : slot === 'sunset' ? golden - 20 : 1170;
        // an outdoor stop on its own ends by sunset; the sunset viewpoint by civil dusk
        let limit = best.daylight === 'dusk' ? dusk : best.daylight === 'sunset' ? sunset : Infinity;
        // children on foot or by bike: an outdoor stop ends early enough to be back at the hotel by civil dusk
        if (input.kids && mode !== 'car' && best.daylight) {
          const back = travel(locOf(best), HOTEL_ID, mode);
          limit = Math.min(limit, dusk - (back?.min ?? 0));
        }
        let session: SessionInfo | null = null;
        let next: SessionInfo | null = null;
        let noSession = false;
        /** no date given: the operator's own time of day, read from the coming sessions */
        let timeOfDay: string | null = null;
        const near = (tm: string) => Math.abs(toMin(tm) - target);
        if (p && date) {
          const list = sessionsMonth(p, date.slice(0, 7)).filter((x) => x.date === date && x.status === 'open' && x.left >= input.people && fits(best, toMin(x.time), toMin(x.time) + minutes));
          // a session must belong to this part of the day (± 2 h), else it is another slot's
          session = list.filter((x) => near(x.time) <= 150).sort((x, y) => near(x.time) - near(y.time))[0] ?? null;
          if (!session) {
            if (!best.selfOk) continue;
            // say 'no guided time that day' only where the operator normally runs at this hour; a
            // sunset at the tower is no slot for a 10:30 guided visit, so it gets no booking box
            if (nextSessions(p.id, 60).some((x) => near(x.time) <= 150)) noSession = true;
            else p = null;
          }
        } else if (p && best.selfOk) {
          // open to everyone: planned on your own, the next guided time shown as an option
          next = nextSessions(p.id, 1)[0] ?? null;
        } else if (p) {
          // only with the operator: never the slot's own time (that would invent an hour). Take a
          // time of day the product really runs at, in this part of the day; else skip it.
          const coming = nextSessions(p.id, 60).filter((x) => x.left >= input.people);
          timeOfDay = [...new Set(coming.map((x) => x.time))]
            .filter((tm) => near(tm) <= 150 && fits(best, toMin(tm), toMin(tm) + minutes))
            .sort((x, y) => near(x) - near(y))[0] ?? null;
          if (!timeOfDay) continue;
          next = coming.find((x) => x.time === timeOfDay) ?? null;
        }
        let begin: number | null = null;
        let end = 0;
        if (session || timeOfDay) {
          // the operator's own times
          begin = toMin(session ? session.time : timeOfDay!);
          end = begin + minutes;
        } else {
          // on your own: the slot's time; else right after the stop before (travel included);
          // else early enough to finish in daylight — whichever fits, nearest the slot's time
          const tries = new Set<number>([round5(target)]);
          // no date: a place you may also visit with the guide starts at the guide's own time when
          // that fits, so the plan and the offered session never disagree
          const guided = !date && best.selfOk && next ? toMin(next.time) : null;
          if (guided != null) {
            const [w0, w1] = win[slot];
            const e = guided + minutes;
            if (guided >= w0 && guided <= w1 && e <= limit && fits(best, guided, e)) { begin = guided; end = e; }
          }
          for (const s of stops) {
            const legIn = travel(locOf(s.act), locOf(best), mode);
            tries.add(Math.ceil((toMin(s.end) + (legIn?.min ?? 0) + GAP) / 5) * 5);
          }
          if (Number.isFinite(limit)) tries.add(Math.floor((limit - minutes) / 5) * 5);
          const [w0, w1] = win[slot];
          if (begin == null) for (const b of [...tries].filter((x) => x >= w0 && x <= w1).sort((x, y) => Math.abs(x - target) - Math.abs(y - target))) {
            // at sunset: from golden hour until the light goes (at least 40 minutes), not a fixed length
            const e = slot === 'sunset' && Number.isFinite(limit) ? Math.min(b + minutes, limit) : b + minutes;
            if (e > limit || e - b < (slot === 'sunset' ? 40 : minutes)) continue;
            if (!fits(best, b, e)) continue;
            begin = b; end = e;
            break;
          }
        }
        if (begin == null || !fits(best, begin, end)) continue;
        // on your own: the next guided time is offered only when it is near the planned time
        // (a 10:30 visit is no option for the sunset at the tower)
        if (best.selfOk && next && toMin(next.time) !== begin) next = null;
        // a place open to everyone with nothing to book at this time: no empty booking box
        if (best.selfOk && p && !session && !next && !noSession) p = null;
        const note = best.monthNote && best.monthNote.months.includes(month) ? { sq: best.monthNote.sq, en: best.monthNote.en } : null;
        const refs = refsFor(best, [...(note ? best.monthNote!.facts : []), ...(best.far ? [best.far.fact] : [])]);
        // the meeting point, when the guest goes with the group (a booked time, or a guided-only tour)
        const meet = p && !noSession && (session || !best.selfOk) ? meetOf(best) : null;
        placed = { act: best, slot, start: toHm(begin), end: toHm(end), travel: null, product: p, session, next, noSession, meet, note, refs, label: '' };
        break;
      }
      if (!placed) continue;
      const best = placed.act;
      used.add(best.id);
      dayUsed.add(best.id);
      uses.set(best.id, (uses.get(best.id) ?? 0) + 1);
      if (best.id === 'dinner') dinners++;
      if (best.fullDay) fullDay = true;
      if (placed.product) shown.add(placed.product.slug);
      stops.push(placed);
    }

    // Final order, legs from the hotel and back. Re-check every leg against the timetable and the
    // day's distance for bike / foot (return to the hotel included); a stop that no longer fits is
    // dropped, never squeezed.
    let home: Travel | null = null;
    let dayKm = 0;
    for (let guard = 0; guard < 12; guard++) {
      // keep the day in time order (a sunset session may sit before an afternoon slot in winter)
      stops.sort((a, b) => toMin(a.start) - toMin(b.start));
      let from: Loc = HOTEL_ID;
      dayKm = 0;
      for (const s of stops) {
        s.travel = travel(from, locOf(s.act), mode);
        dayKm += s.travel?.km ?? 0;
        from = locOf(s.act);
      }
      home = travel(from, HOTEL_ID, mode);
      dayKm += home?.km ?? 0;
      let bad = stops.findIndex((s, i) => i > 0 && toMin(s.start) < toMin(stops[i - 1].end) + (s.travel?.min ?? 0) + GAP);
      if (bad < 0 && dayKm > DAY_MAX_KM[mode] && stops.length > 1) {
        // too far for one day on a bike / on foot: drop the stop with the longest way to it
        let worst = 0;
        stops.forEach((s, i) => { if ((s.travel?.km ?? 0) > (stops[worst].travel?.km ?? 0)) worst = i; });
        bad = worst;
      }
      if (bad < 0) break;
      const [gone] = stops.splice(bad, 1);
      unuse(gone.act.id);
      if (gone.product) shown.delete(gone.product.slug);
    }
    stops.forEach((s, i) => { s.label = `${n}.${i + 1}`; });
    days.push({ n, date, sun, stops, home: stops.length ? home : null, km: Math.round(dayKm * 10) / 10 });
    prevDay = dayUsed;
  }

  // the route on the chart: the guest's own legs (hotel → each stop or meeting point → hotel),
  // day after day; a leg that would cross the lagoon follows the roads round it. A guided tour's
  // own place is a pin, not a leg: the group goes there with the guide.
  const route: PointLike[] = [];
  const legDays: number[] = [];
  const pins: Plan['pins'] = [];
  let at: string | null = null;
  for (const d of days) {
    const seq = [HOTEL_ID, ...d.stops.map((s) => locOf(s.act)).filter((x) => !x.startsWith(FAR) && !!poiOf(x)), HOTEL_ID]
      .filter((id, i, a) => i === 0 || id !== a[i - 1]);
    if (!route.length) { route.push(seq[0]); at = seq[0]; }
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === at) continue;
      for (const p of roadRoute(at!, seq[i])?.via ?? []) { route.push({ x: p.x, y: p.y }); legDays.push(d.n); }
      route.push(seq[i]);
      legDays.push(d.n);
      at = seq[i];
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
