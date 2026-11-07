import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { nativeCheck } from './lib/native-check';
import { checkout, confirmPayment, hash } from '../src/lib/core/service';
import { outboundFetch } from '../src/lib/security/http';
import { inspectPng } from '../src/lib/delivery/service';
import { operatorJSON } from './lib/operator-http';
import {
  createCheckpoint,
  readCheckpoint,
  saveCheckpoint,
  operationKey,
  assertAcceptanceOwner,
} from './lib/acceptance-checkpoint';

// Opt-in hosted test. All business records belong to a newly created temporary owner/org.
// A trusted native DB connection is required for cleanup; Data API privileges are never widened.
assert(process.env.RUN_HOSTED_WRITE_ACCEPTANCE === 'true', 'EXPLICIT_HOSTED_WRITE_OPT_IN_REQUIRED');
assert(
  process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://mxyocfnzrfpujnkqikbp.supabase.co',
  'EXPECTED_PROJECT_REQUIRED',
);
const origin = 'https://oneboss-ai.onrender.com';
process.env.APP_URL = origin;
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    global: { fetch: outboundFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
const storage = admin.storage.from(process.env.STORAGE_BUCKET || 'oneboss-private');
const checkpointPath = '.secrets/acceptance/hosted-write.json';
const cleanupOnly = process.env.CLEANUP_HOSTED_ACCEPTANCE === 'true';
const state = cleanupOnly
  ? await readCheckpoint(checkpointPath)
  : await createCheckpoint(
      checkpointPath,
      `oneboss-hosted-write-${randomUUID()}@example.com`,
      randomBytes(32).toString('base64url'),
    );
let { userId, orgId, projectId } = state;
async function checkpoint() {
  Object.assign(state, { userId, orgId, projectId, phase, runs: runEvidence });
  await saveCheckpoint(checkpointPath, state);
}
let passed = false,
  userRemoved = false,
  businessRemoved = false,
  phase = 'cleanup-permission-preflight';
const checks: string[] = [],
  runEvidence: unknown[] = [];
let manifest: Record<string, any> | undefined;
let accessToken: string | undefined;
async function api(path: string, token?: string, body?: unknown, status = 200) {
  const key = operationKey(state, path, body);
  await checkpoint();
  const result = await operatorJSON(
    `${origin}/api/${path}`,
    {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    status,
    { trace: (event) => console.log(JSON.stringify({ transport: event })) },
  );
  if (result.id && ['QUEUED', 'RUNNING'].includes(result.status)) {
    runEvidence.push({ id: result.id, phase });
    await checkpoint();
  }
  return result;
}
async function completed(run: { id: string }) {
  for (let n = 0; n < 180; n++) {
    const saved = await api(`core/runs/${run.id}`, accessToken);
    assert(saved, 'RUN_MISSING');
    if (saved.status === 'SUCCEEDED') {
      const evidence = {
        runId: run.id,
        role: saved.role,
        status: saved.status,
        usage: saved.usage,
      };
      runEvidence.push(evidence);
      console.log(JSON.stringify(evidence));
      assert(saved.completed_at, 'COMPLETION_TIME_MISSING');
      return saved.output;
    }
    assert(saved.status !== 'FAILED', `WORKER_${saved.error_class}`);
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error('HOSTED_WORKER_TIMEOUT');
}
async function removeTestObjects(prefix: string) {
  assert(
    orgId && (prefix === orgId || prefix.startsWith(orgId + '/')),
    'TEST_STORAGE_SCOPE_REQUIRED',
  );
  const list = await storage.list(prefix, { limit: 1000 });
  assert(!list.error && list.data && list.data.length < 1000, 'STORAGE_CLEANUP_LIST_FAILED');
  const paths: string[] = [];
  for (const entry of list.data) {
    assert(
      /^[a-zA-Z0-9._-]+$/.test(entry.name) && !entry.name.includes('..'),
      'UNEXPECTED_TEST_OBJECT_NAME',
    );
    const path = `${prefix}/${entry.name}`;
    if (entry.id) paths.push(path);
    else await removeTestObjects(path);
  }
  if (paths.length) assert(!(await storage.remove(paths)).error, 'STORAGE_CLEANUP_FAILED');
}
try {
  if (!cleanupOnly) {
    // Roll back permission probes before any temporary account or business record is created.
    await nativeCheck((db) =>
      db.begin(async (tx) => {
        await tx`savepoint cleanup_probe`;
        for (const table of [
          'deliveries',
          'agent_runs',
          'projects',
          'service_orders',
          'organizations',
        ])
          await tx.unsafe(`delete from ${table} where false`);
        await tx`rollback to savepoint cleanup_probe`;
      }),
    );
    assert.equal((await api('health')).configured.creative, true, 'LIVE_B_ADAPTER_REQUIRED');
    const { password, email } = state;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { purpose: state.purpose, acceptanceNonce: state.nonce },
    });
    assert(!created.error && created.data.user, 'TEMP_USER_CREATE_FAILED');
    userId = created.data.user.id;
    await checkpoint();
    const loginClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        global: { fetch: outboundFetch },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const login = await loginClient.auth.signInWithPassword({ email, password });
    assert(!login.error && login.data.session, 'REAL_SIGNIN_FAILED');
    const token = login.data.session.access_token;
    accessToken = token;
    phase = 'hosted-demo-order';
    const org = await api('core/organizations', token, { name: 'OneBoss 临时演示验收' }, 201);
    orgId = org.id;
    await checkpoint();
    const quote = await api('commerce/quotes', token, {
      orgId,
      planCode: process.env.RUN_HOSTED_FORMAT_ACCEPTANCE === 'true' ? 'professional' : 'basic',
    });
    const order = await api('commerce/orders', token, { orgId, quoteId: quote.id, isDemo: true });
    assert.equal(order.is_demo, true);
    await api(`commerce/orders/${order.id}/checkout`, token, { channel: 'sandbox' }, 403);
    // Production HTTP sandbox remains OFF. A trusted server-side test process grants only
    // this explicit demo order using the same guarded payment helper; never real money.
    process.env.ALLOW_SANDBOX = 'true';
    const actor = { userId };
    const paymentEventId = randomUUID();
    await nativeCheck((db) =>
      db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub',${actor.userId},true)`;
        const [current] =
          await tx`select pay_state from service_orders where id=${order.id} and org_id=${orgId!} and is_demo for update`;
        assert(current, 'OWNED_DEMO_ORDER_REQUIRED');
        if (current.pay_state === 'PAID') return;
        const attempt = await checkout(tx, actor, order.id, 'sandbox');
        await confirmPayment(
          tx,
          actor,
          order.id,
          {
            attemptId: attempt.attempt.id,
            eventId: paymentEventId,
            amountMinor: order.amount_minor,
            currency: 'CNY',
            evidenceRef: `temporary-hosted-sandbox-${paymentEventId}`,
          },
          'sandbox',
        );
      }),
    );
    checks.push(
      'Render HTTP creates labeled demo order; public sandbox remains disabled; trusted native helper grants demo-only entitlement',
    );
    const project = await api('core/projects', token, { orderId: order.id });
    projectId = project.id;
    await checkpoint();
    if (process.env.RUN_HOSTED_CUSTOMER_UI === 'true') {
      phase = 'real-customer-browser-flow';
      const { verifyHostedCustomerFlow } = await import('./acceptance-hosted-customer-flow');
      manifest = await verifyHostedCustomerFlow({
        origin,
        email,
        password,
        projectId: project.id,
        orderId: order.id,
        read: (path) => api(path, token),
        checks,
        runEvidence,
      });
      passed = true;
    } else {
      const productId = randomUUID();
      const facts = [
        { id: randomUUID(), productId, key: 'name', value: 'OneBoss 联调演示' },
        {
          id: randomUUID(),
          productId,
          key: 'price',
          value: { amountMinor: 12900, currency: 'CNY', unit: '份', priceType: 'fixed' },
        },
        {
          id: randomUUID(),
          productId,
          key: 'description',
          value: '仅用于系统验收，不是真实商品销售。',
        },
      ].map((f) => ({ ...f, source: 'customer', verified: true, version: 1 }));
      const intake = await api(`core/projects/${projectId}/intake`, token, {
        products: [
          { id: productId, name: 'OneBoss 联调演示', description: '系统演示资料，不是真实销售。' },
        ],
        facts,
        brief: {
          projectId,
          organizationId: orgId,
          productIds: [productId],
          objective: '制作明确标识的系统演示宣传，不增加商品声明。',
          confirmedFacts: facts.map((f) => f.id),
          assetRefs: [],
          preferredStyles: ['editorial-minimal', 'future-tech'],
          restrictions: ['不编造产品材质、性能、销量或真实收款。'],
          deliverables: { site: true, posterCount: 1, xhsCopy: true },
          approval: 'pending',
        },
      });
      await api(`core/projects/${projectId}/approve-brief`, token, {
        revision: intake.brief.revision,
      });
      phase = 'render-real-worker-generation';
      const designRun = await api(`core/projects/${projectId}/design-options`, token, {});
      const directions = await completed(designRun);
      await api(`core/projects/${projectId}/approve-design`, token, {
        runId: designRun.id,
        styleId: directions.choices[0].styleId,
      });
      const production = await completed(
        await api(`core/projects/${projectId}/generate`, token, {}),
      );
      await api(`core/projects/${projectId}/approve-revision`, token, {
        revision: production.artifactRevision,
      });
      phase = 'public-https-publication';
      await completed(
        await api(`core/projects/${projectId}/publish`, token, {
          revision: production.artifactRevision,
        }),
      );
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ['--import', 'tsx', 'scripts/smoke-public.ts', project.publish_slug],
          {
            env: {
              ...process.env,
              APP_URL: origin,
              ...(process.platform === 'win32' ? { PLAYWRIGHT_CHANNEL: 'msedge' } : {}),
              SMOKE_SCREENSHOT_DIR: '.cache/hosted-acceptance',
            },
            stdio: 'ignore',
          },
        );
        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error('PUBLIC_BROWSER_TIMEOUT'));
        }, 120000);
        child.once('error', () => {
          clearTimeout(timeout);
          reject(new Error('PUBLIC_BROWSER_START_FAILED'));
        });
        child.once('exit', (code) => {
          clearTimeout(timeout);
          code === 0 ? resolve() : reject(new Error('PUBLIC_BROWSER_FAILED'));
        });
      });
      checks.push(
        'Render worker real MiMo production, B QA and client approval; HTTPS publication and 375/768/1280 browser evidence',
      );
      phase = 'private-png-zip-delivery';
      await completed(await api(`core/projects/${projectId}/delivery`, token, {}));
      const delivery = await api(`core/projects/${projectId}/delivery`, token);
      manifest = delivery.manifest;
      const response = await outboundFetch(delivery.zipDownloadUrl, {
        signal: AbortSignal.timeout(30000),
      });
      assert(response.ok, 'SIGNED_ZIP_DOWNLOAD_FAILED');
      const bytes = Buffer.from(await response.arrayBuffer());
      const archive = await JSZip.loadAsync(bytes);
      assert.equal(await archive.file('site-url.txt')!.async('string'), manifest!.publicSiteUrl);
      for (const file of manifest!.files) {
        const entry = archive.file(file.path);
        assert(entry, 'ZIP_ENTRY_MISSING');
        const data = await entry.async('nodebuffer');
        assert.equal(data.length, file.size);
        assert.equal(hash(data), file.sha256);
      }
      for (const poster of manifest!.posters)
        await inspectPng(
          await archive.file(poster.path)!.async('nodebuffer'),
          poster.width,
          poster.height,
          manifest!.publicSiteUrl,
          'auto_bottom_right_or_left',
        );
      await mkdir('.cache/hosted-acceptance', { recursive: true });
      await writeFile('.cache/hosted-acceptance/delivery.zip', bytes);
      await writeFile('.cache/hosted-acceptance/manifest.json', JSON.stringify(manifest, null, 2));
      await writeFile(
        '.cache/hosted-acceptance/poster.png',
        await archive.file(manifest!.posters[0].path)!.async('nodebuffer'),
      );
      await api(`core/projects/${projectId}/accept`, token, {
        manifestVersion: manifest!.siteRevision,
      });
      checks.push(
        'real private Storage PNG/QR/copy/manifest ZIP signed download; all bytes/hashes/QR targets match; customer acceptance committed',
      );
      passed = true;
    }
  }
} catch (error) {
  console.error(
    JSON.stringify({
      passed: false,
      phase,
      errorClass:
        (error as { code?: string })?.code || (error instanceof Error ? error.name : 'UNKNOWN'),
      detail:
        error instanceof assert.AssertionError
          ? error.message.slice(0, 180)
          : 'HOSTED_WRITE_CHECK_FAILED',
    }),
  );
} finally {
  try {
    phase = 'cleanup';
    // If Auth create succeeded but its response was lost, recover only the planned identity.
    if (!userId) {
      for (let page = 1; page <= 100; page++) {
        const listed = await admin.auth.admin.listUsers({ page, perPage: 100 });
        assert(!listed.error, 'AUTH_CLEANUP_DISCOVERY_FAILED');
        const owned = listed.data.users.find(
          (u) => u.email === state.email && u.user_metadata?.acceptanceNonce === state.nonce,
        );
        if (owned) {
          userId = owned.id;
          break;
        }
        if (listed.data.users.length < 100) break;
        assert(page < 100, 'AUTH_CLEANUP_DISCOVERY_LIMIT');
      }
    }
    if (userId) {
      state.userId = userId;
      const identity = await admin.auth.admin.getUserById(userId);
      if (identity.data.user && !identity.error)
        assertAcceptanceOwner(state, identity.data.user, userId);
      else {
        assert(identity.error?.code === 'user_not_found', 'AUTH_CLEANUP_IDENTITY_REQUIRED');
        const owned = await nativeCheck(
          (db) => db`select id from organizations where owner_user_id=${userId!}`,
        );
        assert.equal(owned.length, 0, 'AUTH_MISSING_WITH_BUSINESS_RECORDS');
        userRemoved = true;
      }
    }
    await checkpoint();
    if (userId && !orgId) {
      const [owned] = await nativeCheck(
        (db) => db`select id from organizations where owner_user_id=${userId!}`,
      );
      orgId = owned?.id;
    }
    if (userId && orgId) {
      const [owned] = await nativeCheck(
        (db) => db`select owner_user_id from organizations where id=${orgId!}`,
      );
      assert(!owned || owned.owner_user_id === userId, 'TEST_ORG_OWNER_MISMATCH');
      if (owned) {
        // Prevent further work/retries, but never delete data beneath a live worker.
        await nativeCheck((db) =>
          db.begin(async (tx) => {
            const [owner] =
              await tx`select owner_user_id from organizations where id=${orgId!} for update`;
            assert(owner?.owner_user_id === userId, 'TEST_ORG_OWNER_MISMATCH');
            await tx`update project_entitlements set revoked=true where org_id=${orgId!} and is_demo`;
            await tx`update agent_runs set status='FAILED',error_class='ACCEPTANCE_CLEANUP',completed_at=now() where org_id=${orgId!} and status='QUEUED'`;
          }),
        );
        for (let n = 0; ; n++) {
          const [active] = await nativeCheck(
            (db) =>
              db`select count(*)::int n from agent_runs where org_id=${orgId!} and status in ('RUNNING','QUEUED')`,
          );
          if (active.n === 0) break;
          assert(n < 180, 'TEMP_JOB_STILL_RUNNING_USE_CHECKPOINT_CLEANUP');
          await new Promise((r) => setTimeout(r, 5000));
        }
        await removeTestObjects(orgId);
        await nativeCheck((db) =>
          db.begin(async (tx) => {
            const [owner] =
              await tx`select owner_user_id from organizations where id=${orgId!} for update`;
            if (!owner) return; // An earlier commit may have succeeded before a TCP reset.
            assert(owner.owner_user_id === userId, 'TEST_ORG_OWNER_MISMATCH');
            for (const table of [
              'deliveries',
              'change_requests',
              'agent_runs',
              'artifact_versions',
              'design_systems',
              'creative_briefs',
              'media_assets',
              'product_facts',
              'products',
              'project_entitlements',
              'projects',
              'payment_events',
              'manual_payment_reports',
              'wechat_payments',
              'payment_attempts',
              'refunds',
              'service_order_items',
              'service_orders',
              'quotes',
              'api_idempotency',
              'memberships',
            ])
              await tx.unsafe(`delete from ${table} where org_id=$1`, [orgId!]);
            await tx`delete from organizations where id=${orgId!} and owner_user_id=${userId!}`;
            await tx`delete from rate_limits where user_id=${userId!}`;
          }),
        );
      }
      businessRemoved = true;
    } else businessRemoved = true;
    if (userId && businessRemoved && !userRemoved)
      userRemoved = !(await admin.auth.admin.deleteUser(userId)).error;
    else if (!userId) userRemoved = true;
    if (businessRemoved && userRemoved) {
      // Retain only a non-secret closed checkpoint, allowing a fresh independent run.
      const { rename, writeFile } = await import('node:fs/promises');
      const closed = `${checkpointPath}.closed-${Date.now()}`;
      await rename(checkpointPath, closed);
      await writeFile(
        closed,
        JSON.stringify({ version: 1, cleaned: true, phase, userId, orgId, projectId }),
        { mode: 0o600 },
      );
    }
  } catch {
    console.error(JSON.stringify({ phase: 'hosted-cleanup-incomplete', userId, orgId, projectId }));
  }
  const result = {
    passed: (passed || cleanupOnly) && businessRemoved && userRemoved,
    cleanupOnly,
    checks,
    runEvidence,
    verifiedPublicSiteUrl: manifest?.publicSiteUrl,
    temporaryBusinessRecordsRemoved: businessRemoved,
    temporaryAuthUserRemoved: userRemoved,
    isDemo: true,
    realPaymentOccurred: false,
    publicTestSiteRemovedAfterCheck: businessRemoved,
  };
  console.log(JSON.stringify(result));
  const resultDir =
    process.env.RUN_HOSTED_FORMAT_ACCEPTANCE === 'true'
      ? '.cache/hosted-dual-formats-summary'
      : '.cache/hosted-acceptance';
  await mkdir(resultDir, { recursive: true });
  await writeFile(
    `${resultDir}/${cleanupOnly ? 'cleanup-recovery' : 'result'}.json`,
    JSON.stringify(result, null, 2),
  );
  if (!result.passed) process.exitCode = 1;
}
