/**
 * drawer.ts — the cart drawer (<dialog id="cart-drawer">). Lists the cart through
 * POST /api/quote (server prices, offers and per-line problems), with qty steppers for goods,
 * remove with an inline undo row (in place of the line, focus on its Undo, no time limit — it
 * goes on the next cart change or when the drawer closes), subtotal / discount / total and the
 * ≈ EUR line when the visitor chose EUR.
 * The cart pill (an <a href> to the cart page) opens the drawer instead when JS is running.
 */
import { modal } from './menu';
import { getCart, onChange, removeItem, restoreItem, setQty, count, setUnavailable, getPromo, setPromo, type CartItem } from './cart';
import { getCurrency, eurRate } from './prefs';
import { tc, lang } from '../i18n/client';
import { money, formatRange, formatDate, time, nights as fmtNights, guests as fmtGuests, pad2 } from '../i18n/format';
import { photoSrc } from '../components/site/photo-url';

interface QuoteLine {
  key: string; slug: string; kind: CartItem['kind']; name: string; image: string | null; url: string;
  unit_price: number; qty: number; nights?: number; guests?: number; date_from?: string; date_to?: string; starts_at?: string;
  line_total: number; compare_total?: number; offer?: { name: string; saving: number }; problem?: { code: string; message: string };
}
interface Quote { lines: QuoteLine[]; subtotal: number; discount: number; promo?: { code: string; valid: boolean; message: string }; total: number; currency: 'ALL'; eur_rate: number }

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

export async function fetchQuote(items: CartItem[], signal?: AbortSignal): Promise<Quote> {
  const r = await fetch('/api/quote', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    // the promo code accepted on the cart page (T5) — the drawer shows the same total
    body: JSON.stringify({ lang: lang(), items, ...(getPromo() ? { promo: getPromo() } : {}) }),
  });
  if (!r.ok) throw new Error(`quote ${r.status}`);
  const q: Quote = await r.json();
  if (q.promo && !q.promo.valid) setPromo('');
  return q;
}

/** Lines the server no longer sells (retired or unknown slug). */
const retiredKeys = (q: Quote) => q.lines.filter((l) => l.problem?.code === 'unavailable' || !l.url).map((l) => l.key);

function lineMeta(l: QuoteLine): string {
  const L = lang();
  const bits: string[] = [];
  if (l.date_from && l.date_to) bits.push(formatRange(l.date_from, l.date_to, L));
  else if (l.starts_at) bits.push(`${formatDate(l.starts_at, L, 'short')} · ${time(l.starts_at)}`);
  if (l.nights) bits.push(fmtNights(l.nights, L));
  if (l.guests) bits.push(fmtGuests(l.guests, L));
  return bits.join(' · ');
}

