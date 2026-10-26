/**
 * geo.ts — the lagoon chart's data, server side (reads research/geo.json, OSM © contributors,
 * ODbL). One projection for the whole site: equirectangular, viewBox 0 0 1000 1360,
 * 1 unit = 0.021422 km (research/geo.md). Used by <Chart> and by any view that needs a POI,
 * a distance from the hotel or a crop of the chart.
 *
 *   poi('tower-360')                → { id, name:{sq,en}, x, y, lat, lon, confidence, … }
 *   fromHotelKm('tower-360')        → 2.03   (straight line, km)
 *   kmLabel(2.03, 'sq')             → "≈ 2,0 km"
 *   project(40.99, 19.48)           → { x, y }
 *   layers()                        → simplified path data for every chart layer + waterlines
 *
 * Waterlines (the cartographers' offset lines inside the water) are computed once from a
 * distance field of the lagoon polygon and cached for the life of the server.
 */
import { readResearch } from '../site/site-data';

type Raw = Record<string, any>;
export type Lang = 'sq' | 'en';
export type Pt = { x: number; y: number };

export interface Poi {
  id: string; kind: string;
  name: { sq: string; en: string };
  lat: number; lon: number; x: number; y: number;
  confidence: 'high' | 'medium' | 'low';
  inPark: boolean;
  osmUrl: string | null; mapUrl: string | null;
  /** a chart spot chosen by us (no OSM node), e.g. a point inside the forest polygon */
  virtual?: boolean;
}

export const HOTEL_ID = 'hotel-pelikan';
export const VIEW = { w: 1000, h: 1360 };
const FALLBACK = { lat0: 40.931, cos: 0.755499, upd: 5190.6992, lonMin: 19.345, latMax: 41.062, kmPerUnit: 0.021422 };

function data(): Raw | null {
  const g = readResearch<Raw>('geo.json');
  return g && g.paths && Array.isArray(g.pois) ? g : null;
}

export function hasChart(): boolean { return !!data(); }

/* ---------------- projection ---------------- */

function proj() {
  const p = data()?.projection ?? {};
  return {
    cos: Number(p.cos_lat0) || FALLBACK.cos,
    upd: Number(p.units_per_degree_lat) || FALLBACK.upd,
    lonMin: Number(p.bbox?.lon_min) || FALLBACK.lonMin,
    latMax: Number(p.bbox?.lat_max) || FALLBACK.latMax,
  };
}
export const KM_PER_UNIT = (): number => Number(data()?.scale_km_per_unit) || FALLBACK.kmPerUnit;
export const UNITS_PER_KM = (): number => 1 / KM_PER_UNIT();

export function project(lat: number, lon: number): Pt {
  const p = proj();
  return { x: (lon - p.lonMin) * p.cos * p.upd, y: (p.latMax - lat) * p.upd };
}
export function unproject(x: number, y: number): { lat: number; lon: number } {
  const p = proj();
  return { lat: p.latMax - y / p.upd, lon: p.lonMin + x / (p.cos * p.upd) };
}

/* ---------------- points of interest ---------------- */

/**
 * Spots we place ourselves (no single OSM node): each sits inside the OSM polygon it names.
 * pine-forest: inside landuse=forest way 295114375 (the Divjaka pine forest by location,
 * research/geo.md "forest", confidence medium), 0.8 km north-east of the hotel.
 */
const SPOTS: Poi[] = [
  { id: 'pine-forest', kind: 'forest', name: { sq: 'Pishat e Divjakës', en: 'The Divjaka pines' }, lat: 0, lon: 0, x: 545, y: 432, confidence: 'medium', inPark: true, osmUrl: 'https://www.openstreetmap.org/way/295114375', mapUrl: null, virtual: true },
];

