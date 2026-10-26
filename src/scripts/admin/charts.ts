/**
 * Chart hover layer (dataviz skill): a crosshair that snaps to the nearest day and one tooltip
 * with the value. Pointer, touch (tap/drag on the plot) and keyboard (arrow keys on the focused
 * plot). Charts inside one [data-chart-sync] follow the same day. Event-driven DOM writes only:
 * no animation loop. Text goes in with textContent (values are server-formatted strings).
 */
interface Pt { d: string; v: string }

interface Plot { el: HTMLElement; pts: Pt[]; kind: string; cross: HTMLElement; tip: HTMLElement }

function show(p: Plot, i: number): void {
  const n = p.pts.length;
  if (!n) return;
  i = Math.max(0, Math.min(n - 1, i));
  const pct = p.kind === 'bars' ? ((i + 0.5) / n) * 100 : n === 1 ? 50 : (i / (n - 1)) * 100;
  p.cross.hidden = false;
  p.tip.hidden = false;
  p.cross.style.setProperty('--x', `${pct}%`);
  p.tip.replaceChildren();
  const v = document.createElement('strong');
  v.textContent = p.pts[i].v;
  const d = document.createElement('span');
  d.textContent = p.pts[i].d;
  p.tip.append(v, d);
  p.tip.style.setProperty('--x', `${pct}%`);
  p.tip.dataset.side = pct > 60 ? 'left' : 'right';
  p.el.dataset.index = String(i);
}

function hide(p: Plot): void {
  p.cross.hidden = true;
  p.tip.hidden = true;
  delete p.el.dataset.index;
}

export function initCharts(): void {
  const plots: Plot[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('.chart__plot[data-series]')) {
    let pts: Pt[] = [];
    try { pts = JSON.parse(el.dataset.series || '[]'); } catch { /* ignore */ }
    const p: Plot = { el, pts, kind: el.dataset.kind || 'line', cross: el.querySelector('.chart__cross')!, tip: el.querySelector('.chart__tip')! };
    plots.push(p);
  }
  const peers = (p: Plot) => {
    const g = p.el.closest('[data-chart-sync]');
    return g ? plots.filter((q) => q.el.closest('[data-chart-sync]') === g && q.pts.length === p.pts.length) : [p];
  };
  const indexAt = (p: Plot, clientX: number) => {
    const r = p.el.getBoundingClientRect(); // read first, then write (show)
    const f = (clientX - r.left) / Math.max(1, r.width);
    const n = p.pts.length;
    return p.kind === 'bars' ? Math.floor(f * n) : Math.round(f * (n - 1));
  };
  for (const p of plots) {
    p.el.addEventListener('pointermove', (e) => { const i = indexAt(p, e.clientX); for (const q of peers(p)) show(q, i); });
    p.el.addEventListener('pointerdown', (e) => { const i = indexAt(p, e.clientX); for (const q of peers(p)) show(q, i); });
    p.el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') for (const q of peers(p)) hide(q); });
    p.el.addEventListener('focus', () => { for (const q of peers(p)) show(q, p.pts.length - 1); });
    p.el.addEventListener('blur', () => { for (const q of peers(p)) hide(q); });
    p.el.addEventListener('keydown', (e) => {
      const cur = Number(p.el.dataset.index ?? p.pts.length - 1);
      const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'Home' ? -1e6 : e.key === 'End' ? 1e6 : 0;
      if (!step) return;
      e.preventDefault();
      for (const q of peers(p)) show(q, cur + step);
    });
  }
}
