/**
 * DEMO activity for the admin dashboard (`node scripts/seed.mjs --demo`): ~60 orders with
 * customers over the past 60 days (+ a few stays in the next 30 days) and browsing events.
 * Every row is fake and marked: customers/orders demo = 1, e-mails @example.com, event sids
 * start with 'demo-'. Inventory stays consistent: room_nights, sessions and stock are taken
 * with the same guards the app uses.
 * Remove later with: DELETE FROM events WHERE sid LIKE 'demo-%'; orders/customers WHERE demo = 1.
 */
import crypto from 'node:crypto';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_SQ = ['Arben', 'Elira', 'Blerina', 'Gentian', 'Ilir', 'Dorina', 'Erion', 'Klea', 'Arta', 'Besnik', 'Jonida', 'Mirela', 'Sokol', 'Anisa', 'Dritan', 'Ermal'];
const LAST_SQ = ['Hoxha', 'Dervishi', 'Shehu', 'Kola', 'Gjoka', 'Leka', 'Prifti', 'Basha', 'Marku', 'Duka', 'Cela', 'Hysa'];
const FIRST_EU = ['Marco', 'Giulia', 'Anna', 'Lukas', 'Sophie', 'Jan', 'Emma', 'Pierre', 'Claire', 'Tomasz', 'Eva', 'Daniel', 'Laura', 'Matteo'];
const LAST_EU = ['Bianchi', 'Rossi', 'Schmidt', 'Müller', 'Dubois', 'Novak', 'Kowalski', 'Jansen', 'Weber', 'Moretti', 'Fischer', 'Lambert'];
const COUNTRIES_EU = ['IT', 'DE', 'FR', 'PL', 'NL', 'AT', 'CZ', 'GB'];

const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const pick = (r, a) => a[Math.floor(r() * a.length)];
const iso = (d) => d.toISOString();
const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ü/g, 'u').toLowerCase();

