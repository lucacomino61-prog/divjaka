/**
 * Staff accounts (/admin/stafi/, /api/admin/users): the owner adds, disables / enables, re-roles
 * and sets passwords; staff get 403; a disabled account cannot sign in and its sessions are gone;
 * nobody disables or demotes themself or the last active owner; a cross-site POST is refused.
 *
 * Writes admin accounts (apitest-acct-…@example.com) through the API and deletes them directly
 * in the database afterwards, so it runs only against a server on a database COPY: start it with
 * DIVJAKA_DB pointing at the copy and RATE_LIMIT_FACTOR=50 (README → Tests; adding an account and
 * setting a password each check the owner's password: 5 WRONG per 15 min without the factor,
 * correct answers are not counted), and give the test run the same DIVJAKA_DB and, if the server
 * uses another factor, the same RATE_LIMIT_FACTOR.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { admin, adminCookie, call, env, rand, BASE, SAME } from './_lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OWNER_PW = env().ADMIN_PASSWORD;
let a; // the .env owner
let ownerId;

function dbFile() {
  const e = env();
  const file = path.resolve(e.DIVJAKA_DB || path.join(e.DIVJAKA_DATA || path.join(ROOT, 'data'), 'divjaka.db'));
  if (file.toLowerCase() === path.resolve(ROOT, 'data', 'divjaka.db').toLowerCase()) {
    throw new Error('staff.test.mjs creates and deletes admin accounts: start the server on a database copy and set DIVJAKA_DB to that copy for the test run too.');
  }
  return file;
}
function db() {
  const conn = new DatabaseSync(dbFile(), { timeout: 5000 });
  conn.exec('PRAGMA foreign_keys = ON');
  conn.exec('PRAGMA busy_timeout = 5000');
  return conn;
}
const cleanup = () => {
  const conn = db();
  // sessions and remembered browsers cascade
  conn.prepare("DELETE FROM admin_users WHERE email LIKE 'apitest-acct-%@example.com'").run();
  conn.close();
};
const countRows = (table, userId) => {
  const conn = db();
  const n = conn.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(userId).n;
  conn.close();
  return n;
};

/** POST /api/admin/login → { status, cookie } (cookie null on failure). */
async function login(email, password) {
  const res = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...SAME }, body: JSON.stringify({ email, password }) });
  const c = (res.headers.getSetCookie?.() ?? []).find((x) => x.startsWith('dv_admin='));
  return { status: res.status, code: res.status === 200 ? null : (await res.json()).error?.code, cookie: c ? c.split(';')[0] : null };
}
const pw = () => `Pw-${rand()}${rand()}-${rand()}`; // ≥ 12 characters
const newEmail = () => `apitest-acct-${rand()}${rand()}@example.com`;

async function addAccount(role = 'staff', password = pw()) {
  const email = newEmail();
  const r = await a.post('/api/admin/users', { name: `API ${role}`, email, role, password, current_password: OWNER_PW });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { ...r.data.item, password };
}

before(async () => {
  assert.ok(OWNER_PW, 'ADMIN_PASSWORD missing in .env');
  dbFile();
  cleanup();
  a = admin(await adminCookie());
  ownerId = (await a.get('/api/admin/me')).data.user.id;
});

after(() => cleanup());

