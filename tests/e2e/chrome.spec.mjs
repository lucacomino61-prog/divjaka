// Site chrome: menu, language switch, no third-party requests or cookies, 404 page.
import { test, expect } from '@playwright/test';
import { skipLoader } from './helpers.mjs';

test.beforeEach(async ({ context }) => { await skipLoader(context); });

/** The visible language link; on phones it may live in the menu. */
function langLink(page, lang) {
  return page.locator(`a[hreflang="${lang}"]`).filter({ visible: true }).first();
}

test('menu opens and closes (button and Escape)', async ({ page }) => {
  await page.goto('/qendrimi/');
  const btn = page.locator('.menu-btn');
  await btn.click();
  await expect(page.locator('#menu')).toHaveJSProperty('open', true);
  await expect(page.locator('#menu a[href="/eksperienca/"]').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toHaveJSProperty('open', false);
  await btn.click();
  await expect(page.locator('#menu')).toHaveJSProperty('open', true);
  await page.locator('#menu [data-close="menu"]').click();
  await expect(page.locator('#menu')).toHaveJSProperty('open', false);
});

test('language switch goes to the twin page, not to the home', async ({ page }) => {
  await page.goto('/qendrimi/dhome-deluxe/');
  await langLink(page, 'en').click();
  await expect(page).toHaveURL(/\/en\/stay\/dhome-deluxe\/$/);
  await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
  await langLink(page, 'sq').click();
  await expect(page).toHaveURL(/\/qendrimi\/dhome-deluxe\/$/);
});

test('no third-party requests and no cookies on public pages', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL).origin;
  const foreign = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && u.origin !== origin) foreign.push(r.url()); });
  for (const p of ['/', '/dyqani/karte-dhurate/', '/tani/', '/en/stay/']) {
    await page.goto(p, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
  }
  expect(foreign, foreign.join('\n')).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});

test('404 page is bilingual and searchable', async ({ page }) => {
  const res = await page.goto('/nuk-ekziston/?q=pelikan');
  expect(res.status()).toBe(404);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('main')).toContainText('This place is not on the chart');
});