let poiCache: { src: Raw; list: Poi[] } | null = null;
export function pois(): Poi[] {
  const g = data();
  if (!g) return [];
  if (poiCache && poiCache.src === g) return poiCache.list;
  const list: Poi[] = (g.pois as Raw[]).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) => ({
    id: String(p.id), kind: String(p.kind ?? ''),
    name: { sq: String(p.name_sq ?? p.name_en ?? p.id), en: String(p.name_en ?? p.name_sq ?? p.id) },
    lat: Number(p.lat), lon: Number(p.lon), x: Number(p.x), y: Number(p.y),
    confidence: (['high', 'medium', 'low'].includes(p.confidence) ? p.confidence : 'medium') as Poi['confidence'],
    inPark: p.in_park === true,
    osmUrl: typeof p.osm_url === 'string' ? p.osm_url : null,
    mapUrl: typeof p.osm_map_url === 'string' ? p.osm_map_url : null,
  }));
  for (const s of SPOTS) {
    const ll = unproject(s.x, s.y);
    list.push({ ...s, lat: Number(ll.lat.toFixed(6)), lon: Number(ll.lon.toFixed(6)) });
  }
  poiCache = { src: g, list };
  return list;
}

export function poi(id: string | null | undefined): Poi | undefined {
  if (!id) return undefined;
  return pois().find((p) => p.id === id);
}

export type PointLike = string | Pt | { lat: number; lon: number };

/** A POI id, chart x/y or lat/lon → chart point (null when unknown). */
export function resolvePoint(p: PointLike | null | undefined): (Pt & { id?: string }) | null {
  if (!p) return null;
  if (typeof p === 'string') { const q = poi(p); return q ? { x: q.x, y: q.y, id: q.id } : null; }
  if ('x' in p && Number.isFinite(p.x) && Number.isFinite(p.y)) return { x: p.x, y: p.y };
  if ('lat' in p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) return project(p.lat, p.lon);
  return null;
}

/** Straight-line distance in km between two points (chart scale, < 0.4 % error in the box). */
export function distanceKm(a: PointLike, b: PointLike): number | null {
  const p = resolvePoint(a), q = resolvePoint(b);
  if (!p || !q) return null;
  return Math.hypot(p.x - q.x, p.y - q.y) * KM_PER_UNIT();
}
export const fromHotelKm = (p: PointLike): number | null => distanceKm(HOTEL_ID, p);

/** "≈ 2,0 km" / "≈ 2.0 km"; under 1 km one decimal, over 10 km whole km. */
export function kmLabel(km: number | null, lang: Lang): string {
  if (km == null) return '';
  const v = km >= 10 ? Math.round(km).toString() : km.toFixed(1);
  return `≈ ${lang === 'sq' ? v.replace('.', ',') : v} km`;
}

/* ---------------- path helpers ---------------- */

export type Ring = [number, number][];

export function parsePath(d: string): Ring[] {
  const rings: Ring[] = [];
  let cur: Ring | null = null;
  const re = /([MLZmlz])|(-?\d*\.?\d+(?:e-?\d+)?)/g;
  let cmd = 'M';
  const nums: number[] = [];
  const flush = () => {
    for (let i = 0; i + 1 < nums.length; i += 2) {
      if (cmd === 'M' && i === 0) { cur = [[nums[0], nums[1]]]; rings.push(cur); }
      else cur?.push([nums[i], nums[i + 1]]);
    }
    nums.length = 0;
  };
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    if (m[1]) {
      flush();
      cmd = m[1].toUpperCase();
      if (cmd === 'Z') cur = null;
    } else nums.push(Number(m[2]));
  }
  flush();
  return rings.filter((r) => r.length > 1);
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
export function toPath(rings: Ring[], close: boolean): string {
  return rings.map((r) => `M${r.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}${close ? 'Z' : ''}`).join('');
}

