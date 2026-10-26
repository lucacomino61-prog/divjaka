/**
 * recommend.ts — personalises every [data-rec] rail (components/recommend/RecommendRail.astro).
 * Signals stay in this browser: dv-prefs interests, dv-viewed (newest first) and the cart's
 * slugs go to GET /api/recommend as query parameters (no cookies, no identifiers). The answer
 * re-orders server-rendered cards (each product is in the page once: list or hidden pool) and
 * writes each card's reason. Without any signal the server's in-season / hotel-picked order stays.
 * The "Interesat e mia" sheet toggles interests (aria-pressed chips) and saves dv-prefs; the
 * rail updates as you choose. Failures keep the server order and say so in the status line.
 */
import { getPrefs, getViewed, onPrefs, setInterests, toggleInterest } from './prefs';
import { getCart, onChange as onCartChange } from './cart';
import { modal } from './menu';
import { tc, lang } from '../i18n/client';

type Reason = 'interests' | 'history' | 'together' | 'season' | 'popular' | 'picked';
interface Item { slug: string; reason: Reason }

const rails = new WeakSet<HTMLElement>();

export function initRecommend(): void {
  document.querySelectorAll<HTMLElement>('[data-rec]').forEach((rail) => {
    if (rails.has(rail)) return;
    rails.add(rail);
    initRail(rail);
  });
}

function initRail(rail: HTMLElement) {
  const list = rail.querySelector<HTMLElement>('[data-rec-list]');
  const pool = rail.querySelector<HTMLElement>('[data-rec-pool]');
  const status = rail.querySelector<HTMLElement>('[data-rec-status]');
  if (!list || !pool) return;
  const limit = Number(rail.dataset.limit) || 6;
  const kinds = rail.dataset.kinds ?? '';
  const exclude = rail.dataset.exclude ?? '';
  let ctl: AbortController | null = null;
  let timer = 0;
  let lastQuery = '';

  const signals = () => {
    const interests = getPrefs().interests;
    const viewed = getViewed().slice(0, 12);
    const cart = [...new Set(getCart().map((i) => i.slug).filter(Boolean))];
    return { interests, viewed, cart };
  };

  async function refresh(announce: boolean) {
    const s = signals();
    if (!s.interests.length && !s.viewed.length && !s.cart.length && !lastQuery) return; // server order is right
    const q = new URLSearchParams({ lang: lang(), limit: String(limit) });
    if (s.interests.length) q.set('interests', s.interests.join(','));
    if (s.viewed.length) q.set('viewed', s.viewed.join(','));
    if (s.cart.length) q.set('cart', s.cart.join(','));
    if (kinds) q.set('kinds', kinds);
    if (exclude) q.set('exclude', exclude);
    const query = q.toString();
    if (query === lastQuery) return;
    lastQuery = query;
    ctl?.abort();
    ctl = new AbortController();
    // a spinner-free busy state, shown only if the answer takes a moment
    const busy = window.setTimeout(() => list!.setAttribute('aria-busy', 'true'), 200);
    try {
      const r = await fetch(`/api/recommend?${query}`, { signal: ctl.signal, headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as { items?: Item[] };
      apply(data.items ?? []);
      if (announce && status) status.textContent = tc('recommend.updated');
      else if (status) status.textContent = '';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      lastQuery = '';
      if (status) status.textContent = tc('recommend.error');
    } finally {
      clearTimeout(busy);
      list!.removeAttribute('aria-busy');
    }
  }

  function apply(items: Item[]) {
    const cards = new Map<string, HTMLElement>();
    rail.querySelectorAll<HTMLElement>('[data-rec-card]').forEach((c) => cards.set(c.dataset.recCard!, c));
    const keep = items.filter((i) => cards.has(i.slug)).slice(0, limit);
    if (!keep.length) return;
    // write only: move cards, set reasons
    for (const c of [...list!.children] as HTMLElement[]) if (!keep.some((k) => k.slug === c.dataset.recCard)) pool!.append(c);
    keep.forEach((k) => {
      const c = cards.get(k.slug)!;
      c.dataset.reason = k.reason;
      const label = c.querySelector('[data-rec-reason]');
      if (label) label.textContent = tc(`recommend.reason.${k.reason}`);
      list!.append(c);
    });
  }

  const schedule = (announce: boolean) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => { void refresh(announce); }, 280);
  };

  // first personalisation when the browser is idle (never competes with the first paint)
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(() => { void refresh(false); }, { timeout: 2000 }); else window.setTimeout(() => { void refresh(false); }, 600);
  onPrefs(() => schedule(true));
  onCartChange(() => schedule(false));

  // the interests sheet
  const dialog = rail.querySelector<HTMLDialogElement>('[data-rec-sheet]');
  const openBtn = rail.querySelector<HTMLButtonElement>('[data-rec-prefs-open]');
  const label = rail.querySelector<HTMLElement>('[data-rec-prefs-label]');
  if (!dialog || !openBtn) return;
  const sheet = modal(dialog, { swipeClose: 'down' });
  const chips = [...dialog.querySelectorAll<HTMLButtonElement>('[data-interest]')];
  const paint = () => {
    const set = new Set(getPrefs().interests);
    chips.forEach((c) => c.setAttribute('aria-pressed', String(set.has(c.dataset.interest!))));
    const n = chips.filter((c) => set.has(c.dataset.interest!)).length;
    if (label) label.textContent = n ? tc('recommend.prefs.count', { n: String(n) }) : tc('recommend.prefs.open');
  };
  openBtn.addEventListener('click', () => sheet.open(openBtn));
  dialog.querySelectorAll('[data-rec-prefs-close]').forEach((b) => b.addEventListener('click', () => sheet.close()));
  dialog.querySelector('[data-rec-prefs-clear]')?.addEventListener('click', () => setInterests([]));
  chips.forEach((c) => c.addEventListener('click', () => toggleInterest(c.dataset.interest!)));
  // a click on the backdrop closes the sheet
  dialog.addEventListener('click', (e) => { if (e.target === dialog) sheet.close(); });
  onPrefs(paint);
  paint();
}
