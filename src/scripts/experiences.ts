/**
 * experiences.ts — the survey strip (Bécane lineup) on the experiences index and pages (T4).
 * Mouse: drag to scroll (scroll-snap paused while dragging, the click after a drag is swallowed).
 * Touch: native horizontal scroll with snap (nothing intercepted). Keyboard: the strip is
 * focusable; ←/→ and the two buttons move one tag. No requestAnimationFrame: scrollLeft is
 * written in the pointer handler, and button/key moves use native smooth scrolling (instant when
 * motion is off).
 */
import { isMotionOff } from './motion';

function initStrip(root: HTMLElement) {
  const sc = root.querySelector<HTMLElement>('[data-xstrip-scroller]');
  if (!sc) return;
  const nav = root.querySelector<HTMLElement>('[data-xstrip-nav]');
  const prev = root.querySelector<HTMLButtonElement>('[data-xstrip-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-xstrip-next]');
  const step = () => {
    const first = sc.querySelector<HTMLElement>('.xs');
    const gap = parseFloat(getComputedStyle(sc.querySelector('ol')!).columnGap) || 16;
    return (first?.offsetWidth ?? 280) + gap;
  };
  const move = (dir: number) => sc.scrollBy({ left: dir * step(), behavior: isMotionOff() ? 'instant' : 'smooth' });
  const sync = () => {
    const max = sc.scrollWidth - sc.clientWidth - 2;
    if (nav) nav.hidden = max <= 0;
    prev?.setAttribute('aria-disabled', String(sc.scrollLeft <= 2));
    next?.setAttribute('aria-disabled', String(sc.scrollLeft >= max));
  };
  prev?.addEventListener('click', () => move(-1));
  next?.addEventListener('click', () => move(1));
  sc.addEventListener('scroll', sync, { passive: true });
  new ResizeObserver(sync).observe(sc);
  sync();

  sc.addEventListener('keydown', (e) => {
    if (e.target !== sc) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
  });

  // drag with a mouse (touch keeps the native scroll)
  let down = false, startX = 0, startLeft = 0, moved = 0;
  sc.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true; moved = 0; startX = e.clientX; startLeft = sc.scrollLeft;
  });
  window.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx));
    if (moved > 4) { sc.classList.add('is-dragging'); sc.scrollLeft = startLeft - dx; }
  });
  const up = () => {
    if (!down) return;
    down = false;
    if (sc.classList.contains('is-dragging')) {
      sc.classList.remove('is-dragging');
      // let snap settle on the nearest tag
      const s = step();
      sc.scrollTo({ left: Math.round(sc.scrollLeft / s) * s, behavior: isMotionOff() ? 'instant' : 'smooth' });
    }
  };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  sc.addEventListener('click', (e) => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); moved = 0; } }, true);
  sc.addEventListener('dragstart', (e) => e.preventDefault());
}

export function initExperiences() {
  document.querySelectorAll<HTMLElement>('[data-xstrip]').forEach(initStrip);
}
