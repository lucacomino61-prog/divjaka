/**
 * booking.ts — the booking widgets (T4). One entry: initBooking() wires every
 * [data-booking="room" | "experience" | "stay"] permit card on the page and the phone sheet.
 *
 *  - Cal: the month grid (ARIA date grid: one tab stop, arrows ±1/±7, Home/End = week,
 *    Page Up/Down = month, Enter/Space picks). Months come from GET /api/availability/…?month=
 *    (rooms: price per night; stay: lowest price over every room type; experiences: free places
 *    per day + the sessions). The month is kept in the URL (?muaji=YYYY-MM) with replaceState.
 *  - RangeCtl: check-in → check-out, drawn as a plotted route (data-mark on the cells); refuses
 *    a range over a taken night, under the room's min nights or over 30 nights.
 *  - Totals always come from the server (pricing.ts): rooms via GET /api/availability/room/:slug
 *    ?from&to&qty&guests (nightly prices + quote), experiences and the stay search via POST
 *    /api/quote. Add to cart / Book now re-check with POST /api/quote first; local numbers are
 *    never trusted. Errors keep every choice the visitor made.
 *  - No requestAnimationFrame, no animation library: state changes are CSS transitions.
 */
import { addItem } from './cart';
import { isMotionOff, lockScroll } from './motion';
import { track } from './track';
import { addViewed } from './prefs';
import { tc, lang as pageLang } from '../i18n/client';
import {
  MONTHS, formatDate, formatRange, money, number, nights as nightsLabel, seats as seatsLabel, daysBetween, addDays,
} from '../i18n/format';

type Status = 'past' | 'open' | 'full' | 'closed' | 'none' | 'far';
interface Day { date: string; status: Status; price?: number; seats?: number }
interface Sess { id: number; date: string; time: string; left: number; status: string; note: string | null }
interface QuoteLine {
  key: string; slug: string; name: string; unit_price: number; qty: number; nights?: number; guests?: number;
  line_total: number; compare_total?: number; offer?: { name: string; saving: number }; problem?: { code: string; message: string };
}
interface Quote { lines: QuoteLine[]; total: number }

const L = pageLang();
const html = document.documentElement;
const rate = () => Number(html.dataset.eurRate) || 0;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** Both currencies in the markup; CSS shows one from html[data-cur] (same as <Price>). */
function priceHTML(lek: number): string {
  const all = `<span data-cur-all>${esc(money(lek, L))}</span>`;
  return rate() > 0 ? `${all}<span data-cur-eur>${esc(money(lek, L, { currency: 'EUR', rate: rate() }))}</span>` : all;
}
function priceText(lek: number): string {
  return html.dataset.cur === 'EUR' && rate() > 0 ? money(lek, L, { currency: 'EUR', rate: rate() }) : money(lek, L);
}
const ymOf = (d: string) => d.slice(0, 7);
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthDates(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
}
const weekday = (d: string) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = Monday

/** Replace some query params without a history entry (state in the URL, PLAN §8). */
function setParams(patch: Record<string, string | null>) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(patch)) { if (v == null || v === '') u.searchParams.delete(k); else u.searchParams.set(k, v); }
  if (u.href !== location.href) history.replaceState(history.state, '', u);
}

async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) }, ...init });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = data?.error ? (L === 'en' ? data.error.message_en : data.error.message_sq) : '';
    throw Object.assign(new Error(msg || tc('booking.err.network')), { status: r.status, server: !!msg });
  }
  return data as T;
}
const postQuote = (items: unknown[]) => getJSON<Quote>('/api/quote', { method: 'POST', body: JSON.stringify({ lang: L, items }) });

/** Show "Po kontrollojmë…" on a pill only when the wait passes 200 ms (no flash). */
function busy(btn: HTMLElement | null, on: boolean) {
  if (!btn) return;
  const main = btn.querySelector<HTMLElement>('.pill__main');
  if (on) {
    btn.setAttribute('aria-busy', 'true');
    const tmr = window.setTimeout(() => {
      if (main && btn.getAttribute('aria-busy') === 'true') { main.dataset.label ??= main.firstChild?.textContent ?? ''; if (main.firstChild) main.firstChild.textContent = tc('booking.checking'); }
    }, 200);
    btn.dataset.busyT = String(tmr);
  } else {
    clearTimeout(Number(btn.dataset.busyT));
    btn.removeAttribute('aria-busy');
    if (main?.dataset.label != null && main.firstChild) { main.firstChild.textContent = main.dataset.label; delete main.dataset.label; }
  }
}

/* ======================================================================== calendar */

type Provider = (ym: string) => Promise<Day[]>;

class Cal {
  el: HTMLElement;
  body: HTMLTableSectionElement;
  mode: string;
  ym: string;
  min: string;
  max: string;
  today: string;
  horizon: string;
  cache = new Map<string, Day[]>();
  inflight = new Map<string, Promise<Day[]>>();
  focusDate: string | null = null;
  onPick: (d: string) => void = () => {};
  onHover: (d: string | null) => void = () => {};
  markOf: (d: string) => string = () => '';
  canOut: (d: string) => boolean = () => false;
  onMonth: (ym: string) => void = () => {};
  private provider: Provider;
  private seq = 0;

