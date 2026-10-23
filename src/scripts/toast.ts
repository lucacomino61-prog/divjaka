/**
 * toast.ts — one polite live region (#dv-toast in Base). A toast shows for 5 s (8 s with an
 * action), pauses while hovered or focused, and is replaced by the next one. CSS transitions only.
 *
 * Announcing: the host is shown FIRST and its text written ~100 ms later, every time — a live
 * region that enters the accessibility tree with its text already in it is not announced.
 *
 * Top layer: the host is a popover="manual". A modal <dialog> makes everything outside it inert —
 * even a popover stacked above it — so a toast raised while a modal is open moves INTO that
 * dialog (then re-shows as a popover above it) and is anchored to it: in the cart drawer it sits
 * under the drawer head, never over the checkout action. While it is inside a modal and carries
 * an action it does not time out (WCAG 2.2.1); it goes back to <body> when the dialog closes.
 * The cart drawer never raises one for its own removals: it shows an inline "Removed · Undo" row
 * in place of the line (drawer.ts). When a modal opens over a showing toast, modal() in menu.ts
 * calls relift() (or dismiss() for the drawer, which lists the cart itself).
 */
export interface ToastAction { label: string; run: () => void }

let timer = 0;
let sayTimer = 0;
let ms = 5000;
let wired = false;
let hasAction = false;

const host = () => document.getElementById('dv-toast');
const inModal = (h: HTMLElement) => !!h.parentElement?.closest('dialog:modal');

function arm() {
  clearTimeout(timer);
  const h = host();
  // an Undo inside an open modal stays until it is used, dismissed or the dialog closes
  if (h && hasAction && inModal(h)) return;
  timer = window.setTimeout(hide, ms);
}
function hold() { clearTimeout(timer); }

const canPopover = () => typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

/** Put the host where it can be seen and used: inside the topmost open modal, in the top layer. */
function lift(h: HTMLElement) {
  const modals = document.querySelectorAll<HTMLDialogElement>('dialog:modal');
  const parent = modals.length ? modals[modals.length - 1] : document.body;
  if (h.parentElement !== parent) parent.append(h); // removal from the old place hides an open popover
  // anchor: the drawer → under its head, centred in its inline box; anything else → page bottom
  h.classList.toggle('is-in-drawer', parent instanceof HTMLDialogElement && parent.classList.contains('drawer'));
  h.classList.toggle('is-in-modal', parent instanceof HTMLDialogElement);
  if (canPopover() && h.hasAttribute('popover')) {
    try {
      if (h.matches(':popover-open')) h.hidePopover();
      h.showPopover(); // re-show = top of the top layer, above a dialog opened since
    } catch { /* not connected / unsupported: stays an ordinary fixed element */ }
  }
}

function wire(h: HTMLElement) {
  if (wired) return;
  wired = true;
  h.addEventListener('pointerenter', hold);
  h.addEventListener('pointerleave', arm);
  h.addEventListener('focusin', hold);
  h.addEventListener('focusout', arm);
  // the dialog that holds the toast closes → bring a showing toast back to the page
  document.addEventListener('close', (e) => {
    const dlg = e.target as HTMLElement;
    if (!(dlg instanceof HTMLDialogElement) || !dlg.contains(h)) return;
    if (h.dataset.state === 'open') { lift(h); arm(); }
    else { document.body.append(h); h.classList.remove('is-in-drawer', 'is-in-modal'); }
  }, true);
}

export function toast(message: string, action?: ToastAction) {
  const h = host();
  if (!h) return;
  const msg = h.querySelector<HTMLElement>('[data-toast-msg]');
  const btn = h.querySelector<HTMLButtonElement>('[data-toast-action]');
  if (!msg || !btn) return;
  wire(h);
  // show first (empty), write the words once the region is in the accessibility tree
  clearTimeout(sayTimer);
  msg.textContent = '';
  h.dataset.state = 'open';
  lift(h);
  sayTimer = window.setTimeout(() => { msg.textContent = message; }, 100);
  hasAction = !!action;
  if (action) {
    btn.hidden = false;
    btn.textContent = action.label;
    btn.onclick = () => { action.run(); hide(); };
  } else {
    btn.hidden = true;
    btn.onclick = null;
  }
  ms = action ? 8000 : 5000;
  arm();
}

/** A modal opened over a showing toast: move it into that modal so it stays usable. */
export function relift() {
  const h = host();
  if (!h || h.dataset.state !== 'open') return;
  lift(h);
  arm();
}

export function hide() {
  clearTimeout(timer);
  clearTimeout(sayTimer);
  hasAction = false;
  const h = host();
  if (h) h.dataset.state = 'closed';
}
