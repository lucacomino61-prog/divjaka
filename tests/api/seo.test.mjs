import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admin, adminCookie, call, makeProduct, rand, wellFormed } from './_lib.mjs';

test('product feed: well-formed RSS 2.0 with g: fields; items without an image are left out', async () => {
  const a = admin(await adminCookie());
  const withImg = await makeProduct(a, { slug: `apitest-feed-img-${rand()}`, kind: 'goods', price: 900, stock: 0, images: [{ src: '/media/2026/abcdef12', alt_sq: 'x', alt_en: 'x' }] });
  const noImg = await makeProduct(a, { slug: `apitest-feed-noimg-${rand()}`, kind: 'goods', price: 900 });
  const r = await call('GET', '/feed/products.xml', { raw: true });
  await a.del(`/api/admin/products/${withImg.id}`);
  await a.del(`/api/admin/products/${noImg.id}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /xml/);
  const xml = await r.text();
  assert.equal(wellFormed(xml), null);
  assert.match(xml, /<rss version="2\.0" xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0">/);
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  assert.ok(items.length > 0, 'feed has items');
  const mine = items.find((it) => it.includes(`<g:id>${withImg.slug}</g:id>`));
  assert.ok(mine, 'product with an image is in the feed');
  assert.match(mine, /<g:availability>out_of_stock<\/g:availability>/);
  assert.ok(!xml.includes(noImg.slug), 'product without an image is left out');
  for (const it of items) {
    for (const tag of ['g:id', 'title', 'description', 'link', 'g:image_link', 'g:price', 'g:availability', 'g:brand', 'g:identifier_exists']) assert.match(it, new RegExp(`<${tag}>`), tag);
    assert.match(it, /<g:price>\d+ ALL<\/g:price>/);
    assert.match(it, /<g:brand>Hotel Pelikan<\/g:brand>/);
    assert.match(it, /<g:identifier_exists>no<\/g:identifier_exists>/);
    assert.match(it, /<link>https?:\/\/[^<]+\/<\/link>/);
  }
});

test('product feed: research photos resolve to real files (every g:image_link answers 200); control characters never break the XML', async () => {
  const a = admin(await adminCookie());
  const photo = await makeProduct(a, { slug: `apitest-feed-photo-${rand()}`, kind: 'goods', price: 900, images: [{ slug: 'lagoon-sunset' }, { slug: 'beach-dunes' }] });
  // Admin text with a control character (Word's manual line break) is refused …
  const vt = await a.patch(`/api/admin/products/${photo.id}`, { name_sq: 'Hartë\u000bLaguna' });
  assert.equal(vt.status, 400);
  const r = await call('GET', '/feed/products.xml', { raw: true });
  const rEn = await call('GET', '/feed/products.xml?lang=en', { raw: true });
  const xml = await r.text();
  const xmlEn = await rEn.text();
  await a.del(`/api/admin/products/${photo.id}`);
  assert.equal(wellFormed(xml), null);
  assert.equal(wellFormed(xmlEn), null);
  assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(xml), 'no XML-invalid characters');
  const mine = (xml.match(/<item>[\s\S]*?<\/item>/g) ?? []).find((it) => it.includes(`<g:id>${photo.slug}</g:id>`));
  assert.ok(mine, 'product with a research photo is in the feed');
  assert.match(mine, /<g:image_link>[^<]+\/photos\/lagoon-sunset-\d+\.webp<\/g:image_link>/);
  const links = [...xml.matchAll(/<g:(?:additional_)?image_link>([^<]+)<\/g:(?:additional_)?image_link>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  for (const link of links.filter((l) => l.includes('/photos/'))) {
    const res = await call('GET', new URL(link).pathname, { raw: true });
    assert.equal(res.status, 200, link);
  }
});

test('sitemap: well-formed, both languages with hreflang pairs and x-default', async () => {
  const r = await call('GET', '/sitemap.xml', { raw: true });
  assert.equal(r.status, 200);
  const xml = await r.text();
  assert.equal(wellFormed(xml), null);
  const urls = xml.match(/<url>[\s\S]*?<\/url>/g) ?? [];
  assert.ok(urls.length >= 22);
  const locs = urls.map((u) => /<loc>([^<]+)<\/loc>/.exec(u)[1]);
  assert.ok(locs.some((l) => new URL(l).pathname === '/'));
  assert.ok(locs.some((l) => new URL(l).pathname === '/en/'));
  assert.ok(locs.some((l) => new URL(l).pathname === '/qendrimi/'));
  assert.ok(!locs.some((l) => /\/(arka|shporta|admin|api)\//.test(l)));
  const home = urls.find((u) => /<loc>[^<]+\/<\/loc>/.test(u) && new URL(/<loc>([^<]+)<\/loc>/.exec(u)[1]).pathname === '/');
  assert.match(home, /hreflang="sq"/);
  assert.match(home, /hreflang="en"/);
  assert.match(home, /hreflang="x-default"/);
});

test('robots.txt: allow, disallow admin + api, sitemap line', async () => {
  const r = await call('GET', '/robots.txt', { raw: true });
  const t = await r.text();
  assert.match(t, /User-agent: \*/);
  assert.match(t, /Disallow: \/admin/);
  assert.match(t, /Disallow: \/api\//);
  assert.match(t, /Sitemap: https?:\/\/\S+\/sitemap\.xml/);
});

test('security headers on API responses', async () => {
  const r = await call('GET', '/api/catalog', { raw: true });
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(r.headers.get('permissions-policy'), /camera=\(\)/);
});

test('media: no path traversal, unknown files 404', async () => {
  // (A raw "/media/../data/…" is normalised by fetch to "/data/…" before it leaves the client,
  // so it never reaches this route; encoded traversal does.)
  for (const p of ['/media/2026/..%2F..%2Fdivjaka.db', '/media/..%2Fdivjaka.db', '/media/2026/abc.webp', '/media/2026/0123456789ab-960.webp', '/media/2026/0123456789ab-960.webp%00.png']) {
    const r = await call('GET', p, { raw: true });
    assert.equal(r.status, 404, p);
  }
});
