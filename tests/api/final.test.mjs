/**
 * Final-pass fixes (2026-10-26): checkout replay by checkout_id, bank transfer refused when it
 * cannot arrive before the service, hold_cap names its lines, reopening an order on a cancelled
 * slot, unknown product category → 400, demo room counts kept off the public API, gift amount
 * step in the message, TEST simulator head, private pages noindex, admin assistant test box not
 * counted. Writes test data: run against a server on a database COPY (README → Commands),
 * started with RATE_LIMIT_FACTOR=50, and set DIVJAKA_DB to that copy for this run too.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { admin, adminCookie, call, env, makeProduct, rand, randomPerson, tiraneToday, addDays, BASE, SAME } from './_lib.mjs';

let a;
let cookie;
const products = [];
const orderIds = [];
const day = (n) => addDays(tiraneToday(), n);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

before(async () => {
  cookie = await adminCookie();
  a = admin(cookie);
});

after(async () => {
  for (const id of orderIds) await a.patch(`/api/admin/orders/${id}`, { status: 'cancelled' });
  for (const p of products) await a.del(`/api/admin/products/${p.id}`);
});

const post = (body) => call('POST', '/api/checkout', { headers: { Origin: BASE }, body: { lang: 'en', terms_accepted: true, payment_method: 'hotel', ...body } });

async function track(code) {
  const d = await a.get(`/api/admin/orders/${code}`);
  orderIds.push(d.data.order.id);
  return d.data.order.id;
}

async function goods(stock) {
  const p = await makeProduct(a, { slug: `apitest-final-${rand()}`, kind: 'goods', price: 1000, stock });
  products.push(p);
  return p;
}

test('a repeated checkout with the same checkout_id answers with the first order and holds once', async () => {
  const p = await goods(10);
  const person = randomPerson();
  const body = { items: [{ key: 'g', slug: p.slug, kind: 'goods', qty: 1 }], customer: person, checkout_id: 'a'.repeat(16) + rand() + rand() };
  const first = await post(body);
  assert.equal(first.status, 201, JSON.stringify(first.data));
  await track(first.data.code);
  const again = await post(body);
  assert.equal(again.status, 201, JSON.stringify(again.data));
  assert.equal(again.data.code, first.data.code);
  assert.equal(again.data.token, first.data.token);
  assert.equal(again.headers.get('x-dv-replay'), '1');
  const item = (await a.get(`/api/admin/products/${p.id}`)).data.item;
  assert.equal(item.stock, 9, 'stock held once');
  // Another e-mail with the same id is another person's checkout.
  const other = await post({ ...body, customer: randomPerson() });
  assert.equal(other.status, 201);
  assert.notEqual(other.data.code, first.data.code);
  await track(other.data.code);
  // Once the first order is cancelled, the same draft makes a new order.
  await a.patch(`/api/admin/orders/${orderIds[0]}`, { status: 'cancelled' });
  const fresh = await post(body);
  assert.equal(fresh.status, 201);
  assert.notEqual(fresh.data.code, first.data.code);
  await track(fresh.data.code);
});

test('409 hold_cap names the line that hit the cap', async () => {
  const p = await goods(4);
  const keep = await post({ items: [{ key: 'g', slug: p.slug, kind: 'goods', qty: 2 }], customer: randomPerson() });
  assert.equal(keep.status, 201, JSON.stringify(keep.data));
  await track(keep.data.code);
  const r = await post({ items: [{ key: 'mine', slug: p.slug, kind: 'goods', qty: 1 }], customer: randomPerson() });
  assert.equal(r.status, 409);
  assert.equal(r.data.error.code, 'hold_cap');
  assert.deepEqual(r.data.error.lines.map((l) => [l.key, l.problem.code]), [['mine', 'hold_cap']]);
  assert.ok(r.data.error.lines[0].problem.message);
});

test('bank transfer is refused for a session that starts before a transfer could arrive', async () => {
  const pw = env().ADMIN_PASSWORD;
  const cur = (await a.get('/api/admin/settings')).data.settings.payments;
  const set = await a.patch('/api/admin/settings', { payments: { iban: 'AL47 2121 1009 0000 0002 3569 8741', beneficiary: 'API Test', methods: { ...cur.methods, bank: true } }, current_password: pw });
  assert.equal(set.status, 200, JSON.stringify(set.data));
  try {
    const exp = await makeProduct(a, { slug: `apitest-final-exp-${rand()}`, kind: 'experience', price: 900, capacity: 6 });
    products.push(exp);
    const soon = await a.post('/api/admin/sessions', { product_id: exp.id, starts_at: `${day(1)}T10:30`, capacity: 6 });
    const later = await a.post('/api/admin/sessions', { product_id: exp.id, starts_at: `${day(10)}T10:30`, capacity: 6 });
    assert.equal(soon.status, 201);
    const line = (s) => ({ key: 'x', slug: exp.slug, kind: 'experience', qty: 1, guests: 1, session_id: s.data.item.id, starts_at: s.data.item.starts_at });
    const late = await post({ items: [line(soon)], customer: randomPerson(), payment_method: 'bank' });
    assert.equal(late.status, 400, JSON.stringify(late.data));
    assert.equal(late.data.error.code, 'bank_late');
    assert.equal(late.data.error.lines[0].key, 'x');
    const ok = await post({ items: [line(later)], customer: randomPerson(), payment_method: 'bank' });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    await track(ok.data.code);
  } finally {
    const back = await a.patch('/api/admin/settings', { payments: { iban: cur.iban ?? '', beneficiary: cur.beneficiary ?? '', methods: cur.methods }, current_password: pw });
    assert.equal(back.status, 200, JSON.stringify(back.data));
  }
});

test('reopening an order on a cancelled time slot says the slot is cancelled', async () => {
  const exp = await makeProduct(a, { slug: `apitest-final-slot-${rand()}`, kind: 'experience', price: 900, capacity: 6 });
  products.push(exp);
  const s = await a.post('/api/admin/sessions', { product_id: exp.id, starts_at: `${day(9)}T11:00`, capacity: 6 });
  const r = await post({ items: [{ key: 'x', slug: exp.slug, kind: 'experience', qty: 1, guests: 1, session_id: s.data.item.id, starts_at: s.data.item.starts_at }], customer: randomPerson() });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const id = await track(r.data.code);
  assert.equal((await a.patch(`/api/admin/orders/${id}`, { status: 'cancelled' })).status, 200);
  assert.equal((await a.patch(`/api/admin/sessions/${s.data.item.id}`, { status: 'cancelled' })).status, 200);
  const reopen = await a.patch(`/api/admin/orders/${id}`, { status: 'pending' });
  assert.equal(reopen.status, 409);
  assert.equal(reopen.data.error.code, 'session_cancelled');
});

test('confirming or marking paid an order on a cancelled time slot needs force: true', async () => {
  const exp = await makeProduct(a, { slug: `apitest-final-slot2-${rand()}`, kind: 'experience', price: 900, capacity: 6 });
  products.push(exp);
  const s = await a.post('/api/admin/sessions', { product_id: exp.id, starts_at: `${day(9)}T12:00`, capacity: 6 });
  const r = await post({ items: [{ key: 'x', slug: exp.slug, kind: 'experience', qty: 1, guests: 1, session_id: s.data.item.id, starts_at: s.data.item.starts_at }], customer: randomPerson() });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const id = await track(r.data.code);
  assert.equal((await a.patch(`/api/admin/sessions/${s.data.item.id}`, { status: 'cancelled' })).status, 200);
  for (const body of [{ status: 'confirmed' }, { status: 'completed' }, { payment_status: 'paid' }]) {
    const no = await a.patch(`/api/admin/orders/${id}`, body);
    assert.equal(no.status, 409, JSON.stringify(body));
    assert.equal(no.data.error.code, 'session_cancelled');
    assert.equal(no.data.error.field, 'force');
  }
  const pub = await call('GET', `/api/order/${r.data.code}?t=${encodeURIComponent(r.data.token)}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.lines[0].session_cancelled, true, 'guest order view flags the cancelled slot');
  const unchanged = (await a.get(`/api/admin/orders/${id}`)).data.order;
  assert.equal(unchanged.status, 'pending');
  assert.equal(unchanged.payment_status, 'unpaid');
  // Notes and cancelling stay free.
  assert.equal((await a.patch(`/api/admin/orders/${id}`, { notes: 'apitest slot gone' })).status, 200);
  const ok = await a.patch(`/api/admin/orders/${id}`, { status: 'confirmed', force: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.order.status, 'confirmed');
  const paid = await a.patch(`/api/admin/orders/${id}`, { payment_status: 'paid', force: true });
  assert.equal(paid.status, 200, JSON.stringify(paid.data));
  assert.equal(paid.data.order.payment_status, 'paid');
});

test('a product with an unknown category or bundle item is a 400 naming the field', async () => {
  const r = await a.post('/api/admin/products', { slug: `apitest-final-cat-${rand()}`, kind: 'goods', name_sq: 'T', name_en: 'T', price: 100, category: 'no-such-category' });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.equal(r.data.error.fields[0].path, 'category');
  const b = await a.post('/api/admin/products', { slug: `apitest-final-bun-${rand()}`, kind: 'bundle', name_sq: 'T', name_en: 'T', price: 100, stock: 1, bundle_items: [{ product_id: 99999999, qty: 1 }] });
  assert.equal(b.status, 400, JSON.stringify(b.data));
  assert.equal(b.data.error.fields[0].path, 'bundle_items.0.product_id');
});

test('demo room counts stay off the public availability API', async (t) => {
  const rooms = (await a.get('/api/admin/products?kind=room&status=published')).data.items;
  if (!rooms.length || rooms.every((r) => !r.demo)) { t.skip('room counts are verified here'); return; }
  const slug = rooms[0].slug;
  const month = await call('GET', `/api/availability/room/${slug}?month=${day(20).slice(0, 7)}`);
  assert.equal(month.status, 200);
  assert.equal(month.data.units, undefined);
  assert.ok(month.data.days.length >= 28);
  assert.ok(month.data.days.every((d) => d.left === undefined && d.status));
  const range = await call('GET', `/api/availability/room/${slug}?from=${day(20)}&to=${day(22)}`);
  assert.equal(range.status, 200);
  assert.equal(range.data.left, undefined);
  assert.ok(range.data.nights.every((n) => n.left === undefined && n.price > 0));
  assert.ok(range.data.quote.total > 0);
});

test('an off-step gift card amount names the step', async () => {
  const g = await makeProduct(a, { slug: `apitest-final-gift-${rand()}`, kind: 'gift', price: 2000, options: { amount_min: 2000, amount_max: 50000, amount_step: 500 } });
  products.push(g);
  const q = await call('POST', '/api/quote', { headers: SAME, body: { lang: 'en', items: [{ key: 'g', slug: g.slug, kind: 'gift', qty: 1, amount: 2550 }] } });
  assert.equal(q.status, 200, JSON.stringify(q.data));
  const msg = q.data.lines[0].problem.message;
  assert.equal(q.data.lines[0].problem.code, 'amount');
  assert.match(msg, /steps of 500/);
  assert.match(msg, /2,000/);
});

test('the TEST card page opts into view transitions and links the site icon', async (t) => {
  const cfg = (await call('GET', '/api/config')).data;
  if (cfg.payments.card_mode !== 'test') { t.skip('card TEST mode is off here'); return; }
  const p = await goods(5);
  const r = await post({ items: [{ key: 'g', slug: p.slug, kind: 'goods', qty: 1 }], customer: randomPerson(), payment_method: 'card' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  await track(r.data.code);
  const page = await fetch(BASE + r.data.next.url);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /@view-transition\{navigation:auto\}/);
  assert.match(html, /<link rel="icon" href="\/favicon\.svg"/);
});

test('order lookup pages are noindex', async () => {
  for (const p of ['/rezervimet/', '/en/bookings/']) {
    const r = await fetch(BASE + p);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('x-robots-tag') ?? '', /noindex/);
  }
});

test('the admin test box on the assistant is not counted in analytics', async () => {
  const file = path.resolve(env().DIVJAKA_DB || path.join(ROOT, 'data', 'divjaka.db'));
  const count = () => {
    const c = new DatabaseSync(file, { readOnly: true, timeout: 5000 });
    try { return Number(c.prepare("SELECT COUNT(*) AS n FROM events WHERE type LIKE 'assistant%'").get().n); } finally { c.close(); }
  };
  const before = count();
  const r = await call('POST', '/api/assistant', { cookie, headers: { ...SAME, 'X-DV-Admin-Test': '1' }, body: { lang: 'en', message: 'What time is breakfast?' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(count(), before);
});
