import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admin, adminCookie, call, BASE } from './_lib.mjs';

test('admin endpoints require a session (401)', async () => {
  for (const p of ['/api/admin/me', '/api/admin/orders', '/api/admin/stats', '/api/admin/customers/export', '/api/admin/settings']) {
    const r = await call('GET', p);
    assert.equal(r.status, 401, p);
    assert.equal(r.data.error.code, 'unauthorized');
  }
  const forged = await call('GET', '/api/admin/me', { cookie: 'dv_admin=forged-token' });
  assert.equal(forged.status, 401);
});

test('admin pages redirect to the login page without a session', async () => {
  const r = await call('GET', '/admin/', { raw: true });
  assert.ok([302, 303].includes(r.status));
  assert.match(r.headers.get('location'), /^\/admin\/login\/\?next=/);
});

test('wrong password → 401 bad_credentials', async () => {
  const r = await call('POST', '/api/admin/login', { headers: { Origin: BASE, 'Sec-Fetch-Site': 'same-origin' }, body: { email: 'nobody@example.com', password: 'wrong-password' } });
  assert.equal(r.status, 401);
  assert.equal(r.data.error.code, 'bad_credentials');
});

test('login sets an HttpOnly SameSite=Strict cookie; mutations need same-origin', async () => {
  const cookie = await adminCookie();
  const me = await call('GET', '/api/admin/me', { cookie });
  assert.equal(me.status, 200);
  assert.ok(me.data.user.email);

  const body = { inventory: { low_stock: 5 } };
  const cross = await call('PUT', '/api/admin/settings', { cookie, body, headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' } });
  // Blocked either by Astro's own origin check (plain text) or by our middleware (cross_site JSON).
  assert.equal(cross.status, 403);
  if (cross.data && typeof cross.data === 'object') assert.equal(cross.data.error.code, 'cross_site');
  const nullOrigin = await call('PUT', '/api/admin/settings', { cookie, body, headers: { Origin: 'null' } });
  assert.equal(nullOrigin.status, 403);
  const none = await call('PUT', '/api/admin/settings', { cookie, body });
  assert.equal(none.status, 403);
  const sameSite = await call('PUT', '/api/admin/settings', { cookie, body, headers: { 'Sec-Fetch-Site': 'same-site', Origin: BASE } });
  assert.equal(sameSite.status, 403);
  const ok = await call('PUT', '/api/admin/settings', { cookie, body, headers: { 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(ok.status, 200);
  const originOnly = await call('PUT', '/api/admin/settings', { cookie, body, headers: { Origin: BASE } });
  assert.equal(originOnly.status, 200);
});

test('cookie attributes', async () => {
  const { env } = await import('./_lib.mjs');
  const e = env();
  const res = await fetch(BASE + '/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: BASE, 'Sec-Fetch-Site': 'same-origin' },
    body: JSON.stringify({ email: e.ADMIN_EMAIL || 'admin@divjaka.local', password: e.ADMIN_PASSWORD }),
  });
  const set = (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('dv_admin='));
  assert.ok(set);
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Strict/i);
  assert.match(set, /Path=\//);
  assert.match(set, /Expires=/i);
});

test('upload: WebP variants stored and served immutable; non-WebP refused', async () => {
  const cookie = await adminCookie();
  const webp = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'); // 1×1 lossless
  const fd = new FormData();
  fd.append('w480', new Blob([webp], { type: 'image/webp' }), 'a.webp');
  const r = await fetch(BASE + '/api/admin/upload', { method: 'POST', headers: { Cookie: cookie, 'Sec-Fetch-Site': 'same-origin' }, body: fd });
  assert.equal(r.status, 201);
  const data = await r.json();
  assert.match(data.src, /^\/media\/\d{4}\/[a-f0-9]+$/);
  assert.equal(data.widths[0].width, 1);
  const img = await fetch(BASE + data.widths[0].url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/webp');
  assert.match(img.headers.get('cache-control'), /immutable/);

  const bad = new FormData();
  bad.append('w480', new Blob([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')], { type: 'image/webp' }), 'fake.webp');
  const r2 = await fetch(BASE + '/api/admin/upload', { method: 'POST', headers: { Cookie: cookie, 'Sec-Fetch-Site': 'same-origin' }, body: bad });
  assert.equal(r2.status, 400);
});

test('stats and CSV export work for a signed-in admin', async () => {
  const cookie = await adminCookie();
  const s = await call('GET', '/api/admin/stats', { cookie });
  assert.equal(s.status, 200);
  for (const k of ['kpis', 'series', 'funnel', 'top_products', 'sources', 'devices', 'languages', 'search_terms', 'assistant', 'vitals', 'occupancy', 'low_stock']) assert.ok(k in s.data, k);
  assert.equal(s.data.funnel.length, 6);
  assert.equal(s.data.series.length, 30);
  const csv = await call('GET', '/api/admin/customers/export', { cookie, raw: true });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const text = await csv.text();
  assert.match(text.split('\n')[0], /email,name,phone/);
});

// WRITES settings.seo (restored at the end): run against a server on a database copy.
test('seo.default_image: only a path on this site or https on the site origin is saved (what the pages use)', async () => {
  const a = admin(await adminCookie());
  const cur = (await a.get('/api/admin/settings')).data.settings.seo;
  const refused = async (seo, why) => {
    const r = await a.patch('/api/admin/settings', { seo });
    assert.equal(r.status, 400, `${why}: ${JSON.stringify(r.data)}`);
    assert.deepEqual(r.data.error.fields, [{ path: 'default_image', message: 'image_must_be_on_this_site' }], why);
  };
  try {
    await refused({ default_image: 'https://cdn.example/x.jpg' }, 'another host');
    await refused({ default_image: 'photos/x.jpg' }, 'relative path');
    await refused({ default_image: '//evil.example/x.jpg' }, 'protocol-relative');
    await refused({ default_image: 'http://www.hotel.example/x.jpg', site_url: 'https://www.hotel.example' }, 'http');
    await refused({ default_image: 'https://www.hotel.example/x.jpg', site_url: 'https://hotel.example' }, 'www vs apex');
    // a stored image the new site_url would orphan is refused too (the form sends both fields)
    const both = await a.patch('/api/admin/settings', { seo: { site_url: 'https://www.hotel.example', default_image: 'https://www.hotel.example/x.jpg' } });
    assert.equal(both.status, 200, JSON.stringify(both.data));
    await refused({ site_url: 'https://hotel.example' }, 'site_url moved away from the stored image');
    const path = await a.patch('/api/admin/settings', { seo: { default_image: '/photos/x.jpg' } });
    assert.equal(path.status, 200, JSON.stringify(path.data));
    assert.equal(path.data.settings.seo.default_image, '/photos/x.jpg');
    const cleared = await a.patch('/api/admin/settings', { seo: { default_image: '' } });
    assert.equal(cleared.status, 200, 'an empty field is always allowed');
  } finally {
    const back = await a.patch('/api/admin/settings', { seo: { site_url: cur.site_url ?? '', default_image: cur.default_image ?? '' } });
    assert.equal(back.status, 200, JSON.stringify(back.data));
  }
});
