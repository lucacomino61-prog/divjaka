/**
 * Recommendations (GET /api/recommend). Each published product gets a score from five
 * signals; the strongest signal becomes its `reason`:
 *   interests  tag overlap with the visitor's chosen interests          (3 per shared tag)
 *   history    tag/category overlap with recently viewed products        (1.2 per shared tag, +1 same category)
 *   together   co-purchase: bought in the same order as the cart/viewed  (4 × share of co-orders)
 *   season     the product's months include the current month           (1.5; no months listed → 0.3)
 *   popular    distinct tabs that viewed / added it + its orders, 30 days (log scale, ≤ 2)
 *   picked     no signal at all: a neutral label ("chosen by the hotel"), never a popularity claim
 * Demo rows never count: events with sid 'demo-%' and orders with demo = 1 are left out (PLAN §2:
 * no invented popularity). 'season' is only the label when the product's months include this one.
 * Only real orders count (not TEST, confirmed/completed or paid — never an unverified pending
 * one), and views/adds count distinct browsing tabs, so a script cannot steer "popular" or
 * "bought together" with fake checkouts or a flood of events. The order/event part is cached
 * in memory for 60 s (popularity once, co-purchase per anchor set), so a flood of
 * /api/recommend calls does not rescan 30 days of events each time.
 * Items already in the cart are never recommended; viewed items get a small penalty.
 */
import { all } from './db/index';
import { listProducts, pname, primaryImage, type Kind, type Product } from './db/repo/products';
import { addDays, tirane } from './time';
import { productUrl, type Lang } from './urls';

/** An order that really happened: not TEST, and paid or confirmed by staff. */
const REAL_ORDER = "o.test = 0 AND o.demo = 0 AND (o.status IN ('confirmed','completed') OR o.payment_status = 'paid') AND o.status != 'cancelled'";

export type Reason = 'interests' | 'history' | 'together' | 'season' | 'popular' | 'picked';
export interface RecItem { slug: string; kind: Kind; name: string; url: string; price: number; image: string | null; reason: Reason; score?: number }

const TTL = 60_000;
const memo = globalThis as unknown as { __dvPop?: { at: number; map: Map<number, number> }; __dvCo?: Map<string, { at: number; map: Map<number, number> }> };

/** Product id → share of co-orders with the anchors (0..1), from real orders. */
function coPurchase(anchorIds: number[]): Map<number, number> {
  const key = [...new Set(anchorIds)].sort((a, b) => a - b).join(',');
  const store = memo.__dvCo ?? (memo.__dvCo = new Map());
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.map;
  const ids = key.split(',').map(Number);
  const ph = ids.map(() => '?').join(',');
  const rows = all<{ product_id: number; n: number }>(
    `SELECT i2.product_id, COUNT(DISTINCT i2.order_id) AS n FROM order_items i1
     JOIN order_items i2 ON i2.order_id = i1.order_id AND i2.product_id != i1.product_id
     JOIN orders o ON o.id = i1.order_id AND ${REAL_ORDER}
     WHERE i1.product_id IN (${ph}) AND i2.product_id IS NOT NULL GROUP BY i2.product_id`,
    ...ids,
  );
  const max = rows.reduce((m, r) => Math.max(m, r.n), 1);
  const map = new Map(rows.map((r) => [r.product_id, r.n / max] as [number, number]));
  if (store.size > 500) store.clear();
  store.set(key, { at: Date.now(), map });
  return map;
}

/** Product id → popularity points over the last 30 days. */
function popularity(): Map<number, number> {
  const hit = memo.__dvPop;
  if (hit && Date.now() - hit.at < TTL) return hit.map;
  const since = addDays(tirane().date, -30);
  const pop = new Map<number, number>();
  for (const r of all<{ product_id: number; n: number }>(
    `SELECT product_id, COUNT(DISTINCT CASE WHEN type = 'product_view' THEN sid END) + 3 * COUNT(DISTINCT CASE WHEN type = 'add_to_cart' THEN sid END) AS n
     FROM events WHERE day >= ? AND product_id IS NOT NULL AND type IN ('product_view','add_to_cart')
       AND sid IS NOT NULL AND sid NOT LIKE 'demo-%' GROUP BY product_id`,
    since,
  )) pop.set(r.product_id, Number(r.n));
  for (const r of all<{ product_id: number; n: number }>(
    `SELECT i.product_id, COUNT(*) * 5 AS n FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE o.created_at >= ? AND ${REAL_ORDER} AND i.product_id IS NOT NULL GROUP BY i.product_id`,
    since,
  )) pop.set(r.product_id, (pop.get(r.product_id) ?? 0) + Number(r.n));
  memo.__dvPop = { at: Date.now(), map: pop };
  return pop;
}

