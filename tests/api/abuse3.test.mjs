/**
 * Abuse limits (T1 fix round 3): unconfirmed holds on experience seats and tracked stock, short
 * holds, phone required, TEST-paid orders stay counted, staff cannot publish or price, password
 * re-entry for payment details and its throttle, assistant date problems, strict quantities,
 * CSV formula guard, DST gap, private caching of order pages.
 * Run against a server started with RATE_LIMIT_FACTOR=50 (README → Commands).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { admin, adminCookie, call, customer, env, makeProduct, rand, randomPerson, tiraneToday, addDays, BASE, SAME } from './_lib.mjs';

let a;
const products = [];
const orderIds = [];
const day = (n) => addDays(tiraneToday(), n);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let staff = null;

/**
 * This file writes a staff account straight into the database the server uses, so it runs only
 * against a COPY: DIVJAKA_DB (the same value the server was started with) must point somewhere
 * other than the shared data/divjaka.db.
 */
function dbFile() {
  const e = env();
  const file = path.resolve(e.DIVJAKA_DB || path.join(e.DIVJAKA_DATA || path.join(ROOT, 'data'), 'divjaka.db'));
  if (file.toLowerCase() === path.resolve(ROOT, 'data', 'divjaka.db').toLowerCase()) {
    throw new Error('abuse3.test.mjs writes admin_users directly: start the server on a database copy and set DIVJAKA_DB to that copy for the test run too.');
  }
  return file;
}

function db() {
  const conn = new DatabaseSync(dbFile(), { timeout: 5000 });
  conn.exec('PRAGMA foreign_keys = ON');
  conn.exec('PRAGMA busy_timeout = 5000');
  return conn;
}

function scrypt(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

async function login(email, password) {
  const res = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...SAME }, body: JSON.stringify({ email, password }) });
  assert.equal(res.status, 200, 'staff login');
  return (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith('dv_admin=')).split(';')[0];
}

before(async () => {
  a = admin(await adminCookie());
  const email = `apitest-staff-${rand()}@example.com`;
  const password = crypto.randomBytes(18).toString('base64url');
  const conn = db();
  // Leftovers of an interrupted run (sessions and devices cascade).
  conn.prepare("DELETE FROM admin_users WHERE email LIKE 'apitest-staff-%@example.com'").run();
  const id = Number(conn.prepare("INSERT INTO admin_users (email, name, password_hash, role, created_at) VALUES (?, 'API staff', ?, 'staff', ?)").run(email, scrypt(password), new Date().toISOString()).lastInsertRowid);
  conn.close();
  staff = { id, email, password, cookie: await login(email, password) };
});

after(async () => {
  for (const id of orderIds) await a.patch(`/api/admin/orders/${id}`, { status: 'cancelled' });
  for (const p of products) await a.del(`/api/admin/products/${p.id}`);
  if (staff) {
    const conn = db();
    conn.prepare('DELETE FROM admin_sessions WHERE user_id = ?').run(staff.id);
    conn.prepare('DELETE FROM admin_devices WHERE user_id = ?').run(staff.id);
    conn.prepare('DELETE FROM admin_users WHERE id = ?').run(staff.id);
    conn.close();
  }
});

const book = (items, extra = {}, person = randomPerson()) =>
  call('POST', '/api/checkout', { headers: { Origin: BASE }, body: { lang: 'en', items, customer: person, payment_method: 'hotel', terms_accepted: true, ...extra } });

async function track(code) {
  const d = await a.get(`/api/admin/orders/${code}`);
  orderIds.push(d.data.order.id);
  return d.data.order;
}

async function experienceWithSession(capacity) {
  const exp = await makeProduct(a, { slug: `apitest-seat-exp-${rand()}`, kind: 'experience', price: 1000, capacity });
  products.push(exp);
  const s = await a.post('/api/admin/sessions', { product_id: exp.id, starts_at: `${day(14)}T10:00`, capacity });
  assert.equal(s.status, 201, JSON.stringify(s.data));
  return { exp, session: s.data.item };
}

test('seats: unconfirmed orders hold at most half a session; one line takes at most 10 people', async () => {
  const { exp, session } = await experienceWithSession(10);
  const line = (n) => [{ key: 'e', slug: exp.slug, kind: 'experience', qty: n, guests: n, session_id: session.id }];
  const first = await book(line(5));
  assert.equal(first.status, 201, JSON.stringify(first.data));
  await track(first.data.code);
  const second = await book(line(1));
  assert.equal(second.status, 409);
  assert.equal(second.data.error.code, 'hold_cap');
  const q = await call('POST', '/api/quote', { headers: { Origin: BASE }, body: { lang: 'en', items: line(11) } });
  assert.equal(q.status, 200);
  assert.equal(q.data.lines[0].problem.code, 'group_people');
});