/** Douglas–Peucker on one polyline. */
export function simplifyRing(r: Ring, eps: number): Ring {
  if (r.length < 4 || eps <= 0) return r;
  // a closed ring has no baseline (first = last): split it at the point farthest from the start
  const [sx, sy] = r[0], [ex, ey] = r[r.length - 1];
  if (Math.hypot(sx - ex, sy - ey) < 1e-6) {
    let far = 1, fd = -1;
    for (let i = 1; i < r.length - 1; i++) { const d = Math.hypot(r[i][0] - sx, r[i][1] - sy); if (d > fd) { fd = d; far = i; } }
    const a = simplifyOpen(r.slice(0, far + 1), eps), b = simplifyOpen(r.slice(far), eps);
    return [...a, ...b.slice(1)];
  }
  return simplifyOpen(r, eps);
}
function simplifyOpen(r: Ring, eps: number): Ring {
  if (r.length < 3) return r;
  const keep = new Uint8Array(r.length);
  keep[0] = keep[r.length - 1] = 1;
  const stack: [number, number][] = [[0, r.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = r[a], [bx, by] = r[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
    let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * r[i][0] - dx * r[i][1] + bx * ay - by * ax) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return r.filter((_, i) => keep[i]);
}
const simplify = (d: string, eps: number, close: boolean) => toPath(parsePath(d).map((r) => simplifyRing(r, eps)).filter((r) => r.length > 1), close);
export const pointCount = (d: string) => (d.match(/[ML]/g) ?? []).length;

function bboxOf(rings: Ring[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}
function centroid(r: Ring): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
  }
  return a ? { x: cx / (3 * a), y: cy / (3 * a) } : { x: r[0][0], y: r[0][1] };
}

/* ---------------- waterlines: offset lines inside the lagoon ---------------- */

/**
 * Iso-distance lines at `levels` units from the shore (outer shore AND islets), traced with
 * marching squares over a distance field of the water polygon, then simplified. Clean by
 * construction: no self-intersections in narrow arms, rings round every islet.
 */
function waterlinesFrom(rings: Ring[], levels: number[], step = 1.5, eps = 1.25, shore?: { rings: Ring[]; closed: boolean }, isletLevels = Infinity): string[] {
  const [bx0, by0, bx1, by1] = bboxOf(rings);
  const x0 = bx0 - 2, y0 = by0 - 2;
  const nx = Math.ceil((bx1 - bx0 + 4) / step) + 1, ny = Math.ceil((by1 - by0 + 4) / step) + 1;
  const maxL = Math.max(...levels) + step * 2;
  // segments bucketed on a coarse grid so each sample only looks at nearby shore. The distance
  // is measured to `shore` when given (the sea: the coastline only, not the chart's box edges).
  const B = Math.max(maxL, 24);
  const segs: number[] = [];
  const segRing: number[] = [];
  const buckets = new Map<number, number[]>();
  const bnx = Math.ceil((bx1 - bx0 + 4) / B) + 2;
  const bkey = (i: number, j: number) => j * bnx + i;
  const distRings = shore?.rings ?? rings;
  const closed = shore ? shore.closed : true;
  distRings.forEach((r, ri) => { for (let i = 0; i < (closed ? r.length : r.length - 1); i++) {
    const [ax, ay] = r[i], [bx, by] = r[(i + 1) % r.length];
    const s = segs.length / 4;
    segs.push(ax, ay, bx, by);
    segRing.push(ri);
    const i0 = Math.floor((Math.min(ax, bx) - x0) / B), i1 = Math.floor((Math.max(ax, bx) - x0) / B);
    const j0 = Math.floor((Math.min(ay, by) - y0) / B), j1 = Math.floor((Math.max(ay, by) - y0) / B);
    for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
      const k = bkey(ii, jj); const b = buckets.get(k); b ? b.push(s) : buckets.set(k, [s]);
    }
  } });
  const field = new Float32Array(nx * ny);
  // the deeper lines follow the outer shore only: round small islets only the first lines ring
  const fieldOuter = new Float32Array(nx * ny);
  const isletCell = new Uint8Array(nx * ny); // inside the outer shore but on an islet
  for (let j = 0; j < ny; j++) {
    const py = y0 + j * step;
    // scanline inside test: crossings of the row, once per row
    const xs: number[] = [];
    for (const r of rings) for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
      const [xi, yi] = r[i], [xk, yk] = r[k];
      if ((yi > py) !== (yk > py)) xs.push(((xk - xi) * (py - yi)) / (yk - yi) + xi);
    }
    xs.sort((a, b) => a - b);
    const xo: number[] = [];
    if (rings[0]) for (let i = 0, k = rings[0].length - 1; i < rings[0].length; k = i++) {
      const [xi2, yi2] = rings[0][i], [xk2, yk2] = rings[0][k];
      if ((yi2 > py) !== (yk2 > py)) xo.push(((xk2 - xi2) * (py - yi2)) / (yk2 - yi2) + xi2);
    }
    xo.sort((a, b) => a - b);
    let xi = 0, inWater = false, oi = 0, inOuter = false;
    for (let i = 0; i < nx; i++) {
      const px = x0 + i * step;
      while (xi < xs.length && xs[xi] <= px) { inWater = !inWater; xi++; }
      while (oi < xo.length && xo[oi] <= px) { inOuter = !inOuter; oi++; }
      if (!inWater) { field[j * nx + i] = -1; fieldOuter[j * nx + i] = -1; if (!inOuter) continue; isletCell[j * nx + i] = 1; }
      let best = maxL, bestOuter = maxL;
      const bi = Math.floor((px - x0) / B), bj = Math.floor((py - y0) / B);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const b = buckets.get(bkey(bi + di, bj + dj));
        if (!b) continue;
        for (const s of b) {
          const ax = segs[s * 4], ay = segs[s * 4 + 1], ex = segs[s * 4 + 2] - ax, ey = segs[s * 4 + 3] - ay;
          const l2 = ex * ex + ey * ey;
          let t = l2 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d = Math.hypot(px - ax - t * ex, py - ay - t * ey);
          if (d < best) best = d;
          if (segRing[s] === 0 && d < bestOuter) bestOuter = d;
        }
      }
      if (inWater) field[j * nx + i] = best;
      fieldOuter[j * nx + i] = bestOuter;
    }
  }
  const out: string[] = [];
  // marching-squares cases → pairs of cell edges (0 top, 1 right, 2 bottom, 3 left)
  const TABLE: Record<number, [number, number][]> = {
    1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]],
    8: [[2, 3]], 9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]],
  };
  interface Seg { ax: number; ay: number; bx: number; by: number; ka: string; kb: string }
  levels.forEach((L, li) => {
    const F = li >= isletLevels ? fieldOuter : field;
    const segsL: Seg[] = [];
    const ends = new Map<string, number[]>(); // edge key → segment indexes touching it
    const interp = (a: number, b: number) => (L - a) / (b - a);
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const v0 = F[j * nx + i], v1 = F[j * nx + i + 1], v2 = F[(j + 1) * nx + i + 1], v3 = F[(j + 1) * nx + i];
      const c = (v0 > L ? 1 : 0) | (v1 > L ? 2 : 0) | (v2 > L ? 4 : 0) | (v3 > L ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const X = x0 + i * step, Y = y0 + j * step;
      const e = (edge: number): [number, number, string] => {
        if (edge === 0) return [X + step * interp(v0, v1), Y, `h${i},${j}`];
        if (edge === 1) return [X + step, Y + step * interp(v1, v2), `v${i + 1},${j}`];
        if (edge === 2) return [X + step * interp(v3, v2), Y + step, `h${i},${j + 1}`];
        return [X, Y + step * interp(v0, v3), `v${i},${j}`];
      };
      for (const [a, b] of TABLE[c]) {
        const pa = e(a), pb = e(b);
        const idx = segsL.length;
        segsL.push({ ax: pa[0], ay: pa[1], bx: pb[0], by: pb[1], ka: pa[2], kb: pb[2] });
        for (const k of [pa[2], pb[2]]) { const l = ends.get(k); l ? l.push(idx) : ends.set(k, [idx]); }
      }
    }
    const used = new Uint8Array(segsL.length);
    const lines: Ring[] = [];
    for (let s = 0; s < segsL.length; s++) {
      if (used[s]) continue;
      used[s] = 1;
      const line: Ring = [[segsL[s].ax, segsL[s].ay], [segsL[s].bx, segsL[s].by]];
      // grow from the b end (append), then from the a end (prepend)
      for (const fromB of [true, false]) {
        let key = fromB ? segsL[s].kb : segsL[s].ka;
        for (;;) {
          const idx = (ends.get(key) ?? []).find((n) => !used[n]);
          if (idx === undefined) break;
          used[idx] = 1;
          const q = segsL[idx];
          const enterA = q.ka === key;
          const next: [number, number] = enterA ? [q.bx, q.by] : [q.ax, q.ay];
          if (fromB) line.push(next); else line.unshift(next);
          key = enterA ? q.kb : q.ka;
        }
      }
      // with an open shore (the sea) the polygon's own box edges are not shore: cut lines there
      const pieces: Ring[] = [];
      if (shore && !shore.closed) {
        let cur: Ring = [];
        for (const p of line) {
          const edge = p[0] < bx0 + 6 || p[1] < by0 + 6 || p[1] > by1 - 6;
          if (edge) { if (cur.length > 1) pieces.push(cur); cur = []; } else cur.push(p);
        }
        if (cur.length > 1) pieces.push(cur);
      } else if (li >= isletLevels) {
        // a deep line that crosses an islet is cut there (the islet is land)
        let cur: Ring = [];
        for (const p of line) {
          const ci = Math.round((p[0] - x0) / step), cj = Math.round((p[1] - y0) / step);
          if (isletCell[cj * nx + ci]) { if (cur.length > 1) pieces.push(cur); cur = []; } else cur.push(p);
        }
        if (cur.length > 1) pieces.push(cur);
      } else pieces.push(line);
      for (const piece of pieces) {
        let len = 0;
        for (let i = 1; i < piece.length; i++) len += Math.hypot(piece[i][0] - piece[i - 1][0], piece[i][1] - piece[i - 1][1]);
        if (len < 18) continue; // specks round tiny islets read as noise
        lines.push(simplifyRing(piece, eps));
      }
    }
    out.push(toPath(lines, false));
  });
  return out;
}