export function recommend(o: { lang: Lang; interests?: string[]; viewed?: string[]; cart?: string[]; limit?: number; exclude?: string[]; kinds?: Kind[] }): RecItem[] {
  const lang = o.lang;
  const interests = new Set((o.interests ?? []).map((s) => s.toLowerCase()));
  const viewed = (o.viewed ?? []).slice(0, 30);
  const cart = new Set(o.cart ?? []);
  // what the visitor has already seen is not "recommended" back to them (it has its own
  // "Parë së fundi" place); kept only if the catalogue would otherwise run short
  const exclude = new Set([...(o.exclude ?? []), ...cart]);
  const seen = new Set((o.viewed ?? []).slice(0, 30));
  const products = listProducts();
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const month = tirane().month;

  // History profile.
  const histTags = new Map<string, number>();
  const histCats = new Set<string>();
  viewed.forEach((slug, i) => {
    const p = bySlug.get(slug);
    if (!p) return;
    const w = 1 / (1 + i * 0.15); // recent views weigh more
    for (const t of p.tags) histTags.set(t, (histTags.get(t) ?? 0) + w);
    if (p.category) histCats.add(p.category);
  });

  // Co-purchase from real orders (not cancelled).
  const anchorIds = [...cart, ...viewed.slice(0, 5)].map((s) => bySlug.get(s)?.id).filter((x): x is number => !!x);
  const together = new Map<number, number>();
  if (anchorIds.length) for (const [k, v] of coPurchase(anchorIds)) together.set(k, v);

  const pop = popularity();

  const want = Math.min(24, Math.max(1, o.limit ?? 6));
  const pool0 = products.filter((p) => !exclude.has(p.slug) && (!o.kinds?.length || o.kinds.includes(p.kind)));
  const fresh = pool0.filter((p) => !seen.has(p.slug));
  const pool = fresh.length >= want ? fresh : pool0;
  const scoredRaw = pool
    .map((p) => {
      const parts: Record<Exclude<Reason, 'picked'>, number> = {
        interests: p.tags.filter((t) => interests.has(t)).length * 3,
        history: p.tags.reduce((s, t) => s + (histTags.get(t) ?? 0) * 1.2, 0) + (p.category && histCats.has(p.category) ? 1 : 0),
        together: (together.get(p.id) ?? 0) * 4,
        season: p.seasons.length ? (p.seasons.includes(month) ? 1.5 : 0) : 0.3,
        popular: Math.min(2, Math.log10(1 + (pop.get(p.id) ?? 0))),
      };
      let score = Object.values(parts).reduce((a, b) => a + b, 0) + (p.featured ? 0.4 : 0);
      if (viewed.includes(p.slug)) score -= 1.5;
      if (p.seasons.length && !p.seasons.includes(month)) score -= 1;
      return { p, score, parts };
    });
  // "Based on what you viewed" only on the cards the views really pulled in: the ones in this
  // top list that would not be in it without the history signal (never on a viewed item). Every
  // other card is labelled by its strongest other signal, so one label is not on every card.
  const byScore = (a: { p: Product; score: number }, b: { p: Product; score: number }) => b.score - a.score || a.p.sort - b.p.sort;
  const withoutHistory = new Set(
    scoredRaw.map((x) => ({ p: x.p, score: x.score - x.parts.history })).sort(byScore).slice(0, want).map((x) => x.p.slug),
  );
  const scored = scoredRaw
    .map(({ p, score, parts }) => {
      // the label: the strongest real signal; a year-round product's small season bonus is not one
      const labelled = {
        ...parts,
        season: p.seasons.includes(month) ? parts.season : 0,
        history: !seen.has(p.slug) && !withoutHistory.has(p.slug) && parts.history > 0 ? Number.MAX_VALUE : 0,
      };
      const reason = (Object.entries(labelled) as [Reason, number][]).sort((a, b) => b[1] - a[1])[0];
      return { p, score, reason: reason[1] > 0 ? reason[0] : ('picked' as Reason) };
    })
    .sort((a, b) => b.score - a.score || a.p.sort - b.p.sort);

  return scored.slice(0, want).map(({ p, score, reason }) => toItem(p, lang, reason, score));
}

function toItem(p: Product, lang: Lang, reason: Reason, score: number): RecItem {
  return { slug: p.slug, kind: p.kind, name: pname(p, lang), url: productUrl(p.kind, p.slug, lang), price: p.price, image: primaryImage(p), reason, score: Math.round(score * 100) / 100 };
}
