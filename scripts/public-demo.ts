import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';
import { nativeCheck } from './lib/native-check';
import { operatorJSON } from './lib/operator-http';
import { outboundFetch } from '../src/lib/security/http';
import { checkout, confirmPayment, hash } from '../src/lib/core/service';
import { inspectPng } from '../src/lib/delivery/service';

assert(process.env.RUN_PUBLIC_DEMO === 'true', 'PUBLIC_DEMO_OPT_IN_REQUIRED');
assert(
  process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://mxyocfnzrfpujnkqikbp.supabase.co',
  'EXPECTED_DEMO_PROJECT_REQUIRED',
);
const origin = 'https://oneboss-ai.onrender.com',
  slug = 'blackcode-demo';
const path = '.secrets/public-demo/blackcode.json',
  dir = '.cache/public-demo';
await mkdir('.secrets/public-demo', { recursive: true });
await mkdir(dir, { recursive: true });
let state: any;
try {
  state = JSON.parse(await readFile(path, 'utf8'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  state = {
    version: 1,
    purpose: 'permanent-blackcode-demo',
    nonce: randomUUID(),
    email: `oneboss-public-demo-${randomUUID()}@example.com`,
    password: randomBytes(32).toString('base64url'),
    productIds: [randomUUID(), randomUUID()],
    facts: {},
    steps: {},
    keys: {},
    createdAt: new Date().toISOString(),
  };
  await writeFile(path, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
}
assert(
  state.version === 1 && state.purpose === 'permanent-blackcode-demo',
  'EXPECTED_PERMANENT_DEMO_STATE_REQUIRED',
);
async function save() {
  await writeFile(`${path}.tmp`, JSON.stringify(state), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
async function step<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (Object.hasOwn(state.steps, name)) return state.steps[name];
  state.phase = name;
  await save();
  const result = await action();
  state.steps[name] = result;
  await save();
  return result;
}
const client = (key: string) =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    global: { fetch: outboundFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
const admin = client(process.env.SUPABASE_SERVICE_ROLE_KEY!);
let token: string;
async function api(route: string, body?: unknown, expected = 200) {
  const signature = hash(JSON.stringify([route, body]));
  const key = (state.keys[signature] ||= randomUUID());
  await save();
  return operatorJSON(
    `${origin}/api/${route}`,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        Authorization: `Bearer ${token}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    expected,
    { trace: (transport) => console.log(JSON.stringify({ transport })) },
  );
}
async function completed(run: any) {
  for (let n = 0; n < 360; n++) {
    const saved = await api(`core/runs/${run.id}`);
    if (saved.status === 'SUCCEEDED') {
      console.log(
        JSON.stringify({
          runId: saved.id,
          role: saved.role,
          status: saved.status,
          usage: saved.usage,
        }),
      );
      return saved.output;
    }
    assert(saved.status !== 'FAILED', `DEMO_WORKER_${saved.error_class}`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw Error('DEMO_WORKER_WAIT_TIMEOUT_RERUN_SAME_CHECKPOINT');
}
try {
  await nativeCheck(async (db) => {
    const [occupied] = await db`select id,org_id from projects where publish_slug=${slug}`;
    assert(!occupied || occupied.id === state.steps.project?.id, 'PUBLIC_DEMO_SLUG_OCCUPIED');
  });
  const user = await step('identity', async () => {
    for (let page = 1; page <= 100; page++) {
      const listed = await admin.auth.admin.listUsers({ page, perPage: 100 });
      assert(!listed.error, 'DEMO_IDENTITY_DISCOVERY_FAILED');
      const found = listed.data.users.find((u) => u.email === state.email);
      if (found) {
        assert(
          found.user_metadata.purpose === state.purpose &&
            found.user_metadata.demoNonce === state.nonce,
          'DEMO_IDENTITY_MISMATCH',
        );
        return { id: found.id };
      }
      if (listed.data.users.length < 100) break;
      assert(page < 100, 'DEMO_IDENTITY_DISCOVERY_LIMIT');
    }
    const created = await admin.auth.admin.createUser({
      email: state.email,
      password: state.password,
      email_confirm: true,
      user_metadata: { purpose: state.purpose, demoNonce: state.nonce },
    });
    assert(created.data.user && !created.error, 'DEMO_IDENTITY_CREATE_FAILED');
    return { id: created.data.user.id };
  });
  const signedIn = await client(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  ).auth.signInWithPassword({ email: state.email, password: state.password });
  assert(signedIn.data.session && !signedIn.error, 'DEMO_SIGNIN_FAILED');
  assert(
    signedIn.data.user.id === user.id && signedIn.data.user.user_metadata.demoNonce === state.nonce,
    'DEMO_LOGIN_IDENTITY_MISMATCH',
  );
  token = signedIn.data.session.access_token;
  const org: any = await step('organization', () =>
    api('core/organizations', { name: 'BlackCode 公开DEMO · 90天' }, 201),
  );
  const quote: any = await step('quote', () =>
    api('commerce/quotes', { orgId: org.id, planCode: 'professional' }),
  );
  const order: any = await step('order', () =>
    api('commerce/orders', { orgId: org.id, quoteId: quote.id, isDemo: true }),
  );
  assert(
    order.is_demo && order.plan_snapshot.hosting_days === 90 && order.amount_minor === 599,
    'EXPECTED_90_DAY_DEMO_ORDER_REQUIRED',
  );
  process.env.ALLOW_SANDBOX = 'true';
  await step('demo-entitlement', () =>
    nativeCheck((db) =>
      db.begin(async (tx) => {
        const [owner] =
          await tx`select owner_user_id from organizations where id=${org.id} for update`;
        assert(owner?.owner_user_id === user.id, 'DEMO_ORG_OWNER_MISMATCH');
        const [owned] =
          await tx`select pay_state from service_orders where id=${order.id} and org_id=${org.id} and is_demo for update`;
        assert(owned, 'OWNED_DEMO_ORDER_REQUIRED');
        if (owned.pay_state !== 'PAID') {
          const actor = { userId: user.id },
            attempt = await checkout(tx, actor, order.id, 'sandbox');
          await confirmPayment(
            tx,
            actor,
            order.id,
            {
              attemptId: attempt.attempt.id,
              eventId: state.nonce,
              amountMinor: 599,
              currency: 'CNY',
              evidenceRef: `public-demo-${state.nonce}`,
            },
            'sandbox',
          );
        }
        return { isDemo: true, realPaymentOccurred: false };
      }),
    ),
  );
  const project: any = await step('project', () => api('core/projects', { orderId: order.id }));
  await step('nonmember-access-verified', async () => {
    state.review ||= {
      email: `oneboss-demo-access-${randomUUID()}@example.com`,
      password: randomBytes(32).toString('base64url'),
    };
    await save();
    let reviewer: any;
    for (let page = 1; page <= 100; page++) {
      const listed = await admin.auth.admin.listUsers({ page, perPage: 100 });
      assert(!listed.error, 'REVIEW_IDENTITY_DISCOVERY_FAILED');
      reviewer = listed.data.users.find((u) => u.email === state.review.email);
      if (reviewer || listed.data.users.length < 100) break;
      assert(page < 100, 'REVIEW_IDENTITY_DISCOVERY_LIMIT');
    }
    if (!reviewer) {
      const created = await admin.auth.admin.createUser({
        email: state.review.email,
        password: state.review.password,
        email_confirm: true,
        user_metadata: { purpose: 'temporary-public-demo-access-check', demoNonce: state.nonce },
      });
      assert(created.data.user && !created.error, 'REVIEW_IDENTITY_CREATE_FAILED');
      reviewer = created.data.user;
    }
    assert(
      reviewer.user_metadata.purpose === 'temporary-public-demo-access-check' &&
        reviewer.user_metadata.demoNonce === state.nonce,
      'REVIEW_IDENTITY_OWNER_MISMATCH',
    );
    state.review.id = reviewer.id;
    await save();
    try {
      const login = await client(
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      ).auth.signInWithPassword(state.review);
      assert(login.data.session && !login.error, 'REVIEW_IDENTITY_LOGIN_FAILED');
      const headers = {
        Authorization: `Bearer ${login.data.session.access_token}`,
        'Content-Type': 'application/json',
      };
      for (const route of ['workspace', 'delivery']) {
        const denied = await operatorJSON(
          `${origin}/api/core/projects/${project.id}/${route}`,
          { headers },
          403,
        );
        assert(denied.error?.code === 'FORBIDDEN', 'DEMO_NONMEMBER_READ_NOT_DENIED');
      }
      const denied = await operatorJSON(
        `${origin}/api/core/projects/${project.id}/generate`,
        { method: 'POST', headers, body: '{}' },
        403,
      );
      assert(denied.error?.code === 'FORBIDDEN', 'DEMO_NONMEMBER_WRITE_NOT_DENIED');
    } finally {
      const removed = await admin.auth.admin.deleteUser(reviewer.id);
      assert(!removed.error, 'REVIEW_IDENTITY_CLEANUP_FAILED');
      delete state.review;
      await save();
    }
    return { readsDenied: true, writesDenied: true, temporaryAuthUserRemoved: true };
  });
  const hosting: any = await step('hosting', () =>
    nativeCheck((db) =>
      db.begin(async (tx) => {
        const [owned] =
          await tx`select p.id from projects p join organizations o on o.id=p.org_id where p.id=${project.id} and o.owner_user_id=${user.id} for update of p`;
        assert(owned, 'OWNED_DEMO_PROJECT_REQUIRED');
        await tx`update projects set publish_slug=${slug} where id=${project.id}`;
        const [e] =
          await tx`select expires_at,is_demo,revoked from project_entitlements where project_id=${project.id}`;
        assert(e?.is_demo && !e.revoked, 'DEMO_ENTITLEMENT_REQUIRED');
        return { expiresAt: new Date(e.expires_at).toISOString() };
      }),
    ),
  );
  const asset: any = await step('asset', async () => {
    const existing = await api(`core/projects/${project.id}/assets`);
    if (existing.assets.length) {
      assert(existing.assets.length === 1, 'DEMO_ASSET_COUNT_MISMATCH');
      return existing.assets[0];
    }
    const bytes = await sharp(
      Buffer.from(
        '<svg width="600" height="600"><rect width="600" height="600" fill="#1a2441"/><circle cx="300" cy="260" r="160" fill="#6af0c4"/><text x="300" y="280" text-anchor="middle" font-size="58" font-family="sans-serif" fill="#1a2441">BlackCode</text><text x="300" y="510" text-anchor="middle" font-size="64" font-family="sans-serif" fill="white">DEMO</text></svg>',
      ),
    )
      .png()
      .toBuffer();
    // Asset upload is not a server-idempotent route: send once, discover the saved
    // asset on checkpoint recovery rather than retrying an uncertain POST.
    const uploaded = await outboundFetch(`${origin}/api/core/projects/${project.id}/assets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'image/png',
        'x-asset-license': 'customer_authorized',
      },
      body: bytes as any,
      signal: AbortSignal.timeout(90000),
    });
    assert(uploaded.status === 201, 'DEMO_ASSET_UPLOAD_FAILED');
    return uploaded.json();
  });
  const products = [
    {
      id: state.productIds[0],
      name: 'BlackCode 基础服务 · DEMO演示',
      description:
        '宣传网站、海报与文案制作，基础版¥1.99；这是服务能力演示，无真实收款，不承诺获客。',
    },
    {
      id: state.productIds[1],
      name: 'BlackCode 专业服务 · DEMO演示',
      description:
        '宣传网站、海报与文案制作，专业版¥5.99；这是服务能力演示，无真实收款，不承诺获客。',
    },
  ];
  const facts: any[] = [];
  for (const [i, product] of products.entries()) {
    for (const [key, value] of Object.entries({
      name: product.name,
      description: product.description,
      price: { amountMinor: i === 0 ? 199 : 599, currency: 'CNY', unit: '份', priceType: 'fixed' },
      provider: 'BlackCode',
      contact: '微信18001132767；邮箱18510820722@qq.com',
      demoNotice: `DEMO演示，无真实收款；托管至${hosting.expiresAt}，到期可联系服务方续期。`,
    })) {
      const identity = `${i}:${key}`;
      state.facts[identity] ||= randomUUID();
      facts.push({
        id: state.facts[identity],
        productId: product.id,
        key,
        value,
        source: 'customer',
        verified: true,
        version: 1,
      });
    }
  }
  await save();
  const intake: any = await step('intake', () =>
    api(`core/projects/${project.id}/intake`, {
      products,
      facts,
      brief: {
        projectId: project.id,
        organizationId: org.id,
        productIds: products.map((p) => p.id),
        objective:
          '为BlackCode已公开的两种服务制作长期公开DEMO。首页含关联服务列表和详情、可切换的信息标签。每个页面、两张海报及文案都必须明确写DEMO或演示。海报分别1080×1350和1080×1080；展示真实已确认价格、联系方式，二维码指向公开演示网址。不虚构客户、评价、销量或服务效果。',
        brandDescription: 'BlackCode，仅使用自有DEMO图形；不是客户真实案例。',
        confirmedFacts: facts.map((f) => f.id),
        assetRefs: [asset.id],
        preferredStyles: ['editorial-minimal', 'future-tech'],
        restrictions: [
          '必须标注DEMO演示及无真实收款，不宣称真实客户案例。',
          '不编造客户评价、销量、获客保证或未经确认的服务。',
          '只使用已批准的BlackCode公开服务信息、价格、联系方式与自有DEMO素材。',
        ],
        deliverables: {
          site: true,
          posterCount: 2,
          posterFormats: ['portrait', 'square'],
          xhsCopy: true,
        },
        approval: 'pending',
      },
    }),
  );
  await step('brief-approved', () =>
    api(`core/projects/${project.id}/approve-brief`, { revision: intake.brief.revision }),
  );
  const designRun: any = await step('design-run', () =>
    api(`core/projects/${project.id}/design-options`, {}),
  );
  const directions: any = await step('design-complete', () => completed(designRun));
  await step('design-approved', () =>
    api(`core/projects/${project.id}/approve-design`, {
      runId: designRun.id,
      styleId: directions.choices[0].styleId,
    }),
  );
  const generateRun: any = await step('generate-run', () =>
    api(`core/projects/${project.id}/generate`, {}),
  );
  const generated: any = await step('generate-complete', () => completed(generateRun));
  const revision = generated.artifactRevision;
  await step('revision-approved', () =>
    api(`core/projects/${project.id}/approve-revision`, { revision }),
  );
  const publishRun: any = await step('publish-run', () =>
    api(`core/projects/${project.id}/publish`, { revision }),
  );
  await step('publish-complete', () => completed(publishRun));
  const deliveryRun: any = await step('delivery-run', () =>
    api(`core/projects/${project.id}/delivery`, {}),
  );
  await step('delivery-complete', () => completed(deliveryRun));
  const delivery = await api(`core/projects/${project.id}/delivery`);
  const manifest = delivery.manifest;
  assert(manifest.publicSiteUrl === `${origin}/p/${slug}`, 'DEMO_URL_MISMATCH');
  const download = async (url: string) => {
    const response = await outboundFetch(url, { signal: AbortSignal.timeout(60000) });
    assert(response.ok, 'DEMO_DOWNLOAD_FAILED');
    return Buffer.from(await response.arrayBuffer());
  };
  const zipBytes = await download(delivery.zipDownloadUrl),
    zip = await JSZip.loadAsync(zipBytes);
  for (const file of manifest.files) {
    const entry = zip.file(file.path);
    assert(entry, 'DEMO_ZIP_ENTRY_MISSING');
    const bytes = await entry.async('nodebuffer');
    assert(bytes.length === file.size && hash(bytes) === file.sha256, 'DEMO_ZIP_HASH_MISMATCH');
  }
  assert(
    (await zip.file('README-交付说明.md')!.async('string')).includes('DEMO'),
    'DEMO_DELIVERY_NOTICE_REQUIRED',
  );
  assert(
    delivery.posterDownloads.length === 2 && delivery.qrDownloads.length === 2,
    'DEMO_SIGNED_FILE_COUNT_MISMATCH',
  );
  for (const [i, poster] of manifest.posters.entries()) {
    const bytes = await download(delivery.posterDownloads[i].url);
    assert(hash(bytes) === poster.sha256, 'DEMO_SIGNED_POSTER_HASH_MISMATCH');
    await inspectPng(
      bytes,
      1080,
      i === 0 ? 1350 : 1080,
      manifest.publicSiteUrl,
      'auto_bottom_right_or_left',
    );
    await writeFile(`${dir}/poster-${i + 1}.png`, bytes);
    const qr = await download(delivery.qrDownloads[i].url);
    await inspectPng(qr, 800, 800, manifest.publicSiteUrl);
    assert(
      hash(qr) === manifest.files.find((f: any) => f.path === delivery.qrDownloads[i].path)?.sha256,
      'DEMO_QR_HASH_MISMATCH',
    );
    await writeFile(`${dir}/qr-${i + 1}.png`, qr);
  }
  await writeFile(`${dir}/delivery.zip`, zipBytes);
  await writeFile(`${dir}/manifest.json`, JSON.stringify(manifest, null, 2));
  const browser = await chromium.launch({
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    ...(process.env.HTTPS_PROXY
      ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } }
      : {}),
  });
  try {
    const page = await browser.newPage();
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(manifest.publicSiteUrl, {
        waitUntil: 'networkidle',
        timeout: 90000,
      });
      assert(response?.ok(), 'DEMO_PUBLIC_HTTP_FAILED');
      assert(
        (await page.locator('[data-oneboss-demo]').innerText()).includes('无真实收款'),
        'DEMO_PUBLIC_NOTICE_MISSING',
      );
      assert(
        !(await page.locator('body').evaluate((e) => e.scrollWidth > window.innerWidth + 1)),
        'DEMO_PUBLIC_OVERFLOW',
      );
      await page.locator('[data-oneboss-interaction]').first().click();
      await page.screenshot({ path: `${dir}/public-${width}.png`, fullPage: true });
    }
  } finally {
    await browser.close();
  }
  await step('accepted', () =>
    api(`core/projects/${project.id}/accept`, { manifestVersion: revision }),
  );
  const result = {
    passed: true,
    publicUrl: manifest.publicSiteUrl,
    projectId: project.id,
    expiresAt: hosting.expiresAt,
    hostingDays: 90,
    renewable: true,
    isDemo: true,
    realPaymentOccurred: false,
    zipSha256: hash(zipBytes),
    posterCount: 2,
    qrCount: 2,
    temporaryCleanupApplies: false,
    bVisualReview: 'pending',
  };
  await writeFile(`${dir}/result.json`, JSON.stringify(result, null, 2));
  state.phase = 'completed';
  state.result = result;
  await save();
  console.log(JSON.stringify(result));
} catch (error) {
  const message = error instanceof Error ? error.message : '';
  console.error(
    JSON.stringify({
      passed: false,
      phase: state.phase,
      error: /^[A-Z0-9_]+$/.test(message) ? message : 'PUBLIC_DEMO_FAILED',
      permanentProjectRetained: true,
    }),
  );
  process.exitCode = 1;
}