  constructor(el: HTMLElement, provider: Provider) {
    this.el = el;
    this.provider = provider;
    this.body = el.querySelector('[data-cal-body]')!;
    this.mode = el.dataset.mode || 'night';
    this.ym = el.dataset.ym!;
    this.min = el.dataset.min!;
    this.max = el.dataset.max!;
    this.today = el.dataset.today!;
    this.horizon = el.dataset.horizon || '9999-12-31';
    try {
      const data = JSON.parse(el.querySelector<HTMLScriptElement>('script[data-cal-data]')?.textContent || 'null');
      if (Array.isArray(data)) this.cache.set(this.ym, data);
    } catch { /* re-fetch */ }
    this.focusDate = el.querySelector<HTMLElement>('.cal__day[tabindex="0"]')?.dataset.date ?? null;

    el.querySelector('[data-cal-prev]')?.addEventListener('click', (e) => { e.preventDefault(); this.go(addMonths(this.ym, -1)); });
    el.querySelector('[data-cal-next]')?.addEventListener('click', (e) => { e.preventDefault(); this.go(addMonths(this.ym, 1)); });
    this.body.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.cal__day');
      if (!b) return;
      const d = b.dataset.date!;
      this.setFocus(d, false);
      if (b.dataset.status === 'open' || b.hasAttribute('data-can-out')) this.onPick(d);
    });
    this.body.addEventListener('keydown', (e) => this.key(e));
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      this.body.addEventListener('pointerover', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.cal__day');
        if (b) this.onHover(b.dataset.date!);
      });
      this.body.addEventListener('pointerleave', () => this.onHover(null));
    }
  }

  /** Data of a month (cached, fetched once). */
  month(ym: string): Promise<Day[]> {
    const hit = this.cache.get(ym);
    if (hit) return Promise.resolve(hit);
    let p = this.inflight.get(ym);
    if (!p) {
      p = this.provider(ym).then((days) => {
        const out = days.map((d) => (d.status === 'open' && d.date > this.horizon ? { date: d.date, status: 'far' as Status } : d));
        this.cache.set(ym, out); this.inflight.delete(ym); return out;
      }, (err) => { this.inflight.delete(ym); throw err; });
      this.inflight.set(ym, p);
    }
    return p;
  }
  /** Forget cached months (after the server said something changed). */
  invalidate() { this.cache.clear(); }
  day(date: string): Day | undefined { return this.cache.get(ymOf(date))?.find((d) => d.date === date); }

  async go(ym: string, focus?: string) {
    if (ym < this.min || ym > this.max) return;
    const my = ++this.seq;
    this.el.setAttribute('aria-busy', 'true');
    const status = this.el.querySelector<HTMLElement>('[data-cal-status]')!;
    const slow = window.setTimeout(() => { status.textContent = tc('booking.cal.loading'); status.removeAttribute('data-tone'); }, 250);
    try {
      const days = await this.month(ym);
      if (my !== this.seq) return;
      this.ym = ym;
      this.el.dataset.ym = ym;
      this.render(days, focus);
      status.textContent = '';
      setParams({ muaji: ym });
      this.onMonth(ym);
    } catch {
      if (my !== this.seq) return;
      status.dataset.tone = 'error';
      status.innerHTML = `${esc(tc('booking.cal.error'))}<button type="button">${esc(tc('booking.cal.retry'))}</button>`;
      status.querySelector('button')?.addEventListener('click', () => this.go(ym, focus), { once: true });
    } finally {
      clearTimeout(slow);
      if (my === this.seq) this.el.removeAttribute('aria-busy');
    }
  }

  /** Paint the grid for this.ym. */
  render(days = this.cache.get(this.ym) ?? [], focus?: string) {
    const byDate = new Map(days.map((d) => [d.date, d]));
    const dates = monthDates(this.ym);
    const lead = weekday(dates[0]);
    const cells: (string | null)[] = [...Array(lead).fill(null), ...dates];
    while (cells.length % 7) cells.push(null);
    const open = days.find((d) => d.status === 'open')?.date;
    const want = focus && ymOf(focus) === this.ym ? focus
      : this.focusDate && ymOf(this.focusDate) === this.ym ? this.focusDate
      : open ?? dates.find((d) => d >= this.today) ?? dates[0];
    this.focusDate = want;
    let out = '';
    for (let r = 0; r < cells.length / 7; r++) {
      out += '<tr>';
      for (let c = 0; c < 7; c++) {
        const date = cells[r * 7 + c];
        if (!date) { out += '<td class="cal__pad"></td>'; continue; }
        const d = byDate.get(date) ?? { date, status: (date < this.today ? 'past' : 'none') as Status };
        const val = d.status === 'open' ? (d.price != null ? number(d.price, L) : d.seats != null ? String(d.seats) : '') : '';
        const v = d.status === 'open' && d.price != null && rate() > 0
          ? `<span data-cur-all>${val}</span><span data-cur-eur>${number(Math.round(d.price / rate()), L)}</span>`
          : val;
        out += `<td class="cal__cell"><button type="button" class="cal__day" data-date="${date}" data-status="${d.status}"${date === this.today ? ' data-today' : ''} tabindex="${date === want ? 0 : -1}"${d.status === 'open' ? '' : ' aria-disabled="true"'}><span class="cal__n" aria-hidden="true">${Number(date.slice(8))}</span><span class="cal__v" aria-hidden="true">${v}</span></button></td>`;
      }
      out += '</tr>';
    }
    this.body.innerHTML = out;
    const [y, m] = this.ym.split('-').map(Number);
    this.el.querySelector('[data-cal-month]')!.textContent = `${MONTHS[L][m - 1]} ${y}`;
    const prev = this.el.querySelector<HTMLAnchorElement>('[data-cal-prev]')!;
    const next = this.el.querySelector<HTMLAnchorElement>('[data-cal-next]')!;
    const link = (a: HTMLAnchorElement, ym: string, off: boolean) => {
      const u = new URL(location.href); u.searchParams.set('muaji', ym); a.href = u.pathname + u.search;
      if (off) a.setAttribute('aria-disabled', 'true'); else a.removeAttribute('aria-disabled');
    };
    link(prev, addMonths(this.ym, -1), addMonths(this.ym, -1) < this.min);
    link(next, addMonths(this.ym, 1), addMonths(this.ym, 1) > this.max);
    this.paint();
  }

  /** Marks (range route, picked day), departure-only days and accessible names. Writes only. */
  paint() {
    for (const b of this.body.querySelectorAll<HTMLButtonElement>('.cal__day')) {
      const date = b.dataset.date!;
      const d = this.day(date);
      const mark = this.markOf(date);
      const td = b.parentElement!;
      if (mark) td.dataset.mark = mark; else delete td.dataset.mark;
      const can = d?.status !== 'open' && this.canOut(date);
      b.toggleAttribute('data-can-out', can);
      if (d?.status === 'open' || can) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
      const words = mark.split(' ');
      const picked = words.includes('in') || mark === 'out' || mark === 'pick';
      if (picked) b.setAttribute('aria-pressed', 'true'); else b.removeAttribute('aria-pressed');
      b.setAttribute('aria-label', this.label(date, d, mark));
    }
  }

  private label(date: string, d: Day | undefined, mark: string): string {
    const long = formatDate(date, L, 'long');
    let s = long;
    const st = d?.status ?? (date < this.today ? 'past' : 'none');
    if (st === 'open' && d?.price != null) s = tc('booking.cal.dayNight', { date: long, price: priceText(d.price) });
    else if (st === 'open' && d?.seats != null) s = tc('booking.cal.daySeats', { date: long, seats: seatsLabel(d.seats, L) });
    else s = `${long}, ${tc(`booking.cal.${st === 'full' ? 'full' : st}`)}`;
    if (date === this.today) s += `, ${tc('booking.cal.today')}`;
    const words = mark.split(' ');
    if (words.includes('in')) s += `, ${tc('booking.cal.selectedIn')}`;
    if (mark === 'out') s += `, ${tc('booking.cal.selectedOut')}`;
    if (mark === 'mid') s += `, ${tc('booking.cal.inRange')}`;
    return s;
  }

  setFocus(date: string, move = true) {
    this.focusDate = date;
    let target: HTMLButtonElement | null = null;
    for (const b of this.body.querySelectorAll<HTMLButtonElement>('.cal__day')) {
      const on = b.dataset.date === date;
      b.tabIndex = on ? 0 : -1;
      if (on) target = b;
    }
    if (move) target?.focus();
  }

  /** Focus a day; switch months when it lies outside the one shown. */
  async focusDay(date: string) {
    if (ymOf(date) < this.min || ymOf(date) > this.max) return;
    if (ymOf(date) !== this.ym) await this.go(ymOf(date), date);
    this.setFocus(date);
    this.onHover(date);
  }

  private key(e: KeyboardEvent) {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.cal__day');
    if (!b) return;
    const d = b.dataset.date!;
    let next: string | null = null;
    switch (e.key) {
      case 'ArrowLeft': next = addDays(d, -1); break;
      case 'ArrowRight': next = addDays(d, 1); break;
      case 'ArrowUp': next = addDays(d, -7); break;
      case 'ArrowDown': next = addDays(d, 7); break;
      case 'Home': next = addDays(d, -weekday(d)); break;
      case 'End': next = addDays(d, 6 - weekday(d)); break;
      case 'PageUp':
      case 'PageDown': {
        const ym = addMonths(ymOf(d), e.key === 'PageUp' ? -1 : 1);
        const last = monthDates(ym).length;
        next = `${ym}-${String(Math.min(Number(d.slice(8)), last)).padStart(2, '0')}`;
        break;
      }
      default: return;
    }
    e.preventDefault();
    if (next) void this.focusDay(next);
  }
}

