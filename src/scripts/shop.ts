/**
 * shop.ts — the shop index and the product pages (T5).
 *
 * initShop(): the filter form works without JavaScript (GET → the server filters). With it, every
 * change is applied in place: specimens and list rows are shown/hidden and re-ordered from their
 * data-* facts (components/shop/filters.ts, the same rules the server uses), the status line is
 * announced, and the URL follows (pushState for pills/sort/view, replaceState while typing), so
 * Back/Forward, refresh and sharing land on the same view. A click on a card's plate follows the
 * card's link (the plate sits above the stretched link so the crosshair can track the pointer).
 *
 * initProduct(): the floating order card — gift amount presets + custom amount (validated on
 * add, never pre-disabled), quantity stepper, Add to cart (cart.ts store + toast with Undo),
 * Buy now (add, then the checkout), the phone pill (Moooor) that mirrors the card while the card
 * is off screen, addViewed() for recommendations and the product_view beacon.
 */
import { readState, writeState, matches, compare, queryTokens, type ShopState, type ItemFacts, type Kind } from '../components/shop/filters';
import { addItem } from './cart';
import { addViewed, eurRate, getCurrency } from './prefs';
import { track } from './track';
import { tc, lang } from '../i18n/client';
import { initShare } from './share';
import { money } from '../i18n/format';

/** First-touch campaign tags of this tab, kept for the checkout's attribution (sessionStorage dv-utm). */
export function rememberUtm(): void {
  try {
    const q = new URLSearchParams(location.search);
    const source = q.get('utm_source');
    if (!source || sessionStorage.getItem('dv-utm')) return;
    sessionStorage.setItem('dv-utm', JSON.stringify({ source, medium: q.get('utm_medium') ?? undefined, campaign: q.get('utm_campaign') ?? undefined }));
  } catch { /* storage blocked */ }
}

/* ------------------------------------------------------------------ shop index */

