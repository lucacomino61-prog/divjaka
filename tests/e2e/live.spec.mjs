// /tani/: real readings when the provider answers, a clean stale state with a retry when it does not.
// (A provider that answers in 4-10 s cannot be simulated from here; see README → End-to-end tests.)
import { test, expect } from '@playwright/test';
import { skipLoader } from './helpers.mjs';

test('/tani/ shows live data or a clean stale state, never both', async ({ page, context, request }) => {
  await skipLoader(context);
  const live = await (await request.get('/api/live')).json();
  await page.goto('/tani/');
  const entry = page.locator('#now-entry');
  const staleBox = page.locator('.now__stale');
  if (live.stale === false && live.weather) {
    await expect(entry).toHaveAttribute('data-stale', '0');
    await expect(staleBox).toHaveCount(0);
    await expect(page.locator('main')).toContainText('°');
    await expect(page.locator('main')).toContainText('MET Norway');
  } else {
    await expect(entry).toHaveAttribute('data-stale', '1');
    await expect(staleBox).toBeVisible();
    await expect(page.locator('main button').filter({ hasText: /Rifresko|Refresh/ }).first()).toBeVisible();
  }
  // the header reading agrees with the page
  await expect(page.locator('[data-live-mini]')).toHaveAttribute('data-state', live.stale === false && live.weather ? 'ready' : /pending|stale/);
});

test('/en/now/ has the same state in English', async ({ page, context, request }) => {
  await skipLoader(context);
  const live = await (await request.get('/api/live')).json();
  await page.goto('/en/now/');
  await expect(page.locator('#now-entry')).toHaveAttribute('data-stale', live.stale === false && live.weather ? '0' : '1');
});
