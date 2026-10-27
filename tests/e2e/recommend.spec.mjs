// Recommendation rails and leaving the page. WebKit cancels a page's loads as soon as a navigation
// starts and logs each cancelled fetch as "… due to access control checks." (seen once as a flaky
// journey failure). recommend.ts drops its waiting or running /api/recommend on beforeunload, and
// keeps that listener only while a request is due (never costing the back/forward cache).
// The next page is held back on purpose: the old page stays alive while its loads are cancelled.
// Read-only: the cart lives in localStorage.
import { test, expect } from '@playwright/test';
import { skipLoader, watch } from './helpers.mjs';

const railListener = () => {
  const live = new Set();
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (t, f, o) { if (this === window && t === 'beforeunload' && String(f).includes('lastQuery')) live.add(f); return add.call(this, t, f, o); };
  EventTarget.prototype.removeEventListener = function (t, f, o) { if (this === window && t === 'beforeunload') live.delete(f); return rem.call(this, t, f, o); };
  window.__railUnload = () => live.size;
};

test.beforeEach(async ({ context, page }) => {
  await skipLoader(context);
  await context.addInitScript(() => { try { localStorage.setItem('dv-prefs', JSON.stringify({ interests: ['nature'], currency: 'ALL' })); } catch { /* private */ } });
  await context.addInitScript(railListener);
  await page.route('**/shporta/', async (route) => { await new Promise((r) => setTimeout(r, 1200)); try { await route.continue(); } catch { /* page closed */ } });
});

test('the rail personalises, then lets go of beforeunload', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/dyqani/harta-e-lagunes/');
  await expect(page.locator('[data-rec] [data-rec-list] [data-reason]').first()).toBeAttached();
  await expect.poll(() => page.evaluate(() => window.__railUnload())).toBe(0);
  expect(problems, problems.join('\n')).toEqual([]);
});

test('add to cart and leave inside the debounce: no cancelled-request error', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/dyqani/harta-e-lagunes/');
  await expect(page.locator('[data-rec] [data-rec-list] [data-reason]').first()).toBeAttached();
  await page.locator('form[data-buy] button[value="add"]').click();
  await page.goto('/shporta/');
  await page.waitForTimeout(400);
  expect(problems, problems.join('\n')).toEqual([]);
});

test('leave while the request runs: no cancelled-request error', async ({ page }) => {
  const problems = watch(page);
  await page.route('**/api/recommend**', async (route) => { await new Promise((r) => setTimeout(r, 2000)); try { await route.continue(); } catch { /* page gone */ } });
  const sent = page.waitForRequest((r) => r.url().includes('/api/recommend'));
  await page.goto('/dyqani/harta-e-lagunes/');
  await sent;
  await page.goto('/shporta/');
  await page.waitForTimeout(400);
  expect(problems, problems.join('\n')).toEqual([]);
});
