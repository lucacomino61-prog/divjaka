/**
 * heritage.ts — the Opal sentence (components/heritage/Verse.astro): its words light from ink-40
 * to ink as the sentence moves up the screen. Only class toggles on the words that change
 * (no layout reads per frame); ScrollTrigger runs it, through motion.ts. With motion off the
 * class is removed and every word is ink.
 */
import { onMotion, ScrollTrigger } from './motion';

export function initVerses(): void {
  document.querySelectorAll<HTMLElement>('[data-verse]').forEach((v) => {
    const words = [...v.querySelectorAll<HTMLElement>('.verse__w')];
    if (!words.length) return;
    holdForFace(v);
    onMotion(() => {
      v.classList.add('is-reading');
      let lit = 0;
      // the hub's sentence is on the first screen: its first line is lit at rest, so the page's
      // main sentence never reads as greyed out before the first scroll
      let floor = 0;
      const paint = (raw: number) => {
        const n = Math.max(raw, floor);
        if (n === lit) return;
        const [a, b, on] = n > lit ? [lit, n, true] : [n, lit, false];
        for (let i = a; i < b; i++) words[i].classList.toggle('is-lit', on);
        lit = n;
      };
      // a sentence that sits sticky beside a list (the hub on desktop) reads along that list
      const outer = v.dataset.verseTrigger && matchMedia('(min-width: 1100px)').matches ? v.closest<HTMLElement>(v.dataset.verseTrigger) : null;
      const st = ScrollTrigger.create({
        trigger: outer ?? v,
        start: outer ? 'top bottom' : 'top 82%',
        end: outer ? 'bottom bottom' : 'bottom 42%',
        onUpdate: (self) => paint(Math.round(self.progress * words.length)),
        // refresh is the one moment layout is read: how many words the first line holds
        onRefresh: (self) => {
          if (v.dataset.verseTrigger) { const top = words[0].offsetTop; floor = words.filter((w) => w.offsetTop === top).length; }
          paint(Math.round(self.progress * words.length));
        },
      });
      return () => {
        st.kill();
        v.classList.remove('is-reading');
        words.forEach((w) => w.classList.remove('is-lit'));
      };
    });
  });
}

/**
 * No layout shift from the font swap (the hub shows the sentence on its first screen): the words
 * stay hidden (CSS, html.js) until Bricolage is ready, and the box keeps the height it had with
 * the fallback (the wider face, so the real one never needs more), so nothing below it moves.
 * One read, then one write; a 1.5 s cap (the CSS shows the words at 1.6 s in any case).
 */
function holdForFace(v: HTMLElement) {
  const FACE = '600 32px "Bricolage Grotesque"';
  const show = () => v.classList.add('is-set');
  if (!document.fonts || document.fonts.check(FACE)) { show(); return; }
  const h = v.getBoundingClientRect().height;
  if (h > 0) v.style.minBlockSize = `${Math.ceil(h)}px`;
  Promise.race([document.fonts.load(FACE), new Promise((r) => setTimeout(r, 1500))]).then(show, show);
}

/** Month strip: scroll the current month into view inside its own row (no page scroll). */
export function initMonthStrip(): void {
  document.querySelectorAll<HTMLElement>('[data-months]').forEach((strip) => {
    // keyboard: a focused month is always shown whole (Chrome leaves a partly visible one alone)
    strip.addEventListener('focusin', (e) => {
      const li = (e.target as HTMLElement).closest('li');
      if (!li) return;
      const s = strip.getBoundingClientRect(), r = li.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(strip).paddingInlineStart) || 16;
      if (r.left < s.left + pad) strip.scrollLeft -= s.left + pad - r.left;
      else if (r.right > s.right - pad) strip.scrollLeft += r.right - (s.right - pad);
    });
    const now = strip.querySelector<HTMLElement>('[aria-current]');
    if (!now || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft = Math.max(0, now.offsetLeft - strip.clientWidth / 2 + now.offsetWidth / 2);
  });
}
