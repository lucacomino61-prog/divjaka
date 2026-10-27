import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WRITE = process.env.E2E_WRITE === '1';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Admin credentials: E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD, else the project's .env (never printed). */
export function adminCreds() {
  let email = process.env.E2E_ADMIN_EMAIL, password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    try {
      const t = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
      const get = (k) => (new RegExp(`^${k}=(.*)$`, 'm').exec(t)?.[1] || '').trim().replace(/^["']|["']$/g, '');
      email ||= get('ADMIN_EMAIL'); password ||= get('ADMIN_PASSWORD');
    } catch { /* none */ }
  }
  return { email, password };
}

/** Start every page past the once-per-session preloader. */
export async function skipLoader(context) {
  await context.addInitScript(() => { try { sessionStorage.setItem('dv-seen', '1'); } catch { /* private */ } });
}

/** Count requestAnimationFrame calls (window.__raf). */
export async function countRaf(context) {
  await context.addInitScript(() => {
    window.__raf = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => { window.__raf++; return raf(cb); };
  });
}
export async function rafPerSecond(page, ms = 1500) {
  await page.evaluate(() => { window.__raf = 0; });
  await page.waitForTimeout(ms);
  return Math.round((await page.evaluate(() => window.__raf)) * 1000 / ms);
}

/** Widest element past the right edge, or null when the page does not scroll sideways. */
export async function sidewaysOverflow(page) {
  return page.evaluate(() => {
    const iw = innerWidth, w = document.documentElement.scrollWidth;
    if (w <= iw) return null;
    let widest = '', max = iw;
    for (const e of document.querySelectorAll('body *')) {
      const r = e.getBoundingClientRect();
      if (r.right > max + 1 && getComputedStyle(e).position !== 'fixed') { max = r.right; widest = `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 60)}`; }
    }
    return `scrollWidth ${w} > ${iw}: ${widest}`;
  });
}

/** Collect console errors, page errors and failed requests of a page. */
export function watch(page) {
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) problems.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
  page.on('requestfailed', (r) => { const f = r.failure()?.errorText || ''; if (!/ABORTED|cancelled|NS_BINDING_ABORTED/i.test(f)) problems.push(`failed: ${f} ${r.url()}`); });
  return problems;
}

export const isPhone = (testInfo) => !!testInfo.project.use.isMobile;
export const projectIndex = (testInfo) => ['chrome-desktop', 'chrome-phone', 'webkit-desktop', 'webkit-iphone'].indexOf(testInfo.project.name);

/** YYYY-MM of the month `ahead` months after the current one (Europe/Tirane is close enough for a month key). */
export function monthKey(ahead = 1) {
  const d = new Date();
  const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + ahead, 1));
  return `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** On phones the room / experience booking card lives in a sheet behind the sticky pill. */
export async function openBookingSheet(page, testInfo) {
  if (!isPhone(testInfo)) return;
  const pill = page.locator('[data-bk-pill]');
  if (await pill.isVisible()) { await pill.click(); await page.waitForTimeout(600); }
}

export const visibleButton = (page, text) => page.locator('main button').filter({ hasText: text, visible: true }).first();
