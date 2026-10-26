/**
 * chart-signature.ts — "Laguna vizatohet" (DESIGN §4), the home's signature moment.
 *
 * One GSAP timeline scrubbed by ScrollTrigger over the tall track of [data-sig] (the stage is
 * CSS-sticky: no ScrollTrigger pin, no pin-spacer). The scrub starts when the stage sticks, so
 * the coast draws on the pinned stage. Phases, in timeline units:
 *   0–18    the coast draws Shkumbin → Seman (DrawSVG), the lagoon shore closes, the layers and
 *           waterlines come in one by one, "Laguna e Karavastasë" letters itself (SplitText)
 *   18–108  five stops of 18 units: the camera flies (a transform on the chart group, never the
 *           viewBox), the route leg grows, the pin drops with one ripple, the leader tag opens,
 *           a card is dealt from the right (a bottom sheet on phones) and holds ~11 units
 *   108–117 zoom out to every pin; the end panel with "Shiko si listë"
 * Rules (DESIGN §7, README → Motion): motion only through scripts/motion.ts, gsap.ticker is the
 * only rAF owner (no requestAnimationFrame here), transforms/opacity/clip-path only, at most two
 * DrawSVG paths at once, no filters. Each update writes only (geometry is measured on
 * ScrollTrigger refresh), and nothing is written when the camera did not move.
 * Stop-animations / reduced motion: onMotion() reverts everything → the finished chart + list,
 * and a reader who was inside the chart is put back at its start (the tall track collapses).
 */
import { onMotion, onMotionChange, gsap, ScrollTrigger, SplitText, scrollToTarget, isMotionOff } from './motion';

interface StopData { key: string; x: number; y: number; r: number; closed: boolean }
interface Geom { W: number; H: number; bx: number; by: number; k: number; phone: boolean; cardW: number; pad: number; endH: number; footY: number; lagoonW: number }
interface Cam { z: number; ux: number; uy: number; fx: number; fy: number }

const T = { draw: 18, stop: 18 }; // timeline units
/** inside a stop: when the card is dealt in, and when it starts to leave */
const CARD = { in: 3.4, inDur: 1.8, out: T.stop - 1.4, outDur: 1.2 };

type SigRoot = HTMLElement & { _sigSync?: () => void };

export function initSignature(): void {
  const root = document.querySelector<SigRoot>('[data-sig]');
  if (!root) return;
  initListAndSkip(root);
  onMotion(() => setup(root));
}

/* ---------------- list toggle + skip (work with motion on and off) ---------------- */

function initListAndSkip(root: SigRoot) {
  const list = root.querySelector<HTMLElement>('[data-sig-list]');
  const after = root.querySelector<HTMLElement>('#pas-hartes');
  const openers = [...root.querySelectorAll<HTMLElement>('[data-sig-list-open]')];
  // while the chart plays, CSS hides the list until it is opened (.is-open); motion off shows it
  const shown = () => !!list && (list.classList.contains('is-open') || getComputedStyle(list).display !== 'none');
  const sync = () => openers.forEach((o) => o.setAttribute('aria-expanded', String(shown())));
  const open = (e?: Event) => {
    if (!list) return;
    e?.preventDefault();
    const grew = !list.classList.contains('is-open') && !isMotionOff();
    list.classList.add('is-open');
    sync();
    // the page just grew: every trigger below the chart needs its new start
    if (grew) ScrollTrigger.refresh();
    scrollToTarget(list, { immediate: true });
    list.focus({ preventScroll: true });
    if (location.hash !== '#harta-liste') history.replaceState(null, '', '#harta-liste');
  };
  openers.forEach((o) => o.addEventListener('click', open));
  // "Fshih listën": the list folds away and the reader is back at the chart's last frame
  root.querySelector<HTMLElement>('[data-sig-list-close]')?.addEventListener('click', () => {
    if (!list || isMotionOff()) return;
    const track = root.querySelector<HTMLElement>('[data-sig-track]');
    const y = track ? Math.max(0, scrollY + track.getBoundingClientRect().bottom - innerHeight) : null;
    list.classList.remove('is-open');
    sync();
    ScrollTrigger.refresh();
    if (y != null) scrollToTarget(y, { immediate: true });
    if (location.hash === '#harta-liste') history.replaceState(null, '', location.pathname + location.search);
    openers.at(-1)?.focus({ preventScroll: true });
  });
  root.querySelectorAll<HTMLAnchorElement>('[data-sig-skip]').forEach((a) => a.addEventListener('click', (e) => {
    if (!after) return;
    e.preventDefault();
    scrollToTarget(after, { immediate: true });
    after.focus({ preventScroll: true });
  }));
  window.addEventListener('hashchange', () => { if (location.hash === '#harta-liste') open(); });
  if (location.hash === '#harta-liste') open();
  root._sigSync = sync;
  sync();
}

