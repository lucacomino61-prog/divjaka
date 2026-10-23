/**
 * ticker.ts — the logbook ticker strip (DESIGN §3 Header, Vazzi). Real data only: the Divjakë
 * clock always; weather/sea/sun/rooms/season only when /api/live is fresh. The strip moves by
 * a CSS transform written from gsap.ticker (no own rAF), pauses on hover, focus, hidden tab and
 * the Stop switch; with motion off it becomes a still line that scrolls (focusable, edge fade).
 * When /api/live fails or is stale the strip stays as the Divjakë clock only (real data; hiding
 * it would move the header 32 px after load — logged in HANDOFF for DESIGN §3). "Rooms free tonight"
 * appears only when /api/live sets availability_today.rooms_verified (never for demo counts).
 */
import { gsap, onMotion, onMotionChange, isMotionOff } from './motion';
import { getLive, isFresh, type Live } from './livefeed';
import { tc, lang } from '../i18n/client';
import { tirane, time, compass, number } from '../i18n/format';

const SPEED = 38; // px per second — "scrolling slowly"

function items(l: Live | null): string[] {
  const L = lang();
  const out = [tc('live.clock', { time: tirane().time })];
  if (!isFresh(l)) return out;
  const w = l.weather!;
  out.push(tc('live.temp', { t: Math.round(w.temp) }));
  out.push(lang() === 'sq' ? w.label_sq : w.label_en);
  out.push(tc('live.wind', { dir: compass(w.wind_dir, L), v: Math.round(w.wind_kmh) }));
  if (l.marine?.sea_temp != null) out.push(tc('live.sea', { t: Math.round(l.marine.sea_temp) }));
  if (l.sun) {
    // the next sun event only: sunrise before dawn, sunset during the day, nothing after dark
    // (today's sunset is no longer a reading at 21:00; tomorrow's sunrise is not in the feed)
    const now = tirane().time;
    if (now < l.sun.sunrise) out.push(tc('live.sunrise', { time: time(l.sun.sunrise) }));
    else if (now < l.sun.sunset) out.push(tc('live.sunset', { time: time(l.sun.sunset) }));
  }
  if (w.uv != null && w.is_day) out.push(tc('live.uv', { v: number(w.uv, L, w.uv < 10 ? 1 : 0) }));
  // rooms tonight only once the owner's unit counts are real: the seeded counts are demo values
  // (NEEDS_VERIFICATION) and PLAN §2 / DESIGN §10 forbid presenting them as a live fact
  const a = l.availability_today;
  if (a?.rooms_verified === true && a.rooms_left != null && a.rooms_left > 0) {
    out.push(tc('live.rooms', { n: a.rooms_left }));
  }
  // a one-line mono log: each season item cut to its short label (the text before " (…)")
  const season = l.season_now?.items?.slice(0, 3)
    .map((s) => (L === 'sq' ? s.sq : s.en)?.split(' (')[0].trim())
    .filter(Boolean);
  if (season?.length) out.push(tc('live.season', { items: season.join(', ') }));
  return out;
}

export function initTicker() {
  const root = document.querySelector<HTMLElement>('[data-ticker]');
  if (!root) return;
  const track = root.querySelector<HTMLElement>('[data-ticker-track]');
  const first = root.querySelector<HTMLElement>('[data-ticker-line]');
  const viewport = root.querySelector<HTMLElement>('.ticker__viewport');
  if (!track || !first || !viewport) return;

  let live: Live | null = null;
  let lineW = 0, x = 0, hovering = false, focused = false;
  // the strip scrolls away under the sticky header: off screen, no transform is written (a
  // JS-written transform costs a compositor update every frame while the visitor scrolls)
  let onScreen = true;
  // (-1 px top margin: parked at top:-32px the strip only touches the viewport edge, which an
  // observer still counts as intersecting)
  new IntersectionObserver((entries) => { onScreen = entries[entries.length - 1].isIntersecting; }, { rootMargin: '-1px 0px 0px 0px' }).observe(root);

  const render = () => {
    const parts = items(live);
    first.replaceChildren(...parts.flatMap((p, i) => {
      const s = document.createElement('span');
      s.className = 'ticker__item';
      s.textContent = p;
      if (i === 0) s.dataset.tickerClock = '';
      return [s];
    }));
    root.classList.toggle('is-live', isFresh(live));
    layout();
  };

  const unfocusable = () => { viewport.removeAttribute('tabindex'); viewport.removeAttribute('role'); viewport.removeAttribute('aria-label'); };
  const layout = () => {
    track.querySelectorAll('[data-ticker-clone]').forEach((n) => n.remove());
    const moving = root.classList.contains('is-live') && !isMotionOff();
    root.classList.toggle('is-moving', moving);
    if (!moving) {
      track.style.transform = ''; x = 0; lineW = 0;
      // still (Stop / reduced motion): a scrollable line — focusable for the keyboard, with an
      // edge fade + thin scrollbar as the sign that more readings follow
      const over = viewport.scrollWidth > viewport.clientWidth + 1;   // read
      root.classList.toggle('is-overflow', over);                      // write
      // a keyboard stop needs a name: the viewport is a named group (the strip's own label)
      if (over) {
        viewport.tabIndex = 0;
        viewport.setAttribute('role', 'group');
        viewport.setAttribute('aria-label', root.getAttribute('aria-label') || '');
      } else unfocusable();
      return;
    }
    root.classList.remove('is-overflow');
    unfocusable();
    viewport.scrollLeft = 0;
    lineW = first.offsetWidth;                         // read
    const copies = Math.max(1, Math.ceil(root.clientWidth / Math.max(lineW, 1)) + 1);
    for (let i = 0; i < copies; i++) {                // write
      const c = first.cloneNode(true) as HTMLElement;
      c.setAttribute('aria-hidden', 'true');
      c.removeAttribute('data-ticker-line');
      c.dataset.tickerClone = '';
      track.append(c);
    }
  };

  const step = (_t: number, dt: number) => {
    if (hovering || focused || !onScreen || !lineW) return;
    x -= (SPEED * Math.min(dt, 64)) / 1000;
    if (x <= -lineW) x += lineW;
    track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
  };

  root.addEventListener('pointerenter', () => { hovering = true; });
  root.addEventListener('pointerleave', () => { hovering = false; });
  root.addEventListener('focusin', () => { focused = true; });
  root.addEventListener('focusout', () => { focused = false; });
  // The pause control is the header's Stop switch (shown at every width): it stops the strip
  // with everything else, and the strip still pauses on hover/focus.
  onMotion(() => {
    layout();
    gsap.ticker.add(step);
    return () => { gsap.ticker.remove(step); };
  });
  // any change of the effective state (Stop switch, prefers-reduced-motion flipping at runtime,
  // another tab): on → onMotion re-runs the setup above; off → a still, scrollable line
  onMotionChange(() => layout());

  let resizeT = 0;
  new ResizeObserver(() => { clearTimeout(resizeT); resizeT = window.setTimeout(layout, 150); }).observe(root);

  // the clock: re-render on each minute boundary (setTimeout, not a frame loop)
  const tickClock = () => {
    const clock = first.querySelector('[data-ticker-clock]');
    const text = tc('live.clock', { time: tirane().time });
    if (clock && clock.textContent !== text) {
      clock.textContent = text;
      track.querySelectorAll('[data-ticker-clone] [data-ticker-clock]').forEach((c) => { c.textContent = text; });
    }
    const now = new Date();
    setTimeout(tickClock, (60 - now.getSeconds()) * 1000 + 50);
  };
  tickClock();

  getLive().then((l) => { live = l; render(); });
}