test('seats: at most 5 experience time slots per order', async () => {
  const exp = await makeProduct(a, { slug: `apitest-lines-exp-${rand()}`, kind: 'experience', price: 500, capacity: 20 });
  products.push(exp);
  const ids = [];
  for (let i = 0; i < 6; i++) {
    const s = await a.post('/api/admin/sessions', { product_id: exp.id, starts_at: `${day(15 + i)}T09:00`, capacity: 20 });
    ids.push(s.data.item.id);
  }
  const items = ids.map((id, i) => ({ key: `e${i}`, slug: exp.slug, kind: 'experience', qty: 1, guests: 1, session_id: id }));
  const q = await call('POST', '/api/quote', { headers: { Origin: BASE }, body: { lang: 'en', items } });
  assert.equal(q.data.lines.filter((l) => l.problem?.code === 'group_lines').length, 1);
});

test('stock: an unconfirmed order takes at most 5 units, all of them at most half the stock', async () => {
  const goods = await makeProduct(a, { slug: `apitest-stock-${rand()}`, kind: 'goods', price: 700, stock: 10 });
  products.push(goods);
  const line = (n) => [{ key: 'g', slug: goods.slug, kind: 'goods', qty: n }];
  const six = await book(line(6));
  assert.equal(six.status, 409);
  assert.equal(six.data.error.code, 'hold_cap_units');
  const five = await book(line(5));
  assert.equal(five.status, 201, JSON.stringify(five.data));
  await track(five.data.code);
  const one = await book(line(1));
  assert.equal(one.status, 409);
  assert.equal(one.data.error.code, 'hold_cap');
  // Still 5 in stock: the cap never hides stock, it only limits free holds.
  const g = await a.get(`/api/admin/products/${goods.id}`);
  assert.equal(g.data.item.stock, 5);
});

test('far-ahead or long unconfirmed stays get the short hold; small near ones the normal hold', async () => {
  const room = await makeProduct(a, { slug: `apitest-hold-room-${rand()}`, kind: 'room', price: 1000, units: 10, capacity: 2 });
  products.push(room);
  const far = await book([{ key: 'r', slug: room.slug, kind: 'room', qty: 1, from: day(100), to: day(101), guests: 1 }]);
  assert.equal(far.status, 201, JSON.stringify(far.data));
  const farOrder = await track(far.data.code);
  const farHold = Date.parse(farOrder.hold_until) - Date.parse(farOrder.created_at);
  assert.ok(farHold <= 2 * 3600_000 + 1000, `far hold ${farHold}`);
  assert.match(farOrder.review, /far_or_long/);
  const near = await book([{ key: 'r', slug: room.slug, kind: 'room', qty: 1, from: day(10), to: day(11), guests: 1 }]);
  assert.equal(near.status, 201);
  const nearOrder = await track(near.data.code);
  assert.ok(Date.parse(nearOrder.hold_until) - Date.parse(nearOrder.created_at) > 20 * 3600_000);
  assert.equal(nearOrder.review, null);
});

test('pay at hotel / bank needs a phone number', async () => {
  const room = await makeProduct(a, { slug: `apitest-phone-room-${rand()}`, kind: 'room', price: 1000, units: 4, capacity: 2 });
  products.push(room);
  const r = await book([{ key: 'r', slug: room.slug, kind: 'room', qty: 1, from: day(20), to: day(21), guests: 1 }], {}, { ...randomPerson(), phone: null });
  assert.equal(r.status, 400);
});

