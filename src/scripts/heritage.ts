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
    onMotion(() => {
      v.classList.add('is-reading');
      let lit = 0;
      const paint = (n: number) => {
        if (n === lit) return;
        const [a, b, on] = n > lit ? [lit, n, true] : [n, lit, false];
        for (let i = a; i < b; i++) words[i].classList.toggle('is-lit', on);
        lit = n;
      };
      const st = ScrollTrigger.create({
        trigger: v, start: 'top 82%', end: 'bottom 42%',
        onUpdate: (self) => paint(Math.round(self.progress * words.length)),
        onRefresh: (self) => paint(Math.round(self.progress * words.length)),
      });
      return () => {
        st.kill();
        v.classList.remove('is-reading');
        words.forEach((w) => w.classList.remove('is-lit'));
      };
    });
  });
}

/** Month strip: scroll the current month into view inside its own row (no page scroll). */
export function initMonthStrip(): void {
  document.querySelectorAll<HTMLElement>('[data-months]').forEach((strip) => {
    const now = strip.querySelector<HTMLElement>('[aria-current]');
    if (!now || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollLeft = Math.max(0, now.offsetLeft - strip.clientWidth / 2 + now.offsetWidth / 2);
  });
}
