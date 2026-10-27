/**
 * Checkout `replaces` (core round, 2026-10-27): a lost 201 made an order the guest never saw, the
 * guest edited the cart and sent it again with a new checkout_id and the old one as `replaces`.
 * The old order is cancelled (seats back, inventory_log 'replaced', a note for staff) only when
 * it has exactly that checkout_id, the same e-mail key, and is still pending, unpaid, not held or
 * confirmed by staff and inside its hold; otherwise `replaces` is ignored without a word.
 * Writes test data: run against a server on a database COPY started with RATE_LIMIT_FACTOR=50
 * (README → Commands).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { admin, adminCookie, call, makeProduct, rand, randomPerson, tiraneToday, addDays, BASE } from './_lib.mjs';

let a;
const products = [];
const orderIds = [];
const day = (n) => addDays(tiraneToday(), n);
const newId = () => crypto.randomBytes(16).toString('hex');

before(async () => { a = admin(await adminCookie()); });

after(async () => {
  for (const id of orderIds) await a.patch(`/api/admin/orders/${id}`, { status: 'cancelled' });
  for (const p of products) await a.del(`/api/admin/products/${p.id}`);
});

const post = (body) => call('POST', '/api/checkout', { headers: { Origin: BASE }, body: { lang: 'en', terms_accepted: true, payment_method: 'hotel', ...body } });

async function order(code) {
  const d = await a.get(`/api/admin/orders/${code}`);
  assert.equal(d.status, 200, JSON.stringify(d.data));
  if (!orderIds.includes(d.data.order.id)) orderIds.push(d.data.order.id);
  return d.data;
}

/** An experience with one session (capacity 10: pay-at-hotel orders may hold 5 seats together). */
async function session() {
  const exp = await makeProduct(a, { slug: `apitest-repl-${rand()}`, kind: 'experience', price: 700, capacity: 10 });
  products.push(exp);
  const s = await a.post('/api/admin/sessions', { product_id: exp.id, starts_at: `${day(20)}T10:00`, capacity: 10 });
  assert.equal(s.status, 201, JSON.stringify(s.data));
  const item = s.data.item;
  const line = (n) => [{ key: 'e', slug: exp.slug, kind: 'experience', qty: n, guests: n, session_id: item.id, starts_at: item.starts_at }];
  const left = async () => {
    const av = await call('GET', `/api/availability/experience/${exp.slug}?month=${item.starts_at.slice(0, 7)}`);
    return av.data.sessions.find((x) => x.id === item.id).left;
  };
  return { line, left };
}

test('the orphan of a lost 201 is cancelled when the edited draft replaces it, and its seats return', async () => {
  const { line, left } = await session();
  const person = randomPerson();
  const first = newId();
  const lost = await post({ items: line(3), customer: person, checkout_id: first });
  assert.equal(lost.status, 201, JSON.stringify(lost.data));
  await order(lost.data.code);
  assert.equal(await left(), 7);
  // The edited draft (4 people) would pass the 5-seat share only once the orphan's 3 are free.
  const second = newId();
  const edited = await post({ items: line(4), customer: { ...person, email: person.email.toUpperCase() }, checkout_id: second, replaces: first });
  assert.equal(edited.status, 201, JSON.stringify(edited.data));
  assert.notEqual(edited.data.code, lost.data.code);
  assert.equal(edited.headers.get('x-dv-replay'), null);
  await order(edited.data.code);
  const old = await order(lost.data.code);
  assert.equal(old.order.status, 'cancelled');
  assert.match(old.order.notes ?? '', new RegExp(`Zëvendësuar nga ${edited.data.code}`));
  assert.ok(old.log.some((r) => r.reason === 'replaced' && r.delta === 3), 'seats given back in inventory_log');
  assert.equal(await left(), 6, 'only the new order holds seats');
  // A resend of the edited draft is still a replay of it, and cancels nothing more.
  const again = await post({ items: line(4), customer: person, checkout_id: second, replaces: first });
  assert.equal(again.data.code, edited.data.code);
  assert.equal(again.headers.get('x-dv-replay'), '1');
  assert.equal(await left(), 6);
});

test('replaces with another e-mail does not cancel', async () => {
  const { line, left } = await session();
  const first = newId();
  const victim = await post({ items: line(2), customer: randomPerson(), checkout_id: first });
  assert.equal(victim.status, 201, JSON.stringify(victim.data));
  await order(victim.data.code);
  const other = await post({ items: line(1), customer: randomPerson(), checkout_id: newId(), replaces: first });
  assert.equal(other.status, 201, JSON.stringify(other.data));
  await order(other.data.code);
  assert.equal((await order(victim.data.code)).order.status, 'pending');
  assert.equal(await left(), 7);
});

test('a paid, a staff-confirmed or a staff-held order is not cancelled', async () => {
  const { line, left } = await session();
  for (const patch of [{ payment_status: 'paid' }, { status: 'confirmed' }, { status: 'pending' }]) {
    const person = randomPerson();
    const first = newId();
    const r = await post({ items: line(1), customer: person, checkout_id: first });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const o = (await order(r.data.code)).order;
    const p = await a.patch(`/api/admin/orders/${o.id}`, patch);
    assert.equal(p.status, 200, JSON.stringify(p.data));
    const before = p.data.order;
    const next = await post({ items: line(1), customer: person, checkout_id: newId(), replaces: first });
    assert.equal(next.status, 201, JSON.stringify(next.data));
    await order(next.data.code);
    const now = (await order(r.data.code)).order;
    assert.equal(now.status, before.status, `${JSON.stringify(patch)}: status kept`);
    assert.equal(now.payment_status, before.payment_status);
    assert.notEqual(now.status, 'cancelled');
  }
  assert.equal(await left(), 4, 'three kept + three new orders of one seat each');
});

test('a missing or malformed replaces id is ignored', async () => {
  const { line, left } = await session();
  const one = await post({ items: line(1), customer: randomPerson(), checkout_id: newId(), replaces: newId() });
  assert.equal(one.status, 201, JSON.stringify(one.data));
  await order(one.data.code);
  const two = await post({ items: line(1), customer: randomPerson(), checkout_id: newId(), replaces: 'x' });
  assert.equal(two.status, 201, JSON.stringify(two.data));
  await order(two.data.code);
  // replaces = its own checkout_id: nothing to cancel, a normal order
  const id = newId();
  const three = await post({ items: line(1), customer: randomPerson(), checkout_id: id, replaces: id });
  assert.equal(three.status, 201, JSON.stringify(three.data));
  await order(three.data.code);
  assert.equal(await left(), 7);
});