test('a TEST-paid order still counts as unconfirmed (share cap)', async () => {
  const cfg = await call('GET', '/api/config');
  if (!cfg.data.payments.card || cfg.data.payments.card_mode !== 'test') return;
  const room = await makeProduct(a, { slug: `apitest-testpaid-room-${rand()}`, kind: 'room', price: 1000, units: 2, capacity: 2 });
  products.push(room);
  const item = [{ key: 'r', slug: room.slug, kind: 'room', qty: 1, from: day(25), to: day(26), guests: 1 }];
  const r = await book(item, { payment_method: 'card' });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  await track(r.data.code);
  const post = await fetch(BASE + `/api/pay/test/${r.data.code}`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE, 'Sec-Fetch-Site': 'same-origin' },
    body: new URLSearchParams({ t: r.data.token, outcome: 'paid' }),
  });
  assert.equal(post.status, 303);
  const o = (await a.get(`/api/admin/orders/${r.data.code}`)).data.order;
  assert.equal(o.payment_status, 'paid');
  assert.ok(o.hold_until, 'a TEST-paid order keeps a hold');
  const next = await book(item);
  assert.equal(next.status, 409);
  assert.equal(next.data.error.code, 'hold_cap');
});

test('quantities are whole numbers: true, [5], "1e1" are refused; "3" is accepted', async () => {
  const room = await makeProduct(a, { slug: `apitest-qty-goods-${rand()}`, kind: 'goods', price: 100 });
  products.push(room);
  for (const qty of [true, [5], '1e1', 2.5]) {
    const q = await call('POST', '/api/quote', { headers: { Origin: BASE }, body: { lang: 'en', items: [{ slug: room.slug, kind: 'goods', qty }] } });
    assert.equal(q.status, 400, `qty ${JSON.stringify(qty)}`);
  }
  const ok = await call('POST', '/api/quote', { headers: { Origin: BASE }, body: { lang: 'en', items: [{ slug: room.slug, kind: 'goods', qty: '3' }] } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.lines[0].qty, 3);
});

test('staff: new products are drafts; publishing, prices and taking a product off sale are owner-only', async () => {
  const s = admin(staff.cookie);
  const created = await s.post('/api/admin/products', { slug: `apitest-staff-${rand()}`, kind: 'goods', name_sq: 'Staff', name_en: 'Staff', price: 1, status: 'published' });
  assert.equal(created.status, 201);
  assert.equal(created.data.item.status, 'draft');
  assert.equal(created.data.forced_draft, true);
  products.push(created.data.item);
  const publish = await s.patch(`/api/admin/products/${created.data.item.id}`, { status: 'published' });
  assert.equal(publish.status, 403);
  const owned = await makeProduct(a, { slug: `apitest-owned-${rand()}`, kind: 'gift', price: 5000, options: { amount_min: 1000, amount_max: 50000, amount_step: 500 } });
  products.push(owned);
  assert.equal((await s.patch(`/api/admin/products/${owned.id}`, { price: 1 })).status, 403);
  assert.equal((await s.patch(`/api/admin/products/${owned.id}`, { options: { amount_min: 1, amount_max: 50000, amount_step: 500 } })).status, 403);
  assert.equal((await s.patch(`/api/admin/products/${owned.id}`, { status: 'archived' })).status, 403);
  assert.equal((await s.del(`/api/admin/products/${owned.id}`)).status, 403);
  assert.equal((await s.patch(`/api/admin/products/${owned.id}`, { summary_en: 'Text staff may edit' })).status, 200);
});

test('payment details need the password again', async () => {
  const cur = (await a.get('/api/admin/settings')).data.settings.payments;
  // Refused attempts write nothing, so the real SWIFT is never touched here.
  const swift = cur.swift === 'APITESTX' ? 'APITESTY' : 'APITESTX';
  const no = await a.patch('/api/admin/settings', { payments: { swift } });
  assert.equal(no.status, 400);
  assert.equal(no.data.error.code, 'password_required');
  const bad = await a.patch('/api/admin/settings', { payments: { swift }, current_password: 'wrong-' + rand() });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error.code, 'bad_password');
  assert.equal((await a.get('/api/admin/settings')).data.settings.payments.swift, cur.swift);
  // The success path flips the card mode and back (guarded, but not a payment DETAIL, so no
  // 7-day dashboard warning is left behind).
  const pw = env().ADMIN_PASSWORD;
  const other = cur.mode === 'test' ? 'live' : 'test';
  const ok = await a.patch('/api/admin/settings', { payments: { mode: other }, current_password: pw });
  assert.equal(ok.status, 200);
  const back = await a.patch('/api/admin/settings', { payments: { mode: cur.mode }, current_password: pw });
  assert.equal(back.status, 200);
  // A setting that is not a payment detail needs no password.
  assert.equal((await a.patch('/api/admin/settings', { inventory: { low_stock: 5 } })).status, 200);
});

