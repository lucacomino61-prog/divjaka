#!/usr/bin/env node
/**
 * Seed the database (plain Node, no Astro): node scripts/seed.mjs [--reset] [--demo] [--sync-admin]
 *
 *   (no flags)    apply schema + migrations; insert what is missing: settings defaults,
 *                 categories, admin user, catalogue (demo values), sessions 90 days ahead,
 *                 seasonal room rates, offers, FAQ. Never overwrites rows the owner edited.
 *   --reset       wipe every table first (the file stays, so a running server keeps working).
 *                 REFUSED, unless --i-know-this-wipes-everything is given as well, when
 *                 NODE_ENV=production or the database looks live: real orders (demo = 0), a
 *                 product or offer the owner saved (demo = 0), an IBAN in the settings, more than
 *                 one settings group changed from the seed defaults, or an admin password that is
 *                 no longer the one in .env.
 *   --demo        add fake orders/customers/events for the admin dashboard (scripts/seed-data/demo.mjs).
 *   --sync-admin  set the admin password from .env again (normally only done when the admin
 *                 user is first created, so a password changed in the admin is never reverted).
 *
 * Admin: ADMIN_EMAIL / ADMIN_PASSWORD from .env. When .env has no ADMIN_PASSWORD a strong one is
 * generated and written to .env (git-ignored). The password is never printed. After the first
 * sign-in, change it in the admin and delete ADMIN_PASSWORD from .env.
 */
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, ROOMS, EXPERIENCES, GIFTS, BUNDLES, GOODS, OFFERS, FAQ } from './seed-data/catalogue.mjs';
import { seedDemo } from './seed-data/demo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const RESET = args.has('--reset');
const DEMO = args.has('--demo');
const SYNC_ADMIN = args.has('--sync-admin');
const FORCE_WIPE = args.has('--i-know-this-wipes-everything');

const DATA = path.resolve(process.env.DIVJAKA_DATA || path.join(ROOT, 'data'));
const DB_FILE = path.resolve(process.env.DIVJAKA_DB || path.join(DATA, 'divjaka.db'));
const ENV_FILE = path.join(ROOT, '.env');

const log = (...a) => console.log('[seed]', ...a);
const nowIso = () => new Date().toISOString();

// ---------- time (Europe/Tirane) ----------
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tirane', year: 'numeric', month: '2-digit', day: '2-digit' });
const today = fmt.format(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = (s) => new Date(s + 'T00:00:00Z').getUTCDay();

// ---------- .env ----------
function readEnv() {
  const out = {};
  if (!fs.existsSync(ENV_FILE)) return out;
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function ensureAdminEnv() {
  const env = { ...readEnv(), ...Object.fromEntries(['ADMIN_EMAIL', 'ADMIN_PASSWORD'].filter((k) => process.env[k]).map((k) => [k, process.env[k]])) };
  if (env.ADMIN_PASSWORD) return { email: env.ADMIN_EMAIL || 'admin@divjaka.local', password: env.ADMIN_PASSWORD, generated: false };
  const email = env.ADMIN_EMAIL || 'admin@divjaka.local';
  const password = crypto.randomBytes(18).toString('base64url'); // 24 chars, ~144 bits
  const existing = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const lines = existing.split(/\r?\n/).filter((l) => l && !/^\s*ADMIN_(EMAIL|PASSWORD)\s*=/.test(l));
  lines.push(`ADMIN_EMAIL=${email}`, `ADMIN_PASSWORD=${password}`);
  fs.writeFileSync(ENV_FILE, lines.join('\n') + '\n', { mode: 0o600 });
  return { email, password, generated: true };
}

// Same format as src/lib/auth.ts
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}
function verifyPassword(password, stored) {
  const [, N, r, p, s, h] = String(stored).split('$');
  const expected = Buffer.from(h ?? '', 'base64url');
  if (!expected.length) return false;
  const got = crypto.scryptSync(password, Buffer.from(s, 'base64url'), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(got, expected);
}

// ---------- research (optional, verified only) ----------
function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return null; }
}