/** The centre of the widest horizontal stretch of water, averaged over a 24-unit band (a label sits there clear of every shore). */
function widestRun(rings: Ring[]): (Pt & { w: number }) | null {
  const [, y0, , y1] = bboxOf(rings);
  const runs: { y: number; a: number; b: number }[] = [];
  for (let y = Math.ceil(y0) + 1; y < y1; y += 2) {
    const xs: number[] = [];
    for (const r of rings) for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
      const [xi, yi] = r[i], [xk, yk] = r[k];
      if ((yi > y) !== (yk > y)) xs.push(((xk - xi) * (y - yi)) / (yk - yi) + xi);
    }
    xs.sort((a, b) => a - b);
    let best = { y, a: 0, b: 0 };
    for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > best.b - best.a) best = { y, a: xs[i], b: xs[i + 1] };
    runs.push(best);
  }
  // the band of 13 rows (24 units) whose narrowest run is widest: the text box fits in it
  let pick: { y: number; a: number; b: number } | null = null, pickW = 0;
  for (let i = 6; i + 6 < runs.length; i++) {
    const band = runs.slice(i - 6, i + 7);
    const a = Math.max(...band.map((r) => r.a)), b = Math.min(...band.map((r) => r.b));
    if (b - a > pickW) { pickW = b - a; pick = { y: runs[i].y, a, b }; }
  }
  return pick ? { x: (pick.a + pick.b) / 2, y: pick.y, w: pick.b - pick.a } : null;
}

