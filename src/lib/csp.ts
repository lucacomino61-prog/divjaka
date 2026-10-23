/**
 * CSP script hashes, fixed at build time.
 *
 * The allow-list is the sha256 of every `<script is:inline>` block authored in src/**\/*.astro
 * (read as raw source by Vite when the server is built). Nothing that appears in a rendered
 * response can add itself to the list, so an injected <script> stays blocked. Processed
 * `<script>` blocks are bundled to /_astro/*.js files (astro.config.mjs keeps Vite from inlining
 * them) and pass as 'self'. JSON / JSON-LD blocks are data and need no hash.
 *
 * Rules for authors (HANDOFF.md): inline scripts must be static text — no `define:vars`, no
 * `{expressions}` inside them (pass data with a `<script type="application/json">` block or
 * data- attributes instead). Violations are reported to /api/csp-report and logged.
 */
import crypto from 'node:crypto';

const sources = import.meta.glob('/src/**/*.astro', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

const INLINE_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

const sha = (s: string) => `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;

/** Executable inline script bodies in one .astro source. */
export function inlineBodies(source: string): { body: string; dynamic: boolean }[] {
  const out: { body: string; dynamic: boolean }[] = [];
  INLINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(source))) {
    const attrs = m[1];
    if (!/\bis:inline\b/.test(attrs)) continue; // processed scripts become /_astro files
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    out.push({ body: m[2], dynamic: /define:vars/.test(attrs) });
  }
  return out;
}

let cached: Promise<string[]> | null = null;

/** sha256 source list for script-src (computed once per process). */
export function scriptHashes(): Promise<string[]> {
  cached ??= (async () => {
    const set = new Set<string>();
    for (const [file, load] of Object.entries(sources)) {
      let src = '';
      try { src = await load(); } catch { continue; }
      for (const { body, dynamic } of inlineBodies(src)) {
        if (dynamic) {
          console.warn(`[csp] ${file}: an inline script uses define:vars and cannot be hashed; it will be blocked in production.`);
          continue;
        }
        // Sources may be checked out with CRLF; the compiler emits what it reads, so allow both.
        set.add(sha(body));
        set.add(sha(body.replace(/\r\n/g, '\n')));
      }
    }
    return [...set];
  })();
  return cached;
}
