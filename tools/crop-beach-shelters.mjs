/**
 * tools/crop-beach-shelters.mjs — final pass (2026-10-26): the "beach-shelters" photo (Leeturtle,
 * CC BY-SA 4.0) has a wooden pole running down its right edge (it read as a lens-hood arc in the
 * 4:3 plates). The plates are 4:3 like the source, so object-position cannot hide it: this crops
 * the raw file to the left 93 % (keeping 4:3: 3035 × 2276 from x 0, y 140, which also drops a wire
 * at the top) and rewrites the six public files (640/1280/1920 × AVIF/WebP, same names, same
 * dimensions), the LQIP, the byte counts and the "changes" note in
 * research/photos.json (CC BY-SA asks that changes are indicated).
 *   node tools/crop-beach-shelters.mjs
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SLUG = 'beach-shelters';
const CROP = { left: 0, top: 140, width: 3035, height: 2276 };
const WIDTHS = [640, 1280, 1920];

const src = sharp(`${root}raw/photos/${SLUG}.jpg`).rotate().extract(CROP);
const base = await src.toBuffer();

for (const w of WIDTHS) {
  const h = Math.round((w * 3) / 4);
  const img = sharp(base).resize(w, h, { fit: 'cover' });
  await img.clone().avif({ quality: 44, effort: 6 }).toFile(`${root}public/photos/${SLUG}-${w}.avif`);
  await img.clone().webp({ quality: 70, effort: 6 }).toFile(`${root}public/photos/${SLUG}-${w}.webp`);
}

const lqipBuf = await sharp(base).resize(24, 18).webp({ quality: 40 }).toBuffer();
const lqip = `data:image/webp;base64,${lqipBuf.toString('base64')}`;

const file = `${root}research/photos.json`;
const raw = readFileSync(file, 'utf8');
const data = JSON.parse(raw);
const list = Array.isArray(data) ? data : data.photos;
const p = list.find((x) => x.slug === SLUG);
p.lqip = lqip;
for (const kind of ['avif', 'webp']) for (const f of p.files[kind]) f.bytes = statSync(`${root}public${f.path}`).size;
p.changes = 'Cropped to the left 93 % (3035 × 2276 px from x 0, y 140; 4:3 kept) to remove a wooden pole along the right edge and a wire at the top; resized and re-encoded to AVIF/WebP, metadata removed; no retouch.';
// keep the file's own indent and CRLF line endings
const indent = (raw.split('\n')[1] ?? '').match(/^ */)[0].length || 1;
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
writeFileSync(file, JSON.stringify(data, null, indent).replace(/\n/g, eol) + (raw.endsWith('\n') ? eol : ''));
console.log(SLUG, lqip.length, p.files.avif.map((f) => f.bytes), p.files.webp.map((f) => f.bytes));