/* ---- providers ---- */

const roomProvider = (slug: string): Provider => async (ym) => {
  const r = await getJSON<{ days: { date: string; price: number; status: Status }[] }>(`/api/availability/room/${encodeURIComponent(slug)}?month=${ym}`);
  return r.days.map((d) => ({ date: d.date, status: d.status, ...(d.status === 'open' ? { price: d.price } : {}) }));
};
const stayProvider = (slugs: string[]): Provider => async (ym) => {
  const all = await Promise.all(slugs.map((s) => roomProvider(s)(ym)));
  if (!all.length) return [];
  return all[0].map((d, i) => {
    const open = all.map((list) => list[i]).filter((x) => x?.status === 'open');
    if (open.length) return { date: d.date, status: 'open' as Status, price: Math.min(...open.map((x) => x.price ?? Infinity)) };
    const st = all.map((list) => list[i]?.status);
    return { date: d.date, status: (st.includes('past') ? 'past' : st.every((s) => s === 'closed') ? 'closed' : 'full') as Status };
  });
};
function experienceProvider(slug: string, store: Map<string, Sess[]>): Provider {
  return async (ym) => {
    const r = await getJSON<{ sessions: Sess[] }>(`/api/availability/experience/${encodeURIComponent(slug)}?month=${ym}`);
    // only the light-linked keys are public (staff notes are free text)
    const sessions = r.sessions.map((s) => ({ ...s, note: s.note === 'sunrise' || s.note === 'sunset' ? s.note : null }));
    store.set(ym, sessions);
    const today = html.querySelector<HTMLElement>('[data-cal]')?.dataset.today ?? '';
    return monthDates(ym).map((date) => {
      const mine = sessions.filter((s) => s.date === date);
      if (date < today) return { date, status: 'past' as Status };
      if (!mine.length) return { date, status: 'none' as Status };
      const open = mine.filter((s) => s.status === 'open');
      if (open.length) return { date, status: 'open' as Status, seats: open.reduce((n, s) => n + s.left, 0) };
      if (mine.every((s) => s.status === 'past')) return { date, status: 'past' as Status };
      return { date, status: (mine.some((s) => s.status === 'full') ? 'full' : 'closed') as Status };
    });
  };
}

/* ======================================================================== stepper */