export function initDrawer() {
  const dialog = document.getElementById('cart-drawer') as HTMLDialogElement | null;
  if (!dialog) return;
  const list = dialog.querySelector<HTMLElement>('[data-drawer-lines]')!;
  const empty = dialog.querySelector<HTMLElement>('[data-drawer-empty]')!;
  const summary = dialog.querySelector<HTMLElement>('[data-drawer-summary]')!;
  const status = dialog.querySelector<HTMLElement>('[data-drawer-status]')!;
  const countEl = dialog.querySelector<HTMLElement>('[data-drawer-count]');
  // a persistent, visually hidden live region: every +/− re-renders the list, so the stepper's
  // own <output> is a new node each time and would not be announced
  const sayEl = dialog.querySelector<HTMLElement>('[data-drawer-say]');
  let say = '';
  let sayT = 0;
  const announce = () => {
    if (!sayEl) return;
    clearTimeout(sayT);
    const text = say; say = '';
    sayEl.textContent = '';
    if (text) sayT = window.setTimeout(() => { sayEl.textContent = text; }, 100);
  };
  let ctl: AbortController | null = null;
  let spinnerT = 0;
  let debounceT = 0;

  /* ---- remove → inline "Removed · Undo" row (WCAG 2.2.1: no timer; never covers checkout) ---- */
  let gone: { key: string; name: string; item: CartItem; index: number; fresh: boolean } | null = null;
  let ownChange = false; // the next dv:cart is ours (removal/undo), so it must not clear the row
  const removeLine = (l: QuoteLine) => {
    ownChange = true;
    const r = removeItem(l.key, { name: l.name, toast: false });
    ownChange = false;
    if (r) gone = { key: l.key, name: l.name, item: r.item, index: r.index, fresh: true };
  };
  const undo = () => {
    if (!gone) return;
    const g = gone;
    gone = null;
    memo = { key: g.key, role: 'name', index: g.index };
    ownChange = true;
    restoreItem(g.item, g.index);
    ownChange = false;
  };
  const goneRow = () => {
    if (!gone) return null;
    const li = h('li', 'drawer-gone');
    const msg = h('p', 'mono drawer-gone__msg', `${tc('cart.removed')} · ${gone.name}`);
    msg.id = 'drawer-gone-msg';
    const b = h('button', 'pill pill--outline pill--s drawer-gone__undo', tc('cart.undo')) as HTMLButtonElement;
    b.type = 'button'; b.dataset.role = 'undo';
    b.setAttribute('aria-describedby', msg.id);
    b.addEventListener('click', undo);
    li.append(msg, b);
    return li;
  };

  const setState = (s: 'idle' | 'loading' | 'error' | 'empty' | 'ready') => { dialog.dataset.state = s; };

  const renderSummary = (q: Quote) => {
    const L = lang();
    const rate = eurRate() || q.eur_rate;
    const cur = getCurrency();
    const rows: [string, string, string?][] = [[tc('cart.subtotal'), money(q.subtotal, L)]];
    if (q.discount > 0) rows.push([q.promo?.valid ? `${tc('cart.discount')} · ${q.promo.code}` : tc('cart.discount'), `−${money(q.discount, L)}`]);
    rows.push([tc('cart.total'), money(q.total, L), 'total']);
    const dl = h('dl', 'drawer__sums');
    for (const [k, v, cls] of rows) {
      const row = h('div', `drawer__sum${cls ? ` drawer__sum--${cls}` : ''}`);
      row.append(h('dt', 'mono', k), h('dd', cls ? 'drawer__total' : 'mono', v));
      dl.append(row);
    }
    if (cur === 'EUR' && rate) {
      const row = h('div', 'drawer__sum drawer__sum--eur');
      row.append(h('dt', 'mono', tc('currency.EUR')), h('dd', 'mono', money(q.total, L, { currency: 'EUR', rate })));
      dl.append(row);
    }
    summary.querySelector('[data-drawer-sums]')!.replaceChildren(dl);
  };

  const renderLines = (q: Quote) => {
    const L = lang();
    const frag = document.createDocumentFragment();
    for (const raw of q.lines) {
      // a retired or unknown product: a neutral name (never the raw slug), no link, no price,
      // no stepper — one "Hiq" button; the counts already leave it out (setUnavailable)
      const retired = raw.problem?.code === 'unavailable' || !raw.url;
      const l: QuoteLine = retired ? { ...raw, name: tc('cart.unavailable.name'), image: null } : raw;
      const li = h('li', `drawer-line${retired ? ' drawer-line--gone' : ''}`);
      li.dataset.key = l.key;
      const plate = retired ? h('span', 'drawer-line__plate') : h('a', 'drawer-line__plate') as HTMLAnchorElement;
      if (plate instanceof HTMLAnchorElement) { plate.href = l.url; plate.tabIndex = -1; }
      plate.setAttribute('aria-hidden', 'true');
      if (l.image) {
        const img = h('img') as HTMLImageElement;
        img.src = photoSrc(l.image, 640); img.alt = ''; img.width = 72; img.height = 90; img.loading = 'lazy'; img.decoding = 'async';
        plate.append(img);
      } else {
        // no photo yet: the chart's own plate — waterlines and a survey pin, not an empty frame
        plate.classList.add('drawer-line__plate--chart');
        plate.innerHTML = '<svg viewBox="0 0 64 80" aria-hidden="true">'
          + [44, 52, 60, 68].map((y, i) => `<path d="M0 ${y} C 18 ${y - 3 + i}, 38 ${y + 3 - i}, 64 ${y - 1}" fill="none" stroke="currentColor" stroke-width="0.8"/>`).join('')
          + '<circle cx="32" cy="24" r="6" fill="var(--salt-2)" stroke="currentColor" stroke-width="1.5"/><circle cx="32" cy="24" r="2.2" fill="currentColor"/><path d="M32 30v8" stroke="currentColor" stroke-width="1.2"/></svg>';
      }
      const body = h('div', 'drawer-line__body');
      if (retired) body.append(h('span', 'drawer-line__name', l.name));
      else {
        const name = h('a', 'drawer-line__name', l.name) as HTMLAnchorElement;
        name.href = l.url; name.dataset.role = 'name';
        body.append(name);
      }
      const meta = lineMeta(l);
      if (meta) body.append(h('p', 'mono drawer-line__meta', meta));
      if (l.offer) body.append(h('p', 'mono drawer-line__offer', `${tc('stamp.offer')} · ${l.offer.name} · −${money(l.offer.saving, L)}`));
      if (l.problem) {
        const p = h('p', 'mono drawer-line__problem', l.problem.message);
        p.setAttribute('role', 'note');
        body.append(p);
      }
      if (retired) {
        const row = h('div', 'drawer-line__row');
        const drop = h('button', 'pill pill--outline pill--s', tc('cart.remove')) as HTMLButtonElement;
        drop.type = 'button'; drop.dataset.role = 'remove';
        drop.setAttribute('aria-label', tc('cart.remove.aria', { name: l.name }));
        drop.addEventListener('click', () => removeLine(l));
        row.append(drop);
        body.append(row);
        li.append(plate, body, h('span'));
        frag.append(li);
        continue;
      }
      const row = h('div', 'drawer-line__row');
      if (l.kind === 'goods' || l.kind === 'gift' || l.kind === 'bundle') {
        const step = h('div', 'stepper');
        step.setAttribute('role', 'group');
        step.setAttribute('aria-label', `${tc('cart.qty')} · ${l.name}`);
        const less = h('button', 'stepper__btn', '−') as HTMLButtonElement;
        less.type = 'button'; less.dataset.role = 'less'; less.setAttribute('aria-label', tc('cart.less'));
        const said = (n: number) => { say = `${tc('cart.qty')} ${pad2(n)} · ${l.name}`; };
        less.addEventListener('click', () => { if (l.qty <= 1) removeLine(l); else { said(l.qty - 1); setQty(l.key, l.qty - 1); } });
        const out = h('span', 'stepper__val mono', pad2(l.qty)); // not an <output> (implicit live region); announce() speaks
        const more = h('button', 'stepper__btn', '+') as HTMLButtonElement;
        more.type = 'button'; more.dataset.role = 'more'; more.setAttribute('aria-label', tc('cart.more'));
        more.addEventListener('click', () => { said(Math.min(99, l.qty + 1)); setQty(l.key, l.qty + 1); });
        step.append(less, out, more);
        row.append(step);
      } else {
        // an experience's quantity IS its party ("2 persona" is already in the meta line), so no
        // "× 2" that reads as 2 people × 2; a room's quantity is counted in rooms ("× 2 dhoma")
        const qty = l.kind === 'experience' || l.qty <= 1 ? ''
          : l.kind === 'room' ? `× ${tc('booking.rooms.n', { n: l.qty })}` : `× ${l.qty}`;
        row.append(h('span', 'mono drawer-line__qty', qty));
      }
      const price = h('p', 'drawer-line__price');
      if (l.compare_total && l.compare_total > l.line_total) {
        const del = h('s', 'mono drawer-line__was', money(l.compare_total, L));
        price.append(del, document.createTextNode(' '));
      }
      price.append(h('span', 'drawer-line__sum', money(l.line_total, L)));
      row.append(price);
      body.append(row);
      const rm = h('button', 'drawer-line__remove') as HTMLButtonElement;
      rm.type = 'button'; rm.dataset.role = 'remove';
      rm.setAttribute('aria-label', tc('cart.remove.aria', { name: l.name }));
      rm.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
      // focus stays on this button until the re-render; restoreFocus() then picks the next line
      rm.addEventListener('click', () => removeLine(l));
      li.append(plate, body, rm);
      frag.append(li);
    }
    const row = goneRow();
    if (row) frag.insertBefore(row, frag.children[Math.min(gone!.index, frag.children.length)] ?? null);
    list.replaceChildren(frag);
    restoreFocus();
  };

  /*
   * Keyboard focus across re-renders. Every +, − or remove re-renders the list, which destroys
   * the focused button; without this, focus falls to <body> behind the modal. We remember the
   * last focused control in the list (line key + role) and, when focus was lost, put it back on
   * the same control of the same line, else on the name link of the line now at that position,
   * else on the drawer title. Never on the aria-hidden plate link.
   */
  let memo: { key: string; role: string; index: number } | null = null;
  list.addEventListener('focusin', (e) => {
    const el = e.target as HTMLElement;
    const li = el.closest<HTMLElement>('.drawer-line');
    if (!li) return;
    memo = { key: li.dataset.key || '', role: el.dataset.role || 'name', index: [...list.children].indexOf(li) };
  });
  const title = dialog.querySelector<HTMLElement>('#cart-drawer-title');
  function restoreFocus() {
    if (!dialog!.open || !memo) return;
    const ae = document.activeElement as HTMLElement | null;
    const toastHost = document.getElementById('dv-toast');
    const lost = !ae || ae === document.body || ae === dialog || !ae.isConnected
      || (!!toastHost && toastHost.contains(ae) && toastHost.dataset.state !== 'open');
    if (!lost) return;
    const undoBtn = list.querySelector<HTMLElement>('[data-role="undo"]');
    if (gone?.fresh && undoBtn) { gone.fresh = false; undoBtn.focus({ preventScroll: false }); return; }
    const lines = [...list.querySelectorAll<HTMLElement>('.drawer-line')];
    const same = lines.find((li) => li.dataset.key === memo!.key);
    let target: HTMLElement | null = null;
    // a retired line has no name link: its "Hiq" button (data-role remove) is the line's stop
    const lineStop = (li: HTMLElement) => li.querySelector<HTMLElement>('[data-role="name"], [data-role="remove"]');
    if (same) target = same.querySelector<HTMLElement>(`[data-role="${memo.role}"]`) ?? lineStop(same);
    else if (lines.length) target = lineStop(lines[Math.min(memo.index, lines.length - 1)]);
    if (!target && title) { title.tabIndex = -1; target = title; }
    target?.focus({ preventScroll: false });
  }

  const refresh = async () => {
    const items = getCart();
    if (countEl) countEl.textContent = pad2(count());
    ctl?.abort();
    clearTimeout(spinnerT);
    if (!items.length) {
      const row = goneRow();
      if (row) list.replaceChildren(row); else list.replaceChildren();
      empty.hidden = false; summary.hidden = true; setState('empty'); status.textContent = ''; restoreFocus(); return;
    }
    empty.hidden = true;
    ctl = new AbortController();
    // spinner only after 200 ms, so fast answers never flash
    spinnerT = window.setTimeout(() => { setState('loading'); status.textContent = tc('cart.loading'); }, 200);
    try {
      const q = await fetchQuote(items, ctl.signal);
      clearTimeout(spinnerT);
      // counts leave out lines the server no longer sells (our own change: keeps the undo row)
      ownChange = true;
      setUnavailable(retiredKeys(q));
      ownChange = false;
      if (countEl) countEl.textContent = pad2(count());
      renderLines(q);
      announce();
      renderSummary(q);
      summary.hidden = false;
      status.textContent = '';
      setState('ready');
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      clearTimeout(spinnerT);
      setState('error');
      status.textContent = tc('cart.error');
      summary.hidden = true;
    }
  };

  const handle = modal(dialog, { swipeClose: 'right', onOpen: refresh, onClose: () => { gone = null; }, toast: 'hide' });
  dialog.querySelector('[data-drawer-retry]')?.addEventListener('click', refresh);
  onChange(() => {
    // any change we did not make (another tab, a page script) ends the undo offer
    if (!ownChange) gone = null;
    if (dialog.open) { clearTimeout(debounceT); debounceT = window.setTimeout(refresh, 120); }
  });
  window.addEventListener('dv:prefs', () => { if (dialog.open) refresh(); });

  // the cart pill is a real link (works without JS); with JS it opens the drawer
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-cart-open]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    handle.open(a);
  });
  return handle;
}

/** Header/menu cart counters: [data-cart-count] gets "02", the pill its accessible name. */
export function initCartCount() {
  const paint = (n: number) => {
    document.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((el) => { el.textContent = pad2(n); });
    document.querySelectorAll<HTMLElement>('[data-cart-pill]').forEach((el) => {
      el.setAttribute('aria-label', n === 1 ? tc('cart.open.one') : tc('cart.open', { n }));
      el.classList.toggle('has-items', n > 0);
    });
  };
  paint(count());
  onChange((n) => paint(n));
  // once per tab session, in idle time: a background quote finds lines the server no longer
  // sells, so the counts leave them out from the first page on (each drawer open re-checks)
  try {
    if (getCart().length && !sessionStorage.getItem('dv-cart-checked')) {
      sessionStorage.setItem('dv-cart-checked', '1');
      const run = () => { fetchQuote(getCart()).then((q) => setUnavailable(retiredKeys(q))).catch(() => { /* offline: counts stay as stored */ }); };
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 4000 }); else setTimeout(run, 2000);
    }
  } catch { /* storage blocked */ }
}