export function initShop(): void {
  rememberUtm();
  const form = document.querySelector<HTMLFormElement>('[data-shop-form]');
  const results = document.querySelector<HTMLElement>('[data-shop-results]');
  if (!form || !results) return;
  const grid = results.querySelector<HTMLElement>('[data-shop-grid]')!;
  const rows = results.querySelector<HTMLElement>('[data-shop-rows]')!;
  const status = results.querySelector<HTMLElement>('[data-shop-status]')!;
  const empty = results.querySelector<HTMLElement>('[data-shop-empty]')!;
  const emptyBody = results.querySelector<HTMLElement>('[data-shop-empty-body]');
  const clearLinks = results.querySelectorAll<HTMLAnchorElement>('[data-shop-clear], [data-shop-clear-2]');
  const L = lang();

  const cards = [...grid.querySelectorAll<HTMLElement>('[data-spec]')];
  const rowBySlug = new Map([...rows.querySelectorAll<HTMLElement>('[data-row]')].map((r) => [r.dataset.row!, r]));
  const facts = new Map<string, ItemFacts>(cards.map((c) => [c.dataset.spec!, {
    kind: c.dataset.kind as Kind,
    tags: (c.dataset.tags ?? '').split(' ').filter(Boolean),
    hay: c.dataset.hay ?? '',
    price: Number(c.dataset.price) || 0,
    name: c.dataset.name ?? '',
    rank: Number(c.dataset.rank) || 0,
    next: c.dataset.next || null,
  }]));

  // plates forward their click to the card's link (pointer and touch alike)
  grid.addEventListener('click', (e) => {
    const plate = (e.target as HTMLElement).closest('[data-spec-plate]');
    if (!plate || (e.target as HTMLElement).closest('a')) return;
    plate.closest('[data-spec]')?.querySelector<HTMLAnchorElement>('[data-spec-link]')?.click();
  });

  const fromForm = (): ShopState => {
    const fd = new FormData(form);
    const p = new URLSearchParams();
    for (const [k, v] of fd) if (typeof v === 'string' && v) p.set(k, v);
    return readState(p);
  };

  let lastQs = location.search;
  const apply = (s: ShopState, history: 'push' | 'replace' | 'none') => {
    const qt = queryTokens(s.q);
    const sorted = [...facts.entries()].sort((a, b) => compare(s.sort, L)(a[1], b[1]));
    let n = 0;
    const gFrag = document.createDocumentFragment();
    const rFrag = document.createDocumentFragment();
    for (const [slug, f] of sorted) {
      const show = matches(f, s, qt);
      if (show) n++;
      const card = cards.find((c) => c.dataset.spec === slug)!;
      card.hidden = !show;
      gFrag.append(card);
      const row = rowBySlug.get(slug);
      if (row) { row.hidden = !show; rFrag.append(row); }
    }
    grid.append(gFrag);
    rows.append(rFrag);
    results.dataset.view = s.view;
    const total = facts.size;
    const filtered = !!(s.kind || s.interest || s.q);
    status.textContent = !filtered ? tc('shop.showing.all', { total }) : n === 1 ? tc('shop.showing.one', { total }) : tc('shop.showing', { n, total });
    empty.hidden = n > 0;
    if (emptyBody) emptyBody.textContent = s.q && n === 0 ? `${tc('shop.empty.query', { q: s.q })} ${tc('shop.empty.body')}` : tc('shop.empty.body');
    const qs = writeState(s);
    clearLinks.forEach((a) => {
      // "clear" keeps the chosen view (cards or list) and drops the filters
      a.href = location.pathname + writeState({ kind: null, interest: null, q: '', sort: s.sort, view: s.view });
      if (a.dataset.shopClear !== undefined) a.hidden = !filtered;
    });
    if (history !== 'none' && qs !== lastQs) {
      const url = location.pathname + qs + location.hash;
      if (history === 'push') window.history.pushState({ shop: qs }, '', url);
      else window.history.replaceState({ shop: qs }, '', url);
      lastQs = qs;
    }
  };

  // pills, sort and view: push (Back returns to the previous view); the search box: replace
  form.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name === 'q') return;
    apply(fromForm(), 'push');
  });
  let typing = 0;
  let lastTracked = '';
  form.querySelector<HTMLInputElement>('input[name="q"]')?.addEventListener('input', () => {
    clearTimeout(typing);
    typing = window.setTimeout(() => {
      const s = fromForm();
      apply(s, 'replace');
      // one search event per settled query (not per keystroke)
      if (s.q && s.q !== lastTracked && s.q.length >= 2) {
        lastTracked = s.q;
        const n = [...facts.values()].filter((f) => matches(f, s)).length;
        track('search', { meta: { q: s.q, n } });
      }
    }, 220);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(typing);
    apply(fromForm(), 'push');
    // Enter in the search box on a phone: close the keyboard so the results show
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  // the clear links reset in place
  clearLinks.forEach((a) => a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    const s = readState(new URL(a.href).searchParams);
    syncForm(form, s);
    apply(s, 'push');
    form.querySelector<HTMLInputElement>('input[name="lloji"]')?.focus();
  }));
  window.addEventListener('popstate', () => {
    const s = readState(new URLSearchParams(location.search));
    syncForm(form, s);
    lastQs = location.search;
    apply(s, 'none');
  });
}

