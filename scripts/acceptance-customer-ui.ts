import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { chromium, type Browser } from 'playwright-core';
import { outboundFetch } from '../src/lib/security/http';
import { fixture } from '../tests/fixtures';

// Real customer browser/Auth/API on an EMPTY local database. Production artifacts are explicitly
// test fixtures, not a model or publication proof. No real order, payment or hosted business write.
const target = new URL(process.env.TEST_DATABASE_URL || '');
assert(
  ['127.0.0.1', 'localhost'].includes(target.hostname) &&
    /^\/oneboss_acceptance_[a-z0-9_]+$/.test(target.pathname),
  'LOCAL_EMPTY_ACCEPTANCE_DB_REQUIRED',
);
const db = postgres(target.href, { ssl: false, onnotice: () => {} });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: outboundFetch }, auth: { persistSession: false, autoRefreshToken: false } },
);
let userId: string | undefined, server: ChildProcess | undefined, browser: Browser | undefined;
let passed = false,
  removed = false,
  phase = 'database';
const artifacts = '.cache/customer-ui';
await mkdir(artifacts, { recursive: true });
try {
  const [existing] = await db`select count(*)::int n from pg_tables where schemaname='public'`;
  assert.equal(existing.n, 0, 'EMPTY_DATABASE_REQUIRED');
  await db.unsafe(
    "create schema auth; do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to authenticated;",
  );
  const reserved = await db.reserve();
  try {
    await reserved.unsafe(await readFile('docs/setup-supabase.sql', 'utf8'));
  } finally {
    reserved.release();
  }
  const email = `oneboss-ui-${randomUUID()}@example.com`,
    password = randomBytes(28).toString('base64url');
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: 'temporary-customer-ui-acceptance' },
  });
  assert(!created.error && created.data.user, 'AUTH_CREATE_FAILED');
  userId = created.data.user.id;
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  assert(address && typeof address !== 'string');
  const port = address.port;
  await new Promise<void>((r) => reservation.close(() => r()));
  const origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        DATABASE_URL: target.href,
        DATABASE_PASSWORD: '',
        APP_URL: 'https://oneboss.example',
        CREATIVE_ADAPTER_MODULE: 'builtin:b',
        MANUAL_PAYMENT_ENABLED: 'true',
      },
    },
  );
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  browser = await chromium.launch({
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    ...(process.env.HTTPS_PROXY
      ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } }
      : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } }),
    page = await context.newPage();
  const errors: string[] = [];
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.name));
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().startsWith('{"authError"'))
      console.log(message.text());
  });
  page.on('response', async (response) => {
    if (response.url().includes('/auth/v1/token') && response.status() >= 400) {
      const value = await response.json().catch(() => ({}));
      console.log(
        JSON.stringify({
          authHttpStatus: response.status(),
          authErrorCode: value.error_code || value.code || value.error,
        }),
      );
    }
  });
  page.on('requestfailed', (request) => {
    if (request.url().includes('/auth/v1/'))
      console.log(JSON.stringify({ authNetworkError: request.failure()?.errorText }));
  });
  phase = 'marketing';
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin);
    await page.getByRole('heading', { level: 1 }).waitFor();
    assert(
      !(await page.locator('body').evaluate((e) => e.scrollWidth > window.innerWidth + 1)),
      'HOME_OVERFLOW',
    );
    await page.screenshot({ path: `${artifacts}/home-${width}.png`, fullPage: true });
  }
  phase = 'real-browser-login';
  await page.goto(`${origin}/examples`);
  await page
    .frameLocator('iframe[title="交互作品演示"]')
    .locator('.site.style-editorial-minimal')
    .waitFor();
  await page.getByRole('button', { name: '未来科技', exact: true }).click();
  await page
    .frameLocator('iframe[title="交互作品演示"]')
    .locator('.site.style-future-tech')
    .waitFor();
  await page.getByRole('button', { name: '切换手机视口', exact: true }).click();
  assert(
    !(await page
      .frameLocator('iframe[title="交互作品演示"]')
      .locator('body')
      .evaluate((e) => e.scrollWidth > window.innerWidth + 1)),
    'EXAMPLE_MOBILE_OVERFLOW',
  );
  await page.goto(`${origin}/login`);
  await page.getByRole('button', { name: '还没有账户？注册', exact: true }).click();
  assert(
    !(await page.getByRole('button', { name: '创建账户', exact: true }).isDisabled()),
    'USERNAME_SIGNUP_MUST_NOT_REQUIRE_EMAIL_DELIVERY',
  );
  await page.getByRole('button', { name: '已有账户？登录', exact: true }).click();
  await page.getByLabel('账号', { exact: true }).fill(email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录并继续', exact: true }).click();
  phase = 'login-navigation';
  await page.waitForURL('**/dashboard');
  phase = 'account-workspace';
  await page.getByRole('heading', { name: '让下一个作品，开始发生。', exact: true }).waitFor();
  phase = 'order-creation';
  await page.goto(`${origin}/checkout?plan=basic`);
  await page.getByLabel('增加海报（测试价格） 数量', { exact: true }).fill('1');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '创建服务订单 →', exact: true }).click();
  await page.waitForURL('**/dashboard/orders/*');
  await page.getByRole('heading', { name: '订单详情', exact: true }).waitFor();
  await page.getByRole('button', { name: '查看微信收款码，按金额付款', exact: true }).click();
  await page.getByRole('img', { name: '微信收款码，收款人 39(**宇)', exact: true }).waitFor();
  await page.getByLabel('付款说明', { exact: true }).fill('隔离浏览器验收，未发生真实付款。');
  await page.getByRole('checkbox', { name: '我已按订单金额付款', exact: false }).check();
  await page.getByRole('button', { name: '我已付款，提交人工核验', exact: true }).click();
  await page
    .getByText('付款说明已提交，等待人工核验真实到账；订单尚未确认付款。', { exact: false })
    .waitFor();
  await page.reload();
  await page.getByRole('heading', { name: '订单详情', exact: true }).waitFor();
  const [order] =
    await db`select * from service_orders where org_id in(select id from organizations where owner_user_id=${userId})`;
  assert(
    order && order.pay_state === 'PENDING_CONFIRMATION',
    'MANUAL_CLAIM_MUST_NOT_GRANT_PAYMENT',
  );
  assert.equal(
    (await db`select count(*)::int n from project_entitlements where order_id=${order.id}`)[0].n,
    0,
  );
  assert.equal(
    (await db`select count(*)::int n from manual_payment_reports where order_id=${order.id}`)[0].n,
    1,
  );
  assert.equal(order.amount_minor, 10099, 'SERVER_ADDON_TOTAL');
  assert.equal(order.plan_snapshot.poster_count, 3, 'SERVER_ADDON_ENTITLEMENT');
  // Isolated DB fixture entitlement, explicitly changed to demo; never impersonates live payment.
  await db`update service_orders set is_demo=true,pay_state='PAID' where id=${order.id}`;
  await db`insert into project_entitlements(order_id,org_id,remaining_revisions,max_products,max_posters,is_demo,expires_at) values(${order.id},${order.org_id},2,10,2,true,now()+interval '1 day')`;
  await page.reload();
  await page.getByRole('button', { name: '进入制作项目 →', exact: true }).click();
  await page.waitForURL('**/projects/*/intake');
  phase = 'intake-and-approval';
  await page.getByLabel('产品名称', { exact: true }).fill('浏览器验收椅子');
  await page.getByLabel('产品介绍', { exact: true }).fill('隔离测试产品，不是真实销售。');
  for (let index = 1; index < 10; index++) {
    await page.getByRole('button', { name: /添加产品（最多/ }).click();
    await page
      .getByLabel('产品名称', { exact: true })
      .nth(index)
      .fill(`系列验收产品 ${index + 1}`);
    await page
      .getByLabel('产品介绍', { exact: true })
      .nth(index)
      .fill('关联产品目录的隔离浏览器验收资料，不是真实销售。');
  }
  await page
    .getByLabel('这次宣传想达到什么目的？', { exact: true })
    .fill('制作清晰标识的验收作品。');
  await page.getByRole('checkbox', { name: '我已核对以上产品事实', exact: false }).check();
  await page.getByRole('button', { name: '保存已确认事实', exact: true }).click();
  await page.getByRole('button', { name: '批准已保存的需求摘要 →', exact: true }).waitFor();
  await page.getByRole('button', { name: '批准已保存的需求摘要 →', exact: true }).click();
  await page.getByText('需求摘要已批准', { exact: true }).waitFor();
  const [project] = await db`select * from projects where service_order_id=${order.id}`;
  assert(project);
  const [brief] = await db`select * from creative_briefs where project_id=${project.id}`;
  assert(brief.approved_at, 'UI_APPROVAL_NOT_PERSISTED');
  assert.deepEqual(brief.body.deliverables.posterFormats, ['portrait', 'square']);
  const [fact] =
    await db`select id,product_id from product_facts where project_id=${project.id} and key='name'`;
  const catalogFacts =
    await db`select id from product_facts where project_id=${project.id} and version=1`;
  assert.equal(
    (await db`select count(*)::int n from products where project_id=${project.id}`)[0].n,
    10,
  );
  const f = fixture();
  const design = { ...f.design, styleId: 'editorial-minimal', approvedByClient: false };
  await db`insert into agent_runs(org_id,project_id,role,status,input,output,completed_at) values(${order.org_id},${project.id},'design','SUCCEEDED',${db.json({ factVersion: 1 })},${db.json({ choices: [design, { ...design, styleId: 'future-tech', layoutMode: 'future-grid', rationale: '几何布局' }] })},now())`;
  phase = 'direction-and-real-preview';
  await page.getByRole('link', { name: '创意方向', exact: true }).click();
  await page.getByRole('button', { name: '选择并批准此方向', exact: true }).first().click();
  await page.getByText('已批准方向：editorial-minimal', { exact: false }).waitFor();
  const production = structuredClone(f.production);
  const squareCopy = { ...production.copy[0], id: randomUUID(), posterId: randomUUID() };
  production.posters.push({
    ...structuredClone(production.posters[0]),
    canvas: { width: 1080, height: 1080 },
    copyPackRef: squareCopy.id,
  });
  production.copy.push(squareCopy);
  production.site.projectId = project.id;
  production.site.pages[0].sections[0].factRefs = [fact.id];
  production.site.pages[0].sections.push({
    type: 'specs',
    props: {},
    factRefs: [fact.id],
    assetRefs: [],
  });
  production.site.pages[0].sections.push({
    type: 'product-grid',
    props: {},
    factRefs: catalogFacts.map((f) => f.id),
    assetRefs: [],
  });
  production.site.allowedSectionTypes.push('product-grid');
  production.site.allowedSectionTypes.push('specs');
  production.site.pages.push({
    slug: 'about',
    title: '产品说明',
    sections: [{ type: 'story', props: {}, factRefs: [fact.id], assetRefs: [] }],
  });
  production.site.allowedSectionTypes.push('story');
  production.site.pages[0].sections.push({
    type: 'story',
    props: {},
    factRefs: [fact.id],
    assetRefs: [],
  });
  production.site.interactions = ['tabs'];
  for (const p of production.posters) {
    p.projectId = project.id;
    p.layers[0].factRef = fact.id;
    p.productFactRefs = [fact.id];
    p.textRefs = [fact.id];
  }
  production.copy.forEach((c) => {
    c.factRefs = [fact.id];
  });
  await db`insert into artifact_versions(org_id,project_id,revision,fact_version,body) values(${order.org_id},${project.id},1,1,${db.json(production)})`;
  await page.getByRole('link', { name: '作品预览', exact: true }).click();
  await page.frameLocator('iframe[title="私有网站预览"]').locator('.site').waitFor();
  const previewFrame = page.frameLocator('iframe[title="私有网站预览"]');
  phase = 'private-page-selection';
  await page.getByLabel('预览页面', { exact: true }).selectOption('about');
  await previewFrame.locator('.story-section').waitFor();
  await page.getByLabel('预览页面', { exact: true }).selectOption('');
  phase = 'preview-hero-scroll';
  await previewFrame.locator('.hero-actions button').click();
  await page.waitForFunction(
    () =>
      (document.querySelector('iframe[title="私有网站预览"]') as HTMLIFrameElement)?.contentWindow!
        .scrollY > 100,
  );
  phase = 'preview-brand-scroll';
  await previewFrame.getByRole('button', { name: '回到顶部', exact: true }).click();
  await page.waitForFunction(
    () =>
      (document.querySelector('iframe[title="私有网站预览"]') as HTMLIFrameElement)?.contentWindow!
        .scrollY < 150,
  );
  const tab = page
    .frameLocator('iframe[title="私有网站预览"]')
    .locator('[data-oneboss-interaction]')
    .first();
  phase = 'keyboard-tabs';
  await tab.click();
  await previewFrame.getByRole('tab', { name: '资料说明', exact: true }).press('ArrowLeft');
  assert(
    await previewFrame
      .getByRole('tab', { name: '已确认资料', exact: true })
      .evaluate(
        (element) =>
          element.ownerDocument.activeElement === element &&
          element.getAttribute('aria-selected') === 'true',
      ),
    'TAB_KEYBOARD_FOCUS_AND_SELECTION',
  );
  phase = 'ten-product-related-details';
  assert.equal(await previewFrame.locator('.product-card').count(), 10);
  await previewFrame.getByRole('button', { name: /系列验收产品 10/ }).click();
  assert.equal(await previewFrame.locator('.product-detail h3').innerText(), '系列验收产品 10');
  phase = 'dual-poster-preview';
  await page.getByRole('button', { name: '查看海报草稿', exact: true }).click();
  await page.getByRole('img', { name: '海报草稿 1', exact: true }).waitFor();
  await page.getByRole('img', { name: '海报草稿 2', exact: true }).waitFor();
  assert(
    await page
      .getByRole('img', { name: '海报草稿 1', exact: true })
      .evaluate((img) => (img as HTMLImageElement).naturalWidth === 1080),
    'DRAFT_PNG_NOT_RENDERED',
  );
  assert.equal(
    await page
      .getByRole('img', { name: '海报草稿 1', exact: true })
      .evaluate((img) => (img as HTMLImageElement).naturalHeight),
    1350,
  );
  assert.equal(
    await page
      .getByRole('img', { name: '海报草稿 2', exact: true })
      .evaluate((img) => (img as HTMLImageElement).naturalHeight),
    1080,
  );
  const copyDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载文案 Markdown', exact: true }).first().click();
  const copyPath = await (await copyDownload).path();
  assert(
    copyPath && (await readFile(copyPath, 'utf8')).includes('事实版本：1'),
    'COPY_MARKDOWN_DOWNLOAD',
  );
  await page.getByRole('button', { name: '手机', exact: true }).click();
  assert(
    !(await page
      .frameLocator('iframe[title="私有网站预览"]')
      .locator('body')
      .evaluate((e) => e.scrollWidth > window.innerWidth + 1)),
    'PRIVATE_MOBILE_OVERFLOW',
  );
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert(
      !(await page.locator('body').evaluate((e) => e.scrollWidth > window.innerWidth + 1)),
      'STUDIO_OVERFLOW',
    );
    await page.screenshot({ path: `${artifacts}/studio-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: '批准版本 1', exact: true }).click();
  await page.getByRole('button', { name: '发布批准版本 →', exact: true }).waitFor();
  const [version] =
    await db`select status,approved_by from artifact_versions where project_id=${project.id}`;
  assert.equal(version.status, 'APPROVED');
  assert.equal(version.approved_by, userId);
  phase = 'local-fixture-public-navigation-and-metadata';
  // LOCAL demo fixture only: exercises route rendering, not worker/publication proof.
  await db`update projects set published_revision=1 where id=${project.id}`;
  const publicView = await context.newPage();
  for (const width of [375, 768, 1280]) {
    await publicView.setViewportSize({ width, height: 900 });
    await publicView.goto(`${origin}/p/${project.publish_slug}`);
    await publicView
      .getByRole('navigation', { name: '网站页面', exact: true })
      .getByRole('link', { name: '产品说明', exact: true })
      .click();
    await publicView.waitForURL(`**/p/${project.publish_slug}/about`);
    assert((await publicView.title()).includes('产品说明'), 'APPROVED_PAGE_METADATA');
    assert.equal(
      await publicView.locator('meta[name="description"]').getAttribute('content'),
      production.site.seo.description,
    );
    assert.equal(
      await publicView
        .getByRole('navigation', { name: '网站页面', exact: true })
        .locator('[aria-current="page"]')
        .innerText(),
      '产品说明',
    );
    assert(
      !(await publicView
        .locator('body')
        .evaluate((element) => element.scrollWidth > innerWidth + 1)),
      'PUBLIC_SUBPAGE_OVERFLOW',
    );
    await publicView.screenshot({
      path: `${artifacts}/public-subpage-${width}.png`,
      fullPage: true,
    });
  }
  await publicView.close();
  await db`update projects set published_revision=null where id=${project.id}`;
  await page.getByRole('link', { name: '任务记录', exact: true }).click();
  await page.getByRole('heading', { name: '真实任务记录', exact: true }).waitFor();
  assert.deepEqual(errors, [], 'BROWSER_ERRORS');
  phase = 'signout';
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByRole('link', { name: '登录并继续 →', exact: true }).waitFor();
  passed = true;
} catch (e) {
  if (browser) {
    const page = browser.contexts()[0]?.pages()[0];
    if (page) {
      await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }).catch(() => {});
      console.log(
        JSON.stringify({
          visibleError: await page
            .getByRole('alert')
            .allTextContents()
            .catch(() => []),
          pagePath: new URL(page.url()).pathname,
        }),
      );
    }
  }
  console.error(
    JSON.stringify({
      phase,
      errorClass:
        e instanceof assert.AssertionError
          ? e.message.slice(0, 180)
          : e instanceof Error
            ? e.name
            : 'UNKNOWN',
    }),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill();
  if (userId) removed = !(await admin.auth.admin.deleteUser(userId)).error;
  await db.end({ timeout: 5 });
  const result = {
    passed: passed && removed,
    temporaryAuthUserRemoved: removed,
    businessWrites: 'local empty database only',
    generation: 'explicit fixture; no model/publication proof',
    realPayment: false,
  };
  await writeFile(`${artifacts}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
}