/* ---------------- layers ---------------- */

export interface Lettering { key: string; x: number; y: number; w?: number /* open-water run, chart units */; text: { sq: string; en: string }; kind: 'water' | 'place' | 'river'; size?: 's' | 'm' | 'l' }
export interface Layers {
  coast: string;            // Shkumbin mouth → Seman mouth (north → south), one subpath
  lagoon: string;           // outer shore + islets (evenodd)
  shore: string;            // the outer shore only (one subpath: drawable)
  islets: string;           // the islets' shores
  lagoonCentre: Pt;
  waterlines: string[];     // inner offset lines, nearest the shore first
  seaLines: string[];       // offset lines in the sea along the coast
  park: string;
  forest: string;
  forestOther: string[];
  lagoonsOther: { d: string; name: { sq: string; en: string } | null; centre: Pt }[];
  islands: string[];
  rivers: { d: string; name: { sq: string; en: string } }[];
  roads: string[];
  graticule: { lat: { y: number; label: string }[]; lon: { x: number; label: string }[] };
  lettering: Lettering[];
  points: number;
}

const layerCache = new Map<Detail, { src: Raw; layers: Layers }>();

/** DESIGN §4.6: at most 2 000 path points per chart (the signature re-rasterises it per frame). */
export const WATERLINE_LEVELS = [3.2, 9, 18];
export const SEA_LEVELS = [7];
/**
 * full: every layer (≈ 1 900 points, see README → Chart). mini: thumbnails (shop teaser, cards):
 * coast, lagoon water + shore, park and forest outline, one waterline, coarser (≈ 600 points).
 */
