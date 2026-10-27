/**
 * Docs and dictionary drift (static: reads the repository, needs no server).
 * - Every admin.staff.* key is used somewhere in src: all admin.* keys ship to the browser in
 *   #dv-i18n on every admin page, so an unused key is dead weight (other admin.* prefixes are
 *   partly built at run time, e.g. admin.user.role.${role}, and are not checked here).
 * - Every field the POST /api/checkout body accepts is in the `{…}` list on README's API line
 *   for it (except the honeypot `website`; `sid` is listed as ignored).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function sourceText() {
  const out = [];
  const dict = path.join(ROOT, 'src', 'i18n', 'dict');
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (p !== dict) walk(p); } else if (/\.(astro|ts|mjs|js)$/.test(e.name)) out.push(fs.readFileSync(p, 'utf8'));
    }
  })(path.join(ROOT, 'src'));
  return out.join('\n');
}

test('every admin.staff.* dictionary key is used in src', () => {
  const keys = [...new Set([...read('src/i18n/dict/admin.ts').matchAll(/^\s*'(admin\.staff\.[^']+)':/gm)].map((m) => m[1]))];
  assert.ok(keys.length > 10, 'admin.staff.* keys found');
  const src = sourceText();
  assert.deepEqual(keys.filter((k) => !src.includes(`'${k}'`) && !src.includes(`"${k}"`)), []);
});

test('README names every field of the POST /api/checkout body', () => {
  const route = read('src/pages/api/checkout.ts');
  const body = /const Body = z\.object\(\{([\s\S]*?)\n\}\)/.exec(route)?.[1] ?? '';
  const fields = [...body.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]).filter((f) => f !== 'website' && f !== 'sid');
  assert.ok(fields.includes('checkout_id') && fields.includes('items'), 'schema fields parsed');
  const listed = /^- `POST \/api\/checkout` `\{([^}]*)\}`/m.exec(read('README.md'))?.[1];
  assert.ok(listed, 'README has the POST /api/checkout line with its body fields');
  const named = new Set(listed.split(',').map((s) => s.trim()));
  assert.deepEqual(fields.filter((f) => !named.has(f)), []);
});