/** Pick photos.json entries for a product by hint words (licensed photos only). */
function photosFor(hints, used) {
  const data = readJson('research/photos.json');
  const list = Array.isArray(data) ? data : data?.photos ?? [];
  if (!list.length) return [];
  const out = [];
  for (const h of hints) {
    const hit = list.find((ph) => {
      const slug = ph.slug ?? ph.id;
      if (!slug || used.has(slug)) return false;
      if (ph.license === undefined && ph.licence === undefined && ph.license_url === undefined) return false;
      const hay = JSON.stringify([ph.slug, ph.title, ph.subject, ph.subjects, ph.tags, ph.alt_en, ph.alt_sq, ph.description]).toLowerCase();
      return hay.includes(h);
    });
    if (hit) {
      used.add(hit.slug ?? hit.id);
      out.push({ slug: hit.slug ?? hit.id, alt_sq: hit.alt_sq ?? hit.title_sq ?? '', alt_en: hit.alt_en ?? hit.title ?? '' });
      if (out.length >= 2) break;
    }
  }
  return out;
}

/**
 * Business settings prefilled from research/business.json. Only high-confidence public facts
 * (address, coordinates) are shown on the site right away; everything else is prefilled but
 * stays in `placeholders` (hidden from public pages) until the owner saves it in the admin.
 */
function businessFromResearch() {
  const h = readJson('research/business.json')?.hotel ?? {};
  const v = (x) => (x && x.value !== undefined && x.value !== null ? x.value : '');
  const high = (x) => x && x.confidence === 'high';
  const b = {
    name: 'Hotel Pelikan',
    legal_name: v(h.legal_entity), nipt: v(h.nipt),
    address: high(h.address) ? v(h.address) : '',
    phone: v(h.phone), email: v(h.email), whatsapp: '', viber: '',
    checkin: v(h.check_in), checkout: v(h.check_out), reception_hours: '',
    lat: high(h.coordinates) ? Number(h.coordinates.lat) : null,
    lon: high(h.coordinates) ? Number(h.coordinates.lng) : null,
  };
  const placeholders = ['legal_name', 'nipt', 'phone', 'email', 'whatsapp', 'viber', 'checkin', 'checkout', 'reception_hours'];
  if (!b.address) placeholders.push('address');
  if (b.lat === null) placeholders.push('lat', 'lon');
  return { ...b, placeholders };
}