test('owner adds a staff account; the list shows it; duplicates (any case), short passwords and a missing or wrong owner password are refused', async () => {
  const s = await addAccount('staff');
  assert.equal(s.role, 'staff');
  assert.equal(s.disabled_at, null);
  assert.equal('password_hash' in s, false);
  const list = await a.get('/api/admin/users');
  assert.equal(list.status, 200);
  const row = list.data.items.find((u) => u.id === s.id);
  assert.ok(row, 'new account listed');
  assert.equal(list.data.items.some((u) => 'password_hash' in u), false, 'no hashes in the list');

  const dup = await a.post('/api/admin/users', { name: 'Dup', email: s.email.toUpperCase(), role: 'staff', password: pw(), current_password: OWNER_PW });
  assert.equal(dup.status, 409);
  assert.equal(dup.data.error.code, 'email_taken');

  const short = await a.post('/api/admin/users', { name: 'Short', email: newEmail(), role: 'staff', password: 'short-pw', current_password: OWNER_PW });
  assert.equal(short.status, 400);
  assert.ok(short.data.error.fields.some((f) => f.path === 'password'));

  const noPw = await a.post('/api/admin/users', { name: 'No pw', email: newEmail(), role: 'staff', password: pw() });
  assert.equal(noPw.status, 400);
  assert.equal(noPw.data.error.code, 'password_required');

  const wrong = await a.post('/api/admin/users', { name: 'Wrong pw', email: newEmail(), role: 'staff', password: pw(), current_password: 'not-the-owner-password' });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.data.error.code, 'bad_password');

  const signedIn = await login(s.email, s.password);
  assert.equal(signedIn.status, 200, 'the new account signs in with the password the owner typed');
  // last sign-in is shown once there is one
  const again = (await a.get('/api/admin/users')).data.items.find((u) => u.id === s.id);
  assert.ok(again.last_sign_in, 'last_sign_in recorded');
});

test('staff get 403 on the accounts API and page', async () => {
  const s = await addAccount('staff');
  const { cookie } = await login(s.email, s.password);
  const st = admin(cookie);
  assert.equal((await st.get('/api/admin/users')).status, 403);
  assert.equal((await st.post('/api/admin/users', { name: 'X', email: newEmail(), role: 'owner', password: pw(), current_password: s.password })).status, 403);
  assert.equal((await st.patch(`/api/admin/users/${ownerId}`, { active: false })).status, 403);
  assert.equal((await st.post(`/api/admin/users/${ownerId}/password`, { password: pw(), current_password: s.password })).status, 403);
  const page = await call('GET', '/admin/stafi/', { cookie, raw: true });
  assert.equal(page.status, 403);
  const html = await page.text();
  assert.match(html, /cilesimet\/#fjalekalimi/, 'the 403 page points to their own password form');
  assert.doesNotMatch(html, /data-account=/, 'no account list for staff');
  // and the nav has no Stafi entry for staff
  const dash = await (await call('GET', '/admin/', { cookie, raw: true })).text();
  assert.doesNotMatch(dash, /href="\/admin\/stafi\/"/);
  const ownerDash = await (await call('GET', '/admin/', { cookie: (await adminCookie()), raw: true })).text();
  assert.match(ownerDash, /href="\/admin\/stafi\/"/);
});

test('owner sets a new password: the old one stops working and the sessions end', async () => {
  const s = await addAccount('staff');
  const { cookie } = await login(s.email, s.password);
  assert.equal((await call('GET', '/api/admin/me', { cookie })).status, 200);
  const next = pw();
  const r = await a.post(`/api/admin/users/${s.id}/password`, { password: next, current_password: OWNER_PW });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await call('GET', '/api/admin/me', { cookie })).status, 401, 'old session ended');
  assert.equal(countRows('admin_sessions', s.id), 0);
  assert.equal(countRows('admin_devices', s.id), 0);
  assert.equal((await login(s.email, s.password)).status, 401, 'old password refused');
  assert.equal((await login(s.email, next)).status, 200, 'new password works');
  // own password only through POST /api/admin/password (asks for the current one)
  const self = await a.post(`/api/admin/users/${ownerId}/password`, { password: pw(), current_password: OWNER_PW });
  assert.equal(self.status, 409);
  assert.equal(self.data.error.code, 'own_account');
});

test('a disabled account cannot sign in and its sessions are gone; enabling restores it', async () => {
  const s = await addAccount('staff');
  const { cookie } = await login(s.email, s.password);
  assert.ok(countRows('admin_sessions', s.id) >= 1);
  const off = await a.patch(`/api/admin/users/${s.id}`, { active: false });
  assert.equal(off.status, 200);
  assert.ok(off.data.item.disabled_at);
  assert.equal((await call('GET', '/api/admin/me', { cookie })).status, 401, 'session ended');
  assert.equal(countRows('admin_sessions', s.id), 0);
  assert.equal(countRows('admin_devices', s.id), 0);
  const tryIt = await login(s.email, s.password);
  assert.equal(tryIt.status, 401, 'disabled account refused');
  assert.equal(tryIt.code, 'bad_credentials', 'same generic answer as a wrong password');
  const on = await a.patch(`/api/admin/users/${s.id}`, { active: true });
  assert.equal(on.status, 200);
  assert.equal(on.data.item.disabled_at, null);
  assert.equal((await login(s.email, s.password)).status, 200);
});

