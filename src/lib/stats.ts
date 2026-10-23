/**
 * Admin dashboard numbers (GET /api/admin/stats?from&to). Every figure is computed from the
 * DB at request time, so the dashboard always matches the tables.
 * Range: `from` and `to` are inclusive 'YYYY-MM-DD' days in Europe/Tirane. Orders are
 * selected by their created_at instant converted to local day.
 *   revenue          totals of CONFIRMED orders: paid, or confirmed/completed by staff (the same
 *                    rule as the customers' revenue) — an anonymous unconfirmed booking costs
 *                    nothing to make, so it is never counted as money;
 *   pending_revenue  totals of orders still waiting (pending, not paid), shown apart;
 *   paid_revenue     orders with payment_status 'paid'.
 * aov, the daily revenue series, order sources and top products use confirmed orders too;
 * the order counts and the funnel count every order that is not cancelled.
 */
import { all, get } from './db/index';
import { occupancy } from './availability';
import { getSetting } from './db/repo/settings';
import { addDays, daysBetween, dayOf, nights as dayList, tirane } from './time';

/** Europe/Tirane offset from UTC (ms) at an instant. */
function offsetAt(ms: number): number {
  return Date.parse(tirane(new Date(ms)).dateTime + ':00Z') - Math.floor(ms / 60_000) * 60_000;
}

/**
 * UTC instant of local midnight (Europe/Tirane) at the start of `date`. The offset is taken at
 * midnight itself (two passes), so the daylight-saving days are right too:
 * 2026-10-25 → 2026-10-24T22:00Z, 2027-03-28 → 2027-03-27T23:00Z.
 */
export function localMidnightUtc(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d);
  let guess = wall - offsetAt(wall);
  guess = wall - offsetAt(guess);
  return new Date(guess).toISOString();
}

function p75(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(0.75 * s.length) - 1)];
}

interface ORow { id: number; created_at: string; total: number; discount: number; status: string; payment_status: string; customer_id: number | null; source: string | null }

