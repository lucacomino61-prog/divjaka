/**
 * motion.ts — THE motion engine (DESIGN "Engine line", PLAN §3). Import from here, never
 * from 'gsap' or 'lenis' directly, so plugins are registered once and the rules hold:
 *
 *  - gsap.ticker is the only requestAnimationFrame owner. Lenis runs with autoRaf:false and is
 *    stepped from the ticker; lagSmoothing(0). Nothing else may call requestAnimationFrame.
 *  - Motion is OFF when prefers-reduced-motion is set or html[data-motion="off"] (the Stop
 *    switch, persisted in localStorage 'dv-motion'). Off = no Lenis (native scroll), no scrubs,
 *    no reveals (finished states), no ticker strip movement, no VT animation, no loader; the
 *    GSAP ticker is put to sleep when idle (0 rAF calls/s).
 *  - Scroll choreography goes through onMotion(setup): setup runs inside a gsap.context while
 *    motion is on, is reverted (finished CSS state) when motion goes off, and runs again on resume.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin);
gsap.ticker.lagSmoothing(0);
gsap.defaults({ ease: 'power3.out', duration: 0.6 });
// Never call ScrollTrigger.config({...}) without syncInterval handling: in 3.15 it overwrites
// the handle of ScrollTrigger's 250 ms sync interval, which then survives ScrollTrigger.disable()
// and keeps scheduling rAF calls with motion stopped. ignoreMobileResize is already the default.

export { gsap, ScrollTrigger, SplitText, DrawSVGPlugin };

const html = document.documentElement;
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const mqFine = matchMedia('(hover: hover) and (pointer: fine)');
export const EASE_OUT = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

export function isMotionOff(): boolean {
  return html.dataset.motion === 'off' || mqReduce.matches;
}
export function isFinePointer(): boolean { return mqFine.matches; }

/* ---------------- Lenis on the GSAP ticker ---------------- */

let _lenis: Lenis | null = null;
const stepLenis = (time: number) => { _lenis?.raf(time * 1000); };

export function lenis(): Lenis | null { return _lenis; }

function startLenis() {
  if (_lenis || isMotionOff() || html.hasAttribute('data-no-lenis')) return;
  _lenis = new Lenis({
    autoRaf: false,
    lerp: 0.12,
    smoothWheel: true,
    syncTouch: false,
    // Lenis' own anchor handling (1.3.27) does not preventDefault: the browser jumps first and
    // Lenis then glides from the stale position (a visible snap-back). onAnchorClick() below
    // owns same-page hash links instead.
    anchors: false,
    stopInertiaOnNavigate: true,
    prevent: (node) => node.closest?.('dialog, [data-lenis-prevent]') !== null,
  });
  _lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add(stepLenis);
}
function stopLenis() {
  if (!_lenis) return;
  gsap.ticker.remove(stepLenis);
  _lenis.destroy();
  _lenis = null;
  html.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped');
}
/** Pause/resume smooth scroll (open dialogs). Safe when Lenis is off. */
export function lockScroll(lock: boolean) {
  if (lock) { _lenis?.stop(); html.classList.add('scroll-locked'); }
  else { _lenis?.start(); html.classList.remove('scroll-locked'); }
}
/** Jump or glide to a target, honouring motion settings. */
export function scrollToTarget(target: string | HTMLElement | number, opts: { immediate?: boolean } = {}) {
  if (_lenis) { _lenis.resize(); _lenis.scrollTo(target as never, { immediate: !!opts.immediate }); return; }
  if (typeof target === 'number') { window.scrollTo({ top: target, behavior: 'instant' }); return; }
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  el?.scrollIntoView({ behavior: 'instant', block: 'start' });
}

/*
 * Same-page hash links while Lenis runs: one delegated handler. It cancels the native jump,
 * glides with Lenis (scroll-padding-top is honoured by Lenis), then moves focus to the target
 * as the native jump would (tabindex=-1 when the target is not focusable — the skip link and
 * "back to top" rely on it) and records the hash in history. The skip link jumps at once.
 * With motion off (no Lenis) nothing is intercepted: the browser's own jump runs.
 */
