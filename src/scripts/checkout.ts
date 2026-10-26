/**
 * checkout.ts — the cart page (/shporta/) and the checkout (/arka/) (T5).
 *
 * Every figure comes from POST /api/quote (src/lib/pricing.ts is the only price authority); the
 * cart itself is T2's store (scripts/cart.ts). The promo code lives in sessionStorage 'dv-promo'
 * (validated by the server on every quote; an invalid one is dropped with the server's message).
 *
 * Cart page: lines with plate, dates/sessions, offer savings, the server's per-line problem and a
 * way to fix it, quantity steppers for goods/gift cards/bundles, remove with an inline Undo row
 * (no timer), promo code, totals in lek (+ ≈ EUR when chosen), checkout link, empty state.
 * A no-JS "Add to cart" from a product page lands here as ?shto=<slug>&sasia=&amount=|vlera=&pas=
 * (the server prints the product in a data island); we add it and clean the URL.
 *
 * Checkout: three steps on one page, the step in the URL hash (#te-dhenat → #pagesa →
 * #rishikimi; en #details/#payment/#review), Back/Forward move between steps. Each "Continue"
 * validates its step (never a pre-disabled button); errors sit under their fields, a summary on
 * top lists them and takes focus. Review re-prices the cart on the server, explains the hold, and
 * POST /api/checkout places the order: card → the TEST simulator / POK page, hotel and bank →
 * the order page. Errors keep every field as typed. The draft (no consent boxes) is kept in
 * sessionStorage 'dv-checkout' so a reload keeps it; it is wiped once the order exists.
 * No motion in the form (DESIGN §3): steps swap instantly.
 */
import { getCart, onChange, removeItem, restoreItem, setQty, clear as clearCart, addItem, setUnavailable, type CartItem, type Kind } from './cart';
import { getCurrency, eurRate } from './prefs';
import { track } from './track';
import { tc, lang } from '../i18n/client';
import { money, formatRange, formatDate, time, nights as fmtNights, guests as fmtGuests, pad2 } from '../i18n/format';
import { photoSrc } from '../components/site/photo-url';
import { path } from '../i18n/routes';

/* ------------------------------------------------------------------ shared */

export interface QuoteLine {
  key: string; slug: string; kind: Kind; name: string; image: string | null; url: string;
  unit_price: number; qty: number; nights?: number; guests?: number; date_from?: string; date_to?: string; starts_at?: string; session_id?: number;
  line_total: number; compare_total?: number; offer?: { name: string; saving: number }; problem?: { code: string; message: string };
}
export interface Quote { lines: QuoteLine[]; subtotal: number; discount: number; promo?: { code: string; valid: boolean; message: string }; total: number; currency: 'ALL'; eur_rate: number }

const PROMO = 'dv-promo';
export const getPromo = (): string => { try { return sessionStorage.getItem(PROMO) || ''; } catch { return ''; } };
export const setPromo = (code: string) => { try { if (code) sessionStorage.setItem(PROMO, code); else sessionStorage.removeItem(PROMO); } catch { /* blocked */ } };

export async function quote(items: CartItem[], promo: string, signal?: AbortSignal): Promise<Quote> {
  const r = await fetch('/api/quote', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ lang: lang(), items, ...(promo ? { promo } : {}) }),
  });
  if (!r.ok) throw new Error(`quote ${r.status}`);
  return r.json();
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

const retired = (l: QuoteLine) => l.problem?.code === 'unavailable' || !l.url;
const eur = (lek: number) => {
  const rate = eurRate();
  return rate > 0 ? money(lek, lang(), { currency: 'EUR', rate }) : '';
};

export function lineMeta(l: QuoteLine): string {
  const L = lang();
  const bits: string[] = [];
  if (l.kind === 'room' && l.date_from && l.date_to) bits.push(formatRange(l.date_from, l.date_to, L));
  else if (l.starts_at) bits.push(`${formatDate(l.starts_at, L, 'weekday')}, ${formatDate(l.starts_at, L, 'medium')} · ${time(l.starts_at)}`);
  if (l.nights) bits.push(fmtNights(l.nights, L));
  if (l.guests && (l.kind === 'room' || l.kind === 'experience')) bits.push(fmtGuests(l.guests, L));
  if (l.kind === 'gift') bits.push(`${tc('product.amount')}: ${money(l.unit_price, L)}`);
  return bits.join(' · ');
}

