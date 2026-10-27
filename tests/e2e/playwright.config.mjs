// Playwright e2e suite for the Divjaka platform (PLAN §10). Runs against a server you start yourself:
//
//   E2E_BASE_URL=http://127.0.0.1:3850 npm run test:e2e              read-only checks
//   E2E_BASE_URL=... E2E_WRITE=1 npm run test:e2e                     + the full customer journey,
//                                                                       orders, admin cancel (TEST server only)
//
// The write journey creates real orders, signs in to /admin/ and cancels them again. Point it only at a
// test server that runs on a COPY of the database (DIVJAKA_DB / DIVJAKA_DATA), with ALLOW_TEST_PAYMENTS=1
// (TEST card), COOKIE_SECURE=0 (plain http) and RATE_LIMIT_FACTOR=20 (four browser projects share one
// address). See README → "End-to-end tests".
//
// Browsers: Chrome (installed, channel 'chrome') and Playwright WebKit. Firefox is left out: Playwright's
// Firefox does not launch on this Windows machine (spawn UNKNOWN). WebKit on Windows draws variable fonts
// from their default instance and leaves WebGL out of screenshots: use it for layout, not for type.
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3801';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs$/,
  outputDir: './.results/artifacts',
  reporter: [['list'], ['html', { outputFolder: './.results/report', open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chrome-desktop', use: { browserName: 'chromium', channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'chrome-phone', use: { browserName: 'chromium', channel: 'chrome', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent } },
    { name: 'webkit-desktop', use: { browserName: 'webkit', viewport: { width: 1440, height: 900 } } },
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'] } },
  ],
});
