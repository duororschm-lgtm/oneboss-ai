import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import type postgres from 'postgres';
import { chromium } from '@playwright/test';

export async function verifyCreativeFlow({
  api,
  db,
  owner,
  stranger,
  projectId,
  orgId,
  origin,
  checks,
}: {
  api: (
    path: string,
    token?: string,
    body?: unknown,
    key?: string,
    status?: number,
  ) => Promise<any>;
  db: ReturnType<typeof postgres>;
  owner: string;
  stranger: string;
  projectId: string;
  orgId: string;
  origin: string;
  checks: string[];
}) {
  async function completed(run: { id: string }) {
    await db`update agent_runs set max_attempts=1 where id=${run.id}`;
    for (let n = 0; n < 180; n++) {
      const [saved] =
        await db`select status,error_class,output,usage from agent_runs where id=${run.id}`;
      if (saved.status === 'SUCCEEDED') {
        console.log(
          JSON.stringify({ creativeRunId: run.id, status: saved.status, usage: saved.usage }),
        );
        return saved.output;
      }
      assert(saved.status !== 'FAILED', `CREATIVE_${saved.error_class}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('CREATIVE_RUN_TIMEOUT');
  }
  const productId = randomUUID();
  const facts = [
    { id: randomUUID(), productId, key: 'name', value: '联调测试椅子' },
    {
      id: randomUUID(),
      productId,
      key: 'price',
      value: {
        amountMinor: 12900,
        currency: 'CNY',
        unit: '把',
        priceType: 'fixed',
      },
    },
    { id: randomUUID(), productId, key: 'description', value: '用于隔离测试的产品资料。' },
  ].map((f) => ({ ...f, source: 'customer', verified: true, version: 1 }));
  const intake = await api(`core/projects/${projectId}/intake`, owner, {
    products: [{ id: productId, name: '联调测试椅子', description: '隔离环境的测试数据。' }],
    facts,
    brief: {
      projectId,
      organizationId: orgId,
      productIds: [productId],
      objective: '依据已确认资料制作网站与海报，不增加任何产品声明。',
      confirmedFacts: facts.map((f) => f.id),
      assetRefs: [],
      preferredStyles: ['editorial-minimal', 'future-tech'],
      restrictions: ['不编造材质、尺寸、折扣、认证和销量。'],
      deliverables: { site: true, posterCount: 1, xhsCopy: true },
      approval: 'pending',
    },
  });
  await api(`core/projects/${projectId}/approve-brief`, owner, { revision: intake.brief.revision });
  const directionsRun = await api(`core/projects/${projectId}/design-options`, owner, {});
  const directions = await completed(directionsRun);
  await api(`core/projects/${projectId}/approve-design`, owner, {
    runId: directionsRun.id,
    styleId: directions.choices[0].styleId,
  });
  const production = await completed(await api(`core/projects/${projectId}/generate`, owner, {}));
  assert(production.artifactRevision > 0);
  await api(`core/projects/${projectId}/approve-revision`, owner, {
    revision: production.artifactRevision,
  });
  const previewPath = `core/projects/${projectId}/preview?revision=${production.artifactRevision}`;
  const preview = await api(previewPath, owner);
  assert(preview.facts.every((f: { verified: boolean }) => f.verified));
  await api(previewPath, stranger, undefined, undefined, 403);
  checks.push(
    'real MiMo directions and production persisted; B renderer QA and customer revision approval passed',
  );

  const path = `/preview/${projectId}/${production.artifactRevision}`;
  assert.equal((await fetch(origin + path)).status, 404);
  const browser = await chromium.launch({
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    headless: true,
  });
  await mkdir('.cache/creative-acceptance', { recursive: true });
  try {
    for (const width of [375, 768, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      // Add a bearer only to this local origin, never to third-party asset requests.
      await context.route(origin + '/**', (route) =>
        route.continue({
          headers: { ...route.request().headers(), authorization: `Bearer ${owner}` },
        }),
      );
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.name));
      const response = await page.goto(origin + path);
      assert(response?.ok(), 'PREVIEW_HTTP_FAILED');
      await page.locator('.site').waitFor();
      assert.equal(await page.locator('main').count(), 1);
      const control = page.locator('[data-oneboss-interaction]').first();
      await control.click();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-oneboss-interaction]')?.getAttribute('aria-selected') ===
          'true',
      );
      assert.equal(
        await page.locator('body').evaluate((el) => el.scrollWidth > window.innerWidth + 1),
        false,
        `PREVIEW_LAYOUT_OVERFLOW_${width}`,
      );
      assert.deepEqual(errors, [], 'PREVIEW_BROWSER_ERRORS');
      await page.screenshot({ path: `.cache/creative-acceptance/${width}.png`, fullPage: true });
      console.log(JSON.stringify({ width, privatePreview: true, interactionPassed: true }));
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const [p] = await db`select publish_slug,published_revision from projects where id=${projectId}`;
  assert.equal(p.published_revision, null);
  assert.equal((await fetch(`${origin}/p/${p.publish_slug}`)).status, 404);
  checks.push(
    'private preview real B React hydration/tabs passed at 375/768/1280; anonymous preview and unpublished slug denied',
  );
}