function onAnchorClick(e: MouseEvent) {
  if (!_lenis || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.('a[href*="#"]') as HTMLAnchorElement | null;
  if (!a || a.target && a.target !== '_self' || a.hasAttribute('download')) return;
  if (a.closest('dialog')) return; // dialogs lock scroll; their own links close them first
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return;
  const id = decodeURIComponent(url.hash.slice(1));
  if (!id) return;
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  const done = () => {
    if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    if (location.hash !== url.hash) history.pushState(null, '', url.hash);
  };
  const immediate = a.classList.contains('skip-link');
  _lenis.resize();
  _lenis.scrollTo(id === 'top' ? 0 : el, { immediate, onComplete: done }); // onComplete also runs when immediate
}
document.addEventListener('click', onAnchorClick);

/* ---------------- motion-scoped setups ---------------- */

type Cleanup = void | (() => void);
type Setup = () => Cleanup;
const setups = new Map<Setup, { ctx: gsap.Context | null; cleanup: Cleanup }>();

function run(setup: Setup) {
  const rec = setups.get(setup)!;
  let cleanup: Cleanup = undefined;
  rec.ctx = gsap.context(() => { cleanup = setup(); });
  rec.cleanup = cleanup;
}
function revert(setup: Setup) {
  const rec = setups.get(setup);
  if (!rec) return;
  try { if (typeof rec.cleanup === 'function') rec.cleanup(); } catch (e) { console.error(e); }
  rec.ctx?.revert();
  rec.ctx = null; rec.cleanup = undefined;
}

/**
 * Register scroll choreography / loops. Runs now if motion is on, is reverted when it turns off
 * and runs again when it turns back on. Returns an unregister function.
 */
export function onMotion(setup: Setup): () => void {
  setups.set(setup, { ctx: null, cleanup: undefined });
  if (!isMotionOff()) run(setup);
  return () => { revert(setup); setups.delete(setup); };
}

type Listener = (off: boolean) => void;
const listeners = new Set<Listener>();
/** Called with `off` whenever the effective motion state changes. */
export function onMotionChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

let lastOff = isMotionOff();
let sleepTimer = 0;

function apply() {
  const off = isMotionOff();
  if (off === lastOff) return;
  lastOff = off;
  if (off) {
    for (const s of setups.keys()) revert(s);
    stopLenis();
    ScrollTrigger.getAll().forEach((st) => st.kill());
    ScrollTrigger.disable(); // also stops its empty keep-alive rAF loop (_rafBugFix)
    scheduleSleep();
  } else {
    clearTimeout(sleepTimer);
    ScrollTrigger.enable();
    gsap.ticker.wake();
    startLenis();
    for (const s of setups.keys()) run(s);
    ScrollTrigger.refresh();
  }
  listeners.forEach((cb) => { try { cb(off); } catch (e) { console.error(e); } });
}

/** With motion off, let the ticker sleep once short UI tweens have finished (0 rAF/s idle). */
function scheduleSleep() {
  clearTimeout(sleepTimer);
  sleepTimer = window.setTimeout(function check() {
    if (!isMotionOff()) return;
    const busy = gsap.globalTimeline.getChildren(true, true, false).some((a) => a.isActive());
    if (busy) { sleepTimer = window.setTimeout(check, 400); return; }
    gsap.ticker.sleep();
  }, 400);
}
/** Call after starting a UI tween while motion is off (the ticker wakes itself; this re-sleeps it). */
export function settle() { if (isMotionOff()) scheduleSleep(); }

/** The Stop switch. Persists, flips html[data-motion], emits 'dv:motion' {off}. */
export function setMotion(off: boolean) {
  try { off ? localStorage.setItem('dv-motion', 'off') : localStorage.removeItem('dv-motion'); } catch { /* private mode */ }
  if (off) html.dataset.motion = 'off'; else delete html.dataset.motion;
  window.dispatchEvent(new CustomEvent('dv:motion', { detail: { off: isMotionOff() } }));
  apply();
}
export function userStopped(): boolean { return html.dataset.motion === 'off'; }

mqReduce.addEventListener('change', apply);
window.addEventListener('storage', (e) => {
  if (e.key !== 'dv-motion') return;
  if (e.newValue === 'off') html.dataset.motion = 'off'; else delete html.dataset.motion;
  apply();
});

/* ---------------- reveals: data-reveal="lines|fade|plate" ---------------- */

// A reveal plays once per page view: done ones are marked, and when the Stop switch is turned
// off again (resume) everything already on or above the screen counts as read — it was shown in
// its finished state while motion was off, so it must not blink back to opacity 0.
let revealsRan = isMotionOff(); // a page that loaded stopped has already shown everything finished
const markDone = (el: HTMLElement) => { el.dataset.revealDone = '1'; };

function setupReveals(root: ParentNode = document) {
  const els = [...root.querySelectorAll<HTMLElement>('[data-reveal]')];
  const resuming = revealsRan;
  revealsRan = true;
  const vh = window.innerHeight;
  for (const el of els) {
    if (el.dataset.revealDone) continue;
    if (resuming && el.getBoundingClientRect().top < vh) { markDone(el); continue; } // read before write is fine: no writes yet
    const kind = el.dataset.reveal;
    const start = el.dataset.revealStart || 'top 88%';
    const delay = Number(el.dataset.revealDelay || 0);
    if (kind === 'lines') {
      gsap.set(el, { opacity: 1 });
      SplitText.create(el, {
        type: 'lines', mask: 'lines', autoSplit: true, linesClass: 'split-line',
        onSplit(self) {
          // autoSplit re-splits on resize/font load: once played, the new lines stay put
          if (el.dataset.revealDone) return;
          return gsap.from(self.lines, {
            yPercent: 100, opacity: 0, duration: 0.6, stagger: 0.06, delay, lazy: false,
            scrollTrigger: { trigger: el, start, once: true },
            onComplete: () => markDone(el),
          });
        },
      });
    } else if (kind === 'plate') {
      gsap.fromTo(el, { clipPath: 'inset(0% 0% 100% 0%)' }, {
        clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'power2.out', delay, lazy: false, immediateRender: true,
        scrollTrigger: { trigger: el, start, once: true },
        onComplete: () => { gsap.set(el, { clearProps: 'clipPath' }); markDone(el); },
      });
    } else {
      gsap.fromTo(el, { opacity: 0, y: 24 }, {
        opacity: 1, y: 0, duration: 0.6, delay, lazy: false, immediateRender: true,
        scrollTrigger: { trigger: el, start, once: true },
        onComplete: () => markDone(el),
      });
    }
  }
}

/* ---------------- parallax plates: [data-parallax] > img ---------------- */

function setupParallax(root: ParentNode = document) {
  for (const frame of root.querySelectorAll<HTMLElement>('[data-parallax]')) {
    const img = frame.querySelector('img');
    if (!img) continue;
    // the image is (100 + 2·amt) % of the frame tall (chrome.css); moving it by ±amt % of the
    // FRAME = ±amt/(1 + 2·amt/100) % of itself keeps it covering the frame at both ends
    const amt = Number(frame.dataset.parallax || 4);
    const yp = amt / (1 + (2 * amt) / 100);
    gsap.fromTo(img, { yPercent: -yp }, {
      yPercent: yp, ease: 'none',
      scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
    });
  }
}

/* ---------------- crosshair on plates (pointer devices only) ---------------- */

function setupCrosshair() {
  if (!isFinePointer()) return;
  let active: HTMLElement | null = null;
  let rect: DOMRect | null = null;
  let px = 0, py = 0, dirty = false;
  const onMove = (e: PointerEvent) => { px = e.clientX; py = e.clientY; dirty = true; };
  const onEnter = (e: PointerEvent) => {
    active = e.currentTarget as HTMLElement; rect = null; dirty = true;
    active.addEventListener('pointermove', onMove);
    active.classList.add('is-crossed');
    onMove(e);
  };
  const onLeave = (e: PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.removeEventListener('pointermove', onMove);
    el.classList.remove('is-crossed');
    if (active === el) active = null;
  };
  const onScroll = () => { rect = null; dirty = true; };
  const tick = () => {
    if (!active || !dirty) return;
    // read
    rect ??= active.getBoundingClientRect();
    const x = Math.min(Math.max(px - rect.left, 0), rect.width);
    const y = Math.min(Math.max(py - rect.top, 0), rect.height);
    const fx = rect.width ? x / rect.width : 0, fy = rect.height ? y / rect.height : 0;
    // write
    active.style.setProperty('--cx', `${x}px`);
    active.style.setProperty('--cy', `${y}px`);
    const out = active.querySelector<HTMLElement>('[data-cross-readout]');
    if (out) out.textContent = `X ${fx.toFixed(2)} · Y ${fy.toFixed(2)}`;
    dirty = false;
  };
  const plates = [...document.querySelectorAll<HTMLElement>('[data-crosshair]')];
  plates.forEach((p) => { p.addEventListener('pointerenter', onEnter); p.addEventListener('pointerleave', onLeave); });
  window.addEventListener('scroll', onScroll, { passive: true });
  gsap.ticker.add(tick);
  return () => {
    gsap.ticker.remove(tick);
    window.removeEventListener('scroll', onScroll);
    plates.forEach((p) => {
      p.removeEventListener('pointerenter', onEnter); p.removeEventListener('pointerleave', onLeave);
      p.removeEventListener('pointermove', onMove); p.classList.remove('is-crossed');
    });
  };
}

/* ---------------- wordmark: outline → fill (Pioneer) ---------------- */

const played = new WeakSet<Element>();
const failsafeFired = () => html.classList.contains('reveal-failsafe');
function setupWordmark() {
  for (const wm of document.querySelectorAll<SVGSVGElement>('svg[data-wordmark-enter]')) {
    if (played.has(wm)) continue; // once per page view, not again after a Stop/resume
    played.add(wm);
    // the 2.6 s failsafe already showed it fully inked (slow network): never blank it again
    if (failsafeFired()) continue;
    const strokes = wm.querySelectorAll<SVGPathElement>('.wm-stroke path');
    const fill = wm.querySelector<SVGRectElement>('[data-wm-tide]');
    if (!strokes.length || !fill) continue;
    const y0 = Number(fill.getAttribute('y')), h0 = Number(fill.getAttribute('height'));
    const tl = gsap.timeline({ delay: Number(wm.dataset.wordmarkDelay || 0.15) });
    // behind the loader the entrance waits until the scope ring has opened
    if (html.classList.contains('loader-on')) {
      tl.pause();
      window.addEventListener('dv:loaded', () => tl.play(), { once: true });
    }
    tl.fromTo(strokes, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.1, ease: 'power2.inOut', stagger: 0.06 }, 0)
      // ink pools up from the baseline: the clipped rect grows from the bottom (attributes, so
      // no SVG transform-origin maths; one rect, once per view)
      .fromTo(fill, { attr: { y: y0 + h0, height: 0 } }, { attr: { y: y0, height: h0 }, duration: 0.9, ease: 'power2.out' }, 0.75);
    wm.classList.add('is-entering');
    tl.eventCallback('onComplete', () => wm.classList.remove('is-entering'));
  }
}

