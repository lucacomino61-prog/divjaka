#!/usr/bin/env node
/**
 * tools/wordmark.mjs — outline the poster wordmark at build time (DESIGN §2, PLAN §3).
 *
 *   npm run wordmark
 *
 * Reads the static, overlap-free poster instances made by tools/instance-poster.py
 * (tools/fonts/BricolageGrotesque-Poster800.ttf / -Poster700.ttf: Bricolage Grotesque, OFL,
 * opsz 96 · wdth 75, contours unioned with skia-pathops so a stroked outline is one clean line).
 * Falls back to instancing tools/fonts/BricolageGrotesque-VF.ttf with opentype.js variation
 * support (overlaps then remain — run the Python step first).
 *
 * Spacing: poster tracking -0.025em, plus optical spacing — wherever two neighbouring letters'
 * outlines come closer than MIN_GAP (measured scanline by scanline on the real outlines, so the
 * D bowl / I stem / V arm and K leg / A foot never fuse), the pair is opened up to MIN_GAP.
 *
 * Writes src/assets/wordmark.ts (one SVG path per letter + the tight viewBox, so the giant
 * DIVJAKA never waits for a web font: no CLS, drawable as an outline, then filled) and
 * src/assets/poster-metrics.ts (advance widths for server-side poster fitting).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VF = resolve(root, 'tools/fonts/BricolageGrotesque-VF.ttf');
const OUT = resolve(root, 'src/assets/wordmark.ts');
const TRACKING = -0.025;   // em, same as the text posters (.poster)
const MIN_GAP = 0.02;      // em of paper that must stay between two letters' outlines

const load = (file) => { const b = readFileSync(file); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const vf = load(VF);

function fontFor(wght) {
  const file = resolve(root, `tools/fonts/BricolageGrotesque-Poster${wght}.ttf`);
  if (existsSync(file)) return { font: load(file), coords: null, clean: true };
  console.warn(`! ${file} missing — using the variable font (overlapping contours). Run: python tools/instance-poster.py`);
  return { font: vf, coords: { opsz: 96, wdth: 75, wght }, clean: false };
}

/** Flatten opentype path commands (y already flipped) into closed polygons. */
function polygons(cmds) {
  const polys = [];
  let cur = null, px = 0, py = 0;
  const N = 12;
  for (const c of cmds) {
    if (c.type === 'M') { cur = [[c.x, c.y]]; polys.push(cur); px = c.x; py = c.y; }
    else if (c.type === 'L') { cur.push([c.x, c.y]); px = c.x; py = c.y; }
    else if (c.type === 'Q') {
      for (let i = 1; i <= N; i++) { const t = i / N, u = 1 - t; cur.push([u * u * px + 2 * u * t * c.x1 + t * t * c.x, u * u * py + 2 * u * t * c.y1 + t * t * c.y]); }
      px = c.x; py = c.y;
    } else if (c.type === 'C') {
      for (let i = 1; i <= N; i++) {
        const t = i / N, u = 1 - t;
        cur.push([u ** 3 * px + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t ** 3 * c.x, u ** 3 * py + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t ** 3 * c.y]);
      }
      px = c.x; py = c.y;
    }
  }
  return polys;
}
/** x where the outline crosses the horizontal line y (all crossings). */
function crossings(polys, y) {
  const xs = [];
  for (const p of polys) for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
  }
  return xs;
}
/** Closest horizontal approach between glyph a (left) and glyph b (right), same origin. */
function minGap(a, b, y0, y1) {
  let gap = Infinity;
  for (let y = y0; y <= y1; y += 2) {
    const xa = crossings(a, y), xb = crossings(b, y);
    if (!xa.length || !xb.length) continue;
    gap = Math.min(gap, Math.min(...xb) - Math.max(...xa));
  }
  return gap;
}

