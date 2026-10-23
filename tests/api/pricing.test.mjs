import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { admin, adminCookie, call, makeProduct, rand, tiraneToday, addDays } from './_lib.mjs';

let a;
let room;
let goods;
const offers = [];
const code = 'APITEST' + rand().toUpperCase();

before(async () => {
  a = admin(await adminCookie());
  room = await makeProduct(a, { slug: `apitest-room-${rand()}`, kind: 'room', price: 10000, units: 2, capacity: 2 });
  goods = await makeProduct(a, { slug: `apitest-goods-${rand()}`, kind: 'goods', price: 1000, stock: 5 });
  // Seasonal override for one night: 12 000 instead of 10 000.
  const night = addDays(tiraneToday(), 41);
  const rate = await a.post('/api/admin/room-rates', { product_id: room.id, date_from: night, date_to: night, price: 12000 });
  assert.equal(rate.status, 201);
  const auto = await a.post('/api/admin/offers', { name_sq: 'Test auto', name_en: 'Test auto', type: 'percent', value: 10, scope: { products: [room.slug] }, min_nights: 3 });
  assert.equal(auto.status, 201);
  offers.push(auto.data.item.id);
  const promo = await a.post('/api/admin/offers', { name_sq: 'Test kod', name_en: 'Test code', type: 'fixed', value: 1500, scope: { products: [room.slug, goods.slug] }, code, max_uses: 5, min_total: 2000 });
  assert.equal(promo.status, 201);
  offers.push(promo.data.item.id);
});

after(async () => {
  for (const id of offers) await a.del(`/api/admin/offers/${id}`);
  for (const p of [room, goods]) if (p) await a.del(`/api/admin/products/${p.id}`);
});

const q = (items, promo) => call('POST', '/api/quote', { body: { lang: 'en', items, promo } });

test('room: nights × nightly rate (rate override), no offer under 3 nights', async () => {
  const from = addDays(tiraneToday(), 40);
  const r = await q([{ key: 'r', slug: room.slug, kind: 'room', qty: 1, from, to: addDays(from, 2), guests: 2 }]);
  assert.equal(r.status, 200);
  const l = r.data.lines[0];
  assert.equal(l.problem, undefined);
  assert.equal(l.nights, 2);
  assert.equal(l.line_total, 10000 + 12000);
  assert.equal(l.unit_price, 11000);
  assert.equal(l.offer, undefined);
  assert.equal(r.data.subtotal, 22000);
  assert.equal(r.data.total, 22000);
  assert.equal(r.data.currency, 'ALL');
  assert.ok(r.data.eur_rate > 0);
  assert.match(l.url, /^\/en\/stay\//);
});

test('room: 3 nights × 2 rooms gets the automatic 10% offer with strike-through', async () => {
  const from = addDays(tiraneToday(), 40);
  const r = await q([{ key: 'r', slug: room.slug, kind: 'room', qty: 2, from, to: addDays(from, 3), guests: 3 }]);
  const l = r.data.lines[0];
  const base = (10000 + 12000 + 10000) * 2;
  assert.equal(l.compare_total, base);
  assert.equal(l.offer.saving, Math.round(base * 0.1));
  assert.equal(l.line_total, base - Math.round(base * 0.1));
  assert.equal(r.data.total, l.line_total);
});

test('promo code: fixed discount on scoped lines, min_total and unknown codes', async () => {
  const r = await q([{ key: 'g', slug: goods.slug, kind: 'goods', qty: 3 }], code.toLowerCase());
  assert.equal(r.data.subtotal, 3000);
  assert.equal(r.data.promo.valid, true);
  assert.equal(r.data.discount, 1500);
  assert.equal(r.data.total, 1500);

  const small = await q([{ key: 'g', slug: goods.slug, kind: 'goods', qty: 1 }], code);
  assert.equal(small.data.promo.valid, false);
  assert.equal(small.data.discount, 0);
  assert.equal(small.data.total, 1000);

  const unknown = await q([{ key: 'g', slug: goods.slug, kind: 'goods', qty: 2 }], 'NOPE-' + rand());
  assert.equal(unknown.data.promo.valid, false);
  assert.equal(unknown.data.total, 2000);
  // One message for every failure: a guesser cannot tell an existing code from a made-up one.
  assert.equal(unknown.data.promo.message, small.data.promo.message);
});

test('problems: stock, bad dates, guests over capacity, unknown product count for nothing', async () => {
  const from = addDays(tiraneToday(), 40);
  const r = await q([
    { key: 'a', slug: goods.slug, kind: 'goods', qty: 9 },
    { key: 'b', slug: room.slug, kind: 'room', qty: 1, from, to: from },
    { key: 'c', slug: room.slug, kind: 'room', qty: 1, from, to: addDays(from, 1), guests: 5 },
    { key: 'd', slug: 'does-not-exist-' + rand(), kind: 'goods', qty: 1 },
    { key: 'e', slug: goods.slug, kind: 'goods', qty: 1 },
  ]);
  const byKey = Object.fromEntries(r.data.lines.map((l) => [l.key, l]));
  assert.equal(byKey.a.problem.code, 'stock');
  assert.equal(byKey.b.problem.code, 'dates');
  assert.equal(byKey.c.problem.code, 'guests');
  assert.equal(byKey.d.problem.code, 'unavailable');
  assert.equal(byKey.e.problem, undefined);
  assert.equal(r.data.subtotal, 1000);
});

test('client cannot set prices: unit price in the body is ignored', async () => {
  const r = await q([{ key: 'g', slug: goods.slug, kind: 'goods', qty: 1, unit_price: 1, price: 1 }]);
  assert.equal(r.data.total, 1000);
});

test('validation errors use the bilingual error shape', async () => {
  const r = await call('POST', '/api/quote', { body: { items: 'nope' } });
  assert.equal(r.status, 400);
  assert.equal(r.data.error.code, 'bad_request');
  assert.ok(r.data.error.message_sq && r.data.error.message_en);
});
