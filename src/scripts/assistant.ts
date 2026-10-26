/**
 * assistant.ts — the 24/7 assistant chat (T7), loaded on first use by AssistantPanel's tiny
 * listener. POST /api/assistant { lang, message, context:{path, interests, cart, history, sid} }
 * → { reply, chips, links, products, intent, handoff }.
 * - History lives in sessionStorage 'dv-assistant' only (this tab), never on the server unless
 *   the visitor sends it to the staff with the hand-off form.
 * - The typing line appears only if the answer takes longer than 300 ms (no spinner flash).
 * - Answer language follows the page; the SQ/EN switch in the panel changes it (stored with the
 *   history). UI chrome stays in the page language.
 * - Accessible: dialog via menu.ts modal() (focus trap, Esc, focus back to the pill, swipe down on
 *   phones), role="log" + aria-live polite for answers, errors inline next to their fields.
 */
import { modal, type ModalHandle } from './menu';
import { getCart } from './cart';
import { getPrefs } from './prefs';
import { sid } from './track';
import { tc, lang as pageLang } from '../i18n/client';
import { money, number } from '../i18n/format';
import { photoSrc } from '../components/site/photo-url';

type Lang = 'sq' | 'en';
interface Link { label: string; url: string }
interface Product { slug: string; kind: string; name: string; url: string; image: string | null; price: number; left?: number | null; total?: number; when?: string; per?: 'person'; party?: number }
interface Reply { reply: string; chips: string[]; links: Link[]; products: Product[]; intent: string; handoff: boolean }
interface Msg { role: 'user' | 'assistant'; text: string; links?: Link[]; products?: Product[]; handoff?: boolean; error?: boolean; at: string }
interface Store { v: 1; lang: Lang; msgs: Msg[] }

const KEY = 'dv-assistant';
const MAX = 40;

let handle: ModalHandle | null = null;
let dlg: HTMLDialogElement;
let store: Store;
let busy = false;
/** a hand-off POST in flight: a second press or Enter is ignored, so staff never get it twice */
let sending = false;
/** when the hand-off form opened (time trap, as on the contact form) */
let hoOpenedAt = 0;

const $ = <T extends Element = HTMLElement>(sel: string) => dlg.querySelector<T>(sel)!;
const nowHm = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tirane', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

function load(): Store {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (s && s.v === 1 && Array.isArray(s.msgs)) return { v: 1, lang: s.lang === 'en' ? 'en' : s.lang === 'sq' ? 'sq' : pageLang(), msgs: s.msgs.slice(-MAX) };
  } catch { /* private mode */ }
  return { v: 1, lang: pageLang(), msgs: [] };
}
function save() {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...store, msgs: store.msgs.slice(-MAX) })); } catch { /* ignore */ }
}

/* ---------------- rendering ---------------- */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const sameSite = (u: string) => /^\/(?![/\\])/.test(u);
function priceText(lek: number, lang: Lang): string {
  const h = document.documentElement;
  const rate = Number(h.dataset.eurRate) || 0;
  return h.dataset.cur === 'EUR' && rate > 0 ? money(lek, lang, { currency: 'EUR', rate }) : money(lek, lang);
}

