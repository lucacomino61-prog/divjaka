/**
 * Image uploads (POST /api/admin/upload) and serving (/media/<yyyy>/<file>).
 * No native image library is installed, so the admin resizes in the browser (canvas →
 * WebP 480/960/1600, as LC/greta does) and sends the blobs; the server checks magic bytes
 * and size (≤ 4 MB each) and stores them under data/uploads/<yyyy>/<id>-<w>.webp
 * (+ the original as <id>-orig.<ext> when sent).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './db/index';
import { E } from './http';

export const WIDTHS = [480, 960, 1600] as const;
export const MAX_BYTES = 4 * 1024 * 1024;

export const uploadsDir = () => path.join(dataDir(), 'uploads');

export type ImageType = 'webp' | 'jpg' | 'png' | 'avif';

export function sniff(buf: Uint8Array): ImageType | null {
  if (buf.length < 12) return null;
  const ascii = (a: number, b: number) => String.fromCharCode(...buf.subarray(a, b));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (ascii(4, 8) === 'ftyp' && /avi[fs]/.test(ascii(8, 12))) return 'avif';
  return null;
}

/** WebP dimensions (VP8 / VP8L / VP8X). */
export function webpSize(buf: Uint8Array): { w: number; h: number } | null {
  const ascii = (a: number, b: number) => String.fromCharCode(...buf.subarray(a, b));
  const chunk = ascii(12, 16);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  try {
    if (chunk === 'VP8X') return { w: 1 + (dv.getUint16(24, true) | (buf[26] << 16)), h: 1 + (dv.getUint16(27, true) | (buf[29] << 16)) };
    if (chunk === 'VP8 ') return { w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8L') {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      return { w: 1 + (((b1 & 0x3f) << 8) | b0), h: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
  } catch { /* fallthrough */ }
  return null;
}

export interface StoredImage { id: string; src: string; widths: { w: number; url: string; width: number | null; height: number | null }[]; original: string | null }

/** Validate and store one upload set. `files` maps '480' | '960' | '1600' | 'original' → bytes. */
export function storeImage(files: Map<string, Uint8Array>): StoredImage {
  const variants = WIDTHS.filter((w) => files.has(String(w)));
  if (!variants.length) throw E.bad('Mungojnë variantet WebP (480/960/1600).', 'WebP variants (480/960/1600) are missing.');
  for (const [name, buf] of files) {
    if (buf.byteLength > MAX_BYTES) throw E.tooLarge();
    const t = sniff(buf);
    if (name === 'original' ? !t : t !== 'webp') {
      throw E.bad(`Skedari "${name}" nuk është imazh i lejuar.`, `File "${name}" is not an allowed image.`);
    }
  }
  const year = String(new Date().getUTCFullYear());
  const id = crypto.randomBytes(6).toString('hex');
  const dir = path.join(uploadsDir(), year);
  fs.mkdirSync(dir, { recursive: true });
  const widths: StoredImage['widths'] = [];
  for (const w of variants) {
    const buf = files.get(String(w))!;
    fs.writeFileSync(path.join(dir, `${id}-${w}.webp`), buf);
    const size = webpSize(buf);
    widths.push({ w, url: `/media/${year}/${id}-${w}.webp`, width: size?.w ?? null, height: size?.h ?? null });
  }
  let original: string | null = null;
  const orig = files.get('original');
  if (orig) {
    const ext = sniff(orig)!;
    fs.writeFileSync(path.join(dir, `${id}-orig.${ext}`), orig);
    original = `/media/${year}/${id}-orig.${ext}`;
  }
  return { id, src: `/media/${year}/${id}`, widths, original };
}

const SAFE = /^(\d{4})\/([a-f0-9]{8,32})-(480|960|1600|orig)\.(webp|jpg|png|avif)$/;
const TYPES: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', avif: 'image/avif' };

/** Resolve a /media path safely; null when it is not a stored upload. */
export function mediaFile(rel: string): { file: string; type: string } | null {
  const m = SAFE.exec(rel);
  if (!m) return null;
  const file = path.join(uploadsDir(), m[1], `${m[2]}-${m[3]}.${m[4]}`);
  if (!file.startsWith(uploadsDir() + path.sep)) return null;
  return { file, type: TYPES[m[4]] };
}
