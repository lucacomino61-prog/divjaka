/**
 * chrome.ts — the one client entry Base.astro loads on every public page. It boots the motion
 * engine and wires the site chrome: loader, menu, cart drawer + counters, ticker, the Stop /
 * currency switches, live readings in header/menu/footer, prices in EUR, the assistant pill,
 * the page-view beacon and Web Vitals. Feature pages add their own <script> modules and import
 * from './motion', './cart', './prefs', './track' — never a second engine.
 */
import { setMotion } from './motion';
import { initLoader } from './loader';
import { initMenu } from './menu';
import { initDrawer, initCartCount } from './drawer';
import { initTicker } from './ticker';
import { getPrefs, setCurrency, onPrefs, eurRate } from './prefs';
import { track, observeVitals, rememberSource } from './track';
import { getLive, isFresh } from './livefeed';
import { tc, lang } from '../i18n/client';
import { money, tirane, time, compass } from '../i18n/format';

const html = document.documentElement;

function initMotionSwitches() {
  // the label (Stop ↔ Play) follows html[data-motion] in CSS; nothing to paint here
  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-motion-switch]');
    if (!b) return;
    setMotion(html.dataset.motion !== 'off');
  });
}

function initCurrency() {
  const paint = () => {
    const cur = getPrefs().currency;
    html.dataset.cur = cur;
    document.querySelectorAll<HTMLButtonElement>('button[data-currency]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.currency === cur)));
    // server-rendered <Price> carries both figures and is switched by CSS from html[data-cur]
    // (no text written on load); only prices built on the client without them are painted here
    const rate = eurRate();
    const L = lang();
    document.querySelectorAll<HTMLElement>('[data-price-lek]:not([data-price-ssr])').forEach((el) => {
      const lek = Number(el.dataset.priceLek);
      if (!Number.isFinite(lek)) return;
      const main = el.querySelector('[data-price-main]');
      const alt = el.querySelector<HTMLElement>('[data-price-alt]');
      const showEur = cur === 'EUR' && rate > 0;
      if (main) main.textContent = showEur ? money(lek, L, { currency: 'EUR', rate }) : money(lek, L);
      if (alt) { alt.hidden = !showEur; alt.textContent = showEur ? money(lek, L) : ''; }
      // the struck-through "was" price follows the same currency, so an offer never mixes two
      const was = el.querySelector<HTMLElement>('[data-price-was]');
      const wasLek = Number(was?.dataset.priceWas);
      const wasMain = was?.querySelector('[data-price-was-main]');
      if (wasMain && Number.isFinite(wasLek)) wasMain.textContent = showEur ? money(wasLek, L, { currency: 'EUR', rate }) : money(wasLek, L);
    });
  };
  document.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-currency]');
    if (b?.dataset.currency === 'ALL' || b?.dataset.currency === 'EUR') setCurrency(b.dataset.currency);
  });
  onPrefs(paint);
  paint();
}

function initLiveSpots() {
  const spots = document.querySelectorAll<HTMLElement>('[data-live-temp], [data-live-reading]');
  if (!spots.length) return;
  getLive().then((l) => {
    if (!isFresh(l)) return;
    const L = lang();
    const w = l.weather!;
    document.querySelectorAll<HTMLElement>('[data-live-temp]').forEach((el) => {
      el.textContent = `${Math.round(w.temp)}°`;
      // the slot is reserved in CSS (visibility only), so nothing in the header moves
      el.closest<HTMLElement>('[data-live-mini]')?.setAttribute('data-state', 'ready');
      el.closest<HTMLElement>('[data-live-mini]')?.setAttribute('title',`${L === 'sq' ? w.label_sq : w.label_en} · ${tc('live.updated', { time: time(l.updated_at) })}`);
    });
    document.querySelectorAll<HTMLElement>('[data-live-reading]').forEach((el) => {
      const rows: string[] = [
        tc('live.temp', { t: Math.round(w.temp) }) + ` · ${L === 'sq' ? w.label_sq : w.label_en}`,
        tc('live.wind', { dir: compass(w.wind_dir, L), v: Math.round(w.wind_kmh) }),
      ];
      if (l.marine?.sea_temp != null) rows.push(tc('live.sea', { t: Math.round(l.marine.sea_temp) }));
      if (l.sun) rows.push(`${tc('live.sunrise', { time: l.sun.sunrise })} · ${tc('live.sunset', { time: l.sun.sunset })}`);
      const ul = document.createElement('ul');
      ul.className = 'reading-list mono';
      for (const r of rows) { const li = document.createElement('li'); li.textContent = r; ul.append(li); }
      const stamp = document.createElement('p');
      stamp.className = 'mono muted';
      stamp.textContent = `${tc('live.updated', { time: time(l.updated_at) })} · ${tc('live.source')}`;
      el.replaceChildren(ul, stamp);
      el.hidden = false;
      el.closest<HTMLElement>('[data-live-block]')?.removeAttribute('hidden');
    });
  });
}

function initClocks() {
  const paint = () => {
    const t = tirane().time;
    document.querySelectorAll<HTMLElement>('[data-clock]').forEach((el) => { el.textContent = t; el.setAttribute('datetime', t); });
    setTimeout(paint, (60 - new Date().getSeconds()) * 1000 + 50);
  };
  paint();
}

function initAssistant() {
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-assistant-open]');
    if (!a) return;
    // T7's panel listens for this and calls preventDefault() to claim it; without the panel the
    // pill stays a plain link to the contact page.
    const ev = new CustomEvent('dv:assistant-open', { cancelable: true, detail: { from: a.dataset.assistantOpen || 'pill' } });
    window.dispatchEvent(ev);
    if (ev.defaultPrevented) e.preventDefault();
  });
}

function boot() {
  initLoader();
  initMenu();
  initDrawer();
  initCartCount();
  initTicker();
  initMotionSwitches();
  initCurrency();
  initLiveSpots();
  initClocks();
  initAssistant();
  rememberSource();
  if (!html.dataset.noTrack) track('view');
  observeVitals();
}
boot();