test('nobody disables or demotes themself or the last active owner; demoting ends the sessions', async () => {
  const owners = (await a.get('/api/admin/users')).data.items.filter((u) => u.role === 'owner' && !u.disabled_at);
  if (owners.length === 1) {
    // the .env owner is the only active owner: demoting or disabling it is refused as last_owner
    for (const body of [{ role: 'staff' }, { active: false }]) {
      const r = await a.patch(`/api/admin/users/${ownerId}`, body);
      assert.equal(r.status, 409);
      assert.equal(r.data.error.code, 'last_owner');
    }
  }
  const b = await addAccount('owner');
  // with a second owner, demoting or disabling yourself is still refused
  for (const body of [{ role: 'staff' }, { active: false }]) {
    const r = await a.patch(`/api/admin/users/${ownerId}`, body);
    assert.equal(r.status, 409);
    assert.equal(r.data.error.code, 'own_account');
  }
  const bLogin = await login(b.email, b.password);
  const bApi = admin(bLogin.cookie);
  assert.equal((await bApi.get('/api/admin/users')).status, 200, 'second owner manages accounts');
  // demoting B ends B's sessions; B signs in again as staff
  const down = await a.patch(`/api/admin/users/${b.id}`, { role: 'staff' });
  assert.equal(down.status, 200);
  assert.equal(down.data.item.role, 'staff');
  assert.equal((await call('GET', '/api/admin/me', { cookie: bLogin.cookie })).status, 401, 'demoted owner signed out');
  const bAgain = await login(b.email, b.password);
  assert.equal((await admin(bAgain.cookie).get('/api/admin/users')).status, 403);
  // the owner is still an owner
  assert.equal((await a.get('/api/admin/me')).data.user.role, 'owner');
});

test('a cross-site POST is refused and creates nothing', async () => {
  const cookie = await adminCookie();
  const email = newEmail();
  for (const headers of [{ Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'same-site' }]) {
    const r = await call('POST', '/api/admin/users', { cookie, headers, body: { name: 'Evil', email, role: 'owner', password: pw(), current_password: OWNER_PW } });
    assert.equal(r.status, 403, JSON.stringify(headers));
    // With Sec-Fetch-Site: cross-site the Vite DEV server answers first (text/plain, dev only);
    // everywhere else the middleware's same-origin guard answers cross_site JSON.
    if (r.data && typeof r.data === 'object') assert.equal(r.data.error.code, 'cross_site');
  }
  const r2 = await call('PATCH', `/api/admin/users/${ownerId}`, { cookie, headers: { Origin: 'https://evil.example' }, body: { name: 'Evil' } });
  assert.equal(r2.status, 403);
  assert.equal(r2.data.error.code, 'cross_site');
  assert.equal((await a.get('/api/admin/users')).data.items.some((u) => u.email === email), false);
});

test('correct owner passwords are not throttled: more than the 5-per-15-min limit in a row all pass', async () => {
  // The limit counts wrong passwords only. Each call below checks the owner's password (correct)
  // and then answers 409 own_account, so nothing is written. With the old rule (every check
  // counted) call 5 × factor + 1 got 429, and the owner could not add a sixth account.
  const factor = Math.max(1, Number(process.env.RATE_LIMIT_FACTOR || 50));
  const n = 5 * factor + 1;
  for (let i = 0; i < n; i++) {
    const r = await a.post(`/api/admin/users/${ownerId}/password`, { password: pw(), current_password: OWNER_PW });
    assert.equal(r.status, 409, `call ${i + 1} of ${n}: ${JSON.stringify(r.data)}`);
  }
  // and a real account change still works afterwards
  await addAccount('staff');
});

test('unknown account → 404', async () => {
  assert.equal((await a.patch('/api/admin/users/999999999', { active: false })).status, 404);
  assert.equal((await a.post('/api/admin/users/999999999/password', { password: pw(), current_password: OWNER_PW })).status, 404);
});