class Stepper {
  el: HTMLElement;
  input: HTMLInputElement;
  min: number;
  max: number;
  onChange: (n: number) => void = () => {};
  constructor(el: HTMLElement) {
    this.el = el;
    this.input = el.querySelector('[data-stepper-input]')!;
    this.min = Number(this.input.min) || 1;
    this.max = Number(this.input.max) || 99;
    el.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) => b.addEventListener('click', () => {
      if (b.getAttribute('aria-disabled') === 'true') return;
      this.set(this.value + Number(b.dataset.step));
    }));
    this.input.addEventListener('change', () => this.set(Number(this.input.value)));
    this.sync();
  }
  get value() { return Math.trunc(Number(this.input.value)) || this.min; }
  set(n: number, silent = false) {
    const v = Math.min(this.max, Math.max(this.min, Math.trunc(n) || this.min));
    const changed = v !== Number(this.input.value);
    this.input.value = String(v);
    this.sync();
    if (!silent && changed) this.onChange(v);
    else if (!silent && n !== v) this.onChange(v); // typed out of range: clamp and re-quote
  }
  setMax(max: number) {
    this.max = Math.max(this.min, max);
    this.input.max = String(this.max);
    if (this.value > this.max) this.set(this.max);
    else this.sync();
  }
  hint(text: string, tone?: 'error') {
    const h = this.el.querySelector<HTMLElement>('[data-stepper-hint]');
    if (!h) return;
    h.textContent = text;
    if (tone) h.dataset.tone = tone; else delete h.dataset.tone;
  }
  private sync() {
    const [less, more] = this.el.querySelectorAll<HTMLButtonElement>('[data-step]');
    less.setAttribute('aria-disabled', String(this.value <= this.min));
    more.setAttribute('aria-disabled', String(this.value >= this.max));
  }
}

/* ======================================================================== range */

interface RangeOpts { minNights: number; maxNights: number; collapsible: boolean; onChange: () => void }

class RangeCtl {
  el: HTMLElement;
  cal: Cal;
  from: string | null;
  to: string | null;
  picking: 'in' | 'out';
  hover: string | null = null;
  opts: RangeOpts;
  msg: HTMLElement;

  constructor(el: HTMLElement, cal: Cal, opts: RangeOpts) {
    this.el = el; this.cal = cal; this.opts = opts;
    this.from = el.dataset.from ?? null;
    this.to = el.dataset.to ?? null;
    this.picking = this.from && !this.to ? 'out' : 'in';
    this.msg = el.querySelector('[data-range-msg]')!;
    cal.markOf = (d) => this.mark(d);
    cal.canOut = (d) => this.canOut(d);
    cal.onPick = (d) => void this.pick(d);
    cal.onHover = (d) => { if (this.picking === 'out' && this.from && !this.to) { this.hover = d; cal.paint(); } };
    el.querySelectorAll<HTMLButtonElement>('[data-range-field]').forEach((b) => b.addEventListener('click', () => this.field(b.dataset.rangeField as 'in' | 'out')));
    el.querySelector('[data-range-clear]')?.addEventListener('click', () => { this.from = this.to = null; this.picking = 'in'; this.update(); this.say(tc('booking.range.pickIn')); this.cal.setFocus(this.cal.focusDate ?? '', true); });
    this.update(false);
  }

  get open() { return !this.el.querySelector<HTMLElement>('[data-range-cal]')!.hidden; }
  show(on: boolean) {
    if (!this.opts.collapsible) return;
    const box = this.el.querySelector<HTMLElement>('[data-range-cal]')!;
    box.hidden = !on;
    this.el.querySelectorAll('[data-range-field]').forEach((b) => b.setAttribute('aria-expanded', String(on)));
  }

  private field(which: 'in' | 'out') {
    this.picking = which === 'out' && this.from ? 'out' : 'in';
    this.show(true);
    this.update(false);
    this.say(tc(this.picking === 'out' ? 'booking.range.pickOut' : 'booking.range.pickIn'));
    const target = this.picking === 'out' ? (this.to ?? (this.from ? addDays(this.from, 1) : null)) : this.from;
    if (target) void this.cal.focusDay(target); else this.cal.setFocus(this.cal.focusDate ?? '', true);
  }

  /** Nights [from, to) all bookable? Loads the months it needs. */
  async nightsOpen(from: string, to: string): Promise<boolean> {
    const months = new Set<string>();
    for (let d = from; d < to; d = addDays(d, 1)) months.add(ymOf(d));
    await Promise.all([...months].map((m) => this.cal.month(m)));
    for (let d = from; d < to; d = addDays(d, 1)) if (this.cal.day(d)?.status !== 'open') return false;
    return true;
  }
  /** Sync guess for painting (months not loaded yet count as unknown → not offered). */
  private canOut(d: string): boolean {
    if (this.picking !== 'out' || !this.from || this.to || d <= this.from) return false;
    if (daysBetween(this.from, d) > this.opts.maxNights) return false;
    for (let x = this.from; x < d; x = addDays(x, 1)) if (this.cal.day(x)?.status !== 'open') return false;
    return true;
  }

  private mark(d: string): string {
    const { from, to } = this;
    if (from && to) {
      if (d === from) return 'in';
      if (d === to) return 'out';
      if (d > from && d < to) return 'mid';
      return '';
    }
    if (from && d === from) {
      const h = this.hover;
      return h && h > from && this.canOut(h) ? 'in hover' : 'in solo';
    }
    if (from && this.hover && this.hover > from && this.canOut(this.hover)) {
      if (d === this.hover) return 'hover-out';
      if (d > from && d < this.hover) return 'hover';
    }
    return '';
  }

  private async pick(d: string) {
    const { minNights, maxNights } = this.opts;
    if (this.picking === 'in' || !this.from || d <= this.from) {
      // a new arrival: keep the departure if the stay still works
      const keep = this.picking === 'in' && this.to && d < this.to && daysBetween(d, this.to) <= maxNights && daysBetween(d, this.to) >= minNights && await this.nightsOpen(d, this.to);
      this.from = d;
      if (!keep) this.to = null;
      this.picking = this.to ? 'in' : 'out';
      this.hover = null;
      this.update();
      this.say(this.to ? this.doneText() : tc('booking.range.pickOut'));
      return;
    }
    const n = daysBetween(this.from, d);
    if (n > maxNights) { this.say(tc('booking.range.max', { n: maxNights }), 'error'); return; }
    if (n < minNights) { this.say(tc('booking.range.min', { n: minNights }), 'error'); return; }
    if (!(await this.nightsOpen(this.from, d))) { this.say(tc('booking.range.blocked'), 'error'); return; }
    this.to = d;
    this.picking = 'in';
    this.hover = null;
    this.update();
    this.say(this.doneText());
    if (this.opts.collapsible) {
      this.show(false);
      this.el.querySelector<HTMLElement>('[data-range-field="out"]')?.focus();
    }
  }