test('password change: wrong current passwords end every session after 5 in a row', async () => {
  const cookie = await login(staff.email, staff.password);
  const s = admin(cookie);
  for (let i = 0; i < 4; i++) {
    const r = await s.post('/api/admin/password', { current: 'wrong-' + rand(), next: 'a-new-password-' + rand() });
    assert.equal(r.status, 400);
  }
  const fifth = await s.post('/api/admin/password', { current: 'wrong-' + rand(), next: 'a-new-password-' + rand() });
  assert.equal(fifth.status, 401);
  assert.equal((await s.get('/api/admin/me')).status, 401);
  staff.cookie = await login(staff.email, staff.password);
});

test('assistant: impossible dates, empty ranges and past starts are asked again', async () => {
  const ask = (message, lang = 'en') => call('POST', '/api/assistant', { headers: { Origin: BASE }, body: { lang, message } });
  const y = Number(tiraneToday().slice(0, 4)) + 1;
  for (const [m, lang] of [['nga 30 shkurt deri 2 mars', 'sq'], ['room 31/02 to 03/03', 'en'], [`room ${y}-11-01 to ${y}-11-01`, 'en'], [`room ${y}-02-30 to ${y}-03-02`, 'en']]) {
    const r = await ask(m, lang);
    assert.equal(r.data.intent, 'ask_dates', m);
    assert.equal(r.data.products.length, 0, m);
  }
  const past = await ask('room from yesterday to tomorrow');
  assert.equal(past.data.intent, 'ask_dates');
  assert.match(past.data.reply, /passed/);
});

test('admin: a session time inside the spring-forward gap is refused', async () => {
  const exp = await makeProduct(a, { slug: `apitest-dst-exp-${rand()}`, kind: 'experience', price: 500, capacity: 5 });
  products.push(exp);
  const gap = await a.post('/api/admin/sessions', { product_id: exp.id, starts_at: '2027-03-28T02:30', capacity: 5 });
  assert.equal(gap.status, 400);
  const fine = await a.post('/api/admin/sessions', { product_id: exp.id, starts_at: '2027-03-28T03:30', capacity: 5 });
  assert.equal(fine.status, 201);
});

test('customer CSV: full-width = and arithmetic cells get the apostrophe', async () => {
  const room = await makeProduct(a, { slug: `apitest-csv3-room-${rand()}`, kind: 'room', price: 1000, units: 10, capacity: 2 });
  products.push(room);
  const item = (n) => [{ key: 'r', slug: room.slug, kind: 'room', qty: 1, from: day(30 + n), to: day(31 + n), guests: 1 }];
  for (const [i, name] of ['＝1+1', '-1-1'].entries()) {
    const r = await book(item(i), {}, { ...randomPerson(), name });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    await track(r.data.code);
  }
  const csv = await call('GET', '/api/admin/customers/export', { cookie: await adminCookie(), raw: true, headers: { 'Sec-Fetch-Site': 'same-origin' } });
  const text = await csv.text();
  assert.ok(text.includes("'＝1+1"), 'full-width equals guarded');
  assert.ok(text.includes("'-1-1"), 'arithmetic guarded');
});

test('order pages and the order API are never cached; /api/live sends no demo room count', async () => {
  const page = await call('GET', '/porosia/DV-XXXXX/?t=abc', { raw: true });
  assert.match(page.headers.get('cache-control') || '', /no-store/);
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  const live = await call('GET', '/api/live');
  if (!live.data.availability_today.rooms_verified) assert.equal(live.data.availability_today.rooms_left, null);
  const me = await a.get('/api/admin/me');
  assert.equal(typeof me.data.env.held_last_hour.roomNights, 'number');
});

test('analytics: utm values that are not identifiers are not stored as such', async () => {
  const r = await call('POST', '/api/e', {
    headers: { 'Content-Type': 'text/plain', 'User-Agent': 'Mozilla/5.0 (apitest)' },
    body: JSON.stringify({ type: 'view', path: 'javascript:alert(1)', lang: 'sq', sid: 'apitest' + rand(), utm: { source: 'john.doe@gmail.com', campaign: 'Spring sale <b>' } }),
  });
  assert.equal(r.status, 204);
  const conn = db();
  const row = conn.prepare("SELECT path, utm_source, utm_campaign FROM events WHERE type = 'view' ORDER BY id DESC LIMIT 1").get();
  conn.close();
  assert.equal(row.path, null);
  assert.equal(row.utm_source, null);
  assert.equal(row.utm_campaign, null);
});
