/**
 * home.ts — the home's small behaviours (the signature, the verse and the recommendation rail
 * load their own modules):
 *  - today's log ([data-home-live]): fills the reserved reading slots from GET /api/live when the
 *    data is fresh (else one sentence says readings are unavailable), with the provider's
 *    attribution from the payload;
 *  - survey strips ([data-strip]): previous/next buttons on pointer devices (the strip itself
 *    scrolls natively: swipe, wheel, keyboard).
 */
import { getLive, isFresh } from './livefeed';
import { isMotionOff } from './motion';
import { tc, lang } from '../i18n/client';
import { compass, time } from '../i18n/format';

export function initHome(): void {
  initLog();
  initStrips();
}

function initLog() {
  const root = document.querySelector<HTMLElement>('[data-home-live]');
  if (!root) return;
  const set = (sel: string, v: string) => { const el = root.querySelector<HTMLElement>(sel); if (el) el.textContent = v; };
  getLive().then((l) => {
    const L = lang();
    if (!isFresh(l)) { root.dataset.state = 'off'; set('[data-live-label]', tc('home.live.off')); return; }
    root.dataset.state = 'ready';
    const w = l.weather!;
    set('[data-live-big]', String(Math.round(w.temp)));
    set('[data-live-label]', L === 'sq' ? w.label_sq : w.label_en);
    set('[data-live-wind]', `${compass(w.wind_dir, L)} ${Math.round(w.wind_kmh)} km/h`);
    if (l.marine?.sea_temp != null) set('[data-live-sea]', `${Math.round(l.marine.sea_temp)} °C`);
    if (l.sun) { set('[data-live-sunrise]', l.sun.sunrise); set('[data-live-sunset]', l.sun.sunset); }
    const stamp = root.querySelector<HTMLElement>('[data-live-stamp]');
    if (stamp) {
      stamp.textContent = `${tc('live.updated', { time: time(l.updated_at) })} · `;
      const a = document.createElement('a');
      a.href = l.attribution?.url || 'https://open-meteo.com/';
      a.rel = 'noopener';
      a.textContent = (L === 'sq' ? l.attribution?.sq : l.attribution?.en) || tc('live.source');
      stamp.append(a);
    }
  }).catch(() => { root.dataset.state = 'off'; set('[data-live-label]', tc('home.live.off')); });
}

function initStrips() {
  document.querySelectorAll<HTMLElement>('[data-strip]').forEach((strip) => {
    const nav = strip.parentElement?.querySelector<HTMLElement>('[data-strip-nav]');
    if (!nav || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (strip.scrollWidth <= strip.clientWidth + 8) return;
    nav.hidden = false;
    const step = (dir: 1 | -1) => {
      const card = strip.querySelector<HTMLElement>('li');
      const by = (card?.offsetWidth ?? 300) + 24;
      strip.scrollBy({ left: dir * by, behavior: isMotionOff() ? 'auto' : 'smooth' });
    };
    nav.querySelector('[data-strip-prev]')?.addEventListener('click', () => step(-1));
    nav.querySelector('[data-strip-next]')?.addEventListener('click', () => step(1));
  });
}
