// JavaScript off: every page keeps its h1 and its words; the GET forms still work.
import { test, expect } from '@playwright/test';

test.use({ javaScriptEnabled: false });

const PAGES = [
  '/', '/en/', '/qendrimi/', '/qendrimi/dhome-deluxe/', '/eksperienca/', '/eksperienca/shetitje-me-varke-ne-lagune/',
  '/dyqani/', '/dyqani/karte-dhurate/', '/dyqani/harta-e-lagunes/', '/itinerari/', '/trashegimia/', '/trashegimia/laguna-e-karavastase/',
  '/tani/', '/kontakt/', '/privatesia/', '/kushtet/', '/kreditet/', '/rezervimet/', '/shporta/',
  '/en/stay/', '/en/shop/', '/en/heritage/', '/en/now/', '/en/contact/',
];

for (const p of PAGES) {
  test(`${p} without JavaScript: h1 and at least 50 words`, async ({ page }) => {
    await page.goto(p);
    await expect(page.locator('h1')).toBeVisible();
    const words = (await page.locator('main').innerText()).split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(50);
  });
}

test('product pages show their price without JavaScript', async ({ page }) => {
  await page.goto('/dyqani/harta-e-lagunes/');
  await expect(page.locator('main')).toContainText(/\d[\d\s ]*\s?lekë/);
  await page.goto('/en/shop/harta-e-lagunes/');
  await expect(page.locator('main')).toContainText(/[\d,]+\s?lek\b/);
});

test('checkout without JavaScript says why and where to write', async ({ page }) => {
  await page.goto('/arka/');
  await expect(page.locator('h1')).toBeVisible();
  // <noscript> text: read with innerText (Playwright's text matchers skip noscript content)
  expect(await page.locator('main').innerText()).toContain('JavaScript');
});

test('shop search works as a plain GET form', async ({ page }) => {
  await page.goto('/dyqani/');
  const q = page.locator('main form input[name="q"]').first();
  await q.fill('harta');
  await q.press('Enter');
  await expect(page).toHaveURL(/[?&]q=harta/);
  await expect(page.locator('main')).toContainText('Harta e Lagunës');
});

test('itinerary plan renders on the server from the URL', async ({ page }) => {
  await page.goto('/itinerari/?dite=3&interesa=zogj,natyre&ritmi=normal');
  const words = (await page.locator('main').innerText()).split(/\s+/).length;
  expect(words).toBeGreaterThan(400);
});