  doneText() {
    return this.from && this.to ? tc('booking.range.done', { nights: nightsLabel(daysBetween(this.from, this.to), L), range: formatRange(this.from, this.to, L) }) : '';
  }
  say(text: string, tone?: 'error') {
    this.msg.textContent = text;
    if (tone) this.msg.dataset.tone = tone; else delete this.msg.dataset.tone;
  }
  /** Invalidate the range after the server refused it (taken meanwhile). */
  reset(keepFrom = true) {
    if (!keepFrom) this.from = null;
    this.to = null;
    this.picking = this.from ? 'out' : 'in';
    this.update();
  }

  update(notify = true) {
    const q = (s: string) => this.el.querySelector<HTMLElement>(s)!;
    const choose = tc('booking.range.choose');
    q('[data-range-in]').textContent = this.from ? formatDate(this.from, L, 'short') : choose;
    q('[data-range-in-w]').textContent = this.from ? formatDate(this.from, L, 'weekday') : '';
    q('[data-range-out]').textContent = this.to ? formatDate(this.to, L, 'short') : choose;
    q('[data-range-out-w]').textContent = this.to ? formatDate(this.to, L, 'weekday') : '';
    q('[data-range-n]').textContent = this.from && this.to ? nightsLabel(daysBetween(this.from, this.to), L) : '';
    this.el.toggleAttribute('data-has-range', !!(this.from && this.to));
    this.el.querySelectorAll<HTMLElement>('[data-range-field]').forEach((b) => b.toggleAttribute('data-active', b.dataset.rangeField === this.picking && this.open));
    const clear = this.el.querySelector<HTMLElement>('[data-range-clear]');
    if (clear) clear.hidden = !this.from;
    this.cal.el.dataset.picking = this.picking;
    this.cal.paint();
    setParams({ nga: this.from, deri: this.to });
    if (notify) this.opts.onChange();
  }
}

/* ======================================================================== shared stub */

interface Stub {
  sum: HTMLElement; calc: HTMLElement; offer: HTMLElement; msg: HTMLElement; done: HTMLElement;
  add: HTMLElement | null; book: HTMLElement | null;
}
function stubOf(root: HTMLElement): Stub {
  return {
    sum: root.querySelector('[data-bk-sum]')!, calc: root.querySelector('[data-bk-calc]')!, offer: root.querySelector('[data-bk-offer]')!,
    msg: root.querySelector('[data-bk-msg]')!, done: root.querySelector('[data-bk-done]')!,
    add: root.querySelector('[data-bk-add]'), book: root.querySelector('[data-bk-book]'),
  };
}
function waitSum(s: Stub, key: string) {
  s.sum.innerHTML = `<span class="bk__wait">${esc(tc(key))}</span>`;
  s.calc.textContent = '';
  s.offer.hidden = true;
}
function showSum(s: Stub, total: number, compare?: number, offer?: { name: string; saving: number }) {
  s.sum.innerHTML = `${compare && compare > total ? `<s class="bk__sum-was">${priceHTML(compare)}</s>` : ''}<span class="bk__sum-main">${priceHTML(total)}</span>`;
  if (offer) { s.offer.hidden = false; s.offer.textContent = `${tc('booking.total.offer', { name: offer.name })} · ${tc('booking.total.saving', { price: priceText(offer.saving) })}`; }
  else s.offer.hidden = true;
}
function message(s: Stub, text: string | null) {
  if (!text) { s.msg.hidden = true; s.msg.textContent = ''; return; }
  s.msg.textContent = text;
  s.msg.hidden = false;
}

/* ======================================================================== room */