function syncForm(form: HTMLFormElement, s: ShopState) {
  const set = (name: string, value: string) => {
    form.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`).forEach((r) => { r.checked = r.value === value; });
  };
  const p = new URLSearchParams(writeState(s).slice(1));
  set('lloji', p.get('lloji') ?? '');
  set('interes', p.get('interes') ?? '');
  set('pamja', p.get('pamja') ?? '');
  const q = form.querySelector<HTMLInputElement>('input[name="q"]');
  if (q) q.value = s.q;
  const sort = form.querySelector<HTMLSelectElement>('select[name="rendit"]');
  if (sort) sort.value = p.get('rendit') ?? '';
}

/* ------------------------------------------------------------------ product page */

interface ProductData { slug: string; kind: Kind; name: string; price: number; stock: number | null; min?: number; max?: number; step?: number; checkout: string }

export function initProduct(): void {
  const card = document.querySelector<HTMLFormElement>('[data-buy]');
  const dataEl = document.querySelector<HTMLScriptElement>('script[data-product]');
  if (!card || !dataEl) return;
  let d: ProductData;
  try { d = JSON.parse(dataEl.textContent || '{}'); } catch { return; }
  rememberUtm();
  addViewed(d.slug);
  track('product_view', { product: d.slug, meta: { kind: d.kind } });
  initShare();

  const qtyOut = card.querySelector<HTMLInputElement>('[data-qty]');
  const err = card.querySelector<HTMLElement>('[data-buy-error]');
  const custom = card.querySelector<HTMLInputElement>('[data-amount-custom]');
  const customWrap = card.querySelector<HTMLElement>('[data-amount-custom-wrap]');
  const pill = document.querySelector<HTMLElement>('[data-buy-pill]');
  const pillPrice = pill?.querySelector<HTMLElement>('[data-pill-price]');
  const maxQty = d.stock != null ? Math.max(1, Math.min(99, d.stock)) : 99;

  const getQty = () => Math.min(maxQty, Math.max(1, Math.trunc(Number(qtyOut?.value) || 1)));
  const setQty = (n: number) => {
    if (!qtyOut) return;
    const v = Math.min(maxQty, Math.max(1, n));
    qtyOut.value = String(v);
  };
  card.querySelector('[data-qty-less]')?.addEventListener('click', () => setQty(getQty() - 1));
  card.querySelector('[data-qty-more]')?.addEventListener('click', () => {
    if (getQty() >= maxQty && d.stock != null) showError(tc('product.stock.max', { n: d.stock }));
    setQty(getQty() + 1);
  });
  qtyOut?.addEventListener('change', () => setQty(getQty()));

  // gift amount: presets (radios) or "other amount" (number input, shown when chosen)
  const amountRadios = [...card.querySelectorAll<HTMLInputElement>('input[name="amount"]')];
  const syncAmount = () => {
    const other = amountRadios.find((r) => r.checked)?.value === 'custom';
    if (customWrap) customWrap.hidden = !other;
    if (other) custom?.focus({ preventScroll: true });
    paintPill();
  };
  amountRadios.forEach((r) => r.addEventListener('change', syncAmount));
  custom?.addEventListener('input', () => { clearError(); paintPill(); });

  const amount = (): number | null | 'bad' => {
    if (d.kind !== 'gift' || !amountRadios.length) return null;
    const v = amountRadios.find((r) => r.checked)?.value;
    if (v && v !== 'custom') return Number(v);
    const n = Number(String(custom?.value ?? '').replace(/[\s.,]/g, ''));
    if (!Number.isFinite(n) || n < (d.min ?? 0) || n > (d.max ?? Infinity) || (d.step && n % d.step !== 0)) return 'bad';
    return n;
  };

  function showError(msg: string) {
    if (!err) return;
    err.textContent = msg;
    err.hidden = false;
  }
  function clearError() { if (err) { err.hidden = true; err.textContent = ''; } }

  function paintPill() {
    if (!pillPrice) return;
    const a = amount();
    const lek = typeof a === 'number' ? a : d.price;
    pillPrice.dataset.priceLek = String(lek);
    const rate = eurRate();
    const eur = getCurrency() === 'EUR' && rate > 0;
    pillPrice.querySelector('[data-price-main]')!.textContent = eur ? money(lek, lang(), { currency: 'EUR', rate }) : formatLek(lek);
  }
  window.addEventListener('dv:prefs', paintPill);

  const add = (then?: 'checkout') => {
    clearError();
    const a = amount();
    if (a === 'bad') {
      showError(tc('product.amount.error', { min: formatLek(d.min ?? 0), max: formatLek(d.max ?? 0), step: formatLek(d.step ?? 1) }));
      custom?.focus();
      return;
    }
    const qty = getQty();
    const item = addItem({ slug: d.slug, kind: d.kind, qty, ...(typeof a === 'number' ? { amount: a } : {}) }, {
      name: d.name, value: (typeof a === 'number' ? a : d.price) * qty, toast: then !== 'checkout',
    });
    if (!item) return;
    if (then === 'checkout') window.location.href = d.checkout;
  };

  card.addEventListener('submit', (e) => {
    e.preventDefault();
    const sub = (e as SubmitEvent).submitter as HTMLButtonElement | null;
    add(sub?.value === 'buy' ? 'checkout' : undefined);
  });
  pill?.querySelector('[data-pill-add]')?.addEventListener('click', () => {
    // the pill adds with what the card says; a bad custom amount sends the visitor to the card
    if (amount() === 'bad') { card.scrollIntoView({ block: 'center' }); add(); return; }
    add();
  });

  // the pill shows only while the order card is out of view (phones; CSS hides it ≥ 1024 px)
  if (pill && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([en]) => { pill.dataset.show = en.isIntersecting ? 'off' : 'on'; }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(card);
  }
  paintPill();
}

const formatLek = (n: number) => money(Math.round(n), lang());
