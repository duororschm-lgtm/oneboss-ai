import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { database, closeDatabase, transaction } from '../../src/lib/core/db';
import * as core from '../../src/lib/core/service';
import { claimRun, runOne } from '../../src/lib/workflows/runner';
import * as gateway from '../../src/lib/mimo/gateway';
import * as network from '../../src/lib/security/network';
import { AppError } from '../../src/lib/core/errors';
import * as auth from '../../src/lib/security/auth';
import * as files from '../../src/lib/core/storage';
import { GET, POST } from '../../src/app/api/[...path]/route';
import { fixture } from '../fixtures';
import JSZip from 'jszip';
import QRCode from 'qrcode';
import sharp from 'sharp';
import * as adapters from '../../src/lib/core/creative';
import { createDelivery } from '../../src/lib/delivery/service';
import { previewProject } from '../../src/lib/publishing/service';
const url = process.env.TEST_DATABASE_URL;
if (!url)
  throw new Error(
    'TEST_DATABASE_URL required: use a disposable PostgreSQL database, never production',
  );
process.env.DATABASE_URL = url;
process.env.ALLOW_SANDBOX = 'true';
const owner = { userId: randomUUID() },
  stranger = { userId: randomUUID() },
  staff = { userId: randomUUID() };
let orgId: string, orderId: string, projectId: string, attemptId: string;
const db = database();
beforeAll(async () => {
  // Refuse to migrate a database with any existing project schema.
  const [existing] = await db`select to_regclass('public.organizations') present`;
  if (existing.present) throw new Error('Use an EMPTY disposable test database');
  await db.unsafe(
    "create schema if not exists auth; do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to authenticated;",
  );
  // Match the new project's automatic-RLS setting, without supplying real Supabase credentials.
  await db.unsafe(`create function public.test_auto_rls() returns event_trigger language plpgsql as $test_rls$
    declare cmd record; begin
      for cmd in select * from pg_event_trigger_ddl_commands() loop
        if cmd.object_type='table' and cmd.schema_name='public' then
          execute 'alter table ' || cmd.object_identity || ' enable row level security';
        end if;
      end loop;
    end $test_rls$;
    create event trigger test_auto_rls_on_create on ddl_command_end when tag in ('CREATE TABLE') execute function public.test_auto_rls();`);
  await applyBootstrap();
  orgId = (await core.createOrganization(owner, 'Test organization')).id;
  await db`insert into memberships(org_id,user_id,role) values(${orgId},${staff.userId},'member')`;
  await db`insert into platform_admins(user_id) values(${staff.userId})`;
});
afterAll(async () => {
  await closeDatabase();
});
describe.sequential('real PostgreSQL business invariants', () => {
  it('prices on server and freezes order snapshot', async () => {
    const q = await transaction(owner, (tx) => core.createQuote(tx, orgId, 'basic'));
    const o = await transaction(owner, (tx) => core.createOrder(tx, orgId, q.id, true));
    orderId = o.id;
    expect(o.amount_minor).toBe(19900);
    await db`update service_plans set price_minor=29900 where code='basic'`;
    const saved = await transaction(owner, (tx) => core.order(tx, owner, orderId));
    expect(saved.amount_minor).toBe(19900);
    expect(saved.plan_snapshot.price_minor).toBe(19900);
  });
  it('SQL Editor bootstrap is repeatable and preserves business data and migration hashes', async () => {
    await applyBootstrap();
    const [saved] = await db`select amount_minor from service_orders where id=${orderId}`;
    expect(saved.amount_minor).toBe(19900);
    const [plan] = await db`select price_minor from service_plans where code='basic'`;
    expect(plan.price_minor).toBe(29900);
    const history = await db`select name,hash from oneboss_migrations order by name`;
    expect(history).toHaveLength(2);
    for (const migration of history) {
      const { createHash } = await import('node:crypto');
      expect(migration.hash).toBe(
        createHash('sha256')
          .update(await readFile('supabase/migrations/' + migration.name, 'utf8'))
          .digest('hex'),
      );
    }
  });
  it('prices add-ons on the server and snapshots their entitlements', async () => {
    const q = await transaction(owner, (tx) =>
      core.createQuote(tx, orgId, 'basic', [{ code: 'extra-poster', qty: 2 }]),
    );
    expect(q.amount_minor).toBe(49700);
    expect(q.plan_snapshot.poster_count).toBe(4);
    const o = await transaction(owner, (tx) => core.createOrder(tx, orgId, q.id, true));
    const items = await db`select * from service_order_items where order_id=${o.id}`;
    expect(items.length).toBe(2);
    expect(items.reduce((n, x) => n + x.total_minor, 0)).toBe(o.amount_minor);
    await expect(
      transaction(owner, (tx) =>
        core.createQuote(tx, orgId, 'basic', [{ code: 'unknown', qty: 1 }]),
      ),
    ).rejects.toThrow('ADDON_UNAVAILABLE');
  });
  it('HTTP API rejects client-supplied amounts and forged webhooks', async () => {
    const spy = vi.spyOn(auth, 'authenticate').mockResolvedValue(owner);
    try {
      const request = new Request('http://localhost/api/commerce/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'http-test-123' },
        body: JSON.stringify({ orgId, planCode: 'basic', amountMinor: 0 }),
      });
      const result = await POST(request, {
        params: Promise.resolve({ path: ['commerce', 'quotes'] }),
      });
      expect(result.status).toBe(400);
      expect((await result.json()).error.code).toBe('VALIDATION_FAILED');
      const webhook = await POST(
        new Request('http://localhost/api/commerce/payments/webhook/stripe', { method: 'POST' }),
        { params: Promise.resolve({ path: ['commerce', 'payments', 'webhook', 'stripe'] }) },
      );
      expect(webhook.status).toBe(503);
    } finally {
      spy.mockRestore();
    }
  });
  it('denies other tenant access and unpaid production', async () => {
    await expect(transaction(stranger, (tx) => core.order(tx, stranger, orderId))).rejects.toThrow(
      'FORBIDDEN',
    );
    await expect(
      transaction(owner, (tx) => core.createProject(tx, owner, orderId)),
    ).rejects.toThrow('PAYMENT_REQUIRED');
  });
  it('does not let manual mode authorize a demo order', async () => {
    await expect(
      transaction(owner, (tx) => core.checkout(tx, owner, orderId, 'manual_verified')),
    ).rejects.toThrow('DEMO_REQUIRES_SANDBOX');
  });
  it('creates a labeled sandbox attempt', async () => {
    const result = await transaction(owner, (tx) => core.checkout(tx, owner, orderId, 'sandbox'));
    attemptId = result.attempt.id;
    expect(result.isDemo).toBe(true);
  });
  it('rejects wrong amount', async () => {
    await expect(
      transaction(owner, (tx) =>
        core.confirmPayment(
          tx,
          owner,
          orderId,
          {
            attemptId,
            eventId: 'bad-amount-1',
            amountMinor: 0,
            currency: 'CNY',
            evidenceRef: 'sandbox-test',
          },
          'sandbox',
        ),
      ),
    ).rejects.toThrow('AMOUNT_MISMATCH');
  });
  it('ten concurrent identical confirmations grant exactly one entitlement', async () => {
    const input = {
      attemptId,
      eventId: 'sandbox-event-1',
      amountMinor: 19900,
      currency: 'CNY' as const,
      evidenceRef: 'sandbox-test',
    };
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        transaction(owner, (tx) => core.confirmPayment(tx, owner, orderId, input, 'sandbox')),
      ),
    );
    expect(results.every((x) => x.payState === 'PAID')).toBe(true);
    const [{ n }] =
      await db`select count(*)::int n from project_entitlements where order_id=${orderId}`;
    expect(n).toBe(1);
    const [{ events }] =
      await db`select count(*)::int events from payment_events where order_id=${orderId}`;
    expect(events).toBe(1);
  });
  it('creates exactly one project from the authorized order', async () => {
    const p = await transaction(owner, (tx) => core.createProject(tx, owner, orderId));
    projectId = p.id;
    expect((await transaction(owner, (tx) => core.createProject(tx, owner, orderId))).id).toBe(
      projectId,
    );
  });
  it('idempotency caches committed results and detects payload changes', async () => {
    let executions = 0;
    const run = () =>
      core.idempotent(owner, 'test-key-123', 'test', { a: 1 }, orgId, async () => ({
        value: ++executions,
      }));
    expect(await run()).toEqual(await run());
    expect(executions).toBe(1);
    await expect(
      core.idempotent(owner, 'test-key-123', 'test', { a: 2 }, orgId, async () => ({})),
    ).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });
  it('RLS denies stranger reads and direct authenticated writes', async () => {
    await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub',${stranger.userId},true)`;
      await tx.unsafe('set local role authenticated');
      expect((await tx`select * from service_orders`).length).toBe(0);
      expect((await tx`select * from projects`).length).toBe(0);
      expect((await tx`select * from project_entitlements`).length).toBe(0);
    });
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claim.sub',${owner.userId},true)`;
        await tx.unsafe('set local role authenticated');
        await tx`update service_orders set pay_state='PAID' where id=${orderId}`;
      }),
    ).rejects.toThrow('permission denied');
  });
  it('RLS permits only tenant read access', async () => {
    await db.begin(async (tx) => {
      await tx`select set_config('request.jwt.claim.sub',${owner.userId},true)`;
      await tx.unsafe('set local role authenticated');
      expect((await tx`select * from service_orders`).length).toBe(2);
    });
  });
  it('uses immutable fact snapshots and invalidates prior approval', async () => {
    const f = fixture();
    const input = {
      products: [{ id: f.productId, name: '椅子', description: '' }],
      facts: [f.fact],
      brief: {
        projectId,
        organizationId: orgId,
        productIds: [f.productId],
        objective: '宣传',
        confirmedFacts: [f.factId],
        assetRefs: [],
        preferredStyles: [],
        restrictions: [],
        deliverables: { site: true as const, posterCount: 2, xhsCopy: true as const },
        approval: 'pending' as const,
      },
    };
    const first = await transaction(owner, (tx) => core.saveIntake(tx, owner, projectId, input));
    expect(first.facts[0].version).toBe(1);
    await transaction(owner, (tx) => core.approveBrief(tx, owner, projectId, first.brief.revision));
    const second = await transaction(owner, (tx) => core.saveIntake(tx, owner, projectId, input));
    expect(second.facts[0].version).toBe(2);
    expect(first.facts[0].id).not.toBe(second.facts[0].id);
    await expect(
      transaction(owner, (tx) => core.approveBrief(tx, owner, projectId, first.brief.revision)),
    ).rejects.toThrow('STALE_BRIEF');
  });
  it('reclaims crashed jobs with fencing tokens', async () => {
    const r = await transaction(owner, (tx) =>
      core.enqueue(tx, owner, projectId, 'intake', { customerInput: 'test' }),
    );
    const first = await claimRun();
    expect(first.id).toBe(r.id);
    await db`update agent_runs set lease_until=now()-interval '1 minute' where id=${r.id}`;
    const second = await claimRun();
    expect(second.id).toBe(first.id);
    expect(second.lease_token).not.toBe(first.lease_token);
    expect(second.attempt).toBe(2);
    expect(
      (
        await db`update agent_runs set output='{}'::jsonb where id=${r.id} and lease_token=${first.lease_token}`
      ).count,
    ).toBe(0);
    await db`update agent_runs set status='FAILED' where id=${r.id}`;
  });
  it('finishes exhausted crashed jobs with a timestamp and no active lease', async () => {
    const r = await transaction(owner, (tx) => core.enqueue(tx, owner, projectId, 'intake', {}));
    await db`update agent_runs set status='RUNNING',attempt=max_attempts,lease_token=${randomUUID()},lease_until=now()-interval '1 minute' where id=${r.id}`;
    expect(await claimRun()).toBeUndefined();
    const [job] =
      await db`select status,error_class,completed_at,lease_token,lease_until from agent_runs where id=${r.id}`;
    expect(job).toMatchObject({
      status: 'FAILED',
      error_class: 'LEASE_EXHAUSTED',
      lease_token: null,
      lease_until: null,
    });
    expect(job.completed_at).toBeInstanceOf(Date);
  });
  it('marks missing model credentials as failure, never fake success', async () => {
    delete process.env.MIMO_API_KEY;
    delete process.env.MIMO_MODEL;
    const r = await transaction(owner, (tx) =>
      core.enqueue(tx, owner, projectId, 'intake', { customerInput: 'test' }),
    );
    await runOne();
    const [saved] =
      await db`select status,error_class,output,completed_at from agent_runs where id=${r.id}`;
    expect(saved.status).toBe('FAILED');
    expect(saved.error_class).toBe('MIMO_NOT_CONFIGURED');
    expect(saved.output).toBeNull();
    expect(saved.completed_at).toBeInstanceOf(Date);
  });
  it('persists generated output and preserves posters on a website-only change', async () => {
    const [latestBrief] =
      await db`select revision from creative_briefs where project_id=${projectId} order by revision desc limit 1`;
    await transaction(owner, (tx) => core.approveBrief(tx, owner, projectId, latestBrief.revision));
    const [savedFact] =
      await db`select * from product_facts where project_id=${projectId} and version=2`;
    const f = fixture();
    const production = JSON.parse(
      JSON.stringify(f.production)
        .replaceAll(f.projectId, projectId)
        .replaceAll(f.factId, savedFact.id),
    );
    production.site.factVersion = 2;
    production.posters[0].factVersion = 2;
    production.copy[0].factVersion = 2;
    const design = { ...f.design, factVersion: 2 };
    await db`insert into design_systems(org_id,project_id,revision,body,approved_at) values(${orgId},${projectId},1,${db.json(design)},now())`;
    const mock = vi.spyOn(gateway, 'callMimo');
    try {
      mock.mockResolvedValueOnce({ output: production, usage: { total_tokens: 100 } });
      const run = await transaction(owner, (tx) =>
        core.enqueue(tx, owner, projectId, 'generate', {}),
      );
      await db`update agent_runs set error_class='PREVIOUS_ATTEMPT_FAILED' where id=${run.id}`;
      await runOne();
      const [result] = await db`select status,error_class from agent_runs where id=${run.id}`;
      expect(result.status).toBe('SUCCEEDED');
      expect(result.error_class).toBeNull();
      await db`update artifact_versions set status='APPROVED',approved_by=${owner.userId} where project_id=${projectId} and revision=1`;
      const revised = structuredClone(production);
      revised.site.seo.title = '椅子展示新版';
      revised.site.revision = 2;
      mock.mockResolvedValueOnce({
        output: {
          targetArtifacts: ['site'],
          isFactChange: false,
          operations: [{ kind: 'replace', path: 'site.seo.title', proposedValue: '椅子展示新版' }],
          summary: '仅网站',
        },
        usage: {},
      });
      mock.mockResolvedValueOnce({ output: revised, usage: { total_tokens: 42 } });
      const changeRun = await transaction(owner, (tx) =>
        core.requestChange(tx, owner, projectId, {
          targetArtifacts: 'site',
          instruction: '只修改网站标题，海报不变',
          baseRevision: 1,
        }),
      );
      await runOne();
      const [version] =
        await db`select body from artifact_versions where project_id=${projectId} and revision=2`;
      expect(version.body.posters).toEqual(production.posters);
      expect(version.body.copy).toEqual(production.copy);
      expect(version.body.site.seo.title).toBe('椅子展示新版');
      const [recorded] = await db`select usage from agent_runs where id=${changeRun.id}`;
      expect(recorded.usage.revision.total_tokens).toBe(42);
    } finally {
      mock.mockRestore();
    }
  });
  it('previews only the tenant current fact snapshot without publishing or exposing private paths', async () => {
    const signer = vi.spyOn(files, 'signed');
    try {
      await expect(previewProject(stranger, projectId, 1)).rejects.toThrow('FORBIDDEN');
      expect(signer).not.toHaveBeenCalled();
      const preview = await previewProject(owner, projectId, 1);
      expect(preview.facts.every((f) => f.verified && f.version === 2 && f.productId)).toBe(true);
      expect(preview.facts.every((f) => !('source' in f))).toBe(true);
      const [p] = await db`select published_revision from projects where id=${projectId}`;
      expect(p.published_revision).toBeNull();
    } finally {
      signer.mockRestore();
    }
  });
  it('retains provider usage when business validation rejects a model response', async () => {
    const [base] =
      await db`select body from artifact_versions where project_id=${projectId} and revision=1`;
    const output = structuredClone(base.body);
    output.site.pages[0].slug = 'home';
    const mock = vi
      .spyOn(gateway, 'callMimo')
      .mockResolvedValueOnce({ output, usage: { total_tokens: 11 } });
    try {
      const r = await transaction(owner, (tx) =>
        core.enqueue(tx, owner, projectId, 'generate', {}),
      );
      await db`update agent_runs set max_attempts=1 where id=${r.id}`;
      await runOne();
      const [saved] = await db`select status,error_class,usage from agent_runs where id=${r.id}`;
      expect(saved).toMatchObject({
        status: 'FAILED',
        error_class: 'INVALID_SITE_PAGES',
        usage: { total_tokens: 11 },
      });
    } finally {
      mock.mockRestore();
    }
  });
  it('rolls back a publication pointer if the actual HTTP check fails', async () => {
    const previousOrigin = process.env.APP_URL;
    process.env.APP_URL = 'https://oneboss.example';
    const mock = vi
      .spyOn(network, 'verifyPublicUrl')
      .mockRejectedValue(new AppError('PUBLIC_SITE_UNREACHABLE', 502));
    try {
      const run = await transaction(owner, (tx) =>
        core.enqueue(tx, owner, projectId, 'publish', { revision: 1 }),
      );
      await runOne();
      const [p] =
        await db`select published_revision,published_verified from projects where id=${projectId}`;
      expect(p.published_revision).toBeNull();
      expect(p.published_verified).toBe(false);
      const [r] = await db`select status,error_class from agent_runs where id=${run.id}`;
      expect(r.status).toBe('QUEUED');
      expect(r.error_class).toBe('PUBLIC_SITE_UNREACHABLE');
      await db`update agent_runs set status='FAILED' where id=${run.id}`;
    } finally {
      mock.mockRestore();
      if (previousOrigin) process.env.APP_URL = previousOrigin;
      else delete process.env.APP_URL;
    }
  });
  it('requires platform staff, not customer owner, for real manual payment', async () => {
    const q = await transaction(owner, (tx) => core.createQuote(tx, orgId, 'professional'));
    const o = await transaction(owner, (tx) => core.createOrder(tx, orgId, q.id, false));
    const a = await transaction(owner, (tx) => core.checkout(tx, owner, o.id, 'manual_verified'));
    const input = {
      attemptId: a.attempt.id,
      eventId: 'manual-event-1',
      amountMinor: o.amount_minor,
      currency: 'CNY' as const,
      evidenceRef: 'verified-bank-reference',
    };
    await expect(
      transaction(owner, (tx) => core.confirmPayment(tx, owner, o.id, input, 'manual_verified')),
    ).rejects.toThrow('PLATFORM_ADMIN_REQUIRED');
    expect(
      (
        await transaction(staff, (tx) =>
          core.confirmPayment(tx, staff, o.id, input, 'manual_verified'),
        )
      ).payState,
    ).toBe('PAID');
  });
  it('authorizes private poster and ZIP downloads before signing', async () => {
    const prefix = `${orgId}/${projectId}/deliveries/1/test`;
    await db`insert into deliveries(org_id,project_id,revision,manifest,zip_path) values(${orgId},${projectId},1,${db.json({ posters: [{ path: 'posters/test.png' }] })},${prefix + '/delivery.zip'})`;
    const identity = vi.spyOn(auth, 'authenticate').mockResolvedValue(stranger);
    const signer = vi
      .spyOn(files, 'signed')
      .mockImplementation(async (path) => 'https://signed.example/' + path);
    const context = {
      params: Promise.resolve({ path: ['core', 'projects', projectId, 'delivery'] }),
    };
    try {
      const denied = await GET(
        new Request('http://localhost/api/core/projects/' + projectId + '/delivery'),
        context,
      );
      expect(denied.status).toBe(403);
      expect(signer).not.toHaveBeenCalled();
      identity.mockResolvedValue(owner);
      const allowed = await GET(
        new Request('http://localhost/api/core/projects/' + projectId + '/delivery'),
        context,
      );
      expect(allowed.status).toBe(200);
      const body = await allowed.json();
      expect(body.expiresIn).toBe(300);
      expect(body.posterDownloads[0].url).toBe(
        'https://signed.example/' + prefix + '/posters/test.png',
      );
      expect(signer).toHaveBeenCalledTimes(2);
    } finally {
      identity.mockRestore();
      signer.mockRestore();
    }
  });
  it('assembles actual PNG/QR/copy ZIP bytes and accepts only the matching delivery', async () => {
    // A-side contract test: renderer, HTTP proof and Storage are controlled test doubles.
    // It does not establish B rendering quality or a public customer delivery.
    const oldOrigin = process.env.APP_URL;
    process.env.APP_URL = 'https://oneboss.example';
    const url = `https://oneboss.example/p/${(await db`select publish_slug from projects where id=${projectId}`)[0].publish_slug}`;
    const qr = await QRCode.toBuffer(url, { width: 300, margin: 4 });
    const png = await sharp({
      create: {
        width: 1080,
        height: 1350,
        channels: 4,
        background: '#f1f1f1',
      },
    })
      .composite([{ input: qr, left: 750, top: 1020 }])
      .png()
      .toBuffer();
    const uploaded = new Map<string, Buffer>();
    const storage = vi.spyOn(files, 'store').mockImplementation(async (path, bytes) => {
      uploaded.set(path, Buffer.from(bytes));
      return path;
    });
    const http = vi
      .spyOn(network, 'verifyPublicUrl')
      .mockResolvedValue('data-oneboss-revision="2"');
    const adapter = vi.spyOn(adapters, 'creative').mockResolvedValue({
      renderSite: () => null,
      renderPoster: async () => ({ pngBytes: png, qrBytes: qr }),
      validateProduction: async () => ({ pass: true, issues: [] }),
    });
    const identity = vi.spyOn(auth, 'authenticate').mockResolvedValue(owner);
    try {
      await db`update projects set published_revision=2,published_verified=true,browser_verified_revision=2 where id=${projectId}`;
      const r = await transaction(owner, (tx) =>
        core.enqueue(tx, owner, projectId, 'delivery', {}),
      );
      await runOne();
      const [job] = await db`select status,error_class from agent_runs where id=${r.id}`;
      expect(job).toMatchObject({ status: 'SUCCEEDED' });
      const [delivery] =
        await db`select * from deliveries where project_id=${projectId} and revision=2`;
      expect(delivery.manifest.factVersion).toBe(2);
      const archive = await JSZip.loadAsync(uploaded.get(delivery.zip_path)!);
      expect(Object.keys(archive.files)).toEqual(
        expect.arrayContaining([
          'posters/poster-1.png',
          'qrcode/qr-1.png',
          'copy/xiaohongshu-poster-1.md',
          'site-url.txt',
          'README-交付说明.md',
          'manifest.json',
        ]),
      );
      expect(await archive.file('site-url.txt')!.async('string')).toBe(url);
      for (const file of delivery.manifest.files) {
        const bytes = await archive.file(file.path)!.async('nodebuffer');
        expect(bytes.length).toBe(file.size);
        expect(core.hash(bytes)).toBe(file.sha256);
      }
      const accept = await POST(
        new Request(`http://localhost/api/core/projects/${projectId}/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
          body: JSON.stringify({ manifestVersion: 2 }),
        }),
        { params: Promise.resolve({ path: ['core', 'projects', projectId, 'accept'] }) },
      );
      expect(accept.status).toBe(200);
      const [p] = await db`select * from projects where id=${projectId}`;
      expect(p.status).toBe('ACCEPTED');
      // A new fact snapshot cannot reuse the previous ZIP under the same publication.
      await expect(createDelivery({}, { p: { ...p, fact_version: 3 } })).rejects.toThrow(
        'FACT_VERSION_CHANGED',
      );
    } finally {
      storage.mockRestore();
      http.mockRestore();
      adapter.mockRestore();
      identity.mockRestore();
      if (oldOrigin) process.env.APP_URL = oldOrigin;
      else delete process.env.APP_URL;
    }
  });
  it('empty fact snapshots still advance version and invalidate queued work', async () => {
    const q = await transaction(owner, (tx) => core.createQuote(tx, orgId, 'basic'));
    const o = await transaction(owner, (tx) => core.createOrder(tx, orgId, q.id, true));
    const attempt = await transaction(owner, (tx) => core.checkout(tx, owner, o.id, 'sandbox'));
    await transaction(owner, (tx) =>
      core.confirmPayment(
        tx,
        owner,
        o.id,
        {
          attemptId: attempt.attempt.id,
          eventId: randomUUID(),
          amountMinor: o.amount_minor,
          currency: 'CNY',
          evidenceRef: 'sandbox-empty-facts',
        },
        'sandbox',
      ),
    );
    const p = await transaction(owner, (tx) => core.createProject(tx, owner, o.id));
    const f = fixture();
    const input = {
      products: [{ id: f.productId, name: '待补资料', description: '' }],
      facts: [],
      brief: {
        projectId: p.id,
        organizationId: orgId,
        productIds: [f.productId],
        objective: '宣传',
        confirmedFacts: [],
        assetRefs: [],
        preferredStyles: [],
        restrictions: [],
        deliverables: { site: true as const, posterCount: 1, xhsCopy: true as const },
        approval: 'pending' as const,
      },
    };
    await transaction(owner, (tx) => core.saveIntake(tx, owner, p.id, input));
    const r = await transaction(owner, (tx) => core.enqueue(tx, owner, p.id, 'intake', {}));
    await transaction(owner, (tx) => core.saveIntake(tx, owner, p.id, input));
    const [saved] = await db`select fact_version from projects where id=${p.id}`;
    expect(saved.fact_version).toBe(2);
    await runOne();
    const [job] = await db`select status,error_class from agent_runs where id=${r.id}`;
    expect(job.status).toBe('FAILED');
    expect(job.error_class).toBe('FACT_VERSION_CHANGED');
  });
  it('refuses acceptance while publication is unverified or browser QA is stale', async () => {
    const identity = vi.spyOn(auth, 'authenticate').mockResolvedValue(owner);
    try {
      const accept = () =>
        POST(
          new Request(`http://localhost/api/core/projects/${projectId}/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
            body: JSON.stringify({ manifestVersion: 1 }),
          }),
          { params: Promise.resolve({ path: ['core', 'projects', projectId, 'accept'] }) },
        );
      await db`update projects set published_revision=1,published_verified=false,browser_verified_revision=1 where id=${projectId}`;
      expect((await (await accept()).json()).error.code).toBe('VERIFIED_SITE_REQUIRED');
      await db`update projects set published_verified=true,browser_verified_revision=null where id=${projectId}`;
      expect((await (await accept()).json()).error.code).toBe('VERIFIED_SITE_REQUIRED');
      await db`update projects set browser_verified_revision=1 where id=${projectId}`;
      // The minimal download fixture has no factVersion and cannot be accepted.
      expect((await (await accept()).json()).error.code).toBe('DELIVERY_NOT_READY');
    } finally {
      identity.mockRestore();
    }
  });
  it('refund request revokes production but is not a completed refund', async () => {
    const refund = await transaction(owner, (tx) => core.requestRefund(tx, owner, orderId, 19900));
    expect(refund.status).toBe('REQUESTED');
    expect((await transaction(owner, (tx) => core.order(tx, owner, orderId))).pay_state).toBe(
      'REFUND_PENDING',
    );
    await expect(
      transaction(owner, (tx) => core.enqueue(tx, owner, projectId, 'intake', {})),
    ).rejects.toThrow('ENTITLEMENT_REQUIRED');
    await expect(
      transaction(owner, (tx) =>
        core.finalizeRefund(tx, owner, orderId, refund.id, 'refund-reference', true),
      ),
    ).rejects.toThrow('PLATFORM_ADMIN_REQUIRED');
    expect(
      (
        await transaction(staff, (tx) =>
          core.finalizeRefund(tx, staff, orderId, refund.id, 'refund-reference', true),
        )
      ).payState,
    ).toBe('REFUNDED');
    await expect(
      transaction(staff, (tx) =>
        core.finalizeRefund(tx, staff, orderId, refund.id, 'refund-reference', true),
      ),
    ).rejects.toThrow('REFUND_NOT_PENDING');
  });
});

async function applyBootstrap() {
  const connection = await db.reserve();
  try {
    await connection.unsafe(await readFile('docs/setup-supabase.sql', 'utf8'));
  } catch (error) {
    await connection.unsafe('rollback');
    throw error;
  } finally {
    await connection.release();
  }
}