/* ---------------- the scrubbed chart ---------------- */

function setup(root: SigRoot) {
  const stage = root.querySelector<HTMLElement>('[data-sig-stage]');
  const track = root.querySelector<HTMLElement>('[data-sig-track]');
  const fig = root.querySelector<HTMLElement>('[data-chart]');
  const box = fig?.querySelector<HTMLElement>('.chart__box');
  const svg = fig?.querySelector<SVGSVGElement>('svg');
  const cam = fig?.querySelector<SVGGElement>('[data-chart-cam]');
  if (!stage || !track || !fig || !box || !svg || !cam) return;
  // the stage is only sticky when the CSS live mode applies (motion on, JS on)
  if (getComputedStyle(stage).position !== 'sticky') return;

  const [cx, cy, cw] = (fig.dataset.crop ?? '0 0 1000 1360').split(' ').map(Number);
  const upk = Number(fig.dataset.upk) || 46.68;
  const stops: StopData[] = JSON.parse(root.dataset.stops || '[]');
  const cards = [...root.querySelectorAll<HTMLElement>('[data-card]')];
  const intro = root.querySelector<HTMLElement>('[data-sig-intro]');
  const end = root.querySelector<HTMLElement>('[data-sig-end]');
  const count = root.querySelector<HTMLElement>('[data-sig-count]');
  const bar = root.querySelector<HTMLElement>('[data-sig-bar]');
  const coast = fig.querySelector<SVGPathElement>('[data-draw="coast"]');
  const shore = fig.querySelector<SVGPathElement>('[data-draw="shore"]');
  const legs = [...fig.querySelectorAll<SVGLineElement>('[data-leg]')];
  const pins = stops.map((s) => fig.querySelector<HTMLElement>(`[data-pin="stop-${s.key}"]`));
  const overlay = [...fig.querySelectorAll<HTMLElement>('[data-pin], [data-letter]')].map((el) => ({ el, x: Number(el.dataset.x), y: Number(el.dataset.y) }));
  const scaleBar = fig.querySelector<HTMLElement>('.chart__scale-bar');
  const scaleLabel = fig.querySelector<HTMLElement>('.chart__scale-label');
  const scaleLabelText = scaleLabel?.textContent ?? '';
  const KM_STEPS = [0.5, 1, 2, 5, 10];
  const decimal = document.documentElement.lang === 'sq' ? ',' : '.';
  let lastKm = 0;
  const lagoonLetter = fig.querySelector<HTMLElement>('[data-letter="lagoon"]');
  const lagoonText = lagoonLetter?.querySelector<HTMLElement>('[data-letter-text]') ?? null;
  // the water label fits its open-water run (chart units) at every zoom: never across the shore
  const lagoonRun = Number(lagoonLetter?.dataset.w) || 0;
  const lagoonY = Number(lagoonLetter?.dataset.y) || 0;
  let lastLagoonScale = '';
  const layer = (name: string) => fig.querySelector<SVGElement>(`[data-layer="${name}"]`);
  const letter = (key: string) => fig.querySelector<HTMLElement>(`[data-letter="${key}"]`);

  root.classList.add('is-live');
  fig.classList.add('is-live');
  root._sigSync?.();

  const mqPhone = matchMedia('(max-width: 899px)');
  let stickTop = 0;
  let G: Geom = measure();
  const C: Cam = { z: 1, ux: cx + cw / 2, uy: 700, fx: 0.5, fy: 0.5 };

  function measure(): Geom {
    const s = stage!.getBoundingClientRect(), b = box!.getBoundingClientRect();
    const foot = fig!.querySelector<HTMLElement>('.chart__foot')?.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(root).getPropertyValue('--sig-pad')) || Math.max(16, innerWidth * 0.04);
    stickTop = parseFloat(getComputedStyle(stage!).top) || 0;
    return { W: s.width, H: s.height, bx: b.left - s.left, by: b.top - s.top, k: b.width / cw, phone: mqPhone.matches, cardW: cards[0]?.offsetWidth ?? 380, pad, endH: end?.offsetHeight ?? 0, footY: foot && foot.height ? foot.top - s.top : s.height - 112, lagoonW: lagoonText?.offsetWidth ?? 0 };
  }

  // camera views, in chart units + where on the stage the focus point sits
  const fit = (w: number, h: number, aw: number, ah: number) => Math.min(aw / (G.k * w), ah / (G.k * h));
  const baseView = (): Cam => {
    const aw = G.phone ? G.W * 0.94 : G.W * 0.56, ah = G.phone ? G.H * 0.6 : G.H * 0.94;
    // the whole coast, Shkumbin to Seman, and the lagoon
    return { z: fit(660, 1150, aw, ah), ux: 395, uy: 676, fx: G.phone ? 0.5 : 0.68, fy: G.phone ? 0.64 : 0.5 };
  };
  const stopView = (s: StopData): Cam => {
    if (G.phone) return { z: fit(2 * s.r, 2 * s.r, G.W * 0.96, G.H * 0.4), ux: s.x, uy: s.y, fx: 0.5, fy: 0.25 };
    const aw = G.W - G.cardW - G.pad * 3;
    return { z: fit(2 * s.r, 2 * s.r, aw, G.H * 0.9), ux: s.x, uy: s.y, fx: (G.pad + aw / 2) / G.W, fy: 0.5 };
  };
  const endView = (): Cam => {
    const xs = stops.map((s) => s.x), ys = stops.map((s) => s.y);
    const x0 = Math.min(...xs) - 70, x1 = Math.max(...xs) + 90, y0 = Math.min(...ys) - 60, y1 = Math.max(...ys) + 60;
    if (G.phone) {
      // phones: every pin between the end panel (top) and the foot row + Pyet pill (bottom)
      const top = 12 + G.endH + 20, bottom = Math.min(G.H - 112, G.footY + 6);
      const ah = Math.max(120, bottom - top);
      return { z: fit(x1 - x0, y1 - y0, G.W * 0.9, ah), ux: (x0 + x1) / 2, uy: (y0 + y1) / 2, fx: 0.5, fy: (top + ah / 2) / G.H };
    }
    return { z: fit(x1 - x0, y1 - y0, G.W * 0.5, G.H * 0.86), ux: (x0 + x1) / 2, uy: (y0 + y1) / 2, fx: 0.68, fy: 0.5 };
  };
  const camTo = (view: () => Cam) => ({
    z: () => view().z, ux: () => view().ux, uy: () => view().uy, fx: () => view().fx, fy: () => view().fy,
  });

  /* ---- per-frame write (no reads) ---- */
  let last = '';
  let activePin = -2;
  let activeCard = -2;
  let wasInside = false;
  let introFaded = false;
  const n = stops.length;
  const endAt = T.draw + n * T.stop;
  const stopAt = (i: number) => T.draw + i * T.stop;
  function setPin(i: number) {
    activePin = i;
    pins.forEach((p, j) => { p?.classList.toggle('is-active', j === i); p?.classList.toggle('is-selected', j === i); });
    if (count) count.textContent = String(i >= 0 ? i + 1 : tl.time() >= endAt ? n : 0).padStart(2, '0');
  }
  // the card is interactive (and the phone's Pyet pill steps aside) exactly while it is on screen
  function setCard(i: number) {
    activeCard = i;
    cards.forEach((c, j) => { c.inert = j !== i; });
    document.documentElement.classList.toggle('sig-card-on', i >= 0);
  }
  function apply() {
    const tx = (C.fx * G.W - G.bx) / G.k + cx - C.z * C.ux;
    const ty = (C.fy * G.H - G.by) / G.k + cy - C.z * C.uy;
    const key = `${tx.toFixed(2)} ${ty.toFixed(2)} ${C.z.toFixed(4)}`;
    if (key !== last) {
      last = key;
      cam!.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${C.z.toFixed(4)})`);
      for (const o of overlay) {
        o.el.style.translate = `${(G.k * (tx + (C.z - 1) * o.x)).toFixed(1)}px ${(G.k * (ty + (C.z - 1) * o.y)).toFixed(1)}px`;
      }
      // drawn strokes keep their pixel width (no non-scaling-stroke: DrawSVG measures in user units)
      const u = 1 / (G.k * C.z);
      if (coast) coast.style.strokeWidth = `${(1.6 * u).toFixed(3)}`;
      if (shore) shore.style.strokeWidth = `${(1.3 * u).toFixed(3)}`;
      if (lagoonText && lagoonRun && G.lagoonW) {
        // below ~0.58 the italic is too small to read (320 px phones at the whole-coast view): the
        // label waits for a closer zoom instead of crossing the shore
        const fitK = (0.8 * lagoonRun * G.k * C.z) / G.lagoonW;
        const sc = fitK < 0.58 ? 'off' : Math.min(1, fitK).toFixed(3);
        if (sc !== lastLagoonScale) {
          lastLagoonScale = sc;
          lagoonText.style.visibility = sc === 'off' ? 'hidden' : '';
          if (sc !== 'off') lagoonText.style.scale = sc;
        }
      }
      if (scaleBar) {
        // a 100 px bar scaled to a round distance between 60 and 150 px
        const pxKm = G.k * C.z * upk;
        const km = KM_STEPS.find((v) => v * pxKm >= (G.phone ? 44 : 60)) ?? 10;
        scaleBar.style.scale = `${((km * pxKm) / 100).toFixed(4)} 1`;
        if (km !== lastKm && scaleLabel) { lastKm = km; scaleLabel.textContent = `0 — ${String(km).replace('.', decimal)} km`; }
      }
    }
    const t = tl.time();
    const p = t < T.draw + 2.5 || t >= endAt ? -1 : Math.min(n - 1, Math.floor((t - T.draw - 2.5) / T.stop));
    if (p !== activePin) setPin(p);
    const ci = t < T.draw || t >= endAt ? -1 : Math.floor((t - T.draw) / T.stop);
    const local = t - stopAt(ci);
    const c = ci >= 0 && local >= CARD.in + 0.2 && local < CARD.out + CARD.outDur * 0.8 ? ci : -1;
    if (c !== activeCard) setCard(c);
    // once the intro has faded it must not take taps or show a link cursor over the chart
    // (CSS gives it back to keyboard focus with :focus-within)
    const faded = t >= T.draw - 0.4;
    if (faded !== introFaded) { introFaded = faded; intro?.classList.toggle('is-faded', faded); }
    const st = tl.scrollTrigger;
    wasInside = !!st && st.progress > 0 && st.progress < 1;
    if (bar) bar.style.transform = `scaleX(${tl.progress().toFixed(3)})`;
  }

  /* ---- the timeline ---- */
  let tl: gsap.core.Timeline;

  function sizeScale() {
    if (!scaleBar) return;
    scaleBar.style.inlineSize = '100px';
    scaleBar.style.minInlineSize = '0';
  }

  function build() {
    G = measure();
    sizeScale();
    const split = lagoonText ? SplitText.create(lagoonText, { type: 'chars', charsClass: 'sig-char' }) : null;
    tl = gsap.timeline({
      defaults: { ease: 'none' },
      onUpdate: apply,
      // from the moment the stage sticks (under the header) to the end of the track
      scrollTrigger: { trigger: track, start: () => `top ${stickTop}px`, end: 'bottom bottom', scrub: 0.6, invalidateOnRefresh: true },
    });
    tl.set(C, camTo(baseView), 0);

    // 0–18: the coast, the shore, the layers, the waterlines, the water label
    if (coast) tl.fromTo(coast, { drawSVG: '0%' }, { drawSVG: '100%', duration: 10, ease: 'power1.inOut' }, 0.3);
    if (shore) tl.fromTo(shore, { drawSVG: '0%' }, { drawSVG: '100%', duration: 8, ease: 'power1.inOut' }, 7.5);
    const fade = (el: Element | null, at: number, d = 3) => { if (el) tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: d }, at); };
    fade(layer('sea'), 3, 4);
    fade(layer('park'), 5, 3);
    fade(layer('forest'), 6.5, 4);
    fade(layer('rivers'), 8, 2.5);
    fade(layer('roads'), 9, 2.5);
    fade(layer('waters'), 9, 2.5);
    fade(layer('water'), 11, 3);
    fade(layer('islets'), 13.5, 2);
    fig!.querySelectorAll('[data-waterline]').forEach((w, i) => fade(w, 12.5 + i * 1.3, 1.5));
    const letters = ['sea', 'shkumbin', 'seman', 'divjake'].map(letter).filter(Boolean) as HTMLElement[];
    letters.forEach((l, i) => fade(l, 5 + i * 2, 2));
    if (split?.chars.length) {
      tl.set(letter('lagoon'), { opacity: 1 }, 0);
      // every letter hidden from the first frame (a staggered fromTo only pre-renders the first)
      tl.set(split.chars, { opacity: 0, yPercent: 40 }, 0);
      tl.to(split.chars, { opacity: 1, yPercent: 0, duration: 0.6, stagger: 0.15, ease: 'power2.out' }, 14);
    }
    fade(layer('route'), 0, 0.01);
    legs.forEach((leg) => {
      const x1 = Number(leg.getAttribute('x1')), y1 = Number(leg.getAttribute('y1'));
      tl.set(leg, { attr: { x2: x1, y2: y1 } }, 0);
    });
    stops.forEach((_, i) => {
      const p = pins[i];
      if (!p) return;
      tl.set(p.querySelector('.cpin__mark'), { autoAlpha: 0 }, 0);
      tl.set(p.querySelector('.cpin__tag'), { autoAlpha: 0 }, 0);
    });
    fig!.querySelectorAll('[data-zone]').forEach((z) => tl.set(z, { opacity: 0 }, 0));
    // opacity only: its heading stays in the accessibility tree and its links stay reachable (CSS shows it on focus)
    if (intro) tl.to(intro, { opacity: 0, duration: 2 }, T.draw - 1);
    const quiet = [letter('lagoon'), letter('sea'), letter('divjake'), letter('shkumbin'), letter('seman')].filter(Boolean);
    tl.to(quiet, { opacity: 0, duration: 2 }, T.draw + 1.5);

    // 18–108: the stops
    stops.forEach((s, i) => {
      const at = stopAt(i);
      const pin = pins[i], card = cards[i];
      tl.to(C, { ...camTo(() => stopView(s)), duration: 3.5, ease: 'power2.inOut' }, at);
      const leg = legs[i - 1];
      if (leg && !s.closed) tl.to(leg, { attr: { x2: s.x, y2: s.y }, duration: 3.5, ease: 'power2.inOut' }, at);
      if (pin) {
        const tag = pin.querySelector('.cpin__tag');
        const left = pin.classList.contains('cpin--left');
        tl.fromTo(pin.querySelector('.cpin__mark'), { y: -16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1, ease: 'power2.out', immediateRender: false }, at + 2.5);
        tl.fromTo(pin.querySelector('.cpin__ripple'), { scale: 1, opacity: 0.9 }, { scale: 2.8, opacity: 0, duration: 2, ease: 'power1.out', immediateRender: false }, at + 3.2);
        if (tag) tl.fromTo(tag, { autoAlpha: 1, clipPath: left ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, ease: 'power2.out', immediateRender: false }, at + 3.2);
      }
      const zone = s.closed ? fig!.querySelector(`[data-zone="stop-${s.key}"]`) : null;
      if (zone) tl.to(zone, { opacity: 1, duration: 1.5 }, at + 2.8);
      if (card) {
        const from = G.phone ? { yPercent: 104, autoAlpha: 1 } : { xPercent: 115, rotation: 2.5, autoAlpha: 0 };
        tl.fromTo(card, from, { xPercent: 0, yPercent: 0, rotation: 0, autoAlpha: 1, duration: CARD.inDur, ease: 'power3.out', immediateRender: false }, at + CARD.in);
        const out = G.phone ? { yPercent: 104, duration: CARD.outDur, ease: 'power2.in' } : { xPercent: -8, autoAlpha: 0, duration: CARD.outDur, ease: 'power2.in' };
        tl.to(card, out, at + CARD.out);
        if (G.phone) tl.set(card, { autoAlpha: 0 }, at + T.stop - 0.1);
      }
    });

    // 108–117: every pin, the whole lagoon, the end panel
    tl.to(C, { ...camTo(endView), duration: 5, ease: 'power2.inOut' }, endAt);
    const ev = endView();
    // phones: the water label comes back only when it sits clear of the end panel and the foot band
    const lagoonSy = ev.fy * G.H + G.k * ev.z * (lagoonY - ev.uy);
    const lagoonFits = !G.phone || (lagoonSy - 18 > 12 + G.endH && lagoonSy + 18 < G.footY + 6);
    tl.to([lagoonFits && letter('lagoon'), letter('divjake')].filter(Boolean), { opacity: 1, duration: 2 }, endAt + 3);
    if (end) tl.fromTo(end, { autoAlpha: 0 }, { autoAlpha: 1, duration: 2, immediateRender: false }, endAt + 3.5);
    tl.to({}, { duration: 3 }, endAt + 5.5); // hold
  }

  const onRefreshInit = () => { if (lagoonText) lagoonText.style.scale = ''; lastLagoonScale = ''; G = measure(); sizeScale(); last = ''; };
  const onRefresh = () => { last = ''; apply(); };
  // everything build() creates is recorded in ctx, so a rebuild (phone ↔ desktop) and the
  // cleanup revert it all, the SplitText included
  const ctx = gsap.context(() => {});
  const onPhone = () => { ctx.revert(); revertInline(); ctx.add(build); ScrollTrigger.refresh(); };
  function revertInline() {
    cam!.removeAttribute('transform');
    overlay.forEach((o) => { o.el.style.translate = ''; });
    if (coast) coast.style.strokeWidth = '';
    if (shore) shore.style.strokeWidth = '';
    last = ''; activePin = -2; activeCard = -2; lastLagoonScale = ''; introFaded = false;
    if (lagoonText) { lagoonText.style.scale = ''; lagoonText.style.visibility = ''; }
    intro?.classList.remove('is-faded');
  }

  ctx.add(build);
  apply();
  ScrollTrigger.addEventListener('refreshInit', onRefreshInit);
  ScrollTrigger.addEventListener('refresh', onRefresh);
  mqPhone.addEventListener('change', onPhone);

  return () => {
    // Stop pressed while reading the chart: html[data-motion=off] has already collapsed the tall
    // track, so the state recorded while motion was on decides (measuring now would always say
    // "outside"). Once Lenis and ScrollTrigger are gone, the reader goes back to the chart.
    const st = tl?.scrollTrigger;
    const inside = wasInside || (!!st && st.progress > 0 && st.progress < 1);
    ScrollTrigger.removeEventListener('refreshInit', onRefreshInit);
    ScrollTrigger.removeEventListener('refresh', onRefresh);
    mqPhone.removeEventListener('change', onPhone);
    ctx.revert();
    revertInline();
    if (scaleBar) { scaleBar.style.scale = ''; scaleBar.style.inlineSize = ''; scaleBar.style.minInlineSize = ''; }
    if (scaleLabel && scaleLabelText) scaleLabel.textContent = scaleLabelText;
    pins.forEach((p) => p?.classList.remove('is-active', 'is-selected'));
    cards.forEach((c) => { c.inert = false; });
    document.documentElement.classList.remove('sig-card-on');
    if (bar) bar.style.transform = '';
    root.classList.remove('is-live');
    fig.classList.remove('is-live');
    root._sigSync?.();
    if (inside) {
      const stop = onMotionChange((off) => {
        stop();
        // native jump (Lenis is destroyed by now); scrollIntoView honours scroll-padding-top
        if (off) root.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
    }
  };
}