export type Detail = 'full' | 'mini';
const EPS = {
  full: { coast: 0.7, lagoon: 0.85, wl: 1.9, sea: 2.4, park: 2.4, forest: 2.4, other: 2, island: 1, river: 3.5, road: 2 },
  mini: { coast: 2, lagoon: 1.8, wl: 3, sea: 4, park: 4, forest: 4, other: 3, island: 2, river: 5, road: 3 },
};

export function layers(detail: Detail = 'full'): Layers | null {
  const g = data();
  if (!g) return null;
  const hit = layerCache.get(detail);
  if (hit && hit.src === g) return hit.layers;
  const E = EPS[detail];
  const mini = detail === 'mini';
  const P = g.paths as Raw;
  const coastRings = parsePath(String(P.coast));
  const coastNS = coastRings.map((r) => simplifyRing([...r].reverse() as Ring, E.coast));
  const lagoonRings = parsePath(String(P.lagoon)).map((r) => simplifyRing(r, E.lagoon));
  const outer = lagoonRings[0] ?? [];
  const wl = waterlinesFrom(lagoonRings, mini ? WATERLINE_LEVELS.slice(0, 1) : WATERLINE_LEVELS, 1.5, E.wl, undefined, 2);
  const seaRings = parsePath(String(P.sea ?? ''));
  const shoreRings = [...parsePath(String(P.coast_full ?? P.coast)), ...((Array.isArray(P.coast_islands) ? P.coast_islands : []) as Raw[]).flatMap((c) => parsePath(String(c.d)))];
  const sea = seaRings.length && !mini ? waterlinesFrom(seaRings, SEA_LEVELS, 2, E.sea, { rings: shoreRings, closed: false }) : [];
  const ll = (lat: number) => project(lat, 19.4).y;
  const lx = (lon: number) => project(40.9, lon).x;
  const graticule = {
    lat: [40.85, 40.9, 40.95, 41.0, 41.05].map((lat) => ({ y: ll(lat), label: `${Math.floor(lat)}°${String(Math.round((lat % 1) * 60)).padStart(2, '0')}′N` })),
    lon: [19.4, 19.45, 19.5, 19.55].map((lon) => ({ x: lx(lon), label: `${Math.floor(lon)}°${String(Math.round((lon % 1) * 60)).padStart(2, '0')}′E` })),
  };
  const others = (Array.isArray(P.lagoons_other) ? P.lagoons_other : []) as Raw[];
  const rivers = (Array.isArray(P.rivers) ? P.rivers : []) as Raw[];
  const roads = (Array.isArray(P.roads) ? P.roads : []) as Raw[];
  const divjake = poi('divjake-centre');
  const centre = outer.length ? centroid(outer) : { x: 560, y: 650 };
  const label = widestRun(lagoonRings) ?? { x: 600, y: 640, w: 200 };
  const lettering: Lettering[] = [
    // on open water: the middle of the longest horizontal run of water (the label is horizontal)
    { key: 'lagoon', x: label.x, y: label.y, w: label.w, text: { sq: 'Laguna e Karavastasë', en: 'Karavasta Lagoon' }, kind: 'water', size: 'l' },
    { key: 'sea', x: 215, y: 610, text: { sq: 'Deti Adriatik', en: 'Adriatic Sea' }, kind: 'water', size: 'l' },
    ...(divjake ? [{ key: 'divjake', x: divjake.x, y: divjake.y, text: { sq: 'Divjakë', en: 'Divjakë' }, kind: 'place' as const, size: 'm' as const }] : []),
    { key: 'shkumbin', x: 470, y: 92, text: { sq: 'Shkumbini', en: 'Shkumbin' }, kind: 'river', size: 's' },
    { key: 'seman', x: 300, y: 1180, text: { sq: 'Semani', en: 'Seman' }, kind: 'river', size: 's' },
  ];
  const out: Layers = {
    coast: toPath(coastNS, false),
    lagoon: toPath(lagoonRings, true),
    shore: toPath(lagoonRings.slice(0, 1), true),
    islets: toPath(lagoonRings.slice(1), true),
    lagoonCentre: centre,
    waterlines: wl,
    seaLines: sea,
    park: simplify(String(P.park ?? ''), E.park, true),
    forest: simplify(String(P.forest ?? ''), E.forest, true),
    forestOther: mini ? [] : (Array.isArray(P.forest_other) ? P.forest_other : []).map((f: Raw) => simplify(String(f.d), E.forest, true)),
    lagoonsOther: others.map((o) => {
      const rings = parsePath(String(o.d));
      return { d: toPath(rings.map((r) => simplifyRing(r, E.other)), true), name: o.name_sq ? { sq: String(o.name_sq), en: String(o.name_en ?? o.name_sq) } : null, centre: rings[0] ? centroid(rings[0]) : { x: 0, y: 0 } };
    }),
    islands: (Array.isArray(P.coast_islands) ? P.coast_islands : []).map((f: Raw) => simplify(String(f.d), E.island, true)),
    rivers: mini ? [] : rivers.map((r) => ({ d: simplify(String(r.d), E.river, false), name: { sq: String(r.name_sq ?? ''), en: String(r.name_en ?? '') } })),
    roads: mini ? [] : roads.map((r) => simplify(String(r.d), E.road, false)),
    graticule,
    lettering,
    points: 0,
  };
  out.points = [out.coast, out.lagoon, out.shore, out.islets, ...out.waterlines, ...out.seaLines, out.park, out.forest, ...out.forestOther, ...out.lagoonsOther.map((o) => o.d), ...out.islands, ...out.rivers.map((r) => r.d), ...out.roads].reduce((n, d) => n + pointCount(d), 0);
  layerCache.set(detail, { src: g, layers: out });
  return out;
}