function plate(l: QuoteLine, size = 96): HTMLElement {
  const box = h('span', 'cline__plate');
  box.setAttribute('aria-hidden', 'true');
  if (l.image && !retired(l)) {
    const img = h('img');
    img.src = photoSrc(l.image, 640); img.alt = ''; img.width = size; img.height = Math.round(size * 1.25); img.loading = 'lazy'; img.decoding = 'async';
    box.append(img);
  } else {
    box.classList.add('cline__plate--chart');
    box.innerHTML = '<svg viewBox="0 0 64 80" aria-hidden="true">'
      + [44, 52, 60, 68].map((y, i) => `<path d="M0 ${y} C 18 ${y - 3 + i}, 38 ${y + 3 - i}, 64 ${y - 1}" fill="none" stroke="currentColor" stroke-width="0.8"/>`).join('')
      + '<circle cx="32" cy="24" r="6" fill="var(--salt-2)" stroke="currentColor" stroke-width="1.5"/><circle cx="32" cy="24" r="2.2" fill="currentColor"/><path d="M32 30v8" stroke="currentColor" stroke-width="1.2"/></svg>';
  }
  return box;
}

function priceCell(l: QuoteLine): HTMLElement {
  const L = lang();
  const p = h('p', 'cline__price');
  if (l.compare_total && l.compare_total > l.line_total) p.append(h('s', 'cline__was mono', money(l.compare_total, L)), document.createTextNode(' '));
  p.append(h('span', 'cline__sum', money(l.line_total, L)));
  return p;
}

/** Totals block (dl) for both pages. */
export function renderSums(target: HTMLElement, q: Quote, opts: { big?: boolean } = {}) {
  const L = lang();
  const dl = h('dl', 'sums');
  const row = (k: string, v: string, cls = '') => {
    const d = h('div', `sums__row${cls ? ` sums__row--${cls}` : ''}`);
    d.append(h('dt', 'mono', k), h('dd', cls === 'total' ? 'sums__total' : 'mono', v));
    dl.append(d);
  };
  row(tc('cart.subtotal'), money(q.subtotal, L));
  const saved = q.lines.filter((l) => !l.problem).reduce((s, l) => s + (l.offer?.saving ?? 0), 0);
  if (saved > 0) row(tc('cartpage.saved', { amount: money(saved, L) }), '', 'note');
  if (q.discount > 0) row(q.promo?.valid ? tc('order.promo', { code: q.promo.code }) : tc('cart.discount'), `−${money(q.discount, L)}`);
  row(tc('cart.total'), money(q.total, L), 'total');
  if (getCurrency() === 'EUR' && eur(q.total)) row('EUR', tc('cartpage.eur', { amount: eur(q.total) }), 'eur');
  if (opts.big) dl.classList.add('sums--big');
  target.replaceChildren(dl);
}

/* ------------------------------------------------------------------ cart page */

