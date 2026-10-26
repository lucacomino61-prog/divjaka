/**
 * home.ts — the home's small behaviours (the signature, the verse and the recommendation rail
 * load their own modules):
 *  - today's log ([data-home-live]): fills the reserved reading slots from GET /api/live when the
 *    data is fresh (else one sentence says readings are unavailable), with the provider's
 *    attribution from the payload;
 *  - survey strips ([data-strip]): previous/next buttons on pointer devices (the strip itself
 *    scrolls natively: swipe, wheel, keyboard).
 */
import { getLive, isFresh, type Live } from './livefeed';
import { isMotionOff } from './motion';
import { tc, lang } from '../i18n/client';
import { path } from '../i18n/routes';
import { compass, daysBetween, formatDate, time, todayISO } from '../i18n/format';

/** /api/live fields T7 added (src/lib/live.ts) that livefeed's shared type does not list yet */
export interface LiveSource { key: string; sq: string; en: string; url: string; license: string; license_url?: string }
export type LiveX = Live & { marine: (Live['marine'] & { sea_date?: string | null }) | null; sources?: LiveSource[] };

export function initHome(): void {
  initLog();
  initStrips();
}

function initLog() {
  const root = document.querySelector<HTMLElement>('[data-home-live]');
  if (!root) return;
  const set = (sel: string, v: string) => { const el = root.querySelector<HTMLElement>(sel); if (el) el.textContent = v; };
  // no reading: the slots keep their size (a dash in the big slot), so nothing below moves
  const off = () => { root.dataset.state = 'off'; set('[data-live-big]', '—'); set('[data-live-label]', tc('home.live.off')); };
  getLive().then((l) => {
    const L = lang();
    if (!isFresh(l)) { off(); return; }
    root.dataset.state = 'ready';
    const w = l.weather!;
    set('[data-live-big]', String(Math.round(w.temp)));
    set('[data-live-label]', L === 'sq' ? w.label_sq : w.label_en);
    set('[data-live-wind]', `${compass(w.wind_dir, L)} ${Math.round(w.wind_kmh)} km/h`);
    // the sea value is a dated satellite analysis (NASA JPL MUR, about a day behind), never "now":
    // it carries its date, and is left out when that date is more than two days old
    const sea = l.marine?.sea_temp;
    const seaDate = (l as LiveX).marine?.sea_date ?? null;
    const seaAge = seaDate ? daysBetween(seaDate.slice(0, 10), todayISO()) : Infinity;
    const seaShown = sea != null && seaDate != null && seaAge <= 2;
    if (seaShown) {
      set('[data-live-sea]', `${Math.round(sea!)} °C`);
      set('[data-live-sea-note]', tc('home.live.sea.sat', { date: formatDate(seaDate!.slice(0, 10), L, 'day-month') }));
    }
    if (l.sun) { set('[data-live-sunrise]', l.sun.sunrise); set('[data-live-sunset]', l.sun.sunset); }
    const stamp = root.querySelector<HTMLElement>('[data-live-stamp]');
    if (stamp) {
      stamp.textContent = tc('live.updated', { time: time(l.updated_at) });
      // every provider whose reading is on show, each linked, with its licence
      const sources = ((l as LiveX).sources ?? []).filter((s) => s.key !== 'air' && (s.key !== 'sea' || seaShown));
      const list = sources.length ? sources : [{ sq: l.attribution?.sq || tc('live.source'), en: l.attribution?.en || tc('live.source'), url: l.attribution?.url || '', license: '' }];
      for (const s of list) {
        stamp.append(' · ');
        const a = document.createElement('a');
        // without the provider's own link, point at the credits page's weather entry
        a.href = s.url || `${path('credits', L)}#moti`;
        a.rel = 'noopener';
        const licence = /^public domain$/i.test(s.license) ? tc('home.live.pd') : s.license;
        a.textContent = `${L === 'sq' ? s.sq : s.en}${licence ? ` (${licence})` : ''}`;
        stamp.append(a);
      }
    }
  }).catch(off);
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
