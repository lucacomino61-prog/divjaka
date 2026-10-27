// The full customer journey (PLAN §10), then the admin side: orders, room-night grid, seats and stock
// moved; cancelling releases them. WRITES ORDERS: runs only with E2E_WRITE=1 against a test server on a
// database copy (see playwright.config.mjs).
import { test, expect } from '@playwright/test';
import { WRITE, adminCreds, skipLoader, sidewaysOverflow, openBookingSheet, projectIndex, monthKey, visibleButton, watch } from './helpers.mjs';

test.skip(!WRITE, 'set E2E_WRITE=1 (test server on a database copy) to run the ordering journey');
test.describe.configure({ mode: 'serial', timeout: 240_000 });

async function adminPage(browser, baseURL) {
  const { email, password } = adminCreds();
  if (!email || !password) return null;
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const a = await ctx.newPage();
  await a.goto('/admin/');
  await expect(a).toHaveURL(/\/admin\/login/);
  await a.locator('#login-email').fill(email);
  await a.locator('#login-pw').fill(password);
  await a.locator('button[type="submit"]').filter({ visible: true }).first().click();
  await expect(a).not.toHaveURL(/login/);
  return { ctx, a };
}

/** Orders left by an earlier failed run of this suite (e-mail e2e-…) still hold places: cancel them. */
async function cancelLeftovers(a, baseURL) {
  const list = await (await a.request.get('/api/admin/orders?q=e2e-&limit=200')).json();
  for (const o of list.items || []) {
    if (o.status === 'cancelled' || !o.email.startsWith('e2e-')) continue;
    const r = await a.request.patch(`/api/admin/orders/${o.id}`, { data: { status: 'cancelled' }, headers: { origin: new URL(baseURL).origin, 'sec-fetch-site': 'same-origin' } });
    expect(r.status(), `cancel leftover ${o.code}`).toBe(200);
  }
}

const nextDay = (d) => new Date(Date.parse(d + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10);

const cartItems = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('dv-cart') || '{"items":[]}').items);

async function fillDetailsAndPay(page, method, tag) {
  // empty submit → errors on the required fields
  await visibleButton(page, 'Vazhdo').click();
  await expect(page.locator('main [aria-invalid="true"]').first()).toBeVisible();
  const invalid = await page.locator('main [aria-invalid="true"]').evaluateAll((els) => els.map((e) => e.name));
  expect(invalid).toEqual(expect.arrayContaining(['name', 'email', 'terms']));
  await page.locator('#f-name').fill('Test E2E');
  const email = `e2e-${tag}-${Date.now()}@example.com`;
  await page.locator('#f-email').fill(email);
  await page.locator('#f-phone').fill('69' + String(Date.now()).slice(-7));
  await page.locator('#f-country').fill('Shqipëri');
  await page.locator('#f-terms').check();
  await visibleButton(page, 'Vazhdo').click();
  const radio = page.locator(`input[name="payment_method"][value="${method}"]`);
  await expect(radio).toHaveCount(1);
  await page.locator('label', { has: radio }).click();
  await visibleButton(page, 'Vazhdo').click();
  // review → submit with a double click: exactly one POST /api/checkout
  let posts = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/api/checkout')) posts++; });
  const submit = page.locator('main button[type="submit"]').filter({ visible: true }).first();
  await submit.dblclick();
  return { posts: () => posts, email };
}