export function initCartPage(): void {
  const root = document.querySelector<HTMLElement>('[data-cartpage]');
  if (!root) return;
  const list = root.querySelector<HTMLElement>('[data-lines]')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const banner = root.querySelector<HTMLElement>('[data-problems]')!;
  const empty = root.querySelector<HTMLElement>('[data-empty]')!;
  const side = root.querySelector<HTMLElement>('[data-side]')!;
  const sums = root.querySelector<HTMLElement>('[data-sums]')!;
  const count = root.querySelector<HTMLElement>('[data-count]');
  const retry = root.querySelector<HTMLButtonElement>('[data-retry]');
  const go = root.querySelector<HTMLAnchorElement>('[data-go-checkout]');
  const promoForm = root.querySelector<HTMLFormElement>('[data-promo]');
  const promoInput = promoForm?.querySelector<HTMLInputElement>('input[name="promo"]');
  const promoMsg = root.querySelector<HTMLElement>('[data-promo-msg]');
  const promoRemove = root.querySelector<HTMLButtonElement>('[data-promo-remove]');
  const say = root.querySelector<HTMLElement>('[data-say]');

  // a product page's form without JavaScript (or a tap before its script) lands here
  consumeAddParam();

  let ctl: AbortController | null = null;
  let spin = 0;
  let gone: { key: string; name: string; item: CartItem; index: number } | null = null;
  let own = false;
  let promoTyped = '';

  const setState = (s: string) => { root.dataset.state = s; };
  const announce = (msg: string) => { if (say) { say.textContent = ''; window.setTimeout(() => { say.textContent = msg; }, 80); } };

  const removeLine = (l: QuoteLine) => {
    own = true;
    const r = removeItem(l.key, { toast: false, name: l.name });
    own = false;
    if (r) gone = { key: l.key, name: retired(l) ? tc('cart.unavailable.name') : l.name, item: r.item, index: r.index };
    refresh().then(() => list.querySelector<HTMLElement>('[data-undo]')?.focus());
  };
  const undo = () => {
    if (!gone) return;
    const g = gone; gone = null;
    own = true; restoreItem(g.item, g.index); own = false;
    refresh().then(() => list.querySelector<HTMLElement>(`[data-key="${CSS.escape(g.key)}"] .cline__name`)?.focus());
  };

  const goneRow = () => {
    if (!gone) return null;
    const li = h('li', 'cline-gone');
    const msg = h('p', 'mono', tc('cartpage.removed', { name: gone.name }));
    msg.id = 'cline-gone-msg';
    const b = h('button', 'pill pill--outline pill--s', tc('cartpage.undo'));
    b.type = 'button'; b.dataset.undo = '';
    b.setAttribute('aria-describedby', msg.id);
    b.addEventListener('click', undo);
    li.append(msg, b);
    return li;
  };

  const render = (q: Quote) => {
    const L = lang();
    const frag = document.createDocumentFragment();
    q.lines.forEach((l) => {
      const dead = retired(l);
      const li = h('li', `cline${l.problem ? ' cline--problem' : ''}${dead ? ' cline--gone' : ''}`);
      li.dataset.key = l.key;
      li.append(plate(l));
      const body = h('div', 'cline__body');
      if (dead) body.append(h('span', 'cline__name', tc('cart.unavailable.name')));
      else { const a = h('a', 'cline__name', l.name); a.href = l.url; body.append(a); }
      const meta = dead ? '' : lineMeta(l);
      if (meta) body.append(h('p', 'cline__meta mono', meta));
      if (l.offer && !l.problem) body.append(h('p', 'cline__offer mono', `${tc('stamp.offer')} · ${l.offer.name} · −${money(l.offer.saving, L)}`));
      if (l.problem) {
        const p = h('p', 'cline__problem mono', l.problem.message);
        p.setAttribute('role', 'note');
        body.append(p);
        if (!dead && (l.kind === 'room' || l.kind === 'experience')) {
          const fix = h('a', 'cline__fix mono', tc(l.kind === 'room' ? 'cartpage.fix.dates' : 'cartpage.fix.session'));
          fix.href = l.url;
          body.append(fix);
        }
      }
      const ctrl = h('div', 'cline__ctrl');
      if (!dead && (l.kind === 'goods' || l.kind === 'gift' || l.kind === 'bundle')) {
        const st = h('div', 'stepper');
        st.setAttribute('role', 'group');
        st.setAttribute('aria-label', `${tc('cart.qty')} · ${l.name}`);
        const less = h('button', 'stepper__btn', '−'); less.type = 'button'; less.setAttribute('aria-label', tc('cart.less'));
        const val = h('span', 'stepper__val mono', pad2(l.qty));
        const more = h('button', 'stepper__btn', '+'); more.type = 'button'; more.setAttribute('aria-label', tc('cart.more'));
        less.addEventListener('click', () => {
          if (l.qty <= 1) { removeLine(l); return; }
          own = true; setQty(l.key, l.qty - 1); own = false;
          announce(`${tc('cart.qty')} ${pad2(l.qty - 1)} · ${l.name}`);
          refresh(less);
        });
        more.addEventListener('click', () => {
          own = true; setQty(l.key, l.qty + 1); own = false;
          announce(`${tc('cart.qty')} ${pad2(Math.min(99, l.qty + 1))} · ${l.name}`);
          refresh(more);
        });
        less.dataset.role = 'less'; more.dataset.role = 'more';
        st.append(less, val, more);
        ctrl.append(st);
      } else if (!dead && l.qty > 1 && l.kind !== 'experience') {
        ctrl.append(h('span', 'cline__qty mono', `× ${l.qty}`));
      }
      if (!dead && !l.problem) ctrl.append(priceCell(l));
      body.append(ctrl);
      li.append(body);
      const rm = h('button', 'cline__remove');
      rm.type = 'button';
      rm.setAttribute('aria-label', tc('cart.remove.aria', { name: dead ? tc('cart.unavailable.name') : l.name }));
      rm.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';
      rm.addEventListener('click', () => removeLine(l));
      li.append(rm);
      frag.append(li);
    });
    const g = goneRow();
    if (g) frag.insertBefore(g, frag.children[Math.min(gone!.index, frag.children.length)] ?? null);
    list.replaceChildren(frag);

    const problems = q.lines.filter((l) => l.problem).length;
    banner.hidden = problems === 0;
    banner.textContent = problems === 1 ? tc('cartpage.problems.one') : tc('cartpage.problems');
    const n = q.lines.filter((l) => !retired(l)).reduce((s, l) => s + (l.kind === 'experience' ? 1 : l.qty), 0);
    if (count) count.textContent = n === 1 ? tc('cartpage.count.one') : tc('cartpage.count', { n });
    renderSums(sums, q, { big: true });

    // promo state from the server
    if (q.promo) {
      if (q.promo.valid) {
        setPromo(q.promo.code);
        if (promoInput) promoInput.value = q.promo.code;
        promoMsg!.textContent = tc('promo.applied', { code: q.promo.code });
        promoMsg!.dataset.tone = 'ok';
        if (promoRemove) promoRemove.hidden = false;
      } else {
        setPromo('');
        if (promoInput) promoInput.value = promoTyped || q.promo.code;
        promoMsg!.textContent = q.promo.message;
        promoMsg!.dataset.tone = 'error';
        if (promoRemove) promoRemove.hidden = true;
      }
    }
    if (go) go.dataset.blocked = problems ? 'yes' : 'no';
  };

  const refresh = async (keepFocus?: HTMLElement): Promise<void> => {
    const items = getCart();
    ctl?.abort();
    clearTimeout(spin);
    if (!items.length) {
      const g = goneRow();
      list.replaceChildren(...(g ? [g] : []));
      empty.hidden = false; side.hidden = true; banner.hidden = true;
      status.textContent = '';
      if (count) count.textContent = tc('cartpage.count', { n: 0 });
      setState('empty');
      return;
    }
    empty.hidden = true; side.hidden = false;
    ctl = new AbortController();
    spin = window.setTimeout(() => { setState('loading'); status.textContent = tc('cartpage.loading'); }, 200);
    const role = keepFocus?.dataset.role;
    const key = keepFocus?.closest<HTMLElement>('[data-key]')?.dataset.key;
    try {
      const q = await quote(items, promoTyped || getPromo(), ctl.signal);
      promoTyped = '';
      clearTimeout(spin);
      own = true;
      setUnavailable(q.lines.filter(retired).map((l) => l.key));
      own = false;
      render(q);
      status.textContent = '';
      setState('ready');
      if (role && key) list.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"] [data-role="${role}"]`)?.focus();
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      clearTimeout(spin);
      setState('error');
      status.textContent = tc('cartpage.error');
    }
  };

  promoForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = (promoInput?.value ?? '').trim();
    if (!code) { promoMsg!.textContent = tc('promo.empty'); promoMsg!.dataset.tone = 'error'; promoInput?.focus(); return; }
    promoTyped = code;
    refresh();
  });
  promoRemove?.addEventListener('click', () => {
    setPromo('');
    promoTyped = '';
    if (promoInput) promoInput.value = '';
    promoMsg!.textContent = '';
    promoRemove.hidden = true;
    refresh();
    promoInput?.focus();
  });
  retry?.addEventListener('click', () => refresh());
  onChange(() => { if (!own) { gone = null; refresh(); } });
  window.addEventListener('dv:prefs', () => refresh());
  refresh();
}

