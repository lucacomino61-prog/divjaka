/**
 * live.ts — "Divjaka tani" (/tani/) client (T7).
 * - Forecast tabs (24 hours / 7 days): a real tablist (arrows, Home/End), state in the URL
 *   (?pamja=dite), without JS both panels show.
 * - Refresh: GET this same page, swap every [data-live-block] by id (the server is the only
 *   renderer, so nothing is formatted twice). A setTimeout chain every 10 minutes while the tab is
 *   visible; paused while hidden and while animations are stopped (Stop switch / reduced motion
 *   does not stop it — only the Stop switch does, as the brief asks); the button always works.
 *   No requestAnimationFrame anywhere.
 * - Analytics: live_view {section:'now'} once, {section:'forecast', tab} on tab change.
 */
import { onMotionChange, userStopped } from './motion';
import { track } from './track';
import { tc } from '../i18n/client';

const EVERY = 10 * 60 * 1000;

export function initNow() {
  const root = document.querySelector<HTMLElement>('[data-now]');
  if (!root) return;
  track('live_view', { meta: { section: 'now' } });

  /* ---------- tabs ---------- */
  const setTab = (tab: 'hours' | 'days', opts: { focus?: boolean; push?: boolean; track?: boolean } = {}) => {
    root.dataset.view = tab;
    root.querySelectorAll<HTMLAnchorElement>('[data-tab]').forEach((a) => {
      const on = a.dataset.tab === tab;
      a.setAttribute('aria-selected', on ? 'true' : 'false');
      a.tabIndex = on ? 0 : -1;
      if (on && opts.focus) a.focus();
    });
    if (opts.push) {
      const u = new URL(location.href);
      if (tab === 'days') u.searchParams.set('pamja', 'dite'); else u.searchParams.delete('pamja');
      history.replaceState(history.state, '', u);
    }
    if (opts.track) track('live_view', { meta: { section: 'forecast', tab } });
  };
  root.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-tab]');
    if (!a) return;
    e.preventDefault();
    setTab(a.dataset.tab as 'hours' | 'days', { push: true, track: true });
  });
  root.addEventListener('keydown', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('[data-tab]');
    if (!a) return;
    const tabs = [...root.querySelectorAll<HTMLAnchorElement>('[data-tab]')];
    const i = tabs.indexOf(a);
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    else if (e.key === ' ') j = i;
    if (j < 0) return;
    e.preventDefault();
    setTab(tabs[j].dataset.tab as 'hours' | 'days', { focus: true, push: true, track: true });
  });
  setTab((root.dataset.view as 'hours' | 'days') || 'hours');

  /* ---------- refresh ---------- */
  const status = root.querySelector<HTMLElement>('[data-now-status]');
  const auto = root.querySelector<HTMLElement>('[data-now-auto]');
  const btn = root.querySelector<HTMLButtonElement>('[data-now-refresh]');
  let timer: number | undefined;
  let last = Date.now();
  let busy = false;

  const say = (msg: string) => { if (status) status.textContent = msg; };

  async function refresh(manual = false) {
    if (busy) return;
    busy = true;
    let slow: number | undefined;
    if (manual && btn) slow = window.setTimeout(() => { btn.setAttribute('aria-busy', 'true'); say(tc('now.refreshing')); }, 250);
    try {
      const res = await fetch(location.pathname + location.search, { headers: { accept: 'text/html' }, cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      const view = root!.dataset.view;
      document.querySelectorAll<HTMLElement>('[data-live-block][id]').forEach((el) => {
        const next = doc.getElementById(el.id);
        if (next) el.replaceWith(document.importNode(next, true));
      });
      // blocks that appear only now (data came back after an outage)
      doc.querySelectorAll<HTMLElement>('[data-live-block][id]').forEach((n) => {
        if (document.getElementById(n.id)) return;
        const prev = n.previousElementSibling?.id ? document.getElementById(n.previousElementSibling.id) : null;
        prev?.after(document.importNode(n, true));
      });
      setTab((view as 'hours' | 'days') || 'hours');
      last = Date.now();
      const stamp = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Tirane', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
      say(tc('now.refreshed', { time: stamp }));
    } catch {
      say(tc('now.refresh.failed'));
    } finally {
      if (slow) clearTimeout(slow);
      btn?.removeAttribute('aria-busy');
      busy = false;
      schedule();
    }
  }

  const running = () => document.visibilityState === 'visible' && !userStopped();
  function schedule() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (auto) auto.textContent = userStopped() ? tc('now.auto.off') : tc('now.auto');
    if (!running()) return;
    timer = window.setTimeout(() => refresh(), Math.max(1000, EVERY - (Date.now() - last)));
  }

  btn?.addEventListener('click', () => refresh(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !userStopped() && Date.now() - last >= EVERY) refresh();
    else schedule();
  });
  onMotionChange(() => schedule());
  schedule();
}