function renderMsg(m: Msg): HTMLLIElement {
  const li = el('li', `amsg amsg--${m.role === 'user' ? 'user' : 'bot'}${m.error ? ' amsg--error' : ''}`);
  const who = el('p', 'amsg__who mono');
  who.append(el('span', '', m.role === 'user' ? tc('assistant.you') : tc('assistant.bot')), el('span', '', m.at));
  li.append(who);
  const p = el('p', 'amsg__text', m.text);
  p.lang = store.lang;
  li.append(p);
  if (m.products?.length) {
    const ul = el('ul', 'amsg__cards');
    for (const x of m.products.slice(0, 6)) {
      if (!sameSite(x.url)) continue;
      const a = el('a', 'acard');
      a.href = x.url;
      if (x.image) {
        const img = el('img', 'acard__img');
        img.src = photoSrc(x.image, 640, 'webp');
        img.alt = '';
        img.width = 56; img.height = 56;
        img.loading = 'lazy';
        a.append(img);
      } else a.append(el('span', 'acard__img'));
      const body = el('span', '');
      body.append(el('span', 'acard__name', x.name));
      const meta = el('span', 'acard__meta mono');
      if (x.when) meta.append(el('span', '', x.when));
      // experiences: the price per person, or the party's total with its size (rooms: the stay's total)
      meta.append(el('span', '', x.per === 'person'
        ? (x.total != null && x.party
          ? tc('assistant.party', { price: priceText(x.total, store.lang), n: number(x.party, store.lang) })
          : tc('assistant.perPerson', { price: priceText(x.price, store.lang) }))
        : priceText(x.total ?? x.price, store.lang)));
      if (x.left != null) meta.append(el('span', '', x.left === 1 ? tc('assistant.seat') : tc('assistant.seats', { n: number(x.left, store.lang) })));
      body.append(meta);
      a.append(body);
      const li2 = el('li');
      li2.append(a);
      ul.append(li2);
    }
    if (ul.childElementCount) li.append(ul);
  }
  const links = (m.links ?? []).filter((l) => sameSite(l.url) || /^https:\/\//.test(l.url));
  if (links.length) {
    const box = el('p', 'amsg__links');
    for (const l of links) {
      const a = el('a', '', l.label);
      a.href = l.url;
      if (!sameSite(l.url)) a.rel = 'noopener';
      box.append(a);
    }
    li.append(box);
  }
  if (m.handoff) {
    const b = el('button', 'pill pill--outline pill--s amsg__handoff', tc('assistant.handoff.open'));
    b.type = 'button';
    b.dataset.handoff = '';
    li.append(b);
  }
  return li;
}

function renderAll() {
  const log = $('[data-asst-log]');
  log.querySelectorAll('.amsg:not([data-greeting])').forEach((n) => n.remove());
  for (const m of store.msgs) log.append(renderMsg(m));
  setLang(store.lang, false);
}

function setChips(list: string[] | null) {
  const box = $('[data-asst-chips]');
  box.querySelectorAll('[data-dyn]').forEach((n) => n.remove());
  const statics = box.querySelectorAll<HTMLButtonElement>('[data-chip]:not([data-dyn])');
  if (list && list.length) {
    statics.forEach((b) => { b.hidden = true; });
    for (const c of list.slice(0, 4)) {
      const b = el('button', 'achip', c);
      b.type = 'button';
      b.dataset.chip = '';
      b.dataset.dyn = '';
      b.lang = store.lang;
      box.append(b);
    }
  } else {
    statics.forEach((b) => { b.hidden = b.dataset.forLang !== store.lang; });
  }
}

function setLang(l: Lang, persist = true) {
  store.lang = l;
  dlg.querySelectorAll<HTMLElement>('[data-greeting] [data-for-lang]').forEach((p) => { p.hidden = p.dataset.forLang !== l; });
  dlg.querySelectorAll<HTMLButtonElement>('[data-asst-lang]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.asstLang === l ? 'true' : 'false'));
  // a language switch drops the last reply's chips (they are in the other language)
  if (persist || !dlg.querySelector('[data-asst-chips] [data-dyn]')) setChips(null);
  if (persist) save();
}

const scrollEnd = () => { const s = $('[data-asst-scroll]'); s.scrollTop = s.scrollHeight; };

/* ---------------- talking to the server ---------------- */

function context() {
  const prefs = getPrefs();
  return {
    path: location.pathname,
    interests: prefs.interests.slice(0, 12),
    cart: getCart().map((i) => i.slug).slice(0, 40),
    history: store.msgs.filter((m) => !m.error).slice(-6).map((m) => ({ role: m.role, content: m.text.slice(0, 1200) })),
    sid: sid(),
  };
}

async function post(body: Record<string, unknown>): Promise<{ ok: true; data: Reply } | { ok: false; status: number; data?: any }> {
  try {
    const res = await fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || typeof data.reply !== 'string') return { ok: false, status: res.status, data };
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0 };
  }
}