test('customer journey → two orders → admin sees them → cancel releases inventory', async ({ page, context, browser, baseURL }, testInfo) => {
  const idx = Math.max(0, projectIndex(testInfo));
  const month = monthKey(1);
  await skipLoader(context);
  const problems = watch(page);
  let hotelCode, hotelEmail, cardCode, arr, dep, sessionId, sessionDay, tresheNight;

  await test.step('cancel leftovers of an earlier failed run', async () => {
    const adm = await adminPage(browser, baseURL);
    if (!adm) return;
    await cancelLeftovers(adm.a, baseURL);
    await adm.ctx.close();
  });

  await test.step('home + signature', async () => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
    await page.evaluate(async () => { const s = document.querySelector('[data-sig]'); const top = s.getBoundingClientRect().top + scrollY; for (let y = top; y < top + s.offsetHeight; y += 200) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); } });
    expect(await sidewaysOverflow(page)).toBeNull();
  });

  await test.step('stay → room → pick 2 nights → add', async () => {
    await page.goto('/qendrimi/');
    await page.locator('main a[href="/qendrimi/dhome-deluxe/"]').first().click();
    await expect(page).toHaveURL(/\/qendrimi\/dhome-deluxe\//);
    await page.goto(`/qendrimi/dhome-deluxe/?muaji=${month}`);
    await openBookingSheet(page, testInfo);
    const open = await page.locator('[data-booking="room"] .cal__day[data-status="open"]').evaluateAll((els) => els.map((e) => e.dataset.date));
    arr = open[2 + idx * 5]; dep = open[4 + idx * 5];
    await page.locator(`[data-booking="room"] .cal__day[data-date="${arr}"]`).click();
    await page.locator(`[data-booking="room"] .cal__day[data-date="${dep}"]`).click();
    await expect(page.locator('[data-booking="room"] [data-bk-sum]')).toContainText(/\d/);
    await page.locator('[data-booking="room"] [data-bk-add]').click();
    await expect.poll(async () => (await cartItems(page)).some((i) => i.slug === 'dhome-deluxe' && i.from === arr && i.to === dep)).toBe(true);
    expect(await sidewaysOverflow(page)).toBeNull();
  });

  await test.step('experience → pick a session → add', async () => {
    await page.goto(`/eksperienca/qendra-e-vizitoreve-dhe-kulla-360/?muaji=${month}`);
    await openBookingSheet(page, testInfo);
    const open = await page.locator('[data-booking="experience"] .cal__day[data-status="open"]').evaluateAll((els) => els.map((e) => e.dataset.date));
    sessionDay = open[1 + idx * 4];
    await page.locator(`[data-booking="experience"] .cal__day[data-date="${sessionDay}"]`).click();
    const slot = page.locator('[data-booking="experience"] [data-slots-list] label.bk-slot:not(.bk-slot--off)').first();
    await expect(slot).toBeVisible();
    await slot.click();
    await expect(page.locator('[data-booking="experience"] [data-bk-sum]')).toContainText(/\d/);
    await page.locator('[data-booking="experience"] [data-bk-add]').click();
    await expect.poll(async () => (await cartItems(page)).find((i) => i.slug === 'qendra-e-vizitoreve-dhe-kulla-360')?.session_id ?? null).not.toBeNull();
    sessionId = (await cartItems(page)).find((i) => i.slug === 'qendra-e-vizitoreve-dhe-kulla-360').session_id;
  });

  await test.step('shop → gift card + a map print', async () => {
    await page.goto('/dyqani/');
    await page.locator('main a[href="/dyqani/karte-dhurate/"]').first().click();
    await expect(page).toHaveURL(/karte-dhurate/);
    await page.locator('label', { has: page.locator('input[name="amount"][value="5000"]') }).click();
    await page.locator('form[data-buy] button[value="add"]').click();
    await expect.poll(async () => (await cartItems(page)).some((i) => i.slug === 'karte-dhurate' && +i.amount === 5000)).toBe(true);
    await page.goto('/dyqani/harta-e-lagunes/');
    await page.locator('form[data-buy] button[value="add"]').click();
    await expect.poll(async () => (await cartItems(page)).some((i) => i.slug === 'harta-e-lagunes')).toBe(true);
  });

  await test.step('cart lists four lines', async () => {
    await page.goto('/shporta/');
    for (const n of ['Dhomë Deluxe', 'Qendra e Vizitorëve', 'Kartë dhuratë', 'Harta e Lagunës']) await expect(page.locator('main')).toContainText(n);
    expect(await sidewaysOverflow(page)).toBeNull();
  });

  await test.step('checkout, pay at the hotel → order page', async () => {
    await page.goto('/arka/');
    const r = await fillDetailsAndPay(page, 'hotel', `${testInfo.project.name}-hotel`);
    await page.waitForURL(/\/porosia\/DV-[A-Z0-9]+\/\?t=/);
    hotelCode = /\/porosia\/(DV-[A-Z0-9]+)\//.exec(page.url())[1];
    hotelEmail = r.email;
    expect(r.posts()).toBe(1);
    await expect(page.locator('main')).toContainText(hotelCode);
    expect((await cartItems(page)).length).toBe(0);
    expect(await sidewaysOverflow(page)).toBeNull();
  });

  await test.step('TEST card checkout → paid', async () => {
    await page.goto(`/qendrimi/dhome-deluxe-treshe/?muaji=${month}`);
    await openBookingSheet(page, testInfo);
    const open = await page.locator('[data-booking="room"] .cal__day[data-status="open"]').evaluateAll((els) => els.map((e) => e.dataset.date));
    tresheNight = open[3 + idx * 5];
    await page.locator(`[data-booking="room"] .cal__day[data-date="${tresheNight}"]`).click();
    await page.locator(`[data-booking="room"] .cal__day[data-date="${open[4 + idx * 5]}"]`).click();
    await page.locator('[data-booking="room"] [data-bk-add]').click();
    await expect.poll(async () => (await cartItems(page)).length).toBe(1);
    await page.goto('/dyqani/harta-e-lagunes/');
    await page.locator('form[data-buy] [data-qty-more]').click();
    await page.locator('form[data-buy] button[value="add"]').click();
    await expect.poll(async () => (await cartItems(page)).find((i) => i.slug === 'harta-e-lagunes')?.qty).toBe(2);
    await page.goto('/arka/');
    const card = page.locator('input[name="payment_method"][value="card"]');
    test.skip(!(await card.count()), 'card payments are off on this server (needs ALLOW_TEST_PAYMENTS=1 and mode test)');
    const r = await fillDetailsAndPay(page, 'card', `${testInfo.project.name}-card`);
    await page.waitForURL(/\/api\/pay\/test\//);
    expect(r.posts()).toBe(1);
    await page.locator('button').filter({ hasText: /Paguaj|Pay/ }).first().click();
    await page.waitForURL(/\/porosia\/DV-[A-Z0-9]+\/\?t=/);
    cardCode = /\/porosia\/(DV-[A-Z0-9]+)\//.exec(page.url())[1];
    await expect(page.locator('main')).toContainText('PROVË');
  });

  await test.step('find my booking without JavaScript (code + e-mail)', async () => {
    const ctx = await browser.newContext({ baseURL, javaScriptEnabled: false });
    const p = await ctx.newPage();
    await p.goto('/rezervimet/');
    await p.locator('main form input[name="code"]').fill(hotelCode);
    await p.locator('main form input[name="email"]').fill(hotelEmail);
    await p.locator('main form [type="submit"]').first().click();
    await expect(p).toHaveURL(new RegExp(`/porosia/${hotelCode}/\\?t=`));
    await expect(p.locator('main')).toContainText('Qendra e Vizitorëve');
    await ctx.close();
  });

  // soft: the admin half still runs and reports
  expect.soft(problems.filter((x) => !/\/api\/pay\/test\//.test(x)), problems.join('\n')).toEqual([]);

  await test.step('admin: orders, grid, seats, stock; cancel releases', async () => {
    const adm = await adminPage(browser, baseURL);
    test.skip(!adm, 'no admin credentials (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD or .env)');
    const { ctx, a } = adm;
    await a.goto('/admin/porosite/');
    await expect(a.locator('main')).toContainText(hotelCode);
    if (cardCode) await expect(a.locator('main tr, main li').filter({ hasText: cardCode }).first()).toContainText(/test/i);
    const state = async () => {
      const bk = await (await a.request.get(`/api/admin/bookings?from=${arr}&to=${dep}`)).json();
      const room = bk.rooms.find((r) => r.slug === 'dhome-deluxe');
      const goods = await (await a.request.get('/api/admin/products?kind=goods')).json();
      return {
        nights: room.nights.map((n) => n.booked),
        seats: (await (await a.request.get(`/api/admin/bookings?from=${sessionDay}&to=${nextDay(sessionDay)}`)).json()).sessions.find((x) => x.id === sessionId)?.booked,
        stock: goods.items.find((g) => g.slug === 'harta-e-lagunes').stock,
        stays: room.stays.map((s) => s.code),
      };
    };
    const before = await state();
    expect(before.stays).toContain(hotelCode);
    expect(before.nights.every((n) => n >= 1)).toBe(true);
    await a.goto(`/admin/rezervimet?from=${arr}&to=${dep}`);
    await expect(a.locator('main')).toContainText(hotelCode);
    // cancel the pay-at-hotel order
    await a.goto(`/admin/porosite/${hotelCode}/`);
    await a.locator('main button').filter({ hasText: /^Anulo porosinë/ }).click();
    await a.locator('dialog[open] button, [role="dialog"] button').filter({ hasText: /Po, anuloje/ }).click();
    await expect(a.locator('main')).toContainText(/ANULUAR|Anuluar/i);
    const after = await state();
    expect(after.nights).toEqual(before.nights.map((n) => n - 1));
    expect(after.stock).toBe(before.stock + 1);
    expect(before.seats).toBeGreaterThanOrEqual(2);
    expect(after.seats).toBe(before.seats - 2);
    // clean up: cancel the TEST card order too (its stock comes back)
    if (cardCode) {
      await a.goto(`/admin/porosite/${cardCode}/`);
      await a.locator('main button').filter({ hasText: /^Anulo porosinë/ }).click();
      await a.locator('dialog[open] button, [role="dialog"] button').filter({ hasText: /Po, anuloje/ }).click();
      await expect(a.locator('main')).toContainText(/ANULUAR|Anuluar/i);
      expect((await state()).stock).toBe(after.stock + 2);
    }
    await ctx.close();
  });
});