/* ---------------- footer wordmark drawn as a line on arrival ---------------- */

// Once per page view, like the reveals: a mark already drawn is skipped on Stop → resume, and on
// resume (or after the failsafe showed everything) a mark already on or above the screen counts
// as seen — it was shown finished, so it must not vanish and redraw.
const drawn = new WeakSet<Element>();
let footerRan = isMotionOff();
function setupFooterLine() {
  const settled = footerRan || failsafeFired();
  footerRan = true;
  const vh = window.innerHeight;
  for (const wm of document.querySelectorAll<SVGSVGElement>('svg[data-wordmark-draw]')) {
    if (drawn.has(wm)) continue;
    if (settled && wm.getBoundingClientRect().top < vh) { drawn.add(wm); continue; } // read before any write
    const paths = wm.querySelectorAll<SVGPathElement>('path');
    gsap.fromTo(paths, { drawSVG: '0%' }, {
      drawSVG: '100%', duration: 1.6, ease: 'power2.inOut', stagger: 0.08,
      scrollTrigger: { trigger: wm, start: 'top 95%', once: true },
      onComplete: () => { drawn.add(wm); },
    });
  }
}

/* ---------------- page lifecycle (cross-document View Transitions) ---------------- */

window.addEventListener('pageswap', (e: Event) => {
  const vt = (e as Event & { viewTransition?: { skipTransition(): void } }).viewTransition;
  if (vt && isMotionOff()) vt.skipTransition();
});

/* ---------------- boot ---------------- */

function boot() {
  const pendingReveal = html.classList.contains('reveal-pending');
  if (!isMotionOff()) startLenis();
  onMotion(() => {
    if (!html.classList.contains('reveal-failsafe')) setupReveals();
    setupParallax();
    setupWordmark();
    setupFooterLine();
    return setupCrosshair();
  });
  if (pendingReveal) html.classList.remove('reveal-pending');
  if (isMotionOff()) { ScrollTrigger.disable(); scheduleSleep(); }
  // late fonts change line boxes: refresh trigger positions once
  document.fonts?.ready.then(() => { if (!isMotionOff()) ScrollTrigger.refresh(); });
}
boot();
