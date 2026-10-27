// An order on a time slot staff cancelled: Confirm, Mark paid and Complete each warn about the slot,
// and after OK the change is saved (the buttons send force: true; without it the API answers 409
// session_cancelled). WRITES: a published e2e experience, one session, one pay-at-hotel order; the
// order is cancelled and the product archived at the end. Runs only with E2E_WRITE=1 against a test
// server on a database copy (see playwright.config.mjs), Chrome projects only.
import { test, expect } from '@playwright/test';
import { WRITE, adminCreds, skipLoader, watch } from './helpers.mjs';

test.skip(!WRITE, 'set E2E_WRITE=1 (test server on a database copy) to run the admin write checks');
test.describe.configure({ mode: 'serial', timeout: 120_000 });

const rand = () => Math.random().toString(36).slice(2, 8);
const tiraneDay = (ahead) => {
  const d = new Date(Date.now() + ahead * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tirane', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};

test('cancelled slot: confirm, mark paid and complete warn, then save', async ({ page, context, baseURL }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('chrome'), 'one engine is enough for an admin write check');
  const { email, password } = adminCreds();
  test.skip(!email || !password, 'no admin credentials (E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD or .env)');
  await skipLoader(context);
  const problems = watch(page);
  const same = { origin: new URL(baseURL).origin, 'sec-fetch-site': 'same-origin' };

  // sign in through the form
  await page.goto('/admin/');
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.locator('#login-email').fill(email);
  await page.locator('#login-pw').fill(password);
  await page.locator('button[type="submit"]').filter({ visible: true }).first().click();
  await expect(page).not.toHaveURL(/login/);

  // an experience with one session, and a pay-at-hotel order on it
  const slug = `e2e-slot-${rand()}${rand()}`;
  const pr = await page.request.post('/api/admin/products', { headers: same, data: { slug, kind: 'experience', status: 'published', name_sq: 'E2E orar', name_en: 'E2E slot', price: 1000, capacity: 8 } });
  expect(pr.status(), await pr.text()).toBe(201);
  const product = (await pr.json()).item;
  const startsAt = `${tiraneDay(20)}T10:00`;
  const sr = await page.request.post('/api/admin/sessions', { headers: same, data: { product_id: product.id, starts_at: startsAt, capacity: 8 } });
  expect(sr.status(), await sr.text()).toBe(201);
  const session = (await sr.json()).item;
  const phone = `+355 6${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
  const cr = await page.request.post('/api/checkout', {
    headers: { origin: new URL(baseURL).origin },
    data: { lang: 'sq', items: [{ key: 'e', slug, kind: 'experience', qty: 1, guests: 1, session_id: session.id }], customer: { name: 'E2E Orar', email: `e2e-slot-${rand()}@example.com`, phone, country: 'AL' }, payment_method: 'hotel', terms_accepted: true },
  });
  expect(cr.status(), await cr.text()).toBe(201);
  const code = (await cr.json()).code;
  const order = async () => (await (await page.request.get(`/api/admin/orders/${code}`)).json()).order;

  try {
    // staff cancel the slot on Eksperiencat & oraret
    await page.goto(`/admin/oraret/?p=${product.id}&muaj=${startsAt.slice(0, 7)}`);
    const cancelSlot = page.locator(`button[data-action="/api/admin/sessions/${session.id}"][data-body='{"status":"cancelled"}']`);
    await cancelSlot.scrollIntoViewIfNeeded();
    await cancelSlot.click();
    await page.locator('#adm-confirm [data-confirm-ok]').click();
    await expect(page.locator(`button[data-action="/api/admin/sessions/${session.id}"][data-body='{"status":"open"}']`)).toBeAttached();

    const orderUrl = `/admin/porosite/${code}/`;
    const orderApi = `/api/admin/orders/${(await order()).id}`;
    const steps = [
      { body: '"status":"confirmed"', warn: /orar.*anuluar/i, check: (o) => o.status === 'confirmed' },
      { body: '"payment_status":"paid"', warn: /orar.*anuluar/i, check: (o) => o.payment_status === 'paid' },
      { body: '"status":"completed"', warn: /orar.*anuluar.*zhvillua/i, check: (o) => o.status === 'completed' },
    ];
    for (const s of steps) {
      await page.goto(orderUrl);
      await expect(page.locator('main .note-box').first()).toBeVisible();
      const btn = page.locator(`main button[data-body*='${s.body}']`);
      await expect(btn, `${s.body} button sends force`).toHaveAttribute('data-body', /"force":true/);
      const sent = page.waitForResponse((r) => r.url().endsWith(orderApi) && r.request().method() === 'PATCH');
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      const dialog = page.locator('#adm-confirm');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('[data-confirm-body]')).toHaveText(s.warn);
      // forms.ts reloads the page after a 200: wait for that navigation (set up before the click),
      // or the next page.goto races it and is "interrupted by another navigation"
      const reloaded = page.waitForEvent('framenavigated', { predicate: (f) => f === page.mainFrame(), timeout: 15_000 });
      reloaded.catch(() => {}); // still awaited below; this only keeps a failed save from leaving it unhandled
      await dialog.locator('[data-confirm-ok]').click();
      const res = await sent;
      // the page reloads after a 200, so the body is read only on a failure (no reload then)
      expect(res.status(), res.ok() ? s.body : `${s.body}: ${await res.text()}`).toBe(200);
      expect(JSON.parse(res.request().postData() || '{}').force).toBe(true);
      await reloaded;
      await page.waitForLoadState('load');
      await expect.poll(async () => s.check(await order()), { message: `${s.body} saved` }).toBe(true);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  } finally {
    await page.request.patch(`/api/admin/orders/${code}`, { headers: same, data: { status: 'cancelled' } });
    await page.request.delete(`/api/admin/products/${product.id}`, { headers: same });
  }
});