/** ?shto=<slug>&sasia=<n>&amount=<lek>|vlera=<lek>&pas=buy → add to the cart once, clean the URL. */
function consumeAddParam() {
  const el = document.querySelector<HTMLScriptElement>('script[data-cart-add]');
  if (!el) return;
  let d: { slug: string; kind: Kind; name: string; qty: number; amount?: number | null; buy?: boolean } | null = null;
  try { d = JSON.parse(el.textContent || 'null'); } catch { d = null; }
  const url = new URL(location.href);
  ['shto', 'sasia', 'amount', 'vlera', 'pas'].forEach((k) => url.searchParams.delete(k));
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  if (!d) return;
  addItem({ slug: d.slug, kind: d.kind, qty: d.qty, ...(d.amount ? { amount: d.amount } : {}) }, { name: d.name, toast: !d.buy });
  if (d.buy) location.replace(path('checkout', lang()));
}

/* ------------------------------------------------------------------ checkout */

type Step = 'details' | 'payment' | 'review';
const STEPS: Step[] = ['details', 'payment', 'review'];
const HASH: Record<'sq' | 'en', Record<Step, string>> = {
  sq: { details: 'te-dhenat', payment: 'pagesa', review: 'rishikimi' },
  en: { details: 'details', payment: 'payment', review: 'review' },
};
const DRAFT = 'dv-checkout';

interface Cfg { hotel: boolean; bank: boolean; card: boolean; card_mode: string; hold: { card: number; hotel: number; bank: number } }

