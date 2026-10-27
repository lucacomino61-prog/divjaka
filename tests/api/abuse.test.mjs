/**
 * Abuse limits (T1 fix round 2): unconfirmed holds, per-person caps on normalised e-mails,
 * units below booked, assistant date ranges, JSON errors for unknown API routes, cross-site
 * form posts, CSV phone cells, rooms_verified.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { admin, adminCookie, call, customer, makeProduct, rand, randomPerson, tiraneToday, addDays, BASE } from './_lib.mjs';

let a;
const products = [];
const orderIds = [];
const day = (n) => addDays(tiraneToday(), n);

before(async () => {
  a = admin(await adminCookie());
});

after(async () => {
  for (const id of orderIds) await a.patch(`/api/admin/orders/${id}`, { status: 'cancelled' });
  for (const p of products) await a.del(`/api/admin/products/${p.id}`);
});

const book = (items, person = randomPerson(), extra = {}) =>
  call('POST', '/api/checkout', { headers: { Origin: BASE }, body: { lang: 'en', items, customer: person, payment_method: 'hotel', terms_accepted: true, ...extra } });

async function idOf(code) {
  const d = await a.get(`/api/admin/orders/${code}`);
  orderIds.push(d.data.order.id);
  return d.data.order.id;
}

test('per-person cap counts +tags and Gmail dots as the same address', async () => {
  const room = await makeProduct(a, { slug: `apitest-cap-room-${rand()}`, kind: 'room', price: 1000, units: 20, capacity: 2 });
  products.push(room);
  const base = `apitest${rand()}`;
  const from = day(60);
  const item = [{ key: 'r', slug: room.slug, kind: 'room', qty: 1, from, to: addDays(from, 1), guests: 1 }];
  const phone = () => `+355 6${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
  const emails = [`${base}+0@gmail.com`, `${base}+1@gmail.com`, `${base.slice(0, 3)}.${base.slice(3)}@gmail.com`, `${base}+x@googlemail.com`];
  const res = [];
  for (const email of emails) res.push(await book(item, { ...customer, email, phone: phone() }));
  assert.deepEqual(res.slice(0, 3).map((r) => r.status), [201, 201, 201], JSON.stringify(res.map((r) => r.data?.error)));
  for (const r of res.slice(0, 3)) await idOf(r.data.code);
  assert.equal(res[3].status, 429);
  assert.equal(res[3].data.error.code, 'too_many_open_orders');
  // The same phone number under different addresses is the same person too.
  const shared = phone();
  const p1 = [];
  for (let i = 0; i < 4; i++) p1.push(await book(item, { ...customer, email: `apitest-${rand()}${rand()}@example.com`, phone: shared }));
  for (const r of p1.filter((x) => x.status === 201)) await idOf(r.data.code);
  assert.equal(p1[3].status, 429);
});

test('unconfirmed orders hold at most half of a room type per night; staff confirmation lifts it', async () => {
  const room = await makeProduct(a, { slug: `apitest-share-room-${rand()}`, kind: 'room', price: 1000, units: 4, capacity: 2 });
  products.push(room);
  const from = day(70);
  const to = addDays(from, 2);
  const two = [{ key: 'r', slug: room.slug, kind: 'room', qty: 2, from, to, guests: 2 }];
  const one = [{ key: 'r', slug: room.slug, kind: 'room', qty: 1, from, to, guests: 1 }];
  const first = await book(two);
  assert.equal(first.status, 201, JSON.stringify(first.data));
  const firstId = await idOf(first.data.code);
  const blocked = await book(one);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.error.code, 'hold_cap');
  assert.ok(blocked.data.error.message_sq && blocked.data.error.message_en);
  // Still 2 free: the cap only limits unconfirmed holds, it never hides rooms.
  const grid = await a.get(`/api/admin/bookings?from=${from}&to=${to}`);
  assert.equal(Math.min(...grid.data.rooms.find((x) => x.slug === room.slug).nights.map((n) => n.left)), 2);
  const conf = await a.patch(`/api/admin/orders/${firstId}`, { status: 'confirmed' });
  assert.equal(conf.status, 200);
  assert.equal(conf.data.order.staff_hold, 1);
  const now = await book(one);
  assert.equal(now.status, 201, JSON.stringify(now.data));
  await idOf(now.data.code);
});

test('a room type\'s units cannot drop below what is booked (409 below_booked)', async () => {
  const room = await makeProduct(a, { slug: `apitest-units-room-${rand()}`, kind: 'room', price: 1000, units: 2, capacity: 2 });
  products.push(room);
  const from = day(80);
  const item = [{ key: 'r', slug: room.slug, kind: 'room', qty: 1, from, to: addDays(from, 1), guests: 1 }];
  const r1 = await book(item);
  assert.equal(r1.status, 201);
  await a.patch(`/api/admin/orders/${await idOf(r1.data.code)}`, { status: 'confirmed' });
  const r2 = await book(item);
  assert.equal(r2.status, 201, JSON.stringify(r2.data));
  await idOf(r2.data.code);
  const lower = await a.patch(`/api/admin/products/${room.id}`, { units: 1 });
  assert.equal(lower.status, 409);
  assert.equal(lower.data.error.code, 'below_booked');
  assert.equal(lower.data.error.nights[0].night, from);
  const same = await a.patch(`/api/admin/products/${room.id}`, { units: 2 });
  assert.equal(same.status, 200);
  const more = await a.patch(`/api/admin/products/${room.id}`, { units: 3 });
  assert.equal(more.status, 200);
});

test('assistant: absurd or too long date ranges are refused before any availability work', async () => {
  const ask = (message, lang = 'sq') => call('POST', '/api/assistant', { headers: { Origin: BASE }, body: { lang, message } });
  const t0 = Date.now();
  const huge = await ask('dhoma 0001-01-01 to 9999-12-31');
  const ms = Date.now() - t0;
  assert.equal(huge.status, 200);
  assert.ok(ms < 2000, `took ${ms} ms`);
  const y = Number(tiraneToday().slice(0, 4));
  const long = await ask(`room ${y + 1}-03-01 to ${y + 1}-06-01`, 'en');
  assert.equal(long.status, 200);
  assert.equal(long.data.intent, 'ask_dates');
  assert.match(long.data.reply, /30 nights/);
  assert.equal(long.data.products.length, 0);
  const far = await ask(`room ${y + 2}-12-01 to ${y + 2}-12-03`, 'en');
  assert.equal(far.data.intent, 'ask_dates');
  const ok = await ask(`room ${day(20)} to ${day(22)}`, 'en');
  assert.equal(ok.status, 200);
  assert.equal(ok.data.intent, 'availability');
});

test('/api/live says whether room counts are real (rooms_verified)', async () => {
  const r = await call('GET', '/api/live');
  assert.equal(r.status, 200);
  assert.equal(typeof r.data.availability_today.rooms_verified, 'boolean');
});

test('every /api answer is JSON: unknown routes, cross-site form posts', async () => {
  const nope = await call('GET', '/api/nope-' + rand());
  assert.equal(nope.status, 404);
  assert.match(nope.headers.get('content-type'), /application\/json/);
  assert.equal(nope.data.error.code, 'not_found');
  const form = await call('POST', '/api/contact', { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example' }, body: 'name=x' });
  assert.equal(form.status, 403);
  assert.equal(form.data.error.code, 'cross_site');
  // With Sec-Fetch-Site: cross-site the Vite DEV server answers first (text/plain, dev only);
  // the built server answers in the JSON shape.
  const sfs = await call('POST', '/api/contact', { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' }, body: 'name=x' });
  assert.equal(sfs.status, 403);
  if (typeof sfs.data === 'object') assert.equal(sfs.data.error.code, 'cross_site');
  const scheme = await call('POST', '/api/contact', { headers: { 'Content-Type': 'text/plain', Origin: BASE.replace(/^http:/, 'https:') }, body: '{}' });
  assert.equal(scheme.status, 403, 'same host, other scheme is not same-origin');
});

test('admin: other scheme in Origin is refused; limit=-1 is not "no limit"', async () => {
  const cookie = (await import('./_lib.mjs')).adminCookie;
  const c = await cookie();
  const other = await call('PUT', '/api/admin/settings', { cookie: c, body: {}, headers: { Origin: BASE.replace(/^http:/, 'https:') } });
  assert.equal(other.status, 403);
  const list = await a.get('/api/admin/orders?limit=-1');
  assert.equal(list.status, 200);
  assert.ok(list.data.items.length <= 50);
});

test('customer CSV: phone numbers are not prefixed with an apostrophe; formulas are', async () => {
  const room = await makeProduct(a, { slug: `apitest-csv-room-${rand()}`, kind: 'room', price: 1000, units: 10, capacity: 2 });
  products.push(room);
  const from = day(90);
  const phone = `+355 69 ${Math.floor(Math.random() * 1e7).toString().padStart(7, '0')}`;
  const r = await book([{ key: 'r', slug: room.slug, kind: 'room', qty: 1, from, to: addDays(from, 1), guests: 1 }], { ...randomPerson(), phone, name: '=HYPERLINK("x")' });
  assert.equal(r.status, 201);
  await idOf(r.data.code);
  const csv = await call('GET', '/api/admin/customers/export', { cookie: await adminCookie(), raw: true, headers: { 'Sec-Fetch-Site': 'same-origin' } });
  const text = await csv.text();
  assert.ok(text.includes(`,${phone},`) || text.includes(`,"${phone}",`), 'phone exported as is');
  assert.ok(!text.includes(`'${phone}`), 'no apostrophe before a phone number');
  assert.ok(text.includes(`"'=HYPERLINK(""x"")"`), 'formula guarded');
});

test('analytics beacon: a batch is charged per event and capped at 10', async () => {
  const sid = 'apitest' + rand();
  const ev = (i) => ({ type: 'view', path: `/apitest/${i}`, lang: 'sq', sid });
  const r = await call('POST', '/api/e', { headers: { 'Content-Type': 'text/plain', 'User-Agent': 'Mozilla/5.0 (apitest)' }, body: JSON.stringify({ batch: Array.from({ length: 20 }, (_, i) => ev(i)) }) });
  assert.equal(r.status, 204);
});
