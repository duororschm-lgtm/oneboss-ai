import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { database, closeDatabase, transaction } from '../../src/lib/core/db';
import * as core from '../../src/lib/core/service';
import * as adminStats from '../../src/lib/admin/server';
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
import { retryPublication, publishRevision, previewProject, publicProject } from '../../src/lib/publishing/service';
import { accountWorkspace, projectWorkspace } from '../../src/lib/core/workspace';
import { adminWorkspace } from '../../src/lib/core/workspace';
import { registrationLimit } from '../../src/lib/security/registration';
import * as browserQA from '../../src/lib/publishing/browser';
import * as wxProvider from '../../src/lib/commerce/wechat-provider';
import {
  createWechatCheckout,
  applyWechatTransaction,
  closeWechatOrder,
  reconcileWechatOrder,
} from '../../src/lib/commerce/wechat-service';
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
  it('atomically caps anonymous signup attempts despite concurrent requests with changing network hints', async () => {
    const secret = randomUUID();
    const attempts = await Promise.allSettled(
      Array.from({ length: 21 }, (_, index) =>
        registrationLimit(
          new Request('https://oneboss.example/api/auth/register', {
            headers: { 'x-forwarded-for': `203.0.113.${index + 1}` },
          }),
          `customer_${index}`,
          secret,
        ),
      ),
    );
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(20);
    expect(
      (attempts.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason
        .code,
    ).toBe('REGISTRATION_RATE_LIMITED');
  });
  it('prices on server and freezes order snapshot', async () => {
    const q = await transaction(owner, (tx) => core.createQuote(tx, orgId, 'basic'));
    const o = await transaction(owner, (tx) => core.createOrder(tx, orgId, q.id, true));
    orderId = o.id;
    expect(o.amount_minor).toBe(199);
    expect(
      (await db`select price_minor from service_plans where code='professional'`)[0].price_minor,
    ).toBe(599);
    await db`update service_plans set price_minor=299 where code='basic'`;
    const saved = await transaction(owner, (tx) => core.order(tx, owner, orderId));
    expect(saved.amount_minor).toBe(199);
    expect(saved.plan_snapshot.price_minor).toBe(199);
  });
  it('SQL Editor bootstrap is repeatable and preserves business data and migration hashes', async () => {
    await applyBootstrap();
    const [saved] = await db`select amount_minor from service_orders where id=${orderId}`;
    expect(saved.amount_minor).toBe(199);
    const [plan] = await db`select price_minor from service_plans where code='basic'`;
    expect(plan.price_minor).toBe(299);
    const history = await db`select name,hash from oneboss_migrations order by name`;
    expect(history.map((m) => m.name).sort()).toEqual(
      (await readdir('supabase/migrations')).filter((n) => n.endsWith('.sql')).sort(),
    );
    for (const migration of history) {
      const { createHash } = await import('node:crypto');
      expect(migration.hash).toBe(
        createHash('sha256')
          .update((await readFile('supabase/migrations/' + migration.name, 'utf8')).replace(/\r\n/g,'\n'))
          .digest('hex'),
      );
    }
  });
  it('prices add-ons on the server and snapshots their entitlements', async () => {
    const q = await transaction(owner, (tx) =>
      core.createQuote(tx, orgId, 'basic', [{ code: 'extra-poster', qty: 2 }]),
    );
    expect(q.amount_minor).toBe(497);
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
      amountMinor: 199,
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
  it('rejects a new event ID after payment was confirmed', async () => {
    await expect(transaction(owner, (tx) => core.confirmPayment(tx, owner, orderId, {
      attemptId, eventId: 'second-distinct-event', amountMinor: 199, currency: 'CNY',
      evidenceRef: 'second-distinct-evidence',
    }, 'sandbox'))).rejects.toThrow();
    expect((await db`select count(*)::int n from payment_events where order_id=${orderId}`)[0].n).toBe(1);
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
  it('persists attributed transitions, isolates task events and detects stale workers', async()=>{
    const [run]=await db`select * from agent_runs where project_id=${projectId} order by created_at desc limit 1`;
    expect(run.employee_key).toBe('product_analyst');
    const events=await db`select * from task_events where run_id=${run.id} order by id`;
    expect(events.map(e=>e.status)).toContain('QUEUED');
    expect(events.some(e=>e.attempt===2)).toBe(true);
    await expect(db`update task_events set status='FAKE' where run_id=${run.id}`).rejects.toThrow('TASK_EVENTS_APPEND_ONLY');
    await expect(transaction(stranger,tx=>projectWorkspace(tx,stranger,projectId))).rejects.toThrow('FORBIDDEN');
    const workerId=randomUUID();
    await db`insert into worker_instances(id,version,last_seen_at) values(${workerId},'test','2020-01-01')`;
    expect((await transaction(staff,tx=>adminStats.workerHealth(tx,staff)))[0].status).toBe('offline');
    await db`update worker_instances set last_seen_at=now() where id=${workerId}`;
    expect((await transaction(staff,tx=>adminStats.workerHealth(tx,staff)))[0].status).toBe('online');
  });
  it('enforces finance and reviewer roles on the server, preserving legacy owners',async()=>{
    const finance={userId:randomUUID()},reviewer={userId:randomUUID()};
    await db`insert into platform_admins(user_id,role) values(${finance.userId},'finance'),(${reviewer.userId},'reviewer')`;
    expect(await transaction(staff,tx=>core.platformAdmin(tx,staff,'view.audit'))).toBe('owner');
    expect(await transaction(finance,tx=>core.platformAdmin(tx,finance,'act.payment'))).toBe('finance');
    await expect(transaction(reviewer,tx=>core.platformAdmin(tx,reviewer,'act.payment'))).rejects.toThrow('ADMIN_CAPABILITY_REQUIRED');
    await expect(transaction(finance,tx=>adminStats.agentRuns(tx,finance,{page:1,pageSize:10}))).rejects.toThrow('ADMIN_CAPABILITY_REQUIRED');
    expect((await transaction(reviewer,tx=>adminWorkspace(tx,reviewer))).manualAttempts).toEqual([]);
    expect((await transaction(reviewer,tx=>adminStats.overview(tx,reviewer))).todayConfirmedMinor).toBeNull();
  });
  it('rolls back manual receipt and entitlement when audit cannot be persisted',async()=>{
    const quote=await transaction(owner,tx=>core.createQuote(tx,orgId,'basic',[]));
    const o=await transaction(owner,tx=>core.createOrder(tx,orgId,quote.id,false));
    const a=await transaction(owner,tx=>core.checkout(tx,owner,o.id,'manual_verified'));
    await db.unsafe(`create function reject_audit_test() returns trigger language plpgsql as $$ begin raise exception 'AUDIT_UNAVAILABLE_TEST'; end $$; create trigger reject_audit_test before insert on admin_audit_logs for each row execute function reject_audit_test();`);
    try {
      await expect(transaction(staff,tx=>core.confirmPayment(tx,staff,o.id,{attemptId:a.attempt.id,eventId:randomUUID(),amountMinor:o.amount_minor,currency:'CNY',evidenceRef:'bank-confirm-test'},'manual_verified'))).rejects.toThrow('AUDIT_UNAVAILABLE_TEST');
      expect((await db`select pay_state from service_orders where id=${o.id}`)[0].pay_state).toBe('PENDING_CONFIRMATION');
      expect((await db`select count(*)::int n from payment_events where order_id=${o.id}`)[0].n).toBe(0);
      expect((await db`select count(*)::int n from project_entitlements where order_id=${o.id}`)[0].n).toBe(0);
    } finally { await db.unsafe('drop trigger reject_audit_test on admin_audit_logs; drop function reject_audit_test();'); }
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
    const secondCopy = { ...production.copy[0], id: randomUUID(), posterId: randomUUID() };
    production.posters.push({
      ...structuredClone(production.posters[0]),
      copyPackRef: secondCopy.id,
    });
    production.copy.push(secondCopy);
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
  it('requires genuinely different direction layouts and retains usage for rejected proposals', async () => {
    const design = { ...fixture().design, factVersion: 2, approvedByClient: false,
      heroComposition: 'split-editorial', density:'airy', imageTreatment:'framed', motionPreset:'subtle',
      siteBlueprint: { pages: [{slug:'',title:'首页', sections:[
        {type:'hero',layout:{variant:'split-editorial'}}, {type:'specs',layout:{variant:'technical-table'}},
      ]}] } };
    const model = vi.spyOn(gateway, 'callMimo').mockResolvedValue({
      output: {
        choices: [
          { ...design, styleId: 'editorial-minimal', layoutMode: 'editorial' },
          { ...design, styleId: 'future-tech', layoutMode: 'editorial' },
        ],
      },
      usage: { total_tokens: 14 },
    });
    try {
      const rejected = await transaction(owner, (tx) =>
        core.enqueue(tx, owner, projectId, 'design', {}),
      );
      await db`update agent_runs set max_attempts=1 where id=${rejected.id}`;
      await runOne();
      const [r] = await db`select status,error_class,usage from agent_runs where id=${rejected.id}`;
      expect(r.status).toBe('FAILED');
      expect(r.error_class).toBe('DESIGN_DIRECTIONS_NOT_DISTINCT');
      expect(r.usage.attempt1.total_tokens).toBe(14);
      expect(r.usage.attempt2.total_tokens).toBe(14);
      model.mockResolvedValue({
        output: {
          choices: [
            { ...design, styleId: 'editorial-minimal', layoutMode: 'editorial' },
            { ...design, styleId: 'future-tech', layoutMode: 'split',
              heroComposition:'centered-product', density:'dense',imageTreatment:'cutout',
              typography:{...design.typography,display:'monospace'} },
          ],
        },
        usage: { total_tokens: 15 },
      });
      const accepted = await transaction(owner, (tx) =>
        core.enqueue(tx, owner, projectId, 'design', {}),
      );
      await runOne();
      expect((await db`select status from agent_runs where id=${accepted.id}`)[0].status).toBe(
        'SUCCEEDED',
      );
    } finally {
      model.mockRestore();
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
  it('keeps reported manual payments pending until a platform reviewer confirms real receipt', async () => {
    const q = await transaction(owner, (tx) => core.createQuote(tx, orgId, 'basic'));
    const o = await transaction(owner, (tx) => core.createOrder(tx, orgId, q.id, false));
    const attempt = await transaction(owner, (tx) =>
      core.checkout(tx, owner, o.id, 'manual_verified'),
    );
    const duplicate = await transaction(owner, (tx) =>
      core.checkout(tx, owner, o.id, 'manual_verified'),
    );
    expect(duplicate.attempt.id).toBe(attempt.attempt.id);
    await expect(
      transaction(stranger, (tx) =>
        core.reportManualPayment(tx, stranger, o.id, attempt.attempt.id, 'forged claim'),
      ),
    ).rejects.toThrow('FORBIDDEN');
    const claimed = await transaction(owner, (tx) =>
      core.reportManualPayment(
        tx,
        owner,
        o.id,
        attempt.attempt.id,
        'isolated fixture: no real payment; reference1234',
      ),
    );
    expect(claimed.payState).toBe('PENDING_CONFIRMATION');
    expect((await transaction(owner, (tx) => core.order(tx, owner, o.id))).pay_state).toBe(
      'PENDING_CONFIRMATION',
    );
    expect(await db`select * from project_entitlements where order_id=${o.id}`).toHaveLength(0);
    const review = await transaction(staff, (tx) => adminWorkspace(tx, staff));
    expect(review.manualAttempts.find((a) => a.order_id === o.id)?.customer_report).toContain(
      'no real payment',
    );
  });
  it('locks new addon prices and distinguishes manual channels without granting reported payments', async () => {
    const q = await transaction(owner, (tx) => core.createQuote(tx, orgId, 'professional', [
      {code:'extra-product',qty:1},{code:'extra-poster',qty:1},{code:'extra-revision',qty:1},
    ]));
    expect(q.amount_minor).toBe(846);
    const o = await transaction(owner, (tx) => core.createOrder(tx, orgId, q.id, false, 'alipay'));
    expect(o.payment_channel).toBe('alipay');
    const attempt = await transaction(owner, (tx) => core.checkout(tx, owner, o.id, 'manual_verified'));
    expect(attempt.attempt.payment_channel).toBe('alipay');
    await transaction(owner, (tx) => core.reportManualPayment(tx, owner, o.id, attempt.attempt.id, 'Isolated manual-flow test, no real funds'));
    expect(await db`select * from project_entitlements where order_id=${o.id}`).toHaveLength(0);
    await expect(transaction(owner, (tx) => core.checkout(tx, owner, o.id, 'manual_verified', 'wechat'))).rejects.toThrow('PAYMENT_CHANNEL_LOCKED');
    const input = { attemptId:attempt.attempt.id, eventId:randomUUID(),amountMinor:846,currency:'CNY' as const,evidenceRef:randomUUID() };
    await expect(transaction(owner, tx => core.confirmPayment(tx, owner, o.id, input, 'manual_verified'))).rejects.toThrow('PLATFORM_ADMIN_REQUIRED');
    const results = await Promise.allSettled([input,{...input,eventId:randomUUID()}].map(body =>
      transaction(staff, tx => core.confirmPayment(tx, staff, o.id, body, 'manual_verified'))));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await db`select count(*)::int n from payment_events where order_id=${o.id}`)[0].n).toBe(1);
    expect((await db`select plan_snapshot from service_orders where id=${o.id}`)[0].plan_snapshot.addons.map((a:any)=>a.unit_minor)).toEqual([99,99,49]);
    for (const qty of [-1,0,1.5,11])
      await expect(transaction(owner,tx=>core.createQuote(tx,orgId,'professional',[{code:'extra-product',qty}]))).rejects.toThrow('INVALID_ADDON_QUANTITY');
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
    const [previous] =
      await db`select published_revision,published_verified from projects where id=${projectId}`;
    await db`update projects set published_revision=1,published_verified=true where id=${projectId}`;
    await db`insert into deliveries(org_id,project_id,revision,manifest,zip_path) values(${orgId},${projectId},1,${db.json(
      {
        siteRevision: 1,
        factVersion: 2,
        posters: [{ path: 'posters/test.png' }],
        files: [
          { path: 'qrcode/qr-1.png', storagePath: prefix + '/qrcode/qr-1.png' },
          { path: 'qrcode/qr-2.png', storagePath: 'other-project/qrcode/qr-2.png' },
        ],
      },
    )},${prefix + '/delivery.zip'})`;
    await db`insert into deliveries(org_id,project_id,revision,manifest,zip_path) values(${orgId},${projectId},2,${db.json({ siteRevision: 2, factVersion: 2, posters: [] })},${prefix + '/newer.zip'})`;
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
      expect(body.manifest.siteRevision).toBe(1); // A rollback must not download a newer delivery.
      expect(body.expiresIn).toBe(300);
      expect(body.posterDownloads[0].url).toBe(
        'https://signed.example/' + prefix + '/posters/test.png',
      );
      expect(body.qrDownloads).toEqual([
        { path: 'qrcode/qr-1.png', url: 'https://signed.example/' + prefix + '/qrcode/qr-1.png' },
      ]);
      expect(signer).toHaveBeenCalledTimes(3);
    } finally {
      await db`delete from deliveries where project_id=${projectId} and revision=2`;
      await db`update projects set published_revision=${previous.published_revision},published_verified=${previous.published_verified} where id=${projectId}`;
      identity.mockRestore();
      signer.mockRestore();
    }
  });
  it('does not serve expired or revoked demo publication', async () => {
    const [project] = await db`select publish_slug from projects where id=${projectId}`;
    const [previous] =
      await db`select expires_at,revoked from project_entitlements where project_id=${projectId}`;
    try {
      await db`update project_entitlements set expires_at=now()-interval '1 second',revoked=false where project_id=${projectId}`;
      expect(await publicProject(project.publish_slug)).toBeNull();
      await db`update project_entitlements set expires_at=now()+interval '90 days',revoked=true where project_id=${projectId}`;
      expect(await publicProject(project.publish_slug)).toBeNull();
    } finally {
      await db`update project_entitlements set expires_at=${previous.expires_at},revoked=${previous.revoked} where project_id=${projectId}`;
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
      const copy = await archive.file('copy/xiaohongshu-poster-1.md')!.async('string');
      expect(copy).toContain(`制作时间：${delivery.manifest.createdAt}`);
      const qrFile = delivery.manifest.files.find(
        (file: { path: string }) => file.path === 'qrcode/qr-1.png',
      );
      expect(uploaded.get(qrFile.storagePath)).toEqual(
        await archive.file(qrFile.path)!.async('nodebuffer'),
      );
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
      await expect(createDelivery({project_id:p.id}, { p: { ...p, fact_version: 3 } })).rejects.toThrow(
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
      // A download from an older fact snapshot cannot be accepted even with fresh browser QA.
      await db`update deliveries set manifest=jsonb_set(manifest,'{factVersion}','1') where project_id=${projectId} and revision=1`;
      expect((await (await accept()).json()).error.code).toBe('DELIVERY_NOT_READY');
    } finally {
      identity.mockRestore();
    }
  });
  it('serves only accessible account and project workspace data, including after reload', async () => {
    const empty = await transaction(stranger, (tx) => accountWorkspace(tx, stranger));
    expect(empty).toEqual({ isAdmin: false, organizations: [], orders: [], projects: [] });
    const account = await transaction(owner, (tx) => accountWorkspace(tx, owner));
    expect(account.organizations.some((o) => o.id === orgId)).toBe(true);
    expect(account.orders.some((o) => o.id === orderId)).toBe(true);
    expect(account.projects.some((p) => p.id === projectId)).toBe(true);
    const workspace = await transaction(owner, (tx) => projectWorkspace(tx, owner, projectId));
    expect(workspace.project.id).toBe(projectId);
    expect(workspace.facts.every((f) => f.version === workspace.project.fact_version)).toBe(true);
    expect(workspace.assets.every((a) => !('storage_path' in a))).toBe(true);
    await expect(
      transaction(stranger, (tx) => projectWorkspace(tx, stranger, projectId)),
    ).rejects.toThrow('FORBIDDEN');
    const identity = vi.spyOn(auth, 'authenticate').mockResolvedValue(stranger);
    try {
      const response = await GET(
        new Request(`http://localhost/api/core/projects/${projectId}/workspace`),
        { params: Promise.resolve({ path: ['core', 'projects', projectId, 'workspace'] }) },
      );
      expect(response.status).toBe(403);
      identity.mockResolvedValue(owner);
      const allowed = await GET(new Request('http://localhost/api/core/account'), {
        params: Promise.resolve({ path: ['core', 'account'] }),
      });
      expect(allowed.status).toBe(200);
      expect((await allowed.json()).orders.some((o: any) => o.id === orderId)).toBe(true);
    } finally {
      identity.mockRestore();
    }
  });
  it('rolls back when browser QA fails and records successful publication browser evidence', async () => {
    const oldOrigin = process.env.APP_URL;
    process.env.APP_URL = 'https://oneboss.example';
    await db`update projects set published_revision=null,published_verified=false,browser_verified_revision=null where id=${projectId}`;
    const http = vi
      .spyOn(network, 'verifyPublicUrl')
      .mockResolvedValue('data-oneboss-revision="1"');
    const browser = vi
      .spyOn(browserQA, 'verifyPublishedBrowser')
      .mockRejectedValue(new AppError('BROWSER_ERRORS', 502));
    try {
      const failed = await transaction(owner, (tx) =>
        core.enqueue(tx, owner, projectId, 'publish', { revision: 1 }),
      );
      await runOne();
      const [p] =
        await db`select published_revision,published_verified,browser_verified_revision from projects where id=${projectId}`;
      expect(p).toMatchObject({
        published_revision: null,
        published_verified: false,
        browser_verified_revision: null,
      });
      await db`update agent_runs set status='FAILED' where id=${failed.id}`;
      const evidence = [375, 768, 1280].map((width) => ({
        width,
        revision: 1,
        passed: true as const,
      }));
      browser.mockResolvedValue(evidence);
      const success = await transaction(owner, (tx) =>
        core.enqueue(tx, owner, projectId, 'publish', { revision: 1 }),
      );
      await runOne();
      const [done] = await db`select status,output from agent_runs where id=${success.id}`;
      expect(done.status).toBe('SUCCEEDED');
      expect(done.output.browserEvidence).toEqual(evidence);
      expect((await transaction(owner,tx=>projectWorkspace(tx,owner,projectId))).publication.publicUrl).toMatch(/https:\/\/oneboss.example\/p\//);
      const [verified] =
        await db`select published_verified,browser_verified_revision from projects where id=${projectId}`;
      expect(verified).toMatchObject({ published_verified: true, browser_verified_revision: 1 });
    } finally {
      http.mockRestore();
      browser.mockRestore();
      if (oldOrigin) process.env.APP_URL = oldOrigin;
      else delete process.env.APP_URL;
    }
  });
  it('isolates a candidate from public readers and preserves the old verified tuple on failed QA', async () => {
    const oldOrigin = process.env.APP_URL;
    process.env.APP_URL = 'https://oneboss.example';
    const [base] = await db`select * from projects where id=${projectId}`;
    const [e] =
      await db`select remaining_revisions from project_entitlements where project_id=${projectId}`;
    await db`update artifact_versions set status='APPROVED',approved_by=${owner.userId} where project_id=${projectId} and revision=2`;
    await db`update projects set published_revision=1,published_verified=true,browser_verified_revision=1,status='PUBLISHED' where id=${projectId}`;
    const http = vi
      .spyOn(network, 'verifyPublicUrl')
      .mockResolvedValue('data-oneboss-revision="2"');
    const signed = vi.spyOn(files, 'signed').mockResolvedValue('https://assets.example/test.png');
    const mimo = vi.spyOn(gateway, 'callMimo');
    let token: string | undefined;
    const browser = vi
      .spyOn(browserQA, 'verifyPublishedBrowser')
      .mockImplementation(async (_slug, _revision, options) => {
        token = options?.publicationToken;
        expect((await publicProject(base.publish_slug))?.revision).toBe(1);
        expect((await publicProject(base.publish_slug, token))?.revision).toBe(2);
        expect(await publicProject(base.publish_slug, randomUUID())).toBeNull();
        throw new AppError('INTERACTION_QA_FAILED', 502);
      });
    try {
      const r = await transaction(owner, (tx) =>
        core.enqueue(tx, owner, projectId, 'publish', { revision: 2 }),
      );
      await runOne();
      const [p] =
        await db`select published_revision,published_verified,browser_verified_revision,status,publication_token from projects where id=${projectId}`;
      expect(p).toMatchObject({
        published_revision: 1,
        published_verified: true,
        browser_verified_revision: 1,
        status: 'PUBLISHED',
        publication_token: null,
      });
      expect((await publicProject(base.publish_slug))?.revision).toBe(1);
      expect(await publicProject(base.publish_slug, token)).toBeNull();
      expect(mimo).not.toHaveBeenCalled();
      expect(
        (
          await db`select remaining_revisions from project_entitlements where project_id=${projectId}`
        )[0].remaining_revisions,
      ).toBe(e.remaining_revisions);
      expect(
        (
          await db`select stage from task_events where run_id=${r.id} and error_class='INTERACTION_QA_FAILED' order by id desc limit 1`
        )[0].stage,
      ).toContain('retry-wait');
      await db`update agent_runs set status='FAILED' where id=${r.id}`;
    } finally {
      http.mockRestore();
      signed.mockRestore();
      mimo.mockRestore();
      browser.mockRestore();
      if (oldOrigin) process.env.APP_URL = oldOrigin;
      else delete process.env.APP_URL;
    }
  });
  it('allows only authorized, audited, idempotent publication-only retries', async () => {
    const [prior] =
      await db`select id from agent_runs where project_id=${projectId} and role='publish' and status='FAILED' order by created_at desc limit 1`;
    await expect(retryPublication(owner, prior.id, 'publish-retry-user-denied')).rejects.toThrow(
      'PLATFORM_ADMIN_REQUIRED',
    );
    const before = (
      await db`select remaining_revisions from project_entitlements where project_id=${projectId}`
    )[0].remaining_revisions;
    const first = (await retryPublication(staff, prior.id, 'publish-retry-staff-safe')) as any;
    const second = (await retryPublication(staff, prior.id, 'publish-retry-staff-safe')) as any;
    expect(first.runId).toBe(second.runId);
    expect(first.role).toBe('publish');
    expect(
      (
        await db`select count(*)::int n from admin_audit_logs where action='retry-publication' and details->>'runId'=${first.runId}`
      )[0].n,
    ).toBe(1);
    expect(
      (
        await db`select remaining_revisions from project_entitlements where project_id=${projectId}`
      )[0].remaining_revisions,
    ).toBe(before);
    await db`update agent_runs set status='FAILED' where id=${first.runId}`;
  });
  it('fences stale publication commits and atomically switches only a verified candidate', async () => {
    const oldOrigin = process.env.APP_URL;
    process.env.APP_URL = 'https://oneboss.example';
    const http = vi
      .spyOn(network, 'verifyPublicUrl')
      .mockResolvedValue('data-oneboss-revision="2"');
    const browser = vi
      .spyOn(browserQA, 'verifyPublishedBrowser')
      .mockResolvedValue(
        [375, 768, 1280].map((width) => ({ width, revision: 2, passed: true as const })),
      );
    try {
      const r = await transaction(owner, (tx) =>
        core.enqueue(tx, owner, projectId, 'publish', { revision: 2 }),
      );
      const claims = await Promise.all([claimRun(), claimRun()]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const run = claims.find(Boolean)!;
      browser.mockImplementationOnce(async () => {
        await db`update agent_runs set lease_token=${randomUUID()} where id=${r.id}`;
        return [];
      });
      await expect(publishRevision(run)).rejects.toThrow('LEASE_LOST');
      expect(
        (await db`select published_revision from projects where id=${projectId}`)[0]
          .published_revision,
      ).toBe(1);
      await db`update agent_runs set status='FAILED' where id=${r.id}`;
      const good = await transaction(owner, (tx) =>
        core.enqueue(tx, owner, projectId, 'publish', { revision: 2 }),
      );
      await runOne();
      expect((await db`select status from agent_runs where id=${good.id}`)[0].status).toBe(
        'SUCCEEDED',
      );
      expect(
        (
          await db`select published_revision,published_verified,browser_verified_revision,publication_token from projects where id=${projectId}`
        )[0],
      ).toMatchObject({
        published_revision: 2,
        published_verified: true,
        browser_verified_revision: 2,
        publication_token: null,
      });
    } finally {
      http.mockRestore();
      browser.mockRestore();
      if (oldOrigin) process.env.APP_URL = oldOrigin;
      else delete process.env.APP_URL;
    }
  });
  it('binds signed-provider payments to exact merchant, order and amount, idempotently preserving refunds', async () => {
    const keys = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    for (const [key, value] of Object.entries({
      WECHAT_PAY_ENABLED: 'true',
      APP_URL: 'https://oneboss.example',
      WECHAT_MCH_ID: '1234567890',
      WECHAT_APP_ID: 'wx1234567890abcdef',
      WECHAT_CERT_SERIAL: 'ABCDEF0123456789',
      WECHAT_PRIVATE_KEY: keys.privateKey,
      WECHAT_PUBLIC_KEY_ID: 'PUB_KEY_ID_12345678',
      WECHAT_PUBLIC_KEY: keys.publicKey,
      WECHAT_API_V3_KEY: '12345678901234567890123456789012',
    }))
      vi.stubEnv(key, value);
    const provider = vi
      .spyOn(wxProvider, 'wechatRequest')
      .mockResolvedValue({ code_url: 'weixin://wxpay/bizpayurl?pr=test-fixture' });
    try {
      const q = await transaction(owner, (tx) => core.createQuote(tx, orgId, 'basic'));
      const o = await transaction(owner, (tx) => core.createOrder(tx, orgId, q.id, false));
      const first = await createWechatCheckout(owner, o.id),
        second = await createWechatCheckout(owner, o.id);
      expect(first.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(second.qrDataUrl).toBe(first.qrDataUrl);
      const payments = await db`select * from wechat_payments where order_id=${o.id}`;
      expect(payments).toHaveLength(1);
      expect((await transaction(owner, (tx) => core.order(tx, owner, o.id))).pay_state).toBe(
        'PENDING_CONFIRMATION',
      );
      const value = {
        appid: 'wx1234567890abcdef',
        mchid: '1234567890',
        out_trade_no: payments[0].out_trade_no,
        transaction_id: 'wx-test-transaction-0001',
        trade_state: 'SUCCESS',
        amount: { total: o.amount_minor, currency: 'CNY', payer_total: 1 },
      };
      await expect(
        db.begin((tx) =>
          applyWechatTransaction(tx, { ...value, amount: { ...value.amount, total: 1 } }),
        ),
      ).rejects.toThrow('PAYMENT_AMOUNT_MISMATCH');
      await expect(
        db.begin((tx) => applyWechatTransaction(tx, { ...value, mchid: '9999999999' })),
      ).rejects.toThrow('WECHAT_MERCHANT_MISMATCH');
      await expect(reconcileWechatOrder(stranger, o.id)).rejects.toThrow('FORBIDDEN');
      await db.begin((tx) => applyWechatTransaction(tx, value));
      await db.begin((tx) => applyWechatTransaction(tx, value));
      expect((await transaction(owner, (tx) => core.order(tx, owner, o.id))).pay_state).toBe(
        'PAID',
      );
      expect(await db`select * from project_entitlements where order_id=${o.id}`).toHaveLength(1);
      const events =
        await db`select verification_method,verified_by from payment_events where order_id=${o.id}`;
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        verification_method: 'provider_signature',
        verified_by: null,
      });
      await transaction(owner, (tx) => core.requestRefund(tx, owner, o.id, o.amount_minor));
      await db.begin((tx) => applyWechatTransaction(tx, value));
      expect((await transaction(owner, (tx) => core.order(tx, owner, o.id))).pay_state).toBe(
        'REFUND_PENDING',
      );
      expect(
        (await db`select revoked from project_entitlements where order_id=${o.id}`)[0].revoked,
      ).toBe(true);
      const q2 = await transaction(owner, (tx) => core.createQuote(tx, orgId, 'basic'));
      const o2 = await transaction(owner, (tx) => core.createOrder(tx, orgId, q2.id, false));
      await createWechatCheckout(owner, o2.id);
      const [p2] = await db`select * from wechat_payments where order_id=${o2.id}`;
      await expect(
        db.begin((tx) => applyWechatTransaction(tx, { ...value, out_trade_no: p2.out_trade_no })),
      ).rejects.toThrow('EVENT_CONFLICT');
      provider.mockResolvedValue({
        mchid: '1234567890',
        appid: 'wx1234567890abcdef',
        out_trade_no: p2.out_trade_no,
        trade_state: 'NOTPAY',
      });
      expect((await closeWechatOrder(owner, o2.id)).payState).toBe('CLOSED');
      expect((await closeWechatOrder(owner, o2.id)).payState).toBe('CLOSED');
      await expect(createWechatCheckout(owner, o2.id)).rejects.toThrow('ORDER_CLOSING');
    } finally {
      provider.mockRestore();
      vi.unstubAllEnvs();
    }
  });
  it('allows platform review without tenant membership and rejects ordinary customer admin access', async () => {
    const reviewer = { userId: randomUUID() };
    await db`insert into platform_admins(user_id) values(${reviewer.userId})`;
    await expect(transaction(owner, (tx) => adminWorkspace(tx, owner))).rejects.toThrow(
      'PLATFORM_ADMIN_REQUIRED',
    );
    expect(
      (await transaction(reviewer, (tx) => adminWorkspace(tx, reviewer))).orders.some(
        (o) => o.id === orderId,
      ),
    ).toBe(true);
    const q = await transaction(owner, (tx) => core.createQuote(tx, orgId, 'basic'));
    const o = await transaction(owner, (tx) => core.createOrder(tx, orgId, q.id, false));
    const attempt = await transaction(owner, (tx) =>
      core.checkout(tx, owner, o.id, 'manual_verified'),
    );
    const identity = vi.spyOn(auth, 'authenticate').mockResolvedValue(owner);
    const request = () =>
      new Request(`http://localhost/api/commerce/orders/${o.id}/confirm-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({
          attemptId: attempt.attempt.id,
          eventId: 'reviewer-manual-event',
          amountMinor: o.amount_minor,
          currency: 'CNY',
          evidenceRef: 'isolated-manual-fixture-reference',
        }),
      });
    const context = {
      params: Promise.resolve({ path: ['commerce', 'orders', o.id, 'confirm-manual'] }),
    };
    try {
      expect((await POST(request(), context)).status).toBe(403);
      identity.mockResolvedValue(reviewer);
      expect((await POST(request(), context)).status).toBe(200);
      expect((await transaction(owner, (tx) => core.order(tx, owner, o.id))).pay_state).toBe(
        'PAID',
      );
    } finally {
      identity.mockRestore();
    }
  });
  it('refund request revokes production but is not a completed refund', async () => {
    const refund = await transaction(owner, (tx) => core.requestRefund(tx, owner, orderId, 199));
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
    const [confirmedRefund] = await db`select confirmed_at from refunds where id=${refund.id}`;
    expect(confirmedRefund.confirmed_at).not.toBeNull();
    await db`update refunds set created_at='2026-01-01T00:00:00Z',confirmed_at='2026-02-01T16:30:00Z' where id=${refund.id}`;
    await db`update service_orders set is_demo=false where id=${orderId}`;
    const daily = await transaction(staff,tx=>adminStats.revenue(tx,staff,'2026-02-01','2026-02-03','day'));
    expect(daily.map(p=>[p.date,p.refundedMinor])).toEqual([['2026-02-01',0],['2026-02-02',199],['2026-02-03',0]]);
    expect(daily[1].netMinor).toBe(-199);
    await expect(transaction(staff,tx=>adminStats.revenue(tx,staff,'2026-02-30','2026-03-01','day'))).rejects.toThrow('DATE_RANGE_INVALID');
    await expect(transaction(staff,tx=>adminStats.revenue(tx,staff,'2026-03-01','2026-02-01','day'))).rejects.toThrow('DATE_RANGE_INVALID');
    expect(await transaction(staff,tx=>adminStats.revenue(tx,staff,'2026-02-01','2026-02-03','week'))).toHaveLength(2);
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