export function stats(from: string, to: string) {
  const toEx = addDays(to, 1);
  const a = localMidnightUtc(from);
  const b = localMidnightUtc(toEx);

  // TEST card orders (orders.test = 1) are never counted as orders or money; only their count is shown.
  const orders = all<ORow>('SELECT id, created_at, total, discount, status, payment_status, customer_id, source FROM orders WHERE created_at >= ? AND created_at < ? AND test = 0', a, b);
  const testOrders = Number(get<{ n: number }>('SELECT COUNT(*) AS n FROM orders WHERE created_at >= ? AND created_at < ? AND test = 1', a, b)?.n ?? 0);
  const live = orders.filter((o) => o.status !== 'cancelled');
  const isConfirmed = (o: ORow) => o.payment_status === 'paid' || o.status === 'confirmed' || o.status === 'completed';
  const confirmed = live.filter(isConfirmed);
  const revenue = confirmed.reduce((s, o) => s + o.total, 0);
  const pending = live.filter((o) => !isConfirmed(o));
  const customers = new Set(live.map((o) => o.customer_id).filter((x): x is number => x !== null));
  let repeaters = 0;
  if (customers.size) {
    const ids = [...customers];
    const rows = all<{ customer_id: number; n: number }>(
      `SELECT customer_id, COUNT(*) AS n FROM orders WHERE status != 'cancelled' AND test = 0 AND customer_id IN (${ids.map(() => '?').join(',')}) GROUP BY customer_id`,
      ...ids,
    );
    repeaters = rows.filter((r) => Number(r.n) > 1).length;
  }
  const visitors = Number(get<{ n: number }>("SELECT COUNT(DISTINCT sid) AS n FROM events WHERE day >= ? AND day <= ? AND type = 'view'", from, to)?.n ?? 0);

  const kpis = {
    revenue,
    paid_revenue: orders.filter((o) => o.payment_status === 'paid').reduce((s, o) => s + o.total, 0),
    pending_revenue: pending.reduce((s, o) => s + o.total, 0),
    pending_orders: pending.length,
    confirmed_orders: confirmed.length,
    orders: live.length,
    aov: confirmed.length ? Math.round(revenue / confirmed.length) : 0,
    customers: customers.size,
    repeat_rate: customers.size ? Math.round((repeaters / customers.size) * 1000) / 10 : 0,
    cancelled: orders.length - live.length,
    discount: live.reduce((s, o) => s + o.discount, 0),
    visitors,
    conversion: visitors ? Math.round((live.length / visitors) * 1000) / 10 : 0,
    test_orders: testOrders,
  };

  const byDay = new Map<string, { orders: number; revenue: number }>();
  for (const o of live) {
    const d = dayOf(o.created_at);
    const cur = byDay.get(d) ?? { orders: 0, revenue: 0 };
    cur.orders++;
    if (isConfirmed(o)) cur.revenue += o.total;
    byDay.set(d, cur);
  }
  const viewsByDay = new Map(
    all<{ day: string; visitors: number; views: number }>(
      "SELECT day, COUNT(DISTINCT sid) AS visitors, COUNT(*) AS views FROM events WHERE type = 'view' AND day >= ? AND day <= ? GROUP BY day",
      from, to,
    ).map((r) => [r.day, r]),
  );
  const series = dayList(from, toEx).map((day) => ({
    day,
    orders: byDay.get(day)?.orders ?? 0,
    revenue: byDay.get(day)?.revenue ?? 0,
    visitors: Number(viewsByDay.get(day)?.visitors ?? 0),
    views: Number(viewsByDay.get(day)?.views ?? 0),
  }));

  // Funnel: distinct analytics sessions per step; order/paid from the orders table.
  const stepCount = (type: string) => Number(get<{ n: number }>('SELECT COUNT(DISTINCT sid) AS n FROM events WHERE type = ? AND day >= ? AND day <= ?', type, from, to)?.n ?? 0);
  const funnel = [
    { step: 'view', count: visitors },
    { step: 'product_view', count: stepCount('product_view') },
    { step: 'add_to_cart', count: stepCount('add_to_cart') },
    { step: 'checkout_start', count: stepCount('checkout_start') },
    { step: 'order', count: orders.length },
    { step: 'paid', count: orders.filter((o) => o.payment_status === 'paid').length },
  ];

  const top_products = all<{ product_id: number; slug: string; name: string; kind: string; qty: number; revenue: number; orders: number }>(
    `SELECT i.product_id, p.slug, COALESCE(p.name_sq, i.name) AS name, i.kind, SUM(i.qty) AS qty, SUM(i.line_total) AS revenue, COUNT(DISTINCT i.order_id) AS orders
     FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products p ON p.id = i.product_id
     WHERE o.created_at >= ? AND o.created_at < ? AND o.status != 'cancelled' AND o.test = 0
       AND (o.payment_status = 'paid' OR o.status IN ('confirmed','completed')) GROUP BY i.product_id ORDER BY revenue DESC LIMIT 10`,
    a, b,
  );
  const top_viewed = all<{ slug: string; name: string; views: number }>(
    `SELECT p.slug, p.name_sq AS name, COUNT(*) AS views FROM events e JOIN products p ON p.id = e.product_id
     WHERE e.type = 'product_view' AND e.day >= ? AND e.day <= ? GROUP BY e.product_id ORDER BY views DESC LIMIT 10`,
    from, to,
  );
  const sources = all<{ source: string; visitors: number }>(
    `SELECT COALESCE(utm_source, ref, 'direct') AS source, COUNT(DISTINCT sid) AS visitors FROM events
     WHERE type = 'view' AND day >= ? AND day <= ? GROUP BY source ORDER BY visitors DESC LIMIT 20`,
    from, to,
  );
  const campaigns = all<{ source: string; medium: string | null; campaign: string; visitors: number }>(
    `SELECT utm_source AS source, utm_medium AS medium, utm_campaign AS campaign, COUNT(DISTINCT sid) AS visitors FROM events
     WHERE type = 'view' AND day >= ? AND day <= ? AND utm_campaign IS NOT NULL GROUP BY 1, 2, 3 ORDER BY visitors DESC LIMIT 20`,
    from, to,
  );
  const srcMap = new Map<string, { source: string; orders: number; revenue: number }>();
  for (const o of live) {
    const k = o.source || 'direct';
    const cur = srcMap.get(k) ?? { source: k, orders: 0, revenue: 0 };
    cur.orders++;
    if (isConfirmed(o)) cur.revenue += o.total;
    srcMap.set(k, cur);
  }
  const order_sources = [...srcMap.values()].sort((x, y) => y.revenue - x.revenue);
  const devices = all<{ device: string; visitors: number }>(
    "SELECT COALESCE(device, 'unknown') AS device, COUNT(DISTINCT sid) AS visitors FROM events WHERE type = 'view' AND day >= ? AND day <= ? GROUP BY device ORDER BY visitors DESC",
    from, to,
  );
  const languages = all<{ lang: string; visitors: number }>(
    "SELECT COALESCE(lang, 'sq') AS lang, COUNT(DISTINCT sid) AS visitors FROM events WHERE type = 'view' AND day >= ? AND day <= ? GROUP BY lang ORDER BY visitors DESC",
    from, to,
  );
  const top_pages = all<{ path: string; views: number; visitors: number }>(
    "SELECT path, COUNT(*) AS views, COUNT(DISTINCT sid) AS visitors FROM events WHERE type = 'view' AND day >= ? AND day <= ? AND path IS NOT NULL GROUP BY path ORDER BY views DESC LIMIT 20",
    from, to,
  );
  const search_terms = all<{ q: string; searches: number; zero: number }>(
    `SELECT lower(json_extract(meta, '$.q')) AS q, COUNT(*) AS searches, SUM(CASE WHEN CAST(json_extract(meta, '$.n') AS INTEGER) = 0 THEN 1 ELSE 0 END) AS zero
     FROM events WHERE type = 'search' AND day >= ? AND day <= ? AND json_extract(meta, '$.q') IS NOT NULL GROUP BY q ORDER BY searches DESC LIMIT 30`,
    from, to,
  );
  const assistant = {
    questions: Number(get<{ n: number }>("SELECT COUNT(*) AS n FROM events WHERE type = 'assistant_q' AND day >= ? AND day <= ?", from, to)?.n ?? 0),
    misses: all<{ q: string; ts: string; lang: string | null }>(
      "SELECT json_extract(meta, '$.q') AS q, ts, lang FROM events WHERE type = 'assistant_miss' AND day >= ? AND day <= ? ORDER BY ts DESC LIMIT 50",
      from, to,
    ),
  };
  const vitalRows = all<{ name: string; value: number; device: string | null }>(
    "SELECT json_extract(meta, '$.name') AS name, CAST(json_extract(meta, '$.value') AS REAL) AS value, device FROM events WHERE type = 'vital' AND day >= ? AND day <= ?",
    from, to,
  );
  const vitals: Record<string, { p75: number | null; n: number; mobile_p75: number | null }> = {};
  for (const name of ['LCP', 'INP', 'CLS', 'FCP', 'TTFB']) {
    const v = vitalRows.filter((r) => r.name === name).map((r) => Number(r.value)).filter(Number.isFinite);
    const vm = vitalRows.filter((r) => r.name === name && r.device === 'mobile').map((r) => Number(r.value)).filter(Number.isFinite);
    vitals[name] = { p75: p75(v), n: v.length, mobile_p75: p75(vm) };
  }

  const today = tirane().date;
  const occ = occupancy(today, 30);
  const low = getSetting('inventory').low_stock ?? 5;
  const low_stock = all<{ id: number; slug: string; name_sq: string; kind: string; stock: number }>(
    "SELECT id, slug, name_sq, kind, stock FROM products WHERE status = 'published' AND stock IS NOT NULL AND stock <= ? ORDER BY stock, sort",
    low,
  );
  const full_sessions = all<{ id: number; slug: string; name_sq: string; starts_at: string; capacity: number; booked: number }>(
    `SELECT s.id, p.slug, p.name_sq, s.starts_at, s.capacity, s.booked FROM sessions s JOIN products p ON p.id = s.product_id
     WHERE s.status = 'open' AND s.starts_at >= ? AND s.starts_at < ? AND s.capacity - s.booked <= 2 ORDER BY s.starts_at LIMIT 20`,
    `${today}T00:00`, `${addDays(today, 7)}T00:00`,
  );
  const latest_orders = all('SELECT id, code, name, total, status, payment_method, payment_status, test, created_at FROM orders ORDER BY created_at DESC, id DESC LIMIT 8');
  const unread_messages = Number(get<{ n: number }>("SELECT COUNT(*) AS n FROM messages WHERE status = 'new'")?.n ?? 0);
  const pending_orders = Number(get<{ n: number }>("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'")?.n ?? 0);

  return {
    range: { from, to, days: daysBetween(from, to) + 1 },
    kpis, series, funnel, top_products, top_viewed, sources, campaigns, order_sources, devices, languages, top_pages,
    search_terms, assistant, vitals,
    occupancy: { days: occ, avg: occ.length ? Math.round((occ.reduce((s, d) => s + d.rate, 0) / occ.length) * 10) / 10 : 0 },
    low_stock, full_sessions, latest_orders, unread_messages, pending_orders,
  };
}
