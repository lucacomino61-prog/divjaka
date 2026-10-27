/**
 * Finds the executable `<script is:inline>` bodies in one .astro source (csp.ts hashes them).
 * Plain TypeScript with no Vite features, so tests/api/csp.test.mjs can import it under Node.
 *
 * A script tag is matched as a whole: its attributes may hold quoted strings and `{expressions}`
 * (one level of nested braces inside, e.g. `set:html={JSON.stringify({ a, b })}`), and a
 * self-closing `<script … />` (JSON / JSON-LD data blocks) ends right there. Treating
 * `<script … />` as an opening tag swallowed the next real inline script up to its `</script>`,
 * so the cart and checkout pre-paint scripts were never hashed and production blocked them.
 */
const OPEN_RE = /<script\b((?:[^>"'{/]|\/(?!>)|"[^"]*"|'[^']*'|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})*)(\/?)>/gi;
const CLOSE_RE = /<\/script\s*>/gi;

export interface InlineBody { body: string; dynamic: boolean }

/** Every `<script is:inline>` with a body that the browser runs (no src, a JavaScript type). */
export function inlineBodies(source: string): InlineBody[] {
  const out: InlineBody[] = [];
  OPEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN_RE.exec(source))) {
    const attrs = m[1];
    if (m[2] === '/') continue; // self-closing: no body
    CLOSE_RE.lastIndex = OPEN_RE.lastIndex;
    const close = CLOSE_RE.exec(source);
    if (!close) break;
    const body = source.slice(OPEN_RE.lastIndex, close.index);
    OPEN_RE.lastIndex = CLOSE_RE.lastIndex;
    if (!/\bis:inline\b/.test(attrs)) continue; // processed scripts become /_astro files
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    out.push({ body, dynamic: /define:vars/.test(attrs) });
  }
  return out;
}

/** `<script … is:inline …>` opening tags in a source, counted independently (for the build check). */
export function countInlineTags(source: string): number {
  return (source.match(/<script\b[^<]*?\bis:inline\b[^<]*?>/gi) ?? []).filter((t) => !/\btype\s*=\s*["']?application\/(?:ld\+)?json/i.test(t) && !/\bsrc\s*=/.test(t)).length;
}
