import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { admin, adminCookie, call, checkout, makeProduct, rand, tiraneToday, addDays, BASE } from './_lib.mjs';

let a;
let room;
let lastRoom;
let goods;
let exp;
let session;
const orders = [];
const from = addDays(tiraneToday(), 45);
const to = addDays(from, 2);

before(async () => {
  a = admin(await adminCookie());
  room = await makeProduct(a, { slug: `apitest-inv-room-${rand()}`, kind: 'room', price: 5000, units: 3, capacity: 2 });
  lastRoom = await makeProduct(a, { slug: `apitest-last-room-${rand()}`, kind: 'room', price: 5000, units: 1, capacity: 2 });
  goods = await makeProduct(a, { slug: `apitest-last-goods-${rand()}`, kind: 'goods', price: 700, stock: 1 });
  exp = await makeProduct(a, { slug: `apitest-exp-${rand()}`, kind: 'experience', price: 900, capacity: 2 });
  const s = await a.post('/api/admin/sessions', { product_id: exp.id, starts_at: `${addDays(tiraneToday(), 12)}T10:00`, capacity: 1 });
  assert.equal(s.status, 201);
  session = s.data.item;
});

after(async () => {
  for (const id of orders) await a.patch(`/api/admin/orders/${id}`, { status: 'cancelled' });
  for (const p of [room, lastRoom, goods, exp]) if (p) await a.del(`/api/admin/products/${p.id}`);
});

const left = async (slug) => (await call('GET', `/api/availability/room/${slug}?from=${from}&to=${to}`)).data.left;

test('availability decreases after a checkout and the admin grid shows it; cancel releases it', async () => {
  assert.equal(await left(room.slug), 3);
  const r = await checkout([{ key: 'r', slug: room.slug, kind: 'room', qty: 1, from, to, guests: 2 }]);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.match(r.data.code, /^DV-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
  assert.ok(r.data.token.length >= 40);
  assert.equal(r.data.next.type, 'order');
  assert.equal(r.data.order.status, 'pending');
  assert.equal(r.data.order.payment_status, 'unpaid');
  assert.equal(r.data.order.total, 10000);
  assert.equal(await left(room.slug), 2);

  const grid = await a.get(`/api/admin/bookings?from=${from}&to=${to}`);
  const row = grid.data.rooms.find((x) => x.slug === room.slug);
  assert.deepEqual(row.nights.map((n) => n.booked), [1, 1]);
  assert.equal(row.stays[0].code, r.data.code);

  // Public order view needs the token.
  const bad = await call('GET', `/api/order/${r.data.code}?t=wrong`);
  assert.equal(bad.status, 404);
  const ok = await call('GET', `/api/order/${r.data.code}?t=${encodeURIComponent(r.data.token)}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.lines[0].nights, 2);

  const detail = await a.get(`/api/admin/orders/${r.data.code}`);
  assert.equal(detail.data.order.access_token, undefined);
  const c = await a.patch(`/api/admin/orders/${detail.data.order.id}`, { status: 'cancelled' });
  assert.equal(c.status, 200);
  assert.equal(c.data.order.status, 'cancelled');
  assert.equal(await left(room.slug), 3);
});

test('two concurrent checkouts for the last room: exactly one succeeds', async () => {
  const item = [{ key: 'r', slug: lastRoom.slug, kind: 'room', qty: 1, from, to, guests: 1 }];
  const res = await Promise.all([checkout(item), checkout(item)]);
  const codes = res.map((r) => r.status).sort();
  assert.deepEqual(codes, [201, 409], JSON.stringify(res.map((r) => r.data)));
  const loser = res.find((r) => r.status === 409);
  assert.ok(['sold_out', 'cart_problem'].includes(loser.data.error.code));
  const winner = res.find((r) => r.status === 201);
  orders.push(winner.data.order.code);
  assert.equal(await left(lastRoom.slug), 0);
});

test('two concurrent checkouts for the last unit of stock: exactly one succeeds', async () => {
  const item = [{ key: 'g', slug: goods.slug, kind: 'goods', qty: 1 }];
  const res = await Promise.all([checkout(item), checkout(item)]);
  assert.deepEqual(res.map((r) => r.status).sort(), [201, 409]);
  orders.push(res.find((r) => r.status === 201).data.order.code);
  const p = (await call('GET', `/api/product/${goods.slug}`)).data;
  assert.equal(p.left, 0);
});

test('two concurrent checkouts for the last seat of a session: exactly one succeeds', async () => {
  const item = [{ key: 'e', slug: exp.slug, kind: 'experience', qty: 1, session_id: session.id, guests: 1 }];
  const res = await Promise.all([checkout(item), checkout(item)]);
  assert.deepEqual(res.map((r) => r.status).sort(), [201, 409]);
  const winner = res.find((r) => r.status === 201);
  orders.push(winner.data.order.code);
  const month = session.starts_at.slice(0, 7);
  const av = await call('GET', `/api/availability/experience/${exp.slug}?month=${month}`);
  const s = av.data.sessions.find((x) => x.id === session.id);
  assert.equal(s.left, 0);
  assert.equal(s.status, 'full');
  // cancelling gives the seat back
  const d = await a.get(`/api/admin/orders/${winner.data.order.code}`);
  await a.patch(`/api/admin/orders/${d.data.order.id}`, { status: 'cancelled' });
  const av2 = await call('GET', `/api/availability/experience/${exp.slug}?month=${month}`);
  assert.equal(av2.data.sessions.find((x) => x.id === session.id).left, 1);
});

test('card TEST mode: server marks the order paid after the simulator POST', async () => {
  const cfg = await call('GET', '/api/config');
  if (!cfg.data.payments.card || cfg.data.payments.card_mode !== 'test') return;
  const r = await checkout([{ key: 'r', slug: room.slug, kind: 'room', qty: 1, from, to, guests: 1 }], { payment_method: 'card' });
  assert.equal(r.status, 201);
  orders.push(r.data.order.code);
  assert.equal(r.data.next.type, 'redirect');
  const page = await call('GET', r.data.next.url, { raw: true });
  const html = await page.text();
  assert.match(html, /TEST|PROVË/);
  const post = await fetch(BASE + `/api/pay/test/${r.data.code}`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE, 'Sec-Fetch-Site': 'same-origin' },
    body: new URLSearchParams({ t: r.data.token, outcome: 'paid' }),
  });
  assert.equal(post.status, 303);
  const view = await call('GET', `/api/order/${r.data.code}?t=${encodeURIComponent(r.data.token)}`);
  assert.equal(view.data.payment_status, 'paid');
  assert.equal(view.data.status, 'confirmed');
});

test('checkout refuses a cart with problems and cross-site posts', async () => {
  const r = await checkout([{ key: 'x', slug: room.slug, kind: 'room', qty: 1, from, to: from }]);
  assert.equal(r.status, 409);
  assert.equal(r.data.error.code, 'cart_problem');
  const cross = await call('POST', '/api/checkout', { headers: { Origin: 'https://evil.example' }, body: {} });
  assert.equal(cross.status, 403);
});
