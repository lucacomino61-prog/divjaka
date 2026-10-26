import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, BASE, tiraneToday, addDays } from './_lib.mjs';

test('/api/live shape (real MET Norway; weather parts skipped when offline)', async (t) => {
  const r = await call('GET', '/api/live');
  assert.equal(r.status, 200);
  const d = r.data;
  for (const k of ['updated_at', 'stale', 'weather', 'marine', 'air', 'sun', 'daily', 'season_now', 'availability_today', 'attribution']) assert.ok(k in d, k);
  assert.equal(typeof d.stale, 'boolean');
  assert.ok(Array.isArray(d.daily));
  assert.equal(typeof d.season_now.month, 'number');
  assert.ok(Array.isArray(d.season_now.items));
  assert.ok('rooms_left' in d.availability_today && Array.isArray(d.availability_today.sessions));
  assert.match(d.attribution.url, /api\.met\.no/); // T7: MET Norway (free for commercial use)
  assert.ok(Array.isArray(d.sources) && d.sources.every((x) => x.url && x.license), 'sources with licences');
  if (!d.weather) return t.skip('offline: no weather data');
  for (const k of ['temp', 'feels', 'code', 'wind_kmh', 'wind_dir', 'humidity']) assert.equal(typeof d.weather[k], 'number', k);
  assert.ok(d.weather.gust_kmh === null || typeof d.weather.gust_kmh === 'number', 'gust_kmh'); // MET has no gusts for Albania
  assert.equal(typeof d.weather.label_sq, 'string');
  assert.equal(typeof d.weather.is_day, 'boolean');
  if (d.sun) for (const k of ['sunrise', 'sunset', 'golden_start']) assert.match(d.sun[k], /^\d{2}:\d{2}$/);
  for (const day of d.daily) assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
});

test('catalog, product, calendars', async () => {
  const c = await call('GET', '/api/catalog?lang=sq');
  assert.equal(c.status, 200);
  assert.ok(c.data.items.length > 0);
  const room = c.data.items.find((x) => x.kind === 'room');
  const exp = c.data.items.find((x) => x.kind === 'experience');
  const p = await call('GET', `/api/product/${room.slug}?lang=en`);
  assert.equal(p.data.alternate.sq, `/qendrimi/${room.slug}/`);
  assert.equal(p.data.alternate.en, `/en/stay/${room.slug}/`);
  const month = tiraneToday().slice(0, 7);
  const cal = await call('GET', `/api/availability/room/${room.slug}?month=${month}`);
  assert.ok(cal.data.days.length >= 28);
  const ecal = await call('GET', `/api/availability/experience/${exp.slug}?month=${month}`);
  assert.ok(Array.isArray(ecal.data.sessions));
  const missing = await call('GET', '/api/product/nope-nope');
  assert.equal(missing.status, 404);
});

test('recommendations change with interests', async () => {
  const birds = await call('GET', '/api/recommend?lang=sq&interests=birds&limit=3');
  const food = await call('GET', '/api/recommend?lang=sq&interests=food&limit=3');
  assert.equal(birds.status, 200);
  assert.ok(birds.data.items.length > 0);
  assert.notDeepEqual(birds.data.items.map((x) => x.slug), food.data.items.map((x) => x.slug));
  for (const it of birds.data.items) assert.ok(['interests', 'history', 'together', 'season', 'popular'].includes(it.reason));
  const cart = birds.data.items[0].slug;
  const excl = await call('GET', `/api/recommend?lang=sq&interests=birds&cart=${cart}`);
  assert.ok(!excl.data.items.some((x) => x.slug === cart));
});

test('search folds accents (pelikanet = pelikanëve)', async () => {
  const r = await call('GET', `/api/search?q=${encodeURIComponent('pelikanëve')}&lang=sq`);
  const r2 = await call('GET', '/api/search?q=PELIKANET&lang=sq');
  assert.ok(r.data.results.length > 0);
  assert.ok(r2.data.results.length > 0);
  for (const x of r.data.results) assert.ok(['product', 'article', 'faq', 'page'].includes(x.type));
});

test('assistant: FAQ, date availability in both languages, miss → hand-off', async () => {
  const ask = (lang, message, extra = {}) => call('POST', '/api/assistant', { body: { lang, message, ...extra } });
  const faq = await ask('en', 'How can I pay?');
  assert.equal(faq.data.intent, 'faq');
  const from = addDays(tiraneToday(), 60);
  const d = new Date(from + 'T00:00:00Z');
  const monthsSq = ['janar', 'shkurt', 'mars', 'prill', 'maj', 'qershor', 'korrik', 'gusht', 'shtator', 'tetor', 'nëntor', 'dhjetor'];
  const sq = await ask('sq', `A keni dhomë ${d.getUTCDate()}-${d.getUTCDate() + 2 > 28 ? d.getUTCDate() + 1 : d.getUTCDate() + 2} ${monthsSq[d.getUTCMonth()]}?`);
  assert.equal(sq.data.intent, 'availability');
  assert.equal(sq.data.dates.from, from);
  const en = await ask('en', 'Do you have a room for 2 nights from Friday?');
  assert.equal(en.data.intent, 'availability');
  assert.equal(en.data.dates.nights, 2);
  const miss = await ask('en', 'Can I bring my pet tortoise to the karaoke night?');
  assert.ok(['miss', 'llm'].includes(miss.data.intent));
  const contact = await ask('en', 'Please call me', { contact: { name: 'API Test', email: 'api-test@example.com', question: 'API test hand-off', elapsed_ms: 4000 } });
  assert.equal(contact.data.intent, 'contact');
});

test('analytics beacon: 204 for json and text/plain, also when invalid', async () => {
  const ev = { type: 'view', path: '/?t=secret', lang: 'sq', sid: 'apitest01' };
  const a = await fetch(BASE + '/api/e', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify(ev) });
  assert.equal(a.status, 204);
  const b = await fetch(BASE + '/api/e', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', Origin: BASE, 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify(ev) });
  assert.equal(b.status, 204);
  const c = await fetch(BASE + '/api/e', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: 'x'.repeat(5000) });
  assert.equal(c.status, 204);
});

test('contact form: honeypot and validation', async () => {
  const hp = await call('POST', '/api/contact', { headers: { Origin: BASE }, body: { name: 'Bot', email: 'bot@example.com', message: 'spam spam', website: 'http://spam' } });
  assert.equal(hp.status, 201);
  assert.equal(hp.data.id, 0);
  const bad = await call('POST', '/api/contact', { headers: { Origin: BASE }, body: { name: 'X', message: 'no way to reach me' } });
  assert.equal(bad.status, 400);
});