async function ask(text: string) {
  const message = text.trim().slice(0, 600);
  if (!message || busy) return;
  busy = true;
  const typing = $('[data-asst-typing]');
  const hist = context();
  store.msgs.push({ role: 'user', text: message, at: nowHm() });
  $('[data-asst-log]').append(renderMsg(store.msgs[store.msgs.length - 1]));
  setChips([]);
  save();
  scrollEnd();
  const t = window.setTimeout(() => { typing.hidden = false; scrollEnd(); }, 300);
  const r = await post({ lang: store.lang, message, context: hist });
  clearTimeout(t);
  typing.hidden = true;
  let m: Msg;
  if (r.ok) {
    const d = r.data;
    const contactLink = d.links.some((l) => /\/(kontakt|en\/contact)\//.test(l.url));
    m = { role: 'assistant', text: d.reply, links: d.links, products: d.products, handoff: d.handoff || contactLink, at: nowHm() };
    setChips(d.chips?.length ? d.chips : null);
  } else {
    m = { role: 'assistant', text: r.status === 429 ? tc('assistant.rate') : tc('assistant.error'), handoff: true, error: true, at: nowHm() };
    setChips(null);
  }
  store.msgs.push(m);
  $('[data-asst-log]').append(renderMsg(m));
  save();
  scrollEnd();
  busy = false;
}

/* ---------------- hand-off form ---------------- */

/** "I want to talk to the staff" is the request for the form, not the question for the staff (same words as the engine's HANDOFF_WORDS). */
const HANDOFF_RE = /\b(flas me|staf|njeri real|me nje njeri\b|njeri te stafit|njeri nga stafi|operator|human|person real|real person|call me|me telefononi|me merrni|contact me|me kontaktoni|talk to)/;
const foldText = (x: string) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function openHandoff(prefill?: string) {
  const f = $<HTMLFormElement>('[data-asst-handoff]');
  if (f.hidden) hoOpenedAt = performance.now();
  f.hidden = false;
  const q = f.elements.namedItem('question') as HTMLTextAreaElement;
  // the visitor's last question, on its own line, so what they type next starts below it
  if (prefill && !q.value && !HANDOFF_RE.test(foldText(prefill))) q.value = `${prefill}\n`;
  const first = f.elements.namedItem('name') as HTMLInputElement;
  first.focus();
  f.scrollIntoView({ block: 'nearest' });
}

function fieldError(f: HTMLFormElement, name: string, msg: string) {
  const out = f.querySelector<HTMLElement>(`[data-err="${name}"]`);
  if (out) out.textContent = msg;
  const input = f.elements.namedItem(name) as HTMLInputElement | null;
  if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
}

async function sendHandoff(f: HTMLFormElement) {
  if (sending) return;
  const v = (n: string) => ((f.elements.namedItem(n) as HTMLInputElement).value || '').trim();
  const name = v('name'), email = v('email'), phone = v('phone'), question = v('question');
  ['name', 'email', 'question', 'form'].forEach((n) => fieldError(f, n, ''));
  let first: string | null = null;
  const err = (n: string, k: string) => { fieldError(f, n, tc(k)); first ??= n; };
  if (!name) err('name', 'assistant.handoff.err.name');
  if (!email && !phone) err('email', 'assistant.handoff.err.contact');
  else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) err('email', 'assistant.handoff.err.email');
  if (!question) err('question', 'assistant.handoff.err.message');
  if (first) { (f.elements.namedItem(first) as HTMLElement).focus(); return; }
  const btn = f.querySelector<HTMLButtonElement>('[type="submit"]')!;
  btn.setAttribute('aria-busy', 'true');
  sending = true;
  let r: Awaited<ReturnType<typeof post>>;
  try {
    r = await post({ lang: store.lang, message: question.slice(0, 600), context: context(), contact: { name, ...(email ? { email } : {}), ...(phone ? { phone } : {}), question: question.slice(0, 1000), website: v('hp_web_x'), elapsed_ms: Math.max(0, Math.round(performance.now() - hoOpenedAt)) } });
  } finally {
    sending = false;
    btn.removeAttribute('aria-busy');
  }
  if (!r.ok || r.data.intent !== 'contact') {
    fieldError(f, 'form', r.ok ? r.data.reply : r.status === 429 ? tc('assistant.rate') : tc('assistant.error'));
    return;
  }
  f.reset();
  f.hidden = true;
  const m: Msg = { role: 'assistant', text: r.data.reply || tc('assistant.handoff.sent'), at: nowHm() };
  store.msgs.push(m);
  $('[data-asst-log]').append(renderMsg(m));
  save();
  scrollEnd();
  ($('#asst-input') as HTMLInputElement).focus();
}