// ---------- open + schema ----------
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new DatabaseSync(DB_FILE, { timeout: 10000 });
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;');
db.exec(fs.readFileSync(path.join(ROOT, 'db', 'schema.sql'), 'utf8'));
const migDir = path.join(ROOT, 'db', 'migrations');
if (fs.existsSync(migDir)) {
  const done = new Set(db.prepare('SELECT version FROM schema_version').all().map((r) => r.version));
  for (const f of fs.readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
    const v = Number(f.split('-')[0]);
    if (!Number.isInteger(v) || v <= 1 || done.has(v)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      if (!db.prepare('SELECT 1 FROM schema_version WHERE version = ?').get(v)) {
        db.exec(fs.readFileSync(path.join(migDir, f), 'utf8'));
        db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(v, f.replace(/\.sql$/, ''), nowIso());
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

/** Settings the seed inserts when missing (never overwrites what the owner saved). */
function seedSettings() {
  return {
    business: businessFromResearch(),
    // bank: offered only once IBAN + beneficiary are filled in (src/lib/payments/mode.ts), so it
    // starts off. card: 'test' mode runs only where test payments are allowed (dev server or
    // ALLOW_TEST_PAYMENTS=1); in a production build it stays hidden until POK keys + mode 'live'.
    payments: { methods: { hotel: true, bank: false, card: true }, mode: 'test', iban: '', bank_name: '', beneficiary: '', swift: '', card_hold_minutes: 30, bank_hold_hours: 72, hotel_hold_hours: 24 },
    // Bank of Albania official rate, EUR = 90.64 lek, published 22.10.2026 12:10 (read 2026-10-23).
    currency: { eur_rate: 90.64, eur_rate_date: '2026-10-22', eur_rate_source: 'https://www.bankofalbania.org/Tregjet/Kursi_zyrtar_i_kembimit/' },
    social: {},
    assistant: { enabled: true, handoff_email: '', use_claude: true, daily_cap: 300 },
    seo: { site_url: '', default_image: '' },
    inventory: {
      low_stock: 5, booking_cutoff_hours: 2, booking_horizon_days: 548, max_room_nights_per_order: 40, max_open_orders_per_email: 3,
      unconfirmed_share: 0.5, max_unconfirmed_room_nights_per_hour: 60, max_room_nights_per_address_day: 60, pending_alert_per_hour: 5,
    },
    privacy: { events_days: 180, messages_days: 730, events_per_day: 30000 },
  };
}

if (RESET && !FORCE_WIPE) {
  // @example.com addresses are reserved for tests (RFC 2606) and never belong to a guest.
  const realOrders = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE demo = 0 AND email NOT LIKE '%@example.com'").get().n;
  // Test products are archived 'apitest-…' rows; test offers are named 'apitest…'.
  const ownerProducts = db.prepare("SELECT COUNT(*) AS n FROM products WHERE demo = 0 AND slug NOT LIKE 'apitest-%'").get().n;
  const ownerOffers = db.prepare("SELECT COUNT(*) AS n FROM offers WHERE demo = 0 AND COALESCE(name_en, '') NOT LIKE 'apitest%'").get().n;
  const defaults = seedSettings();
  let iban = false;
  let changedGroups = 0;
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    let v = null;
    try { v = JSON.parse(r.value); } catch { /* broken row counts as changed */ }
    if (r.key === 'payments' && v && typeof v.iban === 'string' && v.iban.trim()) iban = true;
    if (!(r.key in defaults) || JSON.stringify(v) !== JSON.stringify(defaults[r.key])) changedGroups++;
  }
  let passwordChanged = false;
  try {
    const envPass = readEnv().ADMIN_PASSWORD;
    const first = db.prepare('SELECT password_hash FROM admin_users ORDER BY id LIMIT 1').get();
    if (first && envPass && !verifyPassword(envPass, first.password_hash)) passwordChanged = true;
  } catch { /* no admin yet */ }
  const why = process.env.NODE_ENV === 'production' ? 'NODE_ENV is production'
    : realOrders ? `the database holds ${realOrders} real (non-demo) order(s)`
    : ownerProducts ? `${ownerProducts} product(s) were saved by the owner`
    : ownerOffers ? `${ownerOffers} offer(s) were saved by the owner`
    : iban ? 'an IBAN is set in the payment settings'
    : changedGroups > 1 ? `${changedGroups} settings groups differ from the seed defaults`
    : passwordChanged ? 'the admin password was changed in the admin (it is no longer the one in .env)'
    : null;
  if (why) {
    console.error(`[seed] --reset refused: ${why}. It would delete every order, customer and admin user.`);
    console.error('[seed] Back up data/divjaka.db first; to wipe anyway add --i-know-this-wipes-everything.');
    db.close();
    process.exit(2);
  }
}

if (RESET) {
  const tables =['events', 'events_daily', 'audit_log', 'admin_devices', 'inventory_log', 'order_items', 'orders', 'customers', 'messages', 'sessions', 'room_nights', 'room_rates', 'bundle_items', 'offers', 'faq', 'products', 'categories', 'admin_sessions', 'admin_users', 'settings'];
  db.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
  for (const t of tables) db.exec(`DELETE FROM ${t};`);
  db.exec('COMMIT; PRAGMA foreign_keys = ON;');
  log('reset: all tables emptied');
}

const run = (sql, ...p) => db.prepare(sql).run(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);

db.exec('BEGIN IMMEDIATE');
try {
  // ---------- settings ----------
  const settings = seedSettings();
  for (const [k, v] of Object.entries(settings)) run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', k, JSON.stringify(v));

  // ---------- categories ----------
  for (const c of CATEGORIES) run('INSERT OR IGNORE INTO categories (id, name_sq, name_en, sort) VALUES (?, ?, ?, ?)', c.id, c.name_sq, c.name_en, c.sort);

  // ---------- admin ----------
  const admin = ensureAdminEnv();
  const existing = get('SELECT id, password_hash FROM admin_users WHERE email = ? COLLATE NOCASE', admin.email);
  if (!existing) {
    run('INSERT INTO admin_users (email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)', admin.email.toLowerCase(), 'Hotel Pelikan', hashPassword(admin.password), 'owner', nowIso());
    log(`admin user ${admin.email} created (password in .env${admin.generated ? ', newly generated' : ''})`);
  } else if (SYNC_ADMIN) {
    // The recovery path after a suspected compromise: every session AND every remembered
    // browser of this account ends (a remembered browser skips the login lock), and the
    // password is set from .env when it differs.
    if (!verifyPassword(admin.password, existing.password_hash)) {
      run('UPDATE admin_users SET password_hash = ? WHERE id = ?', hashPassword(admin.password), existing.id);
      log(`admin user ${admin.email}: password set from .env (--sync-admin)`);
    }
    run('DELETE FROM admin_sessions WHERE user_id = ?', existing.id);
    run('DELETE FROM admin_devices WHERE user_id = ?', existing.id);
    log(`admin user ${admin.email}: all sessions and remembered browsers ended (--sync-admin)`);
  }

  // ---------- catalogue ----------
  const used = new Set();
  const insertProduct = (p, kind, category) => {
    if (get('SELECT 1 FROM products WHERE slug = ?', p.slug)) return false;
    const now = nowIso();
    run(
      `INSERT INTO products (slug, kind, category, name_sq, name_en, summary_sq, summary_en, body_sq, body_en, includes_sq, includes_en, price, compare_at, stock, units, capacity,
        duration_min, poi, tags, seasons, images, options, status, featured, sort, demo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, '[]', ?, ?, 'published', ?, ?, 1, ?, ?)`,
      p.slug, kind, category, p.name_sq, p.name_en, p.summary_sq, p.summary_en,
      JSON.stringify(p.includes_sq ?? []), JSON.stringify(p.includes_en ?? []), p.price, p.stock ?? null, p.units ?? null, p.capacity ?? null,
      p.duration_min ?? null, JSON.stringify(p.tags ?? []), JSON.stringify(photosFor(p.photoHints ?? [], used)), JSON.stringify(p.options ?? {}),
      p.featured ? 1 : 0, p.sort ?? 0, now, now,
    );
    return true;
  };

  let created = 0;
  for (const r of ROOMS) if (insertProduct(r, 'room', 'stays')) created++;
  for (const e of EXPERIENCES) if (insertProduct(e, 'experience', 'experiences')) created++;
  for (const g of GIFTS) if (insertProduct(g, 'gift', 'gifts')) created++;
  for (const b of BUNDLES) {
    if (insertProduct(b, 'bundle', 'bundles')) {
      created++;
      const bid = get('SELECT id FROM products WHERE slug = ?', b.slug).id;
      for (const it of b.items) {
        const pid = get('SELECT id FROM products WHERE slug = ?', it.slug)?.id;
        if (pid) run('INSERT OR IGNORE INTO bundle_items (bundle_id, product_id, qty) VALUES (?, ?, ?)', bid, pid, it.qty);
      }
    }
  }
  for (const g of GOODS) if (insertProduct(g, 'goods', 'local')) created++;
  log(`products: ${created} new`);
  // Bundles hold no rooms or seats until dates are agreed, so their sales need a stock cap.
  // Older databases seeded the demo bundle without one: add it (only while still demo = 1).
  for (const b of BUNDLES) {
    if (b.stock != null) run('UPDATE products SET stock = ? WHERE slug = ? AND demo = 1 AND stock IS NULL', b.stock, b.slug);
  }

  // ---------- seasonal room rates (only for rooms without any) ----------
  const year = Number(today.slice(0, 4));
  for (const r of ROOMS) {
    const p = get('SELECT id FROM products WHERE slug = ?', r.slug);
    if (!p || get('SELECT 1 FROM room_rates WHERE product_id = ?', p.id)) continue;
    for (const y of [year, year + 1]) for (const rate of r.rates ?? []) run('INSERT INTO room_rates (product_id, date_from, date_to, price, note) VALUES (?, ?, ?, ?, ?)', p.id, `${y}-${rate.from}`, `${y}-${rate.to}`, rate.price, 'DEMO: sezoni i lartë');
  }

  // ---------- sessions 90 days ahead from the weekly pattern ----------
  let sessions = 0;
  for (const e of EXPERIENCES) {
    const p = get('SELECT id, capacity FROM products WHERE slug = ?', e.slug);
    if (!p || !e.weekly) continue;
    for (let i = 0; i <= 90; i++) {
      const d = addDays(today, i);
      if (!e.weekly.days.includes(weekday(d))) continue;
      for (const t of e.weekly.times) sessions += Number(run('INSERT OR IGNORE INTO sessions (product_id, starts_at, capacity) VALUES (?, ?, ?)', p.id, `${d}T${t}`, p.capacity ?? e.capacity).changes);
    }
  }
  log(`sessions: ${sessions} new (90 days ahead)`);

  // ---------- offers ----------
  if (!get('SELECT 1 FROM offers')) {
    for (const o of OFFERS) {
      run('INSERT INTO offers (name_sq, name_en, type, value, scope, min_nights, min_total, starts_on, ends_on, code, max_uses, active, demo) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 1)',
        o.name_sq, o.name_en, o.type, o.value, JSON.stringify(o.scope ?? {}), o.min_nights ?? null, o.min_total ?? null, o.code, o.max_uses ?? null,
        // A demo PROMO CODE starts inactive: a launch without review must not hand out a live discount.
        o.code ? 0 : 1);
    }
    log('offers: demo automatic offer + promo code (the code stays inactive until the owner switches it on)');
  }

  // ---------- FAQ ----------
  if (!get('SELECT 1 FROM faq')) {
    const kb = readJson('src/lib/assistant/kb/faq.json');
    const list = Array.isArray(kb) && kb.length ? kb : FAQ;
    list.forEach((f, i) => run('INSERT INTO faq (q_sq, q_en, a_sq, a_en, keywords, links, sort, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      f.q_sq ?? null, f.q_en ?? null, f.a_sq ?? null, f.a_en ?? null, Array.isArray(f.keywords) ? f.keywords.join(', ') : f.keywords ?? null, JSON.stringify(f.links ?? []), f.sort ?? i + 1));
    log(`faq: ${list.length} entries${list === FAQ ? ' (built-in, SPEC facts only)' : ' (from kb/faq.json)'}`);
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

if (DEMO) {
  if (get('SELECT 1 FROM orders WHERE demo = 1')) log('demo: demo orders already exist (use --reset --demo to rebuild)');
  else seedDemo(db, { today, log: (...a) => log(...a) });
}

const counts = db.prepare(`SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM sessions) AS sessions, (SELECT COUNT(*) FROM orders) AS orders,
  (SELECT COUNT(*) FROM customers) AS customers, (SELECT COUNT(*) FROM events) AS events, (SELECT COUNT(*) FROM faq) AS faq`).get();
log('done:', JSON.stringify(counts), '→', path.relative(ROOT, DB_FILE));
db.close();