export function initCheckout(): void {
  const root = document.querySelector<HTMLElement>('[data-checkout-root]');
  const form = document.querySelector<HTMLFormElement>('[data-checkout]');
  if (!root || !form) return;
  const L = lang();
  let cfg: Cfg;
  try { cfg = JSON.parse(document.querySelector('script[data-checkout-cfg]')?.textContent || '{}'); } catch { return; }
  const sections = Object.fromEntries(STEPS.map((s) => [s, form.querySelector<HTMLElement>(`[data-step="${s}"]`)!])) as Record<Step, HTMLElement>;
  const stepLinks = [...document.querySelectorAll<HTMLAnchorElement>('[data-step-link]')];
  const errBox = form.querySelector<HTMLElement>('[data-errors]')!;
  const side = document.querySelector<HTMLElement>('[data-co-side]')!;
  const sideLines = side.querySelector<HTMLElement>('[data-co-lines]')!;
  const sideSums = side.querySelector<HTMLElement>('[data-co-sums]')!;
  const sideToggle = side.querySelector<HTMLElement>('[data-co-toggle]');
  const empty = document.querySelector<HTMLElement>('[data-co-empty]')!;
  const cartBanner = form.querySelector<HTMLElement>('[data-co-cart-problems]')!;
  const reviewLines = form.querySelector<HTMLElement>('[data-review-lines]')!;
  const reviewSums = form.querySelector<HTMLElement>('[data-review-sums]')!;
  const reviewContact = form.querySelector<HTMLElement>('[data-review-contact]')!;
  const reviewPay = form.querySelector<HTMLElement>('[data-review-pay]')!;
  const reviewHold = form.querySelector<HTMLElement>('[data-review-hold]')!;
  const reviewNote = form.querySelector<HTMLElement>('[data-review-note]')!;
  const submitBtn = form.querySelector<HTMLButtonElement>('[data-submit]')!;
  const submitLabel = submitBtn.querySelector<HTMLElement>('.pill__main span') ?? submitBtn;
  const busy = form.querySelector<HTMLElement>('[data-busy]')!;
  const holdBox = form.querySelector<HTMLElement>('[data-hold]')!;

  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  const val = (name: string) => String(field(name)?.value ?? '').trim();
  const method = () => (form.querySelector<HTMLInputElement>('input[name="payment_method"]:checked')?.value ?? '') as 'hotel' | 'bank' | 'card' | '';

  /* ---- draft ---- */
  const KEEP = ['name', 'email', 'phone_code', 'phone', 'country', 'notes'];
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT) || '{}');
    for (const k of KEEP) { const f = field(k); if (f && typeof d[k] === 'string' && !f.value) f.value = d[k]; }
    if (d.method) { const r = form.querySelector<HTMLInputElement>(`input[name="payment_method"][value="${d.method}"]`); if (r) r.checked = true; }
  } catch { /* none */ }
  const saveDraft = () => {
    const d: Record<string, string> = {};
    for (const k of KEEP) d[k] = String(field(k)?.value ?? '');
    d.method = method();
    try { sessionStorage.setItem(DRAFT, JSON.stringify(d)); } catch { /* blocked */ }
  };
  form.addEventListener('input', saveDraft);
  form.addEventListener('change', saveDraft);

  /* ---- errors ---- */
  const errEls = new Map<string, HTMLElement>();
  form.querySelectorAll<HTMLElement>('[data-err-for]').forEach((el) => errEls.set(el.dataset.errFor!, el));
  const clearErrors = () => {
    errEls.forEach((el, k) => { el.textContent = ''; el.hidden = true; form.querySelectorAll<HTMLElement>(`[name="${k}"]`).forEach((f) => f.removeAttribute('aria-invalid')); });
    errBox.hidden = true; errBox.replaceChildren();
  };
  const setError = (name: string, msg: string) => {
    const el = errEls.get(name);
    if (el) { el.textContent = msg; el.hidden = false; }
    form.querySelectorAll<HTMLElement>(`[name="${name}"]`).forEach((f) => f.setAttribute('aria-invalid', 'true'));
  };
  const showSummary = (errs: { name: string; msg: string }[], intro?: string) => {
    errBox.replaceChildren();
    const p = h('p', 'co-errors__title', intro ?? (errs.length === 1 ? tc('err.summary.one') : tc('err.summary', { n: errs.length })));
    errBox.append(p);
    if (errs.length) {
      const ul = h('ul', 'co-errors__list');
      for (const e of errs) {
        const li = h('li');
        const a = h('a', '', e.msg);
        a.href = `#f-${e.name}`;
        a.addEventListener('click', (ev) => { ev.preventDefault(); const t = document.getElementById(`f-${e.name}`) ?? form.querySelector<HTMLElement>(`[name="${e.name}"]`); t?.focus(); });
        li.append(a); ul.append(li);
      }
      errBox.append(ul);
    }
    errBox.hidden = false;
    errBox.focus();
  };

  /* ---- validation per step ---- */
  const digits = (s: string) => s.replace(/\D/g, '');
  const phoneFull = () => {
    const raw = val('phone');
    if (!raw) return '';
    if (raw.startsWith('+') || raw.startsWith('00')) return raw.replace(/^00/, '+');
    const code = val('phone_code') || '+355';
    return `${code} ${raw.replace(/^0+/, '')}`;
  };
  const validate = (step: Step): { name: string; msg: string }[] => {
    const errs: { name: string; msg: string }[] = [];
    if (step === 'details') {
      if (val('name').length < 2) errs.push({ name: 'name', msg: tc('err.name') });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val('email'))) errs.push({ name: 'email', msg: tc('err.email') });
      if (val('phone') && digits(val('phone')).length < 7) errs.push({ name: 'phone', msg: tc('err.phone') });
      if (!(field('terms') as HTMLInputElement | null)?.checked) errs.push({ name: 'terms', msg: tc('err.terms') });
    }
    if (step === 'payment') {
      const m = method();
      if (!m) errs.push({ name: 'payment_method', msg: tc('err.method') });
      else if (m !== 'card' && digits(val('phone')).length < 7) errs.push({ name: 'payment_method', msg: tc('err.phone.required') });
    }
    return errs;
  };
  const firstInvalid = (upTo: Step): Step | null => {
    for (const s of STEPS) { if (s === upTo) return null; if (validate(s).length) return s; }
    return null;
  };

  /* ---- steps ---- */
  let current: Step = 'details';
  const stepFromHash = (): Step => {
    const hsh = location.hash.slice(1);
    return (STEPS.find((s) => HASH[L][s] === hsh || s === hsh) ?? 'details');
  };
  const show = (step: Step, opts: { focus?: boolean; push?: boolean } = {}) => {
    const blocked = firstInvalid(step);
    if (blocked) step = blocked;
    current = step;
    STEPS.forEach((s) => { sections[s].hidden = s !== step; });
    stepLinks.forEach((a) => {
      const s = a.dataset.stepLink as Step;
      const i = STEPS.indexOf(s), c = STEPS.indexOf(step);
      a.dataset.state = i < c ? 'done' : i === c ? 'current' : 'todo';
      if (i === c) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
    });
    const hash = `#${HASH[L][step]}`;
    if (location.hash !== hash) {
      if (opts.push) history.pushState({ co: step }, '', hash);
      else history.replaceState({ co: step }, '', hash);
    }
    if (step === 'payment') paintHold();
    if (step === 'review') prepareReview();
    if (opts.focus) {
      const head = sections[step].querySelector<HTMLElement>('[data-step-head]');
      root.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior });
      head?.focus({ preventScroll: true });
    }
  };
  form.querySelectorAll<HTMLButtonElement>('[data-next]').forEach((b) => b.addEventListener('click', () => {
    clearErrors();
    const errs = validate(current);
    if (errs.length) { errs.forEach((e) => setError(e.name, e.msg)); showSummary(errs); return; }
    const next = STEPS[STEPS.indexOf(current) + 1];
    if (current === 'details') track('checkout_start', { meta: { items: getCart().length, kind: kindsOf(getCart()) } });
    if (next) show(next, { focus: true, push: true });
  }));
  form.querySelectorAll<HTMLButtonElement>('[data-back]').forEach((b) => b.addEventListener('click', () => {
    clearErrors();
    const prev = STEPS[STEPS.indexOf(current) - 1];
    if (prev) show(prev, { focus: true, push: true });
  }));
  form.querySelectorAll<HTMLAnchorElement>('[data-goto]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); clearErrors(); show(a.dataset.goto as Step, { focus: true, push: true });
  }));
  stepLinks.forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); clearErrors(); show(a.dataset.stepLink as Step, { focus: true, push: true });
  }));
  window.addEventListener('popstate', () => { clearErrors(); show(stepFromHash(), { focus: true }); });
  form.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'payment_method') { paintHold(); setErrorClear('payment_method'); }
    if (t.name === 'terms' && t.checked) setErrorClear('terms');
  });
  const setErrorClear = (name: string) => { const el = errEls.get(name); if (el) { el.hidden = true; el.textContent = ''; } };

  function holdText(m: string): string {
    if (m === 'card') return tc('hold.card', { minutes: cfg.hold.card });
    if (m === 'bank') return tc('hold.bank', { hours: cfg.hold.bank });
    if (m === 'hotel') return tc('hold.hotel', { hours: cfg.hold.hotel });
    return '';
  }
  function paintHold() {
    const m = method();
    holdBox.textContent = m ? `${holdText(m)} ${tc('hold.note')}` : '';
    holdBox.hidden = !m;
  }

  /* ---- quote + summary ---- */
  let firstTotal: number | null = null;
  let lastQuote: Quote | null = null;
  const paintSide = (q: Quote) => {
    sideLines.replaceChildren(...q.lines.map((l) => {
      const li = h('li', `co-line${l.problem ? ' co-line--problem' : ''}`);
      const name = h('span', 'co-line__name', retired(l) ? tc('cart.unavailable.name') : l.name);
      const meta = h('span', 'co-line__meta mono', retired(l) ? '' : lineMeta(l));
      const sum = h('span', 'co-line__sum mono', l.problem ? '—' : money(l.line_total, L));
      li.append(name, sum, meta);
      if (l.problem) li.append(h('span', 'co-line__problem mono', l.problem.message));
      return li;
    }));
    renderSums(sideSums, q);
    if (sideToggle) {
      const n = q.lines.filter((l) => !retired(l)).length;
      sideToggle.textContent = tc('checkout.summary.toggle', { count: n === 1 ? tc('cartpage.count.one') : tc('cartpage.count', { n }), total: money(q.total, L) });
    }
    const problems = q.lines.some((l) => l.problem);
    cartBanner.hidden = !problems;
  };
  const load = async (): Promise<Quote | null> => {
    const items = getCart();
    if (!items.length) {
      root.dataset.state = 'empty';
      empty.hidden = false;
      return null;
    }
    root.dataset.state = 'ready';
    empty.hidden = true;
    try {
      const q = await quote(items, getPromo());
      if (q.promo && !q.promo.valid) setPromo('');
      lastQuote = q;
      if (firstTotal == null) firstTotal = q.total;
      paintSide(q);
      return q;
    } catch {
      sideSums.textContent = tc('cartpage.error');
      return null;
    }
  };

  async function prepareReview() {
    reviewNote.textContent = tc('checkout.loading');
    const before = firstTotal;
    const q = await load();
    if (!q) { reviewNote.textContent = tc('err.network'); return; }
    reviewLines.replaceChildren(...q.lines.map((l) => {
      const li = h('li', `rv-line${l.problem ? ' rv-line--problem' : ''}`);
      li.append(h('span', 'rv-line__name', retired(l) ? tc('cart.unavailable.name') : l.name), h('span', 'rv-line__sum mono', l.problem ? '—' : money(l.line_total, L)));
      const meta = retired(l) ? '' : lineMeta(l);
      if (meta) li.append(h('span', 'rv-line__meta mono', meta));
      if (l.offer && !l.problem) li.append(h('span', 'rv-line__offer mono', `${tc('stamp.offer')} · ${l.offer.name} · −${money(l.offer.saving, L)}`));
      if (l.problem) li.append(h('span', 'rv-line__problem mono', l.problem.message));
      return li;
    }));
    renderSums(reviewSums, q, { big: true });
    reviewNote.textContent = before != null && before !== q.total
      ? tc('review.changed', { from: money(before, L), to: money(q.total, L) })
      : tc('review.requote');
    firstTotal = q.total;
    // contact + payment summary
    const rows: [string, string][] = [
      [tc('field.name'), val('name')], [tc('field.email'), val('email')],
      ...(val('phone') ? [[tc('field.phone'), phoneFull()] as [string, string]] : []),
      ...(val('country') ? [[tc('field.country'), val('country')] as [string, string]] : []),
      ...(val('notes') ? [[tc('field.notes'), val('notes')] as [string, string]] : []),
    ];
    reviewContact.replaceChildren(...rows.map(([k, v]) => { const d = h('div'); d.append(h('dt', 'mono', k), h('dd', '', v)); return d; }));
    const m = method();
    const label = form!.querySelector<HTMLElement>(`[data-method-label="${m}"]`)?.textContent ?? m;
    reviewPay.textContent = label;
    reviewHold.textContent = `${holdText(m)} ${tc('hold.note')}`;
    submitLabel.textContent = tc(m === 'card' ? 'review.submit.card' : 'review.submit');
  }

  /* ---- submit ---- */
  let sending = false;
  let spin = 0;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (current !== 'review') { form.querySelector<HTMLButtonElement>(`[data-step="${current}"] [data-next]`)?.click(); return; }
    if (sending) return;
    clearErrors();
    for (const s of ['details', 'payment'] as Step[]) {
      const errs = validate(s);
      if (errs.length) { show(s, { focus: false, push: true }); errs.forEach((x) => setError(x.name, x.msg)); showSummary(errs); return; }
    }
    const items = getCart();
    if (!items.length) { root.dataset.state = 'empty'; empty.hidden = false; return; }
    sending = true;
    submitBtn.setAttribute('aria-busy', 'true');
    spin = window.setTimeout(() => { busy.hidden = false; busy.textContent = tc('review.submitting'); }, 200);
    const promo = getPromo();
    const utm = readUtm();
    const body = {
      lang: L, items,
      ...(promo ? { promo } : {}),
      customer: { name: val('name'), email: val('email'), phone: phoneFull() || null, country: val('country') || null },
      payment_method: method(),
      notes: val('notes') || null,
      marketing_consent: !!(field('marketing') as HTMLInputElement | null)?.checked,
      terms_accepted: true,
      website: val('website'),
      ...(utm ? { utm } : {}),
    };
    let res: Response;
    try {
      res = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
    } catch {
      done(); showSummary([], tc('err.network'));
      return;
    }
    let data: Record<string, any> = {};
    try { data = await res.json(); } catch { /* not json */ }
    if (res.status === 201 && data.code) {
      clearCart();
      setPromo('');
      try { sessionStorage.removeItem(DRAFT); } catch { /* fine */ }
      const orderUrl = `${path('order', L, { code: data.code })}?t=${encodeURIComponent(data.token)}`;
      const next = data.next ?? {};
      location.assign(next.type === 'redirect' || (next.type === 'pok' && next.url) ? next.url : next.url || orderUrl);
      return;
    }
    done();
    handleError(res.status, data.error ?? {});
  });
  function done() { clearTimeout(spin); sending = false; submitBtn.removeAttribute('aria-busy'); busy.hidden = true; busy.textContent = ''; }

  function handleError(status: number, err: { code?: string; message_sq?: string; message_en?: string; fields?: { path: string; message: string }[]; lines?: { key: string; problem: { message: string } }[]; max?: number }) {
    const server = (L === 'en' ? err.message_en : err.message_sq) || '';
    const code = err.code ?? '';
    if (code === 'bad_request' && err.fields?.length) {
      const map: Record<string, { name: string; msg: string; step: Step }> = {
        'customer.name': { name: 'name', msg: tc('err.name'), step: 'details' },
        'customer.email': { name: 'email', msg: tc('err.email'), step: 'details' },
        'customer.phone': { name: 'phone', msg: tc('err.phone.required'), step: 'details' },
        'customer.country': { name: 'country', msg: server, step: 'details' },
        terms_accepted: { name: 'terms', msg: tc('err.terms'), step: 'details' },
        payment_method: { name: 'payment_method', msg: tc('err.method'), step: 'payment' },
      };
      const errs = err.fields.map((f) => map[f.path]).filter(Boolean);
      if (errs.length) {
        show(errs[0].step, { push: true });
        errs.forEach((x) => setError(x.name, x.msg));
        showSummary(errs.map(({ name, msg }) => ({ name, msg })));
        return;
      }
    }
    let msg = '';
    switch (code) {
      case 'cart_problem': msg = tc('err.cart_problem'); load().then(() => show('review')); break;
      case 'sold_out': msg = tc('err.sold_out'); load(); break;
      case 'promo_invalid': msg = tc('err.promo_invalid'); setPromo(''); load().then(() => show('review')); break;
      case 'promo_rate': msg = tc('err.promo_rate'); break;
      case 'hold_cap': msg = tc('err.hold_cap'); break;
      case 'hold_cap_units': msg = tc('err.hold_cap_units', { max: err.max ?? 5 }); break;
      case 'too_many_open_orders': msg = tc('err.too_many_open_orders'); break;
      case 'rate_limited': msg = tc('err.rate_limited'); break;
      case 'unavailable': msg = tc('err.unavailable'); show('payment', { push: true }); break;
      case 'bad_request': msg = status === 400 && !err.fields ? tc('err.method_off') : server || tc('err.generic'); if (!err.fields) show('payment', { push: true }); break;
      default: msg = server || tc('err.generic');
    }
    showSummary([], msg);
    const contact = h('a', 'co-errors__contact mono', tc('err.contact'));
    contact.href = path('contact', L);
    errBox.append(contact);
  }

  /* ---- boot ---- */
  load().then((q) => {
    if (!q) return;
    show(stepFromHash());
  });
  paintHold();
  onChange(() => { load(); });
  window.addEventListener('dv:prefs', () => { if (lastQuote) load(); });
}

function kindsOf(items: CartItem[]): string {
  const k = [...new Set(items.map((i) => i.kind))];
  return k.length === 1 ? k[0] : 'mixed';
}

/** First-touch campaign tags of this tab (written by the landing page's URL, kept for checkout). */
function readUtm(): { source?: string; medium?: string; campaign?: string } | null {
  try {
    const q = new URLSearchParams(location.search);
    const fromUrl = { source: q.get('utm_source') ?? undefined, medium: q.get('utm_medium') ?? undefined, campaign: q.get('utm_campaign') ?? undefined };
    if (fromUrl.source) return fromUrl;
    const s = JSON.parse(sessionStorage.getItem('dv-utm') || 'null');
    return s && typeof s.source === 'string' ? s : null;
  } catch { return null; }
}