/* ---------------- boot ---------------- */

function init() {
  dlg = document.getElementById('assistant') as HTMLDialogElement;
  store = load();
  handle = modal(dlg, {
    swipeClose: 'down',
    onOpen: () => {
      document.documentElement.classList.add('assistant-open');
      requestIdle(() => scrollEnd());
      ($('#asst-input') as HTMLInputElement).focus({ preventScroll: true });
    },
    onClose: () => document.documentElement.classList.remove('assistant-open'),
  });
  renderAll();

  $('[data-asst-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    // an answer is still on its way: keep the text in the field (it is sent with the next Enter)
    if (busy) return;
    const input = $('#asst-input') as HTMLInputElement;
    const text = input.value;
    input.value = '';
    ask(text);
  });
  dlg.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const chip = t.closest<HTMLButtonElement>('[data-chip]');
    if (chip) { ask(chip.textContent || ''); return; }
    const lb = t.closest<HTMLButtonElement>('[data-asst-lang]');
    if (lb) { setLang(lb.dataset.asstLang === 'en' ? 'en' : 'sq'); return; }
    if (t.closest('[data-handoff]')) {
      const lastQ = [...store.msgs].reverse().find((m) => m.role === 'user')?.text;
      openHandoff(lastQ);
      return;
    }
    if (t.closest('[data-ho-cancel]')) { $<HTMLFormElement>('[data-asst-handoff]').hidden = true; ($('#asst-input') as HTMLInputElement).focus(); return; }
    if (t.closest('[data-asst-clear]')) {
      store = { v: 1, lang: store.lang, msgs: [] };
      save();
      renderAll();
      setChips(null);
      ($('#asst-input') as HTMLInputElement).focus();
      return;
    }
    // a link inside the panel navigates: close first so the page behind is not left inert
    const a = t.closest<HTMLAnchorElement>('a[href]');
    if (a && sameSite(a.getAttribute('href') || '')) handle?.close();
  });
  const ho = $<HTMLFormElement>('[data-asst-handoff]');
  ho.addEventListener('submit', (e) => { e.preventDefault(); sendHandoff(e.currentTarget as HTMLFormElement); });
  // clear a field's error as soon as it is corrected (as the contact form does)
  ho.addEventListener('input', (e) => {
    const n = (e.target as HTMLInputElement).name;
    if (n === 'phone') fieldError(ho, 'email', '');
    else if (n) fieldError(ho, n, '');
  });
}

/** a short idle without requestAnimationFrame (GSAP's ticker is the only rAF owner) */
function requestIdle(fn: () => void) { setTimeout(fn, 0); }

export function openAssistant(from?: HTMLElement | null) {
  if (!handle) init();
  handle!.open(from ?? null);
}