function initRoom(root: HTMLElement) {
  const slug = root.dataset.slug!;
  const name = root.dataset.name ?? slug;
  const cap = Number(root.dataset.capacity) || 2;
  const cal = new Cal(root.querySelector<HTMLElement>('[data-cal]')!, roomProvider(slug));
  const s = stubOf(root);
  const rooms = new Stepper(root.querySelector('[data-stepper="rooms"]')!);
  const guests = new Stepper(root.querySelector('[data-stepper="guests"]')!);
  const nightsBox = root.querySelector<HTMLDetailsElement>('[data-bk-nights]');
  const nightsList = root.querySelector<HTMLElement>('[data-bk-nights-list]');
  let ctl: AbortController | null = null;
  let timer = 0;
  let lastOk = false;

  const range = new RangeCtl(root.querySelector('[data-range]')!, cal, {
    minNights: Number(root.dataset.minNights) || 1, maxNights: 30, collapsible: false,
    onChange: () => schedule(),
  });
  rooms.onChange = (n) => { guests.setMax(cap * n); setParams({ dhoma: String(n) }); schedule(); };
  guests.onChange = (n) => { setParams({ persona: String(n) }); schedule(); };
  guests.setMax(cap * rooms.value);

  const item = () => ({ key: '', slug, kind: 'room' as const, qty: rooms.value, from: range.from!, to: range.to!, guests: guests.value });

  function schedule() { clearTimeout(timer); timer = window.setTimeout(refresh, 120); }

  async function refresh() {
    message(s, null);
    s.done.hidden = true;
    if (!range.from || !range.to) { waitSum(s, 'booking.total.waitDates'); if (nightsBox) nightsBox.hidden = true; lastOk = false; return; }
    ctl?.abort();
    ctl = new AbortController();
    const q = new URLSearchParams({ from: range.from, to: range.to, qty: String(rooms.value), guests: String(guests.value), lang: L });
    root.setAttribute('aria-busy', 'true');
    try {
      const r = await getJSON<{ nights: { night: string; price: number }[]; quote: { line: QuoteLine; total: number } }>(`/api/availability/room/${encodeURIComponent(slug)}?${q}`, { signal: ctl.signal });
      const line = r.quote.line;
      const n = r.nights.length;
      showSum(s, line.line_total, line.compare_total, line.offer);
      s.calc.textContent = tc('booking.total.nights', { nights: nightsLabel(n, L), price: priceText(line.unit_price * rooms.value) }) + (rooms.value > 1 ? ` · ${rooms.value} × ${L === 'sq' ? 'dhoma' : 'rooms'}` : '');
      if (nightsBox && nightsList) {
        nightsList.innerHTML = r.nights.map((x) => `<li><span>${esc(formatDate(x.night, L, 'weekday-short'))} ${esc(formatDate(x.night, L, 'short'))}</span><span>${priceHTML(x.price)}</span></li>`).join('');
        nightsBox.hidden = n < 2;
      }
      lastOk = !line.problem;
      if (line.problem) message(s, line.problem.message);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      lastOk = false;
      waitSum(s, 'booking.total.waitDates');
      message(s, (e as Error).message || tc('booking.err.network'));
    } finally {
      root.removeAttribute('aria-busy');
    }
  }

  async function commit(go: boolean) {
    const btn = go ? s.book : s.add;
    if (!range.from || !range.to) {
      message(s, tc('booking.err.dates'));
      cal.setFocus(cal.focusDate ?? '', true);
      return;
    }
    busy(btn, true);
    try {
      const q = await postQuote([item()]);
      const line = q.lines[0];
      if (line?.problem) {
        cal.invalidate();
        await cal.go(cal.ym);
        if (line.problem.code === 'sold_out' || line.problem.code === 'closed') { range.reset(true); clearTimeout(timer); waitSum(s, 'booking.total.waitDates'); }
        message(s, `${tc('booking.err.changed')} ${line.problem.message}`);
        return;
      }
      addItem({ slug, kind: 'room', qty: rooms.value, from: range.from, to: range.to, guests: guests.value }, { name, value: line?.line_total, toast: !go });
      if (go) { location.href = root.dataset.checkout!; return; }
      s.done.hidden = false;
      s.done.querySelector('[data-bk-done-text]')!.textContent = tc('booking.inCart', { range: formatRange(range.from, range.to, L) });
    } catch (e) {
      message(s, (e as Error).message || tc('booking.err.network'));
    } finally {
      busy(btn, false);
    }
  }
  s.add?.addEventListener('click', () => commit(false));
  s.book?.addEventListener('click', () => commit(true));
  // currency switch: re-word the readouts that are plain text
  window.addEventListener('dv:prefs', () => { if (lastOk) void refresh(); cal.paint(); });
  if (range.from && range.to) void refresh();
  else if (range.from) void range.nightsOpen(range.from, addDays(range.from, 1)).then(() => cal.paint());
}

/* ======================================================================== experience */

function initExperience(root: HTMLElement) {
  const slug = root.dataset.slug!;
  const name = root.dataset.name ?? slug;
  const maxGroup = Number(root.dataset.maxGroup) || 10;
  const store = new Map<string, Sess[]>();
  try {
    const seed = JSON.parse(root.querySelector('script[data-bk-sessions]')?.textContent || 'null');
    if (seed?.ym && Array.isArray(seed.sessions)) store.set(seed.ym, seed.sessions);
  } catch { /* fetched on demand */ }
  const cal = new Cal(root.querySelector<HTMLElement>('[data-cal]')!, experienceProvider(slug, store));
  const s = stubOf(root);
  const people = new Stepper(root.querySelector('[data-stepper="people"]')!);
  const slots = root.querySelector<HTMLElement>('[data-slots]')!;
  const slotName = slots.dataset.name!;
  const params = new URL(location.href).searchParams;
  let date: string | null = params.get('data');
  let session: number | null = Number(params.get('orari')) || Number(slots.querySelector<HTMLInputElement>('input:checked')?.value) || null;
  let ctl: AbortController | null = null;
  let timer = 0;
  if (date && !cal.day(date)) date = null;

  cal.markOf = (d) => (d === date ? 'pick' : '');
  cal.onPick = (d) => {
    date = d; session = null; renderSlots(true); cal.paint(); setParams({ data: d, orari: null }); schedule();
    // the slots sit under the calendar: bring them up inside the card's own scroll (desktop column / phone sheet)
    slots.scrollIntoView({ block: 'nearest', behavior: isMotionOff() ? 'instant' : 'smooth' });
  };
  people.onChange = (n) => { setParams({ persona: String(n) }); schedule(); };

  const daySessions = () => (date ? (store.get(ymOf(date)) ?? []).filter((x) => x.date === date) : []);
  const noteText = (n: string | null) => (n === 'sunrise' ? tc('booking.session.sunrise') : n === 'sunset' ? tc('booking.session.sunset') : '');

  function renderSlots(autoPick = false) {
    const legend = slots.querySelector<HTMLElement>('[data-slots-legend]')!;
    const list = slots.querySelector<HTMLElement>('[data-slots-list]')!;
    legend.textContent = date ? tc('booking.session.for', { date: formatDate(date, L, 'day-month') }) : tc('booking.session');
    const mine = daySessions();
    const open = mine.filter((x) => x.status === 'open');
    if (autoPick && open.length === 1) session = open[0].id;
    if (session && !open.some((x) => x.id === session)) session = null;
    let out = '';
    if (!date) out = `<p class="bk-slots__empty mono">${esc(tc('booking.session.pickDay'))}</p>`;
    else if (!open.length) out = `<p class="bk-slots__empty mono">${esc(tc('booking.session.none'))}</p>`;
    out += mine.map((x) => {
      const on = x.status === 'open';
      const left = on ? seatsLabel(x.left, L) : x.status === 'full' ? tc('booking.session.full') : tc('booking.session.closed');
      const note = noteText(x.note);
      return `<label class="bk-slot${on ? '' : ' bk-slot--off'}"><input type="radio" name="${esc(slotName)}" value="${x.id}"${x.id === session ? ' checked' : ''}${on ? '' : ' disabled'} data-left="${x.left}"><span class="bk-slot__time">${esc(x.time)}</span><span class="bk-slot__left mono">${esc(left)}</span>${note ? `<span class="bk-slot__note mono">${esc(note)}</span>` : ''}</label>`;
    }).join('');
    list.innerHTML = out;
    if (session) setParams({ orari: String(session) });
    capPeople();
  }
  function capPeople() {
    const chosen = daySessions().find((x) => x.id === session);
    const cap = Math.max(1, Math.min(maxGroup, chosen ? chosen.left : maxGroup));
    people.setMax(cap);
    if (chosen && chosen.left < maxGroup) people.hint(tc('booking.people.cap', { seats: seatsLabel(chosen.left, L) }));
    else people.hint(tc('booking.people.group', { n: maxGroup }));
  }
  slots.addEventListener('change', (e) => {
    const r = e.target as HTMLInputElement;
    if (r.type !== 'radio') return;
    session = Number(r.value);
    setParams({ orari: String(session) });
    capPeople();
    schedule();
  });

  function schedule() { clearTimeout(timer); timer = window.setTimeout(refresh, 100); }
  const item = () => ({ key: '', slug, kind: 'experience' as const, qty: people.value, guests: people.value, session_id: session! });

  async function refresh() {
    message(s, null);
    s.done.hidden = true;
    if (!session) { waitSum(s, 'booking.total.waitSession'); return; }
    ctl?.abort();
    ctl = new AbortController();
    root.setAttribute('aria-busy', 'true');
    try {
      const q = await getJSON<Quote>('/api/quote', { method: 'POST', body: JSON.stringify({ lang: L, items: [item()] }), signal: ctl.signal });
      const line = q.lines[0];
      showSum(s, line.line_total, line.compare_total, line.offer);
      s.calc.textContent = tc('booking.total.people', { people: L === 'sq' ? (people.value === 1 ? '1 person' : `${people.value} persona`) : people.value === 1 ? '1 person' : `${people.value} people`, price: priceText(line.unit_price) });
      if (line.problem) message(s, line.problem.message);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      waitSum(s, 'booking.total.waitSession');
      message(s, (e as Error).message || tc('booking.err.network'));
    } finally {
      root.removeAttribute('aria-busy');
    }
  }

  async function commit(go: boolean) {
    const btn = go ? s.book : s.add;
    if (!session || !date) {
      message(s, tc('booking.err.session'));
      if (!date) cal.setFocus(cal.focusDate ?? '', true);
      else slots.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
      return;
    }
    busy(btn, true);
    try {
      const q = await postQuote([item()]);
      const line = q.lines[0];
      if (line?.problem) {
        message(s, `${tc('booking.err.changed')} ${line.problem.message}`);
        cal.invalidate();
        store.clear();
        await cal.go(cal.ym, date);
        renderSlots();
        return;
      }
      addItem({ slug, kind: 'experience', qty: people.value, guests: people.value, session_id: session }, { name, value: line?.line_total, toast: !go });
      if (go) { location.href = root.dataset.checkout!; return; }
      const sess = daySessions().find((x) => x.id === session);
      s.done.hidden = false;
      s.done.querySelector('[data-bk-done-text]')!.textContent = tc('booking.inCart', { range: `${formatDate(date, L, 'day-month')}, ${sess?.time ?? ''}` });
    } catch (e) {
      message(s, (e as Error).message || tc('booking.err.network'));
    } finally {
      busy(btn, false);
    }
  }
  s.add?.addEventListener('click', () => commit(false));
  s.book?.addEventListener('click', () => commit(true));
  cal.onMonth = () => { if (date && ymOf(date) !== cal.ym) { /* keep the pick; it is in another month */ } };
  window.addEventListener('dv:prefs', () => { if (session) void refresh(); });
  cal.paint();
  capPeople();
  if (session) void refresh();
}

