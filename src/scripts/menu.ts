/**
 * menu.ts — the full-screen legend menu (<dialog id="menu">) and shared modal-dialog plumbing.
 * showModal() gives the focus trap and makes the page behind inert; Esc closes natively.
 * We add: scroll lock (Lenis paused), aria-expanded on openers, focus returned to the opener,
 * swipe-down to close on touch, and legend ↔ mini-chart pins (hover/focus drops the pin).
 * Openers also carry commandfor/command="show-modal", so an early tap works before this loads.
 */
import { lockScroll } from './motion';
import { relift, hide as hideToast } from './toast';

export interface ModalHandle { open(opener?: HTMLElement | null): void; close(): void; el: HTMLDialogElement }

/** Wire any <dialog> as a page-level modal with the shared behaviour. */
export function modal(dialog: HTMLDialogElement, opts: { swipeClose?: 'down' | 'right'; onOpen?: () => void; onClose?: () => void; toast?: 'relift' | 'hide' } = {}): ModalHandle {
  let opener: HTMLElement | null = null;
  const openers = () => document.querySelectorAll<HTMLElement>(`[aria-controls="${dialog.id}"]`);
  // a toast showing when this modal opens would sit inert behind it: move it in, or (the cart
  // drawer, which lists the cart with its own inline undo) dismiss it
  const toastOnOpen = () => { if (opts.toast === 'hide') hideToast(); else relift(); };

  const open = (from?: HTMLElement | null) => {
    if (dialog.open) return;
    opener = from ?? (document.activeElement as HTMLElement | null);
    dialog.showModal();
    lockScroll(true);
    document.documentElement.classList.add(`${dialog.id}-open`);
    openers().forEach((o) => o.setAttribute('aria-expanded', 'true'));
    toastOnOpen();
    opts.onOpen?.();
  };
  const close = () => { if (dialog.open) dialog.close(); };

  dialog.addEventListener('close', () => {
    lockScroll(false);
    document.documentElement.classList.remove(`${dialog.id}-open`);
    openers().forEach((o) => o.setAttribute('aria-expanded', 'false'));
    opts.onClose?.();
    const back = opener;
    opener = null;
    if (back && back.isConnected) back.focus({ preventScroll: true });
  });
  // opened natively by an invoker button before this script ran
  dialog.addEventListener('toggle', (e) => {
    if ((e as ToggleEvent).newState === 'open' && !document.documentElement.classList.contains(`${dialog.id}-open`)) {
      lockScroll(true);
      document.documentElement.classList.add(`${dialog.id}-open`);
      openers().forEach((o) => o.setAttribute('aria-expanded', 'true'));
      toastOnOpen();
      opts.onOpen?.();
    }
  });

  // swipe to close on touch
  if (opts.swipeClose) {
    let sx = 0, sy = 0, tracking = false;
    dialog.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      const scroller = (e.target as HTMLElement).closest('[data-scroll]') as HTMLElement | null;
      tracking = e.touches.length === 1 && (!scroller || scroller.scrollTop <= 0);
      sx = t.clientX; sy = t.clientY;
    }, { passive: true });
    dialog.addEventListener('touchmove', (e) => {
      if (!tracking) return;
      const t = e.touches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      const hit = opts.swipeClose === 'down' ? dy > 90 && Math.abs(dx) < dy * 0.6 : dx > 90 && Math.abs(dy) < dx * 0.6;
      if (hit) { tracking = false; close(); }
    }, { passive: true });
    dialog.addEventListener('touchend', () => { tracking = false; }, { passive: true });
  }

  // back/forward cache: a page left through a link inside the open dialog must not come back
  // with the sheet still up and scroll locked. Close it as the page is hidden (no animation —
  // nobody sees it), and once more on a persisted pageshow in case the browser restored it open.
  window.addEventListener('pagehide', (e) => { if (e.persisted && dialog.open) dialog.close(); });
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    if (dialog.open) dialog.close();
    else if (document.documentElement.classList.contains(`${dialog.id}-open`)) {
      document.documentElement.classList.remove(`${dialog.id}-open`);
      lockScroll(false);
    }
  });

  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>(`[commandfor="${dialog.id}"], [data-open="${dialog.id}"], [data-close="${dialog.id}"]`);
    if (!t) return;
    const cmd = t.getAttribute('command') || (t.hasAttribute('data-close') ? 'close' : 'show-modal');
    e.preventDefault();
    if (cmd === 'close') close(); else open(t);
  });

  return { open, close, el: dialog };
}

export function initMenu() {
  const dialog = document.getElementById('menu') as HTMLDialogElement | null;
  if (!dialog) return;
  const handle = modal(dialog, { swipeClose: 'down' });

  // legend ↔ mini chart: hovering or focusing an entry drops its pin and draws the leader line
  const chart = dialog.querySelector<HTMLElement>('[data-minichart]');
  if (chart) {
    const pins = chart.querySelectorAll<SVGGElement>('.mpin[data-pin]');
    const set = (poi: string | null) => {
      if (poi) chart.dataset.active = poi; else delete chart.dataset.active;
      pins.forEach((g) => g.classList.toggle('is-active', g.dataset.pin === poi));
    };
    // legend links only: a focus listener on the chart's SVG <g> pins would make Chrome put
    // them in the Tab order (unnamed stops); the pins carry data-pin, not data-poi
    dialog.querySelectorAll<HTMLAnchorElement>('a[data-poi]').forEach((a) => {
      const poi = a.dataset.poi || null;
      a.addEventListener('pointerenter', () => set(poi));
      a.addEventListener('focus', () => set(poi));
      a.addEventListener('pointerleave', () => set(null));
      a.addEventListener('blur', () => set(null));
    });
  }
  // a same-page link (e.g. #hash) closes the menu first
  dialog.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a');
    if (a && a.pathname === location.pathname && a.hash) handle.close();
  });
  return handle;
}
