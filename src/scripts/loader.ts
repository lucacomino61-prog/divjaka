/**
 * loader.ts — the spotting-scope preloader (DESIGN §5, Kode row). The inline script in
 * Preloader.astro owns the safety net (Skip from 0 ms, 1.8 s cap, once per session, removal);
 * this module adds the real progress: web fonts + the LCP image + the document, shown as the
 * coordinates running from 0°00′ to the hotel's position while the plate comes into focus, and
 * opens the scope the moment progress reaches 100 %.
 */
import { gsap, settle } from './motion';
import { coords } from '../i18n/format';

declare global { interface Window { __dvLoaderFinish?: () => void } }

export function initLoader() {
  const html = document.documentElement;
  const el = document.getElementById('dv-loader');
  if (!el || !html.classList.contains('loader-on')) return;
  const out = el.querySelector<HTMLElement>('[data-loader-coords]');
  const lat = Number(el.dataset.lat) || 0, lon = Number(el.dataset.lon) || 0;
  const proxy = { p: 0 };
  let target = 0.08;

  const paint = () => {
    const p = proxy.p;
    el.style.setProperty('--p', p.toFixed(3));
    if (out) out.textContent = coords(lat * p, lon * p);
  };
  const advance = (to: number) => {
    target = Math.max(target, to);
    const last = target >= 0.999;
    gsap.to(proxy, {
      // the last stretch is quick: the scope is never longer than what it hides
      p: target, duration: last ? 0.18 : 0.35, ease: 'power2.out', overwrite: true, onUpdate: paint,
      // 100 % → open at once (no hold); the inline script still caps the whole thing at 1.8 s
      onComplete: () => { if (proxy.p >= 0.999) window.__dvLoaderFinish?.(); },
    });
  };

  const weights = { fonts: 0.4, lcp: 0.4, doc: 0.2 };
  let done = 0;
  const part = (w: number) => { done += w; advance(Math.min(1, done)); };

  (document.fonts?.ready ?? Promise.resolve()).then(() => part(weights.fonts));
  const lcp = document.querySelector<HTMLImageElement>('main img[fetchpriority="high"]');
  if (!lcp || lcp.complete) part(weights.lcp);
  else {
    const fin = () => part(weights.lcp);
    lcp.addEventListener('load', fin, { once: true });
    lcp.addEventListener('error', fin, { once: true });
  }
  if (document.readyState === 'complete') part(weights.doc);
  else window.addEventListener('load', () => part(weights.doc), { once: true });

  paint();
  advance(0.08);
  window.addEventListener('dv:loaded', () => { gsap.killTweensOf(proxy); settle(); }, { once: true });
}