/* ======================================================================== stay search */

interface RoomRef { slug: string; name: string; cap: number; url: string }

function initStay(root: HTMLElement) {
  const list: RoomRef[] = JSON.parse(root.dataset.rooms || '[]');
  const cal = new Cal(root.querySelector<HTMLElement>('[data-cal]')!, stayProvider(list.map((r) => r.slug)));
  const s = stubOf(root);
  const guests = new Stepper(root.querySelector('[data-stepper="guests"]')!);
  const results = root.querySelector<HTMLElement>('[data-bk-results]')!;
  const search = root.querySelector<HTMLElement>('[data-bk-search]');
  const range = new RangeCtl(root.querySelector('[data-range]')!, cal, { minNights: 1, maxNights: 30, collapsible: true, onChange: () => { s.done.hidden = true; } });
  guests.onChange = (n) => setParams({ persona: String(n) });
  const roomWord = (n: number) => (L === 'sq' ? (n === 1 ? '1 dhomë' : `${n} dhoma`) : n === 1 ? '1 room' : `${n} rooms`);
  let last: { lines: QuoteLine[]; qty: number[] } | null = null;

  async function run() {
    message(s, null);
    if (!range.from || !range.to) {
      range.show(true);
      range.say(tc('booking.range.pickIn'), 'error');
      message(s, tc('booking.err.dates'));
      root.querySelector<HTMLElement>('[data-range-field="in"]')?.focus();
      return;
    }
    const g = guests.value;
    const qty = list.map((r) => Math.max(1, Math.ceil(g / r.cap)));
    busy(search, true);
    try {
      // one line per room type; quoted one by one so a type never limits another (whole-cart rules)
      const quotes = await Promise.all(list.map((r, i) => postQuote([{ key: r.slug, slug: r.slug, kind: 'room', qty: qty[i], from: range.from, to: range.to, guests: g }])));
      last = { lines: quotes.map((q) => q.lines[0]), qty };
      paintResults();
      setParams({ nga: range.from, deri: range.to, persona: String(g) });
    } catch (e) {
      message(s, (e as Error).message || tc('booking.err.network'));
    } finally {
      busy(search, false);
    }
  }
  function paintResults() {
    if (!last || !range.from || !range.to) return;
    const lines = last.lines;
    const free = lines.filter((l) => !l.problem).length;
    const head = `${nightsLabel(daysBetween(range.from, range.to), L)} · ${formatRange(range.from, range.to, L)} · ${free === 1 ? tc('stay.search.result1') : tc('stay.search.result', { n: free })}`;
    const q = (r: RoomRef, i: number) => `${r.url}?nga=${range.from}&deri=${range.to}&persona=${guests.value}&dhoma=${last!.qty[i]}`;
    results.innerHTML = `<p class="sr__head mono">${esc(head)}</p>${free ? '' : `<p class="bk-msg">${esc(tc('stay.search.none'))}</p>`}<ol class="sr">${list.map((r, i) => {
      const l = lines[i];
      const ok = !l.problem;
      const was = l.compare_total && l.compare_total > l.line_total ? `<s class="bk__sum-was">${priceHTML(l.compare_total)}</s> ` : '';
      return `<li class="sr__row${ok ? '' : ' sr__row--full'}" data-slug="${esc(r.slug)}"><p class="sr__name"><a href="${esc(q(r, i))}">${esc(r.name)}</a></p><p class="sr__meta mono">${esc(roomWord(last!.qty[i]))} · ${esc(tc('stay.search.cap', { n: r.cap }))} · ${esc(ok ? tc('stay.search.free') : tc('stay.search.full'))}</p><div class="sr__price"><span class="sr__total">${was}${priceHTML(l.line_total)}</span>${ok ? `<button type="button" class="pill pill--outline sr__add" data-sr-add="${esc(r.slug)}" data-qty="${last!.qty[i]}">${esc(tc('booking.add'))}</button>` : ''}</div>${ok && l.offer ? `<p class="sr__problem bk__offer mono">${esc(tc('booking.total.offer', { name: l.offer.name }))}</p>` : ''}${!ok && l.problem ? `<p class="sr__problem">${esc(l.problem.message)}</p>` : ''}</li>`;
    }).join('')}</ol>`;
  }
  search?.addEventListener('click', run);
  results.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-sr-add]');
    if (!b || !range.from || !range.to) return;
    const ref = list.find((r) => r.slug === b.dataset.srAdd)!;
    const it = { key: '', slug: ref.slug, kind: 'room' as const, qty: Number(b.dataset.qty) || 1, from: range.from, to: range.to, guests: guests.value };
    b.setAttribute('aria-busy', 'true');
    try {
      const qt = await postQuote([it]);
      const line = qt.lines[0];
      if (line.problem) { message(s, `${tc('booking.err.changed')} ${line.problem.message}`); cal.invalidate(); await run(); return; }
      addItem({ slug: it.slug, kind: 'room', qty: it.qty, from: it.from, to: it.to, guests: it.guests }, { name: ref.name, value: line.line_total });
      s.done.hidden = false;
      s.done.querySelector('[data-bk-done-text]')!.textContent = tc('booking.inCart', { range: `${ref.name} · ${formatRange(range.from, range.to, L)}` });
    } catch (err) {
      message(s, (err as Error).message || tc('booking.err.network'));
    } finally {
      b.removeAttribute('aria-busy');
    }
  });
  // the server already answered a shared ?nga=&deri= link; keep those rows until a new search
}

