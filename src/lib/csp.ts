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
import { countInlineTags, inlineBodies } from './csp-scan';

const sources = import.meta.glob('/src/**/*.astro', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

const sha = (s: string) => `'sha256-${crypto.createHash('sha256').update(s, 'utf8').digest('base64')}'`;

export { inlineBodies };

let cached: Promise<string[]> | null = null;

/** sha256 source list for script-src (computed once per process). */
export function scriptHashes(): Promise<string[]> {
  cached ??= (async () => {
    const set = new Set<string>();
    for (const [file, load] of Object.entries(sources)) {
      let src = '';
      try { src = await load(); } catch { continue; }
      const bodies = inlineBodies(src);
      // An inline script the scanner missed would ship unhashed and be blocked in production.
      if (bodies.length !== countInlineTags(src)) {
        console.error(`[csp] ${file}: found ${countInlineTags(src)} <script is:inline> tags but hashed ${bodies.length}; check csp-scan.ts.`);
      }
      for (const { body, dynamic } of bodies) {
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
