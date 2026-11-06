import { database, closeDatabase } from '../src/lib/core/db';
import { chromium } from '@playwright/test';
import { appOrigin, verifyPublicUrl } from '../src/lib/security/network';
const slug = process.argv[2];
if (!slug || !/^[a-z0-9-]{1,100}$/.test(slug))
  throw new Error('Usage: npm run smoke:public -- <published-slug>');
const url = `${appOrigin()}/p/${slug}`;
await verifyPublicUrl(url, `/p/${slug}`);
const [published] =
  await database()`select id,published_revision from projects where publish_slug=${slug} and published_verified`;
if (!published?.published_revision) throw new Error('VERIFIED_PUBLICATION_REQUIRED');
const browser = await chromium.launch();
try {
  for (const width of [375, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.name));
    const response = await page.goto(url);
    if (
      (await page.locator('main[data-oneboss-revision]').getAttribute('data-oneboss-revision')) !==
      String(published.published_revision)
    )
      throw new Error('REVISION_CHANGED');
    if (!response?.ok()) throw new Error('PUBLIC_SITE_FAILED');
    if (await page.locator('body').evaluate((e) => e.scrollWidth > window.innerWidth + 1))
      throw new Error('LAYOUT_OVERFLOW');
    if (
      await page
        .locator('img')
        .evaluateAll((imgs) =>
          imgs.some(
            (i) => !(i as HTMLImageElement).complete || (i as HTMLImageElement).naturalWidth === 0,
          ),
        )
    )
      throw new Error('BROKEN_IMAGE');
    // B adapter must expose at least one testable interaction with an observable state change.
    const control = page.locator('[data-oneboss-interaction]').first();
    await control.waitFor();
    const before = await page.locator('main').innerHTML();
    await control.click();
    await page.waitForTimeout(200);
    if (before === (await page.locator('main').innerHTML()))
      throw new Error('INTERACTION_NO_EFFECT');
    if (errors.length) throw new Error('BROWSER_ERRORS');
    console.log(JSON.stringify({ width, url, passed: true }));
    await page.close();
  }
  const rows =
    await database()`update projects set browser_verified_revision=${published.published_revision} where id=${published.id} and published_revision=${published.published_revision} and published_verified returning id`;
  if (!rows.length) throw new Error('PUBLICATION_CHANGED_DURING_QA');
} finally {
  await browser.close();
  await closeDatabase();
}