function outline(text, { wght = 800, tracking = TRACKING, minGap: want = MIN_GAP } = {}) {
  const { font, coords } = fontFor(wght);
  const upm = font.unitsPerEm;
  const glyphs = [...text].map((ch) => font.charToGlyph(ch));
  // glyph outlines at origin 0, y flipped to SVG (y down) at baseline 0
  const shapes = glyphs.map((g) => {
    const t = coords && font.variation ? font.variation.getTransform(g, coords) : g;
    const cmds = t.path.commands.map((c) => { const m = { ...c }; for (const k of ['y', 'y1', 'y2']) if (k in m) m[k] = -m[k]; return m; });
    return { cmds, adv: t.advanceWidth ?? g.advanceWidth, polys: polygons(cmds) };
  });
  const capTop = -Math.round(font.tables.os2?.sCapHeight || 700);
  let x = 0;
  const letters = [];
  const pairs = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  glyphs.forEach((g, i) => {
    const s = shapes[i];
    if (text[i] !== ' ') {
      const p = new opentype.Path();
      for (const c of s.cmds) { const m = { ...c }; for (const k of ['x', 'x1', 'x2']) if (k in m) m[k] += x; p.commands.push(m); }
      const bb = p.getBoundingBox();
      minX = Math.min(minX, bb.x1); maxX = Math.max(maxX, bb.x2);
      minY = Math.min(minY, bb.y1); maxY = Math.max(maxY, bb.y2);
      letters.push({ char: text[i], d: p.toPathData(1) });
    }
    const next = glyphs[i + 1];
    if (!next) return;
    let step = s.adv + font.getKerningValue(g, next) + tracking * upm;
    if (text[i] !== ' ' && text[i + 1] !== ' ') {
      // optical floor: shift b by `step`, measure the outline gap, open the pair if too tight
      const b = shapes[i + 1].polys.map((poly) => poly.map(([px, py]) => [px + step, py]));
      const gap = minGap(s.polys, b, capTop, 0);
      const floor = want * upm;
      if (gap < floor) step += floor - gap;
      pairs.push(`${text[i]}${text[i + 1]} ${Math.round(Math.max(gap, floor))}`);
    }
    x += step;
  });
  const pad = 2;
  const vx = Math.floor(minX) - pad, vy = Math.floor(minY) - pad;
  const w = Math.ceil(maxX) - vx + pad, h = Math.ceil(maxY) - vy + pad;
  return { out: { text, viewBox: `${vx} ${vy} ${w} ${h}`, width: w, height: h, paths: letters.map((l) => l.d), letters: letters.map((l) => l.char) }, pairs };
}

const main = outline('DIVJAKA');
const hotel = outline('HOTEL PELIKAN', { wght: 700, tracking: 0.02, minGap: 0.03 });

const banner = `// GENERATED by tools/wordmark.mjs — do not edit. Run \`npm run wordmark\` to rebuild.
// Bricolage Grotesque (OFL) at opsz 96 · wdth 75 · wght 800, overlaps removed (tools/instance-poster.py),
// tracking ${TRACKING}em + optical floor ${MIN_GAP}em between outlines; units = font units (1000/em).
`;
const body = `export interface Outline { text: string; viewBox: string; width: number; height: number; paths: string[]; letters: string[] }
export const wordmark: Outline = ${JSON.stringify(main.out)};
export const hotelLine: Outline = ${JSON.stringify(hotel.out)};
export default wordmark;
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, banner + body);

// Poster metrics: advance widths (em) of the poster instance, so <SectionHead size="poster">
// can fit a word to its line on the server (no JS, no CLS). Tracking is added per gap.
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZËÇÉÈÊÖÜÄÁÀÍÓÚÑ0123456789 -–—·.,:;\'’!?&/()°′"«»';
const upm = vf.unitsPerEm;
const adv = {};
for (const ch of CHARS) {
  const g = vf.charToGlyph(ch);
  if (!g || g.index === 0) continue;
  const t = vf.variation ? vf.variation.getTransform(g, { opsz: 96, wdth: 75, wght: 800 }) : g;
  adv[ch] = Math.round(((t.advanceWidth ?? g.advanceWidth) / upm) * 10000) / 10000;
}
// The poster fallback face (Arial Bold, also the metrics of Helvetica Bold on Apple systems):
// its unscaled advances, so SectionHead can pick a size-adjusted fallback face per poster whose
// lines are never wider than the real face's (type.css "Poster Fallback NN").
const FALLBACK_FILES = ['C:/Windows/Fonts/arialbd.ttf', '/Library/Fonts/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf'];
const fbFile = FALLBACK_FILES.find((f) => existsSync(f));
const fbAdv = {};
if (fbFile) {
  const fb = load(fbFile);
  for (const ch of CHARS) {
    const g = fb.charToGlyph(ch);
    if (!g || g.index === 0) continue;
    fbAdv[ch] = Math.round((g.advanceWidth / fb.unitsPerEm) * 10000) / 10000;
  }
} else console.warn('! Arial Bold not found — FALLBACK_ADVANCE left empty (posters use the 60 % fallback)');
const METRICS = resolve(root, 'src/assets/poster-metrics.ts');
writeFileSync(METRICS, `// GENERATED by tools/wordmark.mjs — advance widths in em of Bricolage Grotesque at
// opsz 96 · wdth 75 · wght 800 (the .poster setting). Unknown characters fall back to 'N'.
// Text posters and the outlined wordmark both use ${TRACKING}em (tighter fuses I stems at wght 800).
// FALLBACK_ADVANCE: Arial Bold (the local() poster fallback in type.css), unscaled.
export const TRACKING = ${TRACKING};
export const ADVANCE: Record<string, number> = ${JSON.stringify(adv)};
export const FALLBACK_ADVANCE: Record<string, number> = ${JSON.stringify(fbAdv)};
/** Size-adjust buckets of the "Poster Fallback NN" faces in src/styles/type.css. */
export const FALLBACK_BUCKETS = [50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70];

