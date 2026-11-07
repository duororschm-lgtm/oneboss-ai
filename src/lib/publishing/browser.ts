import { chromium } from 'playwright-core';
import { appOrigin, verifyPublicUrl } from '../security/network';
import { assert } from '../core/errors';

/** Only visits our validated publication path, never a customer-submitted URL. */
export async function verifyPublishedBrowser(slug: string, revision: number) {
  assert(/^[a-z0-9-]{1,100}$/.test(slug), 'INVALID_PUBLIC_SLUG');
  const url = `${appOrigin()}/p/${slug}`;
  await verifyPublicUrl(url, `/p/${slug}`);
  const browser = await chromium.launch({
    ...(process.env.BROWSER_EXECUTABLE_PATH
      ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
      : process.platform === 'win32'
        ? { channel: 'msedge' }
        : {}),
    args: ['--disable-dev-shm-usage'],
    timeout: 30000,
  });
  const evidence: { width: number; revision: number; passed: true }[] = [];
  try {
    for (const width of [375, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.name));
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      assert(response?.ok(), 'PUBLIC_SITE_UNREACHABLE', 502);
      const main = page.locator('main[data-oneboss-revision]');
      assert(
        (await main.getAttribute('data-oneboss-revision')) === String(revision),
        'PUBLIC_REVISION_MISMATCH',
        409,
      );
      assert(
        !(await page.locator('body').evaluate((e) => e.scrollWidth > window.innerWidth + 1)),
        'LAYOUT_OVERFLOW',
      );
      assert(
        !(await page
          .locator('img')
          .evaluateAll((images) =>
            images.some(
              (i) => !(i as HTMLImageElement).complete || !(i as HTMLImageElement).naturalWidth,
            ),
          )),
        'BROKEN_IMAGE',
      );
      const before = await main.innerHTML();
      await page.locator('[data-oneboss-interaction]').first().click({ timeout: 10000 });
      await page.waitForFunction(
        (html) => document.querySelector('main[data-oneboss-revision]')?.innerHTML !== html,
        before,
        { timeout: 5000 },
      );
      assert(!errors.length, 'BROWSER_ERRORS');
      evidence.push({ width, revision, passed: true });
      await page.close();
    }
    return evidence;
  } finally {
    await browser.close();
  }
}
