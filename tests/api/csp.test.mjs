/**
 * CSP hash scanner (src/lib/csp-scan.ts): every `<script is:inline>` in src/**\/*.astro must be
 * found and hashed, including one that follows a self-closing `<script type="application/json" … />`
 * (the cart and checkout pages). Static: needs no server. With API_URL pointing at a PRODUCTION
 * server (node dist/server/entry.mjs), it also hashes the inline scripts of the rendered cart and
 * checkout pages and checks them against the CSP header.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineBodies, countInlineTags } from '../../src/lib/csp-scan.ts';
import { BASE } from './_lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function astroFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...astroFiles(p));
    else if (e.name.endsWith('.astro')) out.push(p);
  }
  return out;
}

test('a self-closing data script does not hide the inline script after it', () => {
  const src = `<script type="application/json" data-x set:html={JSON.stringify({ a: 1 }).replace(/</g, '\\\\u003c')} />
<p>between</p>
<script is:inline>window.__ok = 1;</script>`;
  const b = inlineBodies(src);
  assert.equal(b.length, 1);
  assert.equal(b[0].body, 'window.__ok = 1;');
});

test('processed scripts, src scripts and JSON blocks are not hashed', () => {
  const src = `<script>import './a';</script><script is:inline src="/x.js"></script><script is:inline type="application/ld+json">{}</script><script is:inline type="module">1</script>`;
  assert.deepEqual(inlineBodies(src).map((x) => x.body), ['1']);
});

test('every is:inline tag in src/**/*.astro is found', () => {
  let tags = 0, found = 0;
  for (const f of astroFiles(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(f, 'utf8');
    const n = countInlineTags(src);
    const b = inlineBodies(src).length;
    assert.equal(b, n, `${path.relative(ROOT, f)}: ${n} is:inline tags, ${b} hashed`);
    tags += n; found += b;
  }
  assert.ok(tags > 0 && found === tags);
});

test('production: rendered inline scripts on cart and checkout are allowed by the CSP', async (t) => {
  const r = await fetch(BASE + '/shporta/').catch(() => null);
  const csp = r?.headers.get('content-security-policy') ?? '';
  const scriptSrc = /(?:^|;)\s*script-src ([^;]*)/.exec(csp)?.[1] ?? '';
  if (!r || !scriptSrc || scriptSrc.includes("'unsafe-inline'")) { t.skip('needs a production server at API_URL'); return; }
  for (const p of ['/shporta/', '/arka/', '/en/cart/', '/en/checkout/', '/']) {
    const res = await fetch(BASE + p);
    const html = await res.text();
    const header = res.headers.get('content-security-policy') ?? '';
    const bodies = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
      .filter(([, a]) => !/\bsrc\s*=/.test(a) && !/type\s*=\s*"?application\/(?:ld\+)?json/i.test(a))
      .map(([, , b]) => b);
    for (const b of bodies) {
      const h = `'sha256-${crypto.createHash('sha256').update(b, 'utf8').digest('base64')}'`;
      assert.ok(header.includes(h), `${p}: inline script ${h} not in script-src`);
    }
  }
});