/* ---------------- crops ---------------- */

export type Crop = [number, number, number, number];

/** The lagoon, the forest strip, the beach and the hotel: the chart's working sheet. */
export const SHEET_CROP: Crop = [372, 262, 396, 694];

/**
 * A crop around points with padding, at least `min` units on each side, aspect clamped to
 * [minAspect, maxAspect] (w/h), kept inside the chart where possible.
 */
export function cropAround(points: Pt[], o: { pad?: number; min?: number; minAspect?: number; maxAspect?: number } = {}): Crop {
  const pad = o.pad ?? 40, min = o.min ?? 220, minA = o.minAspect ?? 0.75, maxA = o.maxAspect ?? 1.34;
  if (!points.length) return SHEET_CROP;
  let x0 = Math.min(...points.map((p) => p.x)) - pad, x1 = Math.max(...points.map((p) => p.x)) + pad;
  let y0 = Math.min(...points.map((p) => p.y)) - pad, y1 = Math.max(...points.map((p) => p.y)) + pad;
  const grow = (a0: number, a1: number, size: number): [number, number] => { const c = (a0 + a1) / 2; return [c - size / 2, c + size / 2]; };
  if (x1 - x0 < min) [x0, x1] = grow(x0, x1, min);
  if (y1 - y0 < min) [y0, y1] = grow(y0, y1, min);
  let w = x1 - x0, h = y1 - y0;
  if (w / h < minA) { [x0, x1] = grow(x0, x1, h * minA); w = h * minA; }
  if (w / h > maxA) { [y0, y1] = grow(y0, y1, w / maxA); h = w / maxA; }
  const clamp = (a: number, size: number, max: number) => Math.min(Math.max(a, 0), Math.max(0, max - size));
  x0 = clamp(x0, w, VIEW.w); y0 = clamp(y0, h, VIEW.h);
  return [Math.round(x0), Math.round(y0), Math.round(w), Math.round(h)];
}
