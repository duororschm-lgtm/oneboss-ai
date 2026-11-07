import { chromium, type Browser } from 'playwright-core';
import { appOrigin, verifyPublicUrl } from '../security/network';
import { assert, AppError } from '../core/errors';

export interface PublicationBrowserOptions {
  publicationToken?: string;
  onStage?: (stage: string) => Promise<void>;
}
/** Observe the clicked control and its declared panel, not unrelated timers/animations. */
function interactionState(element: Element) {
  const controlled = (element.getAttribute('aria-controls') || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.outerHTML || '')
    .join('');
  return JSON.stringify({
    control: element.outerHTML,
    controlled,
    checked: (element as HTMLInputElement).checked,
    value: (element as HTMLInputElement).value,
  });
}
/** Only visits our validated publication path. All real QA gates remain mandatory. */
export async function verifyPublishedBrowser(
  slug: string,
  revision: number,
  options: PublicationBrowserOptions = {},
) {
  assert(/^[a-z0-9-]{1,100}$/.test(slug), 'INVALID_PUBLIC_SLUG');
  const url = `${appOrigin()}/p/${slug}`;
  await verifyPublicUrl(url, `/p/${slug}`, options);
  let browser: Browser | undefined;
  let stage = 'launch';
  const evidence: { width: number; revision: number; passed: true }[] = [];
  try {
    await options.onStage?.('publish-browser-launch');
    browser = await chromium.launch({
      ...(process.env.BROWSER_EXECUTABLE_PATH
        ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH }
        : process.platform === 'win32'
          ? { channel: 'msedge' }
          : {}),
      args: ['--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1'],
      timeout: 30000,
    });
    const context = await browser.newContext();
    if (options.publicationToken)
      await context.route('**/*', (route) => {
        const request = route.request(),
          target = new URL(request.url());
        const headers = { ...request.headers() };
        // Do not forward the capability to Storage/CDNs, other projects or query strings.
        delete headers['x-oneboss-publication'];
        if (
          target.origin === appOrigin() &&
          (target.pathname === `/p/${slug}` || target.pathname.startsWith(`/p/${slug}/`))
        )
          headers['x-oneboss-publication'] = options.publicationToken!;
        return route.fallback({ headers });
      });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.name));
    for (const width of [375, 768, 1280]) {
      errors.length = 0;
      stage = 'navigation';
      await options.onStage?.(`publish-browser-${width}-navigation`);
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      assert(response?.ok(), 'PUBLIC_SITE_UNREACHABLE', 502);
      const main = page.locator('main[data-oneboss-revision]');
      await main.waitFor({ state: 'visible', timeout: 10000 });
      assert(
        (await main.getAttribute('data-oneboss-revision')) === String(revision),
        'PUBLIC_REVISION_MISMATCH',
        409,
      );
      stage = 'images';
      await options.onStage?.(`publish-browser-${width}-images`);
      await page.locator('img').evaluateAll((images) =>
        images.forEach((image) => {
          (image as HTMLImageElement).loading = 'eager';
        }),
      );
      await page.waitForFunction(
        () => Array.from(document.images).every((image) => image.complete),
        null,
        { timeout: 10000 },
      );
      assert(
        await page
          .locator('img')
          .evaluateAll((images) =>
            images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
          ),
        'BROKEN_IMAGE',
        502,
      );
      stage = 'layout';
      await page.waitForFunction(() => document.fonts.status === 'loaded', null, {
        timeout: 10000,
      });
      assert(
        !(await page
          .locator('body')
          .evaluate(
            (element) =>
              Math.max(element.scrollWidth, document.documentElement.scrollWidth) > innerWidth + 1,
          )),
        'LAYOUT_OVERFLOW',
      );
      stage = 'interaction';
      await options.onStage?.(`publish-browser-${width}-interaction`);
      const control = page.locator('[data-oneboss-interaction]').first();
      assert(await control.count(), 'INTERACTION_QA_FAILED', 502);
      const before = await control.evaluate(interactionState);
      await control.click({ timeout: 10000 });
      let changed = false;
      for (let i = 0; i < 50; i++) {
        if ((await control.evaluate(interactionState)) !== before) {
          changed = true;
          break;
        }
        await page.waitForTimeout(100);
      }
      assert(changed, 'INTERACTION_QA_FAILED', 502);
      assert(
        (await main.getAttribute('data-oneboss-revision')) === String(revision),
        'PUBLIC_REVISION_MISMATCH',
        409,
      );
      assert(!errors.length, 'BROWSER_ERRORS', 502);
      evidence.push({ width, revision, passed: true });
    }
    return evidence;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      stage === 'launch'
        ? 'BROWSER_LAUNCH_FAILED'
        : stage === 'interaction'
          ? 'INTERACTION_QA_FAILED'
          : stage === 'images'
            ? 'BROKEN_IMAGE'
            : error instanceof Error && error.name === 'TimeoutError'
              ? 'BROWSER_TIMEOUT'
              : 'PUBLIC_SITE_UNREACHABLE',
      502,
    );
  } finally {
    await browser?.close().catch(() => {});
  }
}
