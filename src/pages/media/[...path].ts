import type { APIRoute } from 'astro';
import fs from 'node:fs';
import { mediaFile } from '../../lib/media';

/** GET /media/<yyyy>/<id>-<480|960|1600|orig>.<ext> — uploaded images, immutable (names are random ids). */
export const GET: APIRoute = async ({ params, request }) => {
  const m = mediaFile(String(params.path ?? ''));
  if (!m) return new Response('Not found', { status: 404 });
  let st: fs.Stats;
  try {
    st = fs.statSync(m.file);
  } catch {
    return new Response('Not found', { status: 404 });
  }
  const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  const headers = { 'Content-Type': m.type, 'Cache-Control': 'public, max-age=31536000, immutable', ETag: etag, 'Content-Length': String(st.size) };
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  return new Response(fs.readFileSync(m.file), { headers });
};
