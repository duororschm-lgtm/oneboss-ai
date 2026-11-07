import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import JSZip from 'jszip';
import { outboundFetch } from '../src/lib/security/http';
import { inspectPng } from '../src/lib/delivery/service';
import { hash } from '../src/lib/core/service';
import type { Workspace, Row } from '../src/lib/customer/types';

/** Real Render UI -> Auth/API -> hosted MiMo/worker -> publication/QA/files. No model fixtures. */
export async function verifyHostedCustomerFlow({
  origin,
  email,
  password,
  projectId,
  orderId,
  read,
  checks,
  runEvidence,
}: {
  origin: string;
  email: string;
  password: string;
  projectId: string;
  orderId: string;
  read: (path: string) => Promise<any>;
  checks: string[];
  runEvidence: unknown[];
}) {
  assert.equal(origin, (process.env.APP_URL || 'https://oneboss-ai.onrender.com'));
  const formatAcceptance = process.env.RUN_HOSTED_FORMAT_ACCEPTANCE === 'true';
  const dir = formatAcceptance ? '.cache/hosted-dual-formats' : '.cache/hosted-customer-ui';
  await mkdir(dir, { recursive: true });
  const browser = await chromium.launch({
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    ...(process.env.HTTPS_PROXY
      ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } }
      : {}),
  });
  const context = await browser.newContext({
      viewport: { width: formatAcceptance ? 375 : 1280, height: 900 },
    }),
    page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.setDefaultNavigationTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.name));
  const workspace = () => read(`core/projects/${projectId}/workspace`) as Promise<Workspace>;
  const phase = (value: string) => console.log(JSON.stringify({ customerPhase: value }));
  async function run(button: string, role: string) {
    const previous = new Set((await workspace()).runs.map((r) => r.id));
    await page.getByRole('button', { name: button, exact: true }).click();
    for (let n = 0; n < 360; n++) {
      const data = await workspace(),
        current = data.runs.find((r) => r.role === role && !previous.has(r.id));
      if (current?.status === 'SUCCEEDED') {
        const evidence = {
          runId: current.id,
          role,
          status: current.status,
          usage: current.usage,
          ...(role === 'publish'
            ? { browserEvidence: (current.output as Row).browserEvidence }
            : {}),
        };
        runEvidence.push(evidence);
        console.log(JSON.stringify(evidence));
        return data;
      }
      if (current?.status === 'FAILED') {
        const failed = {
          runId: current.id,
          role,
          status: current.status,
          errorClass: current.error_class,
          attempt: current.attempt,
          usage: current.usage,
        };
        runEvidence.push(failed);
        console.log(JSON.stringify(failed));
        throw Error(`HOSTED_${role}_${current.error_class}`);
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    throw Error(`HOSTED_${role}_TIMEOUT`);
  }
  async function verifyPublic(slug: string, revision: number) {
    const publicPage = await context.newPage();
    try {
      for (const width of [375, 768, 1280]) {
        await publicPage.setViewportSize({ width, height: 900 });
        const response = await publicPage.goto(`${origin}/p/${slug}`, { waitUntil: 'networkidle' });
        assert(response?.ok(), 'PUBLIC_HTTP_FAILED');
        const main = publicPage.locator('main[data-oneboss-revision]');
        assert.equal(await main.getAttribute('data-oneboss-revision'), String(revision));
        const before = await main.innerHTML();
        await publicPage.locator('[data-oneboss-interaction]').first().click();
        await publicPage.waitForFunction(
          (old) => document.querySelector('main[data-oneboss-revision]')?.innerHTML !== old,
          before,
        );
        assert(
          !(await publicPage
            .locator('body')
            .evaluate((e) => e.scrollWidth > window.innerWidth + 1)),
          'PUBLIC_OVERFLOW',
        );
        await publicPage.screenshot({
          path: `${dir}/public-r${revision}-${width}.png`,
          fullPage: true,
        });
      }
    } finally {
      await publicPage.close();
    }
  }
  async function verifyDelivery(expectedRevision: number) {
    const delivery = await read(`core/projects/${projectId}/delivery`);
    assert.equal(delivery.manifest.siteRevision, expectedRevision);
    if (formatAcceptance) {
      assert.equal(delivery.qrDownloads.length, 2);
      for (const [index, qr] of delivery.qrDownloads.entries()) {
        const qrResponse = await outboundFetch(qr.url, { signal: AbortSignal.timeout(30000) });
        assert(qrResponse.ok, 'SIGNED_QR_DOWNLOAD_FAILED');
        const bytes = Buffer.from(await qrResponse.arrayBuffer());
        await inspectPng(bytes, 800, 800, delivery.manifest.publicSiteUrl);
        const file = delivery.manifest.files.find((f: Row) => f.path === qr.path);
        assert(file && file.sha256 === hash(bytes), 'SIGNED_QR_HASH_MISMATCH');
        await writeFile(`${dir}/qr-${index + 1}.png`, bytes);
      }
    }
    const response = await outboundFetch(delivery.zipDownloadUrl, {
      signal: AbortSignal.timeout(30000),
    });
    assert(response.ok, 'SIGNED_ZIP_FAILED');
    const bytes = Buffer.from(await response.arrayBuffer()),
      archive = await JSZip.loadAsync(bytes);
    for (const file of delivery.manifest.files) {
      const entry = archive.file(file.path);
      assert(entry, 'ZIP_FILE_MISSING');
      const data = await entry.async('nodebuffer');
      assert.equal(data.length, file.size);
      assert.equal(hash(data), file.sha256);
    }
    for (const [index, poster] of delivery.manifest.posters.entries()) {
      await inspectPng(
        await archive.file(poster.path)!.async('nodebuffer'),
        poster.width,
        poster.height,
        delivery.manifest.publicSiteUrl,
        'auto_bottom_right_or_left',
      );
      await writeFile(
        `${dir}/poster-r${expectedRevision}-${index + 1}.png`,
        await archive.file(poster.path)!.async('nodebuffer'),
      );
    }
    if (formatAcceptance)
      assert.deepEqual(
        delivery.manifest.posters.map((p: Row) => p.height),
        [1350, 1080],
      );
    await writeFile(`${dir}/delivery-r${expectedRevision}.zip`, bytes);
    await writeFile(
      `${dir}/manifest-r${expectedRevision}.json`,
      JSON.stringify(delivery.manifest, null, 2),
    );
    await writeFile(
      `${dir}/poster-r${expectedRevision}.png`,
      await archive.file(delivery.manifest.posters[0].path)!.async('nodebuffer'),
    );
    return delivery.manifest as Row;
  }
  try {
    phase('real-login-and-authorized-demo-order');
    await page.goto(`${origin}/login`);
    await page.getByLabel('账号', { exact: true }).fill(email);
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '登录并继续', exact: true }).click();
    await page.waitForURL('**/dashboard');
    await page.goto(`${origin}/dashboard/orders/${orderId}`);
    await page.getByText('演示订单 · 无真实收款', { exact: true }).waitFor();
    await page.getByRole('button', { name: '进入制作项目 →', exact: true }).click();
    await page.waitForURL(`**/projects/${projectId}/intake`);
    phase('customer-intake-and-authorized-image');
    await page.getByLabel('产品名称', { exact: true }).fill('OneBoss 交付体验');
    await page
      .getByLabel('产品介绍', { exact: true })
      .fill('这是完整客户流程的系统演示资料，不是真实商品销售，不发生真实付款。');
    await page
      .getByLabel('这次宣传想达到什么目的？', { exact: true })
      .fill(
        formatAcceptance
          ? '制作明确标识的两个产品系列展示网站，首页有产品列表和可查看的详情；两张海报分别为1080×1350竖版、1080×1080方形，配套小红书文案，仅用于系统验收。'
          : '制作明确标识的宣传网站、高清海报和小红书配套文案，用于系统验收。',
      );
    if (formatAcceptance) {
      await page.getByRole('button', { name: /添加产品（最多/ }).click();
      await page.getByLabel('产品名称', { exact: true }).nth(1).fill('OneBoss 第二款演示产品');
      await page
        .getByLabel('产品介绍', { exact: true })
        .nth(1)
        .fill('同系列的第二款演示产品，仅用于验证关联产品展示，不是真实商品销售。');
      await page.getByLabel('本次海报数量', { exact: false }).selectOption('2');
      await page.getByLabel('海报 1 尺寸', { exact: true }).selectOption('portrait');
      await page.getByLabel('海报 2 尺寸', { exact: true }).selectOption('square');
    }
    await page.getByRole('checkbox', { name: '我拥有这些图片的宣传使用权', exact: true }).check();
    const bytes = await sharp({
      create: { width: 320, height: 320, channels: 3, background: '#d74c2f' },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="320" height="320"><rect x="70" y="70" width="180" height="180" rx="35" fill="#f5f1e8"/><text x="160" y="172" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#20251f">DEMO</text></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: 'oneboss-owned-demo.png', mimeType: 'image/png', buffer: bytes });
    await page.getByRole('checkbox', { name: /素材 1/ }).check();
    await page.getByRole('checkbox', { name: '我已核对以上产品事实', exact: false }).check();
    await page.getByRole('button', { name: '保存已确认事实', exact: true }).click();
    await page.getByRole('button', { name: '批准已保存的需求摘要 →', exact: true }).click();
    await page.getByText('需求摘要已批准', { exact: true }).waitFor();
    const confirmed = await workspace();
    assert.equal(confirmed.assets.length, 1);
    assert(confirmed.briefs[0].body.assetRefs.includes(confirmed.assets[0].id));
    if (formatAcceptance) {
      assert.equal(confirmed.products.length, 2);
      assert.deepEqual(confirmed.briefs[0].body.deliverables.posterFormats, ['portrait', 'square']);
    }
    phase('real-hosted-design-and-production');
    await page.getByRole('link', { name: '创意方向', exact: true }).click();
    await run('生成创意方案', 'design');
    await page.getByRole('button', { name: '选择并批准此方向', exact: true }).first().click();
    await page.getByRole('link', { name: '作品预览', exact: true }).click();
    const generated = await run('开始生成作品', 'generate');
    assert(generated.versions.length);
    await page
      .frameLocator('iframe[title="私有网站预览"]')
      .locator('[data-oneboss-interaction]')
      .first()
      .click();
    await page.getByRole('button', { name: '查看海报草稿', exact: true }).click();
    await page.getByRole('img', { name: '海报草稿 1', exact: true }).waitFor();
    await page.screenshot({ path: `${dir}/customer-studio.png`, fullPage: true });
    phase('approve-publish-and-auto-browser-qa');
    await page.getByRole('button', { name: '批准版本 1', exact: true }).click();
    const published = await run('发布批准版本 →', 'publish');
    assert.equal(published.project.published_revision, 1);
    assert.equal(published.project.browser_verified_revision, 1);
    await verifyPublic(published.project.publish_slug, 1);
    phase('signed-private-delivery-and-customer-acceptance');
    await page.getByRole('link', { name: '作品交付', exact: true }).click();
    await run('生成正式交付包', 'delivery');
    const first = await verifyDelivery(1);
    await page.getByRole('button', { name: '我已检查成品，确认验收', exact: true }).click();
    if (formatAcceptance) {
      assert.deepEqual(errors, [], 'BROWSER_ERRORS');
      await page.screenshot({ path: `${dir}/customer-delivery.png`, fullPage: true });
      checks.push(
        'real hosted two-product intake and MiMo production, selected portrait/square independent PNG layouts, public three-width QA, ZIP/PNG/QR hashes and customer acceptance; no real payment',
      );
      await writeFile(
        `${dir}/result.json`,
        JSON.stringify(
          { passed: true, isDemo: true, realPayment: false, manifest: first, runEvidence },
          null,
          2,
        ),
      );
      return first;
    }
    phase('real-site-only-revision');
    const original = (await workspace()).versions.find((v) => v.revision === 1)!.body;
    await page.getByRole('link', { name: '提出修改', exact: true }).click();
    await page
      .getByLabel('具体希望如何调整？', { exact: true })
      .fill('只把网站首屏改为黑金风格；保持产品事实、海报和小红书文案原样不变。');
    const changed = await run('提交修改，使用一轮次数', 'change');
    const second = changed.versions[0];
    assert.equal(second.revision, 2);
    assert.deepEqual(second.body.posters, original.posters);
    assert.deepEqual(second.body.copy, original.copy);
    assert.notDeepEqual(second.body.site, original.site);
    await page.getByRole('link', { name: '作品预览', exact: true }).click();
    await page.getByRole('button', { name: '批准版本 2', exact: true }).click();
    await run('发布批准版本 →', 'publish');
    await page.getByRole('link', { name: '作品交付', exact: true }).click();
    await run('生成正式交付包', 'delivery');
    const revised = await verifyDelivery(2);
    assert.equal(revised.posters[0].sha256, first.posters[0].sha256);
    phase('rollback-and-current-version-download');
    await page.getByRole('link', { name: '作品预览', exact: true }).click();
    const rolled = await run('发布此版本', 'publish');
    assert.equal(rolled.project.published_revision, 1);
    await verifyPublic(rolled.project.publish_slug, 1);
    await page.getByRole('link', { name: '作品交付', exact: true }).click();
    const final = await verifyDelivery(1);
    await page.screenshot({ path: `${dir}/customer-delivery.png`, fullPage: true });
    assert.deepEqual(errors, [], 'BROWSER_ERRORS');
    checks.push(
      'real customer browser login, authorized upload/intake/brief/design approval, hosted MiMo generation, private site+draft PNG, publish with automated three-width Chromium QA, signed PNG/ZIP hash+QR, customer acceptance, actual website-only model revision preserving poster/copy and poster bytes, publish revision2, rollback revision1/current download',
    );
    await writeFile(
      `${dir}/result.json`,
      JSON.stringify(
        { passed: true, isDemo: true, realPayment: false, manifest: final, runEvidence },
        null,
        2,
      ),
    );
    return final;
  } catch (e) {
    await page.screenshot({ path: `${dir}/failure.png`, fullPage: true }).catch(() => {});
    console.error(
      JSON.stringify({
        customerPage: new URL(page.url()).pathname,
        visibleErrors: await page
          .getByRole('alert')
          .allTextContents()
          .catch(() => []),
      }),
    );
    throw e;
  } finally {
    await browser.close();
  }
}
