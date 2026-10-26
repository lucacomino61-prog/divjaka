import type { APIRoute } from 'astro';
import { E, handle, json, readCapped } from '../../../lib/http';
import { requireAdmin } from '../../../lib/auth';
import { storeImage, MAX_BYTES } from '../../../lib/media';

/**
 * POST /api/admin/upload (multipart/form-data)
 *   fields: w480, w960, w1600 — WebP blobs resized in the browser (at least one required);
 *           Safari sends JPEG instead (one format per upload; src is then the …-1600.jpg URL)
 *           original — optional source image (jpeg/png/webp/avif)
 * Each file ≤ 4 MB, checked by magic bytes. → 201 { id, src, widths:[{w, url, width, height}], original }
 * Store `{ src }` (plus alt_sq/alt_en) in products.images.
 * The raw body is read through a cap (4 files × 4 MB + form overhead) before it is parsed, so a
 * chunked upload without Content-Length cannot grow past it.
 */
export const POST: APIRoute = handle(async ({ locals, request }) => {
  requireAdmin(locals);
  const type = request.headers.get('content-type') || '';
  if (!type.includes('multipart/form-data')) throw E.bad('Dërgoni multipart/form-data.', 'Send multipart/form-data.');
  const raw = await readCapped(request, 4 * MAX_BYTES + 64 * 1024);
  let form: FormData;
  try {
    form = await new Response(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) as Uint8Array<ArrayBuffer>, { headers: { 'Content-Type': type } }).formData();
  } catch {
    throw E.bad('Formulari nuk u lexua.', 'The form could not be read.');
  }
  const files = new Map<string, Uint8Array>();
  for (const [name, key] of [['w480', '480'], ['w960', '960'], ['w1600', '1600'], ['original', 'original']] as const) {
    const f = form.get(name);
    if (f && typeof f !== 'string') {
      if (f.size > MAX_BYTES) throw E.tooLarge();
      files.set(key, new Uint8Array(await f.arrayBuffer()));
    }
  }
  return json(storeImage(files), { status: 201 });
});
