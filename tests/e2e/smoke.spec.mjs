// Every public route: 200, one h1, canonical + hreflang twins, no console errors, no sideways scroll.
import { test, expect } from '@playwright/test';
import { skipLoader, sidewaysOverflow, watch } from './helpers.mjs';

const KEY_PAGES = [
  '/', '/en/', '/qendrimi/', '/qendrimi/dhome-deluxe/', '/eksperienca/', '/eksperienca/shetitje-me-varke-ne-lagune/',
  '/dyqani/', '/dyqani/karte-dhurate/', '/shporta/', '/arka/', '/rezervimet/', '/itinerari/', '/trashegimia/',
  '/trashegimia/pelikani-kacurrel/', '/tani/', '/kontakt/', '/privatesia/', '/kushtet/', '/kreditet/',
  '/en/stay/dhome-deluxe/', '/en/shop/', '/en/checkout/', '/en/now/',
];

test.describe('server HTML of every sitemap route', () => {
  test('sitemap routes answer 200 with one h1, canonical and hreflang twins', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chrome-desktop', 'server HTML checks run once');
    const sm = await (await request.get('/sitemap.xml')).text();
    const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    expect(urls.length).toBeGreaterThan(40);
    const problems = [];
    for (const p of urls) {
      const res = await request.get(p);
      const html = await res.text();
      if (res.status() !== 200) { problems.push(`${p}: ${res.status()}`); continue; }
      const h1 = (html.match(/<h1[\s>]/g) || []).length;
      if (h1 !== 1) problems.push(`${p}: ${h1} h1`);
      const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
      if (!canonical || new URL(canonical).pathname !== p) problems.push(`${p}: canonical ${canonical}`);
      const alts = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => m[1]).sort().join(',');
      if (alts !== 'en,sq,x-default') problems.push(`${p}: hreflang ${alts}`);
      if (!/<meta name="description" content="[^"]{20,}/.test(html)) problems.push(`${p}: description`);
      for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
        try { JSON.parse(m[1]); } catch { problems.push(`${p}: JSON-LD does not parse`); }
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('unknown routes answer 404 in both languages', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chrome-desktop', 'server HTML checks run once');
    expect((await request.get('/nuk-ekziston-kjo-faqe/')).status()).toBe(404);
    expect((await request.get('/en/no-such-page/')).status()).toBe(404);
  });

  test('robots, sitemap and product feed', async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== 'chrome-desktop', 'server HTML checks run once');
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toMatch(/Disallow: \/admin/);
    expect(robots).toMatch(/Sitemap: https?:\/\//);
    const feed = await request.get('/feed/products.xml');
    expect(feed.status()).toBe(200);
    const xml = await feed.text();
    expect(xml).toMatch(/<rss[^>]*version="2.0"/);
    expect(xml).toMatch(/xmlns:g="http:\/\/base.google.com\/ns\/1.0"/);
    for (const item of xml.split('<item>').slice(1)) for (const f of ['g:id', 'title', 'link', 'g:price', 'g:availability', 'g:image_link']) expect(item, f).toContain(`<${f}`);
  });
});

test.describe('key pages in the browser', () => {
  test.beforeEach(async ({ context }) => { await skipLoader(context); });
  for (const p of KEY_PAGES) {
    test(`${p} loads clean`, async ({ page }) => {
      const problems = watch(page);
      const res = await page.goto(p, { waitUntil: 'load' });
      expect(res.status()).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      await page.waitForTimeout(800);
      expect(await sidewaysOverflow(page)).toBeNull();
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }
});