/* ======================================================================== phone sheet */

function initSheet() {
  const pill = document.querySelector<HTMLButtonElement>('[data-bk-pill]');
  const sheet = document.querySelector<HTMLDialogElement>('[data-bk-sheet]');
  const slot = document.querySelector<HTMLElement>('[data-bk-slot]');
  const card = slot?.querySelector<HTMLElement>('.bk');
  if (!pill || !sheet || !slot || !card) return;
  const body = sheet.querySelector<HTMLElement>('[data-bk-sheet-body]')!;
  const wide = matchMedia('(min-width: 1000px)');

  const open = () => {
    if (sheet.open) return;
    body.append(card);
    sheet.showModal();
    lockScroll(true);
    html.classList.add('leja-open');
    pill.setAttribute('aria-expanded', 'true');
    // first useful stop: the first focusable control of the card (the date grid or a field)
    (card.querySelector<HTMLElement>('[data-range-field]') ?? card.querySelector<HTMLElement>('.cal__day[tabindex="0"]') ?? card.querySelector<HTMLElement>('input'))?.focus({ preventScroll: true });
  };
  const close = () => { if (sheet.open) sheet.close(); };
  sheet.addEventListener('close', () => {
    slot.append(card);
    lockScroll(false);
    html.classList.remove('leja-open');
    pill.setAttribute('aria-expanded', 'false');
    if (!wide.matches) pill.focus({ preventScroll: true });
  });
  pill.addEventListener('click', open);
  sheet.querySelector('[data-bk-sheet-close]')?.addEventListener('click', close);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  wide.addEventListener('change', () => { if (wide.matches) close(); });
  // swipe down from the top of the sheet (bar, or the body when it is scrolled to the top)
  let sy = 0, sx = 0, tracking = false;
  sheet.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    tracking = e.touches.length === 1 && sheet.scrollTop <= 0 && !(e.target as HTMLElement).closest('.cal__grid, .bk-step, .bk-slots');
    sy = t.clientY; sx = t.clientX;
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    const t = e.touches[0];
    const dy = t.clientY - sy, dx = t.clientX - sx;
    if (dy > 90 && Math.abs(dx) < dy * 0.6) { tracking = false; close(); }
  }, { passive: true });
  sheet.addEventListener('touchend', () => { tracking = false; }, { passive: true });
  window.addEventListener('pagehide', (e) => { if ((e as PageTransitionEvent).persisted) close(); });
  // a deep link with dates (?nga=…) on a phone opens straight on the permit
  if (!wide.matches && new URL(location.href).searchParams.has('leje')) open();
}

/* ======================================================================== boot */

export function initBooking() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-booking]')) {
    try {
      const kind = root.dataset.booking;
      if (kind === 'room') initRoom(root);
      else if (kind === 'experience') initExperience(root);
      else if (kind === 'stay') initStay(root);
      if ((kind === 'room' || kind === 'experience') && root.dataset.slug) {
        addViewed(root.dataset.slug);
        track('product_view', { product: root.dataset.slug, meta: { kind } });
      }
    } catch (e) { console.error(e); }
  }
  initSheet();
}