export function seedDemo(db, { today, log = console.log }) {
  const r = rng(20261023);
  
  const rooms = db.prepare("SELECT * FROM products WHERE kind = 'room' AND status = 'published'").all();
  const exps = db.prepare("SELECT * FROM products WHERE kind = 'experience' AND status = 'published'").all();
  const goods = db.prepare("SELECT * FROM products WHERE kind IN ('goods','gift') AND status = 'published'").all();
  const ratesFor = (pid) => db.prepare('SELECT * FROM room_rates WHERE product_id = ? ORDER BY id').all(pid);
  const nightPrice = (p, night) => {
    let best = null;
    for (const x of ratesFor(p.id)) if (x.date_from <= night && x.date_to >= night && (!best || x.id > best.id)) best = x;
    return best ? best.price : p.price;
  };

  const people = [];
  for (let i = 0; i < 45; i++) {
    const local = r() < 0.55;
    const first = pick(r, local ? FIRST_SQ : FIRST_EU);
    const last = pick(r, local ? LAST_SQ : LAST_EU);
    people.push({
      name: `${first} ${last}`, email: `${ascii(first)}.${ascii(last)}${i}@example.com`,
      phone: local ? `+355 6${Math.floor(7 + r() * 3)} ${String(Math.floor(r() * 9000000) + 1000000)}` : null,
      country: local ? 'AL' : pick(r, COUNTRIES_EU), lang: local ? 'sq' : 'en',
    });
  }

  const insCustomer = db.prepare('INSERT OR IGNORE INTO customers (email, name, phone, country, lang, marketing_consent, consent_at, created_at, demo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)');
  const custId = db.prepare('SELECT id FROM customers WHERE email = ?');
  const insOrder = db.prepare(`INSERT INTO orders (code, access_token, customer_id, email, name, phone, country, lang, status, payment_method, payment_status, payment_provider, payment_ref,
    subtotal, discount, total, promo_code, notes, source, sid, demo, created_at, updated_at, paid_at, cancelled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, ?, ?, 1, ?, ?, ?, ?)`);
  const insItem = db.prepare(`INSERT INTO order_items (order_id, product_id, kind, name, unit_price, qty, line_total, date_from, date_to, session_id, guests, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insLog = db.prepare('INSERT INTO inventory_log (product_id, session_id, night, delta, reason, order_id, ts) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insEvent = db.prepare(`INSERT INTO events (ts, day, type, path, lang, product_id, value, sid, ref, utm_source, utm_medium, utm_campaign, device, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const newCode = () => {
    for (;;) {
      let s = 'DV-';
      for (const b of crypto.randomBytes(5)) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
      if (!db.prepare('SELECT 1 FROM orders WHERE code = ?').get(s)) return s;
    }
  };

  /** Try to hold a room for [from, to): returns false when any night is full. */
  const holdRoom = (p, from, to, qty) => {
    const nights = [];
    for (let d = from; d < to; d = addDays(d, 1)) nights.push(d);
    for (const n of nights) {
      db.prepare('INSERT OR IGNORE INTO room_nights (product_id, night) VALUES (?, ?)').run(p.id, n);
      const row = db.prepare('SELECT booked, closed FROM room_nights WHERE product_id = ? AND night = ?').get(p.id, n);
      if (row.booked + row.closed + qty > p.units) return null;
    }
    for (const n of nights) db.prepare('UPDATE room_nights SET booked = booked + ? WHERE product_id = ? AND night = ?').run(qty, p.id, n);
    return nights;
  };

  let made = 0;
  const sources = [null, null, null, 'google.com', 'facebook.com', 'instagram.com', 'google.com'];
  db.exec('BEGIN IMMEDIATE');
  try {
    for (let i = 0; i < 64; i++) {
      const daysAgo = Math.floor(Math.pow(r(), 0.8) * 60);
      const createdDay = addDays(today, -daysAgo);
      const created = new Date(`${createdDay}T${String(8 + Math.floor(r() * 13)).padStart(2, '0')}:${String(Math.floor(r() * 60)).padStart(2, '0')}:00Z`);
      if (created > new Date()) created.setTime(Date.now() - 3600_000);
      const person = r() < 0.2 && i > 10 ? people[Math.floor(r() * 10)] : pick(r, people); // some repeat customers
      const consent = r() < 0.4;
      insCustomer.run(person.email, person.name, person.phone, person.country, person.lang, consent ? 1 : 0, consent ? iso(created) : null, iso(created));
      const cid = custId.get(person.email).id;

      const kindRoll = r();
      const items = [];
      if (kindRoll < 0.5 && rooms.length) {
        const p = pick(r, rooms);
        const lead = Math.floor(r() * 25);
        const from = addDays(createdDay, lead);
        const n = 1 + Math.floor(r() * 4);
        const to = addDays(from, n);
        const qty = 1;
        const nights = holdRoom(p, from, to, qty);
        if (!nights) continue;
        const prices = nights.map((d) => nightPrice(p, d));
        const sum = prices.reduce((a, b) => a + b, 0);
        let total = sum;
        let offer = null;
        if (n >= 3) { const s = Math.round(total * 0.1); total -= s; offer = { name: 'Qëndrim i gjatë: −10% nga 3 netë', saving: s }; }
        items.push({ p, kind: 'room', qty, unit: Math.round(sum / n), total, from, to, guests: Math.min(p.capacity, 1 + Math.floor(r() * p.capacity)), nights, meta: { slug: p.slug, nights: n, night_prices: prices, ...(offer ? { offer } : {}) } });
        if (r() < 0.35 && exps.length) {
          const e = pick(r, exps);
          items.push({ p: e, kind: 'experience', qty: 2, unit: e.price, total: e.price * 2, startsDay: addDays(from, 1), guests: 2 });
        }
      } else if (kindRoll < 0.85 && exps.length) {
        const e = pick(r, exps);
        const ppl = 1 + Math.floor(r() * 4);
        items.push({ p: e, kind: 'experience', qty: ppl, unit: e.price, total: e.price * ppl, startsDay: addDays(createdDay, Math.floor(r() * 10)), guests: ppl });
      } else if (goods.length) {
        const g = pick(r, goods);
        const qty = g.kind === 'gift' ? 1 : 1 + Math.floor(r() * 2);
        if (g.stock !== null) {
          const ok = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?').run(qty, g.id, qty).changes;
          if (!ok) continue;
        }
        const amount = g.kind === 'gift' ? pick(r, [3000, 5000, 5000, 10000]) : g.price;
        items.push({ p: g, kind: g.kind, qty, unit: amount, total: amount * qty, meta: { slug: g.slug, ...(g.kind === 'gift' ? { amount } : {}), ...(g.stock !== null ? { held_stock: qty } : {}) }, stocked: g.stock !== null });
      }
      if (!items.length) continue;

      // Experience sessions: use (or create) a slot on that day.
      for (const it of items.filter((x) => x.kind === 'experience')) {
        let s;
        if (it.startsDay > today) {
          // Future: use a real scheduled slot (generated from the weekly pattern).
          s = db.prepare("SELECT * FROM sessions WHERE product_id = ? AND starts_at >= ? AND status = 'open' ORDER BY starts_at LIMIT 1").get(it.p.id, `${it.startsDay}T00:00`);
          if (!s) { it.skip = true; continue; }
          it.startsDay = s.starts_at.slice(0, 10);
        } else {
          // Past: the slot that took place that day (created for the demo history).
          const startsAt = `${it.startsDay}T${r() < 0.6 ? '09:00' : '16:30'}`;
          db.prepare('INSERT OR IGNORE INTO sessions (product_id, starts_at, capacity) VALUES (?, ?, ?)').run(it.p.id, startsAt, it.p.capacity ?? 12);
          s = db.prepare('SELECT * FROM sessions WHERE product_id = ? AND starts_at = ?').get(it.p.id, startsAt);
        }
        const startsAt = s.starts_at;
        if (s.booked + it.guests > s.capacity) { it.skip = true; continue; }
        db.prepare('UPDATE sessions SET booked = booked + ? WHERE id = ?').run(it.guests, s.id);
        it.session = s;
        it.meta = { slug: it.p.slug, starts_at: startsAt };
      }
      const keep = items.filter((x) => !x.skip);
      if (!keep.length) continue;

      const total = keep.reduce((a, x) => a + x.total, 0);
      const methodRoll = r();
      const method = methodRoll < 0.45 ? 'hotel' : methodRoll < 0.7 ? 'bank' : 'card';
      const serviceDay = keep[0].from ?? keep[0].startsDay ?? createdDay;
      const past = serviceDay < today;
      const cancelled = r() < 0.06;
      let status = past ? 'completed' : method === 'card' ? 'confirmed' : r() < 0.5 ? 'confirmed' : 'pending';
      let payStatus = method === 'card' || past || (method === 'bank' && r() < 0.6) ? 'paid' : 'unpaid';
      if (cancelled) { status = 'cancelled'; if (payStatus === 'paid' && method === 'card') payStatus = 'refunded'; else payStatus = 'unpaid'; }
      const paidAt = payStatus === 'paid' ? iso(new Date(created.getTime() + (method === 'card' ? 120_000 : 86_400_000))) : null;
      const sid = `demo-${crypto.randomBytes(6).toString('hex')}`;
      const src = pick(r, sources);
      const orderId = Number(insOrder.run(
        newCode(), crypto.randomBytes(32).toString('base64url'), cid, person.email, person.name, person.phone, person.country, person.lang,
        status, method, payStatus, method === 'card' ? 'test' : null, method === 'card' ? `TEST-DEMO-${i}` : null,
        total, total, src, null, iso(created), iso(created), paidAt, cancelled ? iso(new Date(created.getTime() + 2 * 86_400_000)) : null,
      ).lastInsertRowid);

      for (const it of keep) {
        insItem.run(orderId, it.p.id, it.kind, it.p[person.lang === 'en' ? 'name_en' : 'name_sq'], it.unit, it.kind === 'experience' ? it.guests : it.qty, it.total,
          it.kind === 'room' ? it.from : it.kind === 'experience' ? it.startsDay : null, it.kind === 'room' ? it.to : null,
          it.session?.id ?? null, it.guests ?? null, JSON.stringify(it.meta ?? { slug: it.p.slug }));
        if (it.kind === 'room') for (const n of it.nights) insLog.run(it.p.id, null, n, -it.qty, 'order', orderId, iso(created));
        else if (it.kind === 'experience') insLog.run(it.p.id, it.session.id, null, -it.guests, 'order', orderId, iso(created));
        else if (it.stocked) insLog.run(it.p.id, null, null, -it.qty, 'order', orderId, iso(created));
        if (cancelled) {
          // release what was held
          if (it.kind === 'room') for (const n of it.nights) db.prepare('UPDATE room_nights SET booked = MAX(0, booked - ?) WHERE product_id = ? AND night = ?').run(it.qty, it.p.id, n);
          else if (it.kind === 'experience') db.prepare('UPDATE sessions SET booked = MAX(0, booked - ?) WHERE id = ?').run(it.guests, it.session.id);
          else if (it.stocked) db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(it.qty, it.p.id);
          insLog.run(it.p.id, it.session?.id ?? null, null, it.kind === 'experience' ? it.guests : it.qty, 'cancel', orderId, iso(created));
        }
      }
      const dayKey = ymd(created);
      insEvent.run(iso(created), dayKey, 'checkout_start', person.lang === 'en' ? '/en/checkout/' : '/arka/', person.lang, null, total, sid, src, null, null, null, r() < 0.6 ? 'mobile' : 'desktop', null);
      insEvent.run(iso(created), dayKey, 'order', null, person.lang, null, total, null, null, src, null, null, null, JSON.stringify({ method }));
      if (payStatus === 'paid') insEvent.run(paidAt, paidAt.slice(0, 10), 'paid', null, person.lang, null, total, null, null, src, null, null, null, JSON.stringify({ method }));
      made++;
    }

    // Browsing events for every past day.
    const all = db.prepare("SELECT id, slug, kind FROM products WHERE status = 'published'").all();
    const pathOf = (p, lang) => {
      const base = { room: ['/qendrimi/', '/en/stay/'], experience: ['/eksperienca/', '/en/experiences/'] }[p.kind] ?? ['/dyqani/', '/en/shop/'];
      return `${base[lang === 'en' ? 1 : 0]}${p.slug}/`;
    };
    const pages = [['/', '/en/'], ['/qendrimi/', '/en/stay/'], ['/eksperienca/', '/en/experiences/'], ['/dyqani/', '/en/shop/'], ['/trashegimia/', '/en/heritage/'], ['/tani/', '/en/now/'], ['/itinerari/', '/en/itinerary/']];
    const searches = ['pelikan', 'laguna', 'dhome', 'flamingo', 'kulla', 'room', 'tour', 'parking', 'karte dhurate', 'kayak', 'bicikleta', 'breakfast', 'mengjes'];
    const misses = ['A keni parking?', 'Is breakfast included?', 'A lejohen kafshët?', 'Do you have airport transfer?', 'Sa larg është plazhi?'];
    let events = 0;
    for (let d = 60; d >= 1; d--) {
      const day = addDays(today, -d);
      const visitors = 15 + Math.floor(r() * 45) + (new Date(day).getUTCDay() % 6 === 0 ? 15 : 0);
      for (let v = 0; v < visitors; v++) {
        const sid = `demo-${crypto.randomBytes(6).toString('hex')}`;
        const lang = r() < 0.6 ? 'sq' : 'en';
        const device = r() < 0.62 ? 'mobile' : r() < 0.1 ? 'tablet' : 'desktop';
        const roll = r();
        const ref = roll < 0.35 ? 'google.com' : roll < 0.5 ? 'facebook.com' : roll < 0.6 ? 'instagram.com' : null;
        const utm = r() < 0.08 ? ['facebook', 'social', 'vjeshte-2026'] : [null, null, null];
        let t = Date.parse(`${day}T${String(7 + Math.floor(r() * 15)).padStart(2, '0')}:00:00Z`) + Math.floor(r() * 3600_000);
        const ev = (type, path, product, value, meta) => {
          insEvent.run(new Date(t).toISOString(), day, type, path, lang, product ?? null, value ?? null, sid, ref, utm[0], utm[1], utm[2], device, meta ? JSON.stringify(meta) : null);
          t += 20_000 + Math.floor(r() * 90_000);
          events++;
        };
        const n = 1 + Math.floor(r() * 5);
        for (let k = 0; k < n; k++) ev('view', pick(r, pages)[lang === 'en' ? 1 : 0]);
        if (r() < 0.55 && all.length) {
          const p = pick(r, all);
          ev('view', pathOf(p, lang));
          ev('product_view', pathOf(p, lang), p.id);
          if (r() < 0.22) {
            ev('add_to_cart', pathOf(p, lang), p.id, 1);
            if (r() < 0.45) ev('checkout_start', lang === 'en' ? '/en/checkout/' : '/arka/');
          }
        }
        if (r() < 0.08) { const q = pick(r, searches); ev('search', null, null, null, { q, n: ['flamingo', 'parking', 'kayak', 'bicikleta', 'breakfast', 'mengjes'].includes(q) ? 0 : 1 + Math.floor(r() * 4) }); }
        if (r() < 0.04) { const q = pick(r, misses); ev('assistant_q', null, null, null, { q, intent: 'miss', hit: false }); ev('assistant_miss', null, null, null, { q }); }
        if (r() < 0.5) {
          const lcp = Math.round(900 + r() * r() * 3200);
          ev('vital', null, null, lcp, { name: 'LCP', value: lcp, rating: lcp <= 2500 ? 'good' : lcp <= 4000 ? 'needs-improvement' : 'poor' });
          const inp = Math.round(40 + r() * r() * 380);
          ev('vital', null, null, inp, { name: 'INP', value: inp, rating: inp <= 200 ? 'good' : inp <= 500 ? 'needs-improvement' : 'poor' });
          const cls = Math.round(r() * r() * 0.18 * 1000) / 1000;
          ev('vital', null, null, Math.round(cls * 1000), { name: 'CLS', value: cls, rating: cls <= 0.1 ? 'good' : 'needs-improvement' });
        }
      }
    }
    db.exec('COMMIT');
    log(`demo: ${made} orders, ${people.length} customers, ${events} events`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
