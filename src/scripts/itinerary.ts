/**
 * itinerary.ts — the planner's enhancements (T7). The plan itself is rendered on the server from
 * the URL; here we only:
 *  - tidy the URL on submit (interesa=zogj,kulture; no empty date) and land on the plan;
 *  - add sessions to the cart (scripts/cart.ts addItem, with its toast and Undo);
 *  - share (Web Share API, else copy the link), print;
 *  - highlight the day being read on the route chart (IntersectionObserver; no rAF);
 *  - track 'itinerary' {days, interests, items, step, action} (the meta keys /api/e keeps).
 */
import { addItem, type Kind } from './cart';
import { track } from './track';
import { toast } from './toast';
import { tc } from '../i18n/client';

interface AddData { slug: string; kind: Kind; qty: number; guests?: number; session_id: number; name: string; value: number }

export function initItinerary() {
  const root = document.querySelector<HTMLElement>('[data-itinerary]');
  if (!root) return;
  const plan = root.dataset.plan ? (JSON.parse(root.dataset.plan) as { days: number; interests: string[]; items: number }) : null;
  const meta = (step: string, action: string, extra: Record<string, unknown> = {}) => ({ meta: { step, action, ...(plan ?? {}), ...extra } });
  if (plan) track('itinerary', meta('plan', 'view'));

  /* ---------- form ---------- */
  const form = root.querySelector<HTMLFormElement>('[data-planner-form]');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const q = new URLSearchParams();
    q.set('dite', String(fd.get('dite') ?? '2'));
    const date = String(fd.get('mberritja') ?? '').trim();
    if (date) q.set('mberritja', date);
    q.set('persona', String(fd.get('persona') ?? '2'));
    const interests = fd.getAll('interesa').map(String);
    if (interests.length) q.set('interesa', interests.join(','));
    q.set('ritmi', String(fd.get('ritmi') ?? 'normal'));
    if (fd.get('femije')) q.set('femije', '1');
    q.set('levizja', String(fd.get('levizja') ?? 'makine'));
    track('itinerary', { meta: { step: 'form', action: 'submit', days: Number(q.get('dite')), interests } });
    const action = new URL(form.action, location.href);
    location.assign(`${action.pathname}?${q.toString().replace(/%2C/g, ',')}#plani`);
  });

  /* ---------- cart ---------- */
  const add = (btn: HTMLButtonElement, quiet = false) => {
    if (btn.dataset.state === 'added') return false;
    const d = JSON.parse(btn.dataset.add!) as AddData;
    // same line shape as the experience page (booking.ts): guests = people, so adding the same
    // session there and here makes one cart line, not two
    const item = addItem({ slug: d.slug, kind: d.kind, qty: d.qty, guests: d.guests ?? d.qty, session_id: d.session_id }, { name: d.name, value: d.value, toast: !quiet });
    if (!item) return false;
    btn.dataset.state = 'added';
    const label = btn.querySelector('[data-add-label]');
    if (label) label.textContent = tc('itinerary.book.added');
    return true;
  };
  root.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const one = target.closest<HTMLButtonElement>('[data-add]');
    if (one) {
      if (add(one)) track('itinerary', meta('plan', 'add', { items: 1 }));
      return;
    }
    const all = target.closest<HTMLButtonElement>('[data-add-all]');
    if (all) {
      let n = 0;
      root.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((b) => { if (add(b, true)) n++; });
      if (n) {
        toast(tc('cart.added'));
        track('itinerary', meta('plan', 'add_all', { items: n }));
      }
      return;
    }
    const share = target.closest<HTMLButtonElement>('[data-share]');
    if (share) {
      const url = new URL(share.dataset.share!, location.href).href;
      const title = document.title;
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        navigator.share({ title, url }).then(() => track('share', { meta: { channel: 'native', kind: 'itinerary' } })).catch(() => {});
      } else {
        // no clipboard (http, older WebViews) or refused: select the visible link and say so
        const manual = () => {
          const a = root.querySelector<HTMLElement>('.plan__link a');
          if (a) {
            const r = document.createRange();
            r.selectNodeContents(a);
            const sel = getSelection();
            sel?.removeAllRanges();
            sel?.addRange(r);
            a.scrollIntoView({ block: 'nearest' });
          }
          toast(tc('itinerary.copy.manual'));
        };
        if (!navigator.clipboard?.writeText) manual();
        else navigator.clipboard.writeText(url).then(() => {
          toast(tc('itinerary.copied'));
          track('share', { meta: { channel: 'copy', kind: 'itinerary' } });
        }).catch(manual);
      }
      track('itinerary', meta('plan', 'share'));
      return;
    }
    if (target.closest('[data-print]')) {
      track('itinerary', meta('plan', 'print'));
      window.print();
    }
  });

  /* ---------- the day being read, on the chart ---------- */
  const chart = root.querySelector<HTMLElement>('[data-route-chart]');
  const legDays = (chart?.dataset.legdays ?? '').split(',').filter(Boolean).map(Number);
  const days = [...root.querySelectorAll<HTMLElement>('.pday[data-day]')];
  const links = [...root.querySelectorAll<HTMLAnchorElement>('[data-day-link]')];
  if (!chart || !days.length || !legDays.length) return;
  const legs = [...chart.querySelectorAll<SVGElement>('[data-leg]')];
  let current = 0;
  const show = (n: number) => {
    if (n === current) return;
    current = n;
    if (n) chart.dataset.activeDay = String(n); else delete chart.dataset.activeDay;
    legs.forEach((l) => l.classList.toggle('is-day', legDays[Number(l.dataset.leg)] === n));
    links.forEach((a) => a.classList.toggle('is-day', Number(a.dataset.dayLink) === n));
  };
  const visible = new Map<number, number>();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) visible.set(Number((e.target as HTMLElement).dataset.day), e.isIntersecting ? e.intersectionRatio : 0);
    let best = 0, ratio = 0;
    for (const [n, r] of visible) if (r > ratio) { ratio = r; best = n; }
    if (days.length > 1) show(best);
  }, { rootMargin: '-30% 0px -40% 0px', threshold: [0, 0.25, 0.5, 1] });
  days.forEach((d) => io.observe(d));
  days.forEach((d) => {
    d.addEventListener('pointerenter', () => { if (days.length > 1) show(Number(d.dataset.day)); });
    d.addEventListener('focusin', () => { if (days.length > 1) show(Number(d.dataset.day)); });
  });
}
