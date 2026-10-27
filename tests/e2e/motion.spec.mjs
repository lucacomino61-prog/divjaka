// Motion: the Stop switch kills every loop, reduced motion shows finished states, the preloader skips,
// and the signature coastline draws with scroll.
import { test, expect } from '@playwright/test';
import { skipLoader, countRaf, rafPerSecond, sidewaysOverflow } from './helpers.mjs';

test('Stop-animations switch: 0 rAF calls/s idle, persisted, nothing left invisible', async ({ page, context }) => {
  await skipLoader(context);
  await countRaf(context);
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  expect(await rafPerSecond(page)).toBeGreaterThan(20); // the one GSAP ticker runs while motion is on
  await page.locator('[data-motion-switch]').filter({ visible: true }).first().click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await page.waitForTimeout(1200);
  expect(await rafPerSecond(page, 2000)).toBeLessThanOrEqual(1);
  await page.evaluate(() => scrollTo(0, 3000));
  await page.waitForTimeout(300);
  expect(await rafPerSecond(page, 1500)).toBeLessThanOrEqual(1);
  const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
  expect(running).toBe(0);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await page.waitForTimeout(1000);
  expect(await rafPerSecond(page, 1500)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => localStorage.getItem('dv-motion'))).toBe('off');
});

test('prefers-reduced-motion: no loop, signature static with all five stops visible', async ({ browser, baseURL }, testInfo) => {
  const ctx = await browser.newContext({ ...testInfo.project.use, baseURL, reducedMotion: 'reduce' });
  await skipLoader(ctx);
  await countRaf(ctx);
  const page = await ctx.newPage();
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  expect(await rafPerSecond(page, 2000)).toBeLessThanOrEqual(1);
  await page.locator('[data-sig]').scrollIntoViewIfNeeded();
  const cards = await page.locator('.sig-card').evaluateAll((els) => els.map((e) => +getComputedStyle(e).opacity));
  expect(cards.length).toBe(5);
  expect(cards.every((o) => o > 0.99)).toBe(true);
  // nothing stuck invisible further down
  const ghosts = [];
  for (let y = 0; y < 14000; y += 900) {
    await page.evaluate((y) => scrollTo(0, y), y);
    await page.waitForTimeout(80);
    ghosts.push(...(await page.evaluate(() => [...document.querySelectorAll('main h2, main h3, main p, main img, main .sig-card')].filter((e) => {
      const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return false;
      let o = 1; for (let n = e; n && n !== document.body; n = n.parentElement) o *= +getComputedStyle(n).opacity;
      return o < 0.05;
    }).map((e) => `${e.tagName}.${e.className}`))));
  }
  expect([...new Set(ghosts)]).toEqual([]);
  await ctx.close();
});

test('preloader: once per session, Skip works, shorter than what it hides', async ({ page }) => {
  const t0 = Date.now();
  await page.goto('/', { waitUntil: 'commit' });
  const skip = page.locator('[data-loader-skip]');
  if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 2000 }).catch(() => { /* finished on its own first */ });
  await expect(page.locator('#dv-loader')).toHaveCount(0, { timeout: 2500 });
  expect(Date.now() - t0).toBeLessThan(4000);
  expect(await page.evaluate(() => sessionStorage.getItem('dv-seen'))).toBe('1');
  await page.goto('/qendrimi/');
  await expect(page.locator('#dv-loader')).toHaveCount(0);
  await page.goto('/');
  await expect(page.locator('#dv-loader')).toHaveCount(0);
});

test('signature: the coastline draws with scroll, five stops, list view toggle', async ({ page, context }) => {
  await skipLoader(context);
  await page.goto('/', { waitUntil: 'load' });
  const sig = page.locator('[data-sig]');
  await expect(sig).toHaveCount(1);
  await expect(page.locator('.sig-card')).toHaveCount(5);
  const read = () => page.evaluate(() => { const p = document.querySelector('[data-sig] [style*="stroke-dashoffset"]') || document.querySelector('[data-sig] path'); return p ? getComputedStyle(p).strokeDashoffset : null; });
  const before = await read();
  await page.evaluate(async () => {
    const s = document.querySelector('[data-sig]'); const top = s.getBoundingClientRect().top + scrollY;
    for (let y = top; y < top + s.offsetHeight; y += 150) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
  });
  await page.waitForTimeout(500);
  expect(await read()).not.toBe(before);
  expect(await sidewaysOverflow(page)).toBeNull();
});