const sumOf = (text: string, table: Record<string, number>, unknown: number) =>
  [...text.toUpperCase()].reduce((s, c) => s + (table[c] ?? table.N ?? unknown), 0);

/** Width in em of an uppercase poster line (tracking between glyphs included). */
export function posterEm(text: string, tracking: number = TRACKING): number {
  const n = [...text].length;
  return sumOf(text, ADVANCE, 0.6) + tracking * Math.max(0, n);
}

/**
 * Lay a poster out on the server: the longest word fills the line (fitEm, in em), the words are
 * set in the fewest lines that fit and balanced across them, and the fallback face is the
 * largest size-adjust bucket whose every line is no wider than the real face's. Each line is
 * printed nowrap, so a late web font can change neither the line count nor the height (no CLS).
 */
export function posterLayout(title: string, floorEm = 2.2, slack = 1.02): { lines: string[]; fitEm: number; fallback: number } {
  const words = title.split(/\\s+/).filter(Boolean);
  if (!words.length) return { lines: [], fitEm: floorEm * slack, fallback: 60 };
  const fitEm = Math.max(...words.map((w) => posterEm(w)), floorEm) * slack;
  const width = (from: number, to: number) => posterEm(words.slice(from, to).join(' '));
  // fewest lines (greedy), then the split into that many lines with the narrowest widest line
  let count = 1;
  for (let i = 0, w = 0; i < words.length; i++) {
    const next = w === 0 ? posterEm(words[i]) : width(i - w, i + 1);
    if (w > 0 && next > fitEm) { count++; w = 1; } else w++;
  }
  const n = words.length;
  const best: number[][] = Array.from({ length: count + 1 }, () => Array(n + 1).fill(Infinity));
  const cut: number[][] = Array.from({ length: count + 1 }, () => Array(n + 1).fill(0));
  best[0][0] = 0;
  for (let k = 1; k <= count; k++) for (let j = 1; j <= n; j++) for (let i = k - 1; i < j; i++) {
    const w = width(i, j);
    if (w > fitEm && j - i > 1) continue;
    const v = Math.max(best[k - 1][i], w);
    if (v < best[k][j]) { best[k][j] = v; cut[k][j] = i; }
  }
  const lines: string[] = [];
  for (let k = count, j = n; k > 0; k--) { const i = cut[k][j]; lines.unshift(words.slice(i, j).join(' ')); j = i; }
  let fallback = 60;
  if (Object.keys(FALLBACK_ADVANCE).length) {
    const ratio = Math.min(...lines.map((l) => {
      const glyphs = l.replace(/\\s+/g, ' ');
      return sumOf(glyphs, ADVANCE, 0.6) / Math.max(0.01, sumOf(glyphs, FALLBACK_ADVANCE, 0.72));
    }));
    fallback = FALLBACK_BUCKETS.filter((b) => b / 100 <= ratio).at(-1) ?? FALLBACK_BUCKETS[0];
  }
  return { lines, fitEm, fallback };
}
`);
console.log(`poster metrics: ${Object.keys(adv).length} glyphs → ${METRICS}`);
console.log(`wordmark: ${main.out.viewBox} (ratio ${(main.out.width / main.out.height).toFixed(3)}) gaps: ${main.pairs.join(', ')} → ${OUT}`);
console.log(`hotel line: ${hotel.out.viewBox} gaps: ${hotel.pairs.join(', ')}`);
