import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { outboundFetch } from '../src/lib/security/http';
import { IntakeResult } from '../src/contracts';

// Real Auth + HTTP + worker acceptance. Business writes are confined to an EMPTY local DB.
// Never accepts a hosted database, never mocks authentication or model responses.
const testUrl = process.env.TEST_DATABASE_URL ?? '';
const parsed = new URL(testUrl);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname), 'LOCAL_TEST_DB_REQUIRED');
assert(/^\/oneboss_acceptance_[a-z0-9_]+$/.test(parsed.pathname), 'DISPOSABLE_DB_NAME_REQUIRED');
const authUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(authUrl && publicKey && adminKey, 'SUPABASE_AUTH_CONFIG_REQUIRED');
assert(process.env.MIMO_API_KEY && process.env.MIMO_MODEL, 'REAL_MIMO_REQUIRED');
const db = postgres(testUrl, { ssl: false, onnotice: () => {} });
const options = {
  global: { fetch: outboundFetch },
  auth: { persistSession: false, autoRefreshToken: false },
};
const admin = createClient(authUrl, adminKey, options);
const userIds: string[] = [];
const children: ChildProcess[] = [];
const checks: string[] = [];
let phase = 'database-guard';
let failure = false;
let removedUsers = 0;
let workerEvidence: { runId: string; attempt: number; totalTokens?: number } | undefined;
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const address = reservation.address();
assert(address && typeof address !== 'string');
const port = address.port;
await new Promise<void>((resolve, reject) =>
  reservation.close((error) => (error ? reject(error) : resolve())),
);
const origin = `http://127.0.0.1:${port}`;
const childEnv = {
  ...process.env,
  DATABASE_URL: testUrl,
  DATABASE_PASSWORD: '',
  ALLOW_SANDBOX: 'true',
  APP_URL: origin,
};
function start(args: string[]) {
  const child = spawn(process.execPath, args, { env: childEnv, stdio: 'ignore' });
  children.push(child);
  return child;
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function api(path: string, token?: string, body?: unknown, key = randomUUID(), status = 200) {
  const response = await fetch(`${origin}/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  assert.equal(
    response.status,
    status,
    `HTTP_${response.status}_${result.error?.code ?? 'UNEXPECTED'}`,
  );
  return result;
}
try {
  const [existing] = await db`select count(*)::int n from pg_tables where schemaname='public'`;
  assert.equal(existing.n, 0, 'EMPTY_TEST_DB_REQUIRED');
  await db.unsafe(
    "create schema auth; do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to authenticated;",
  );
  const reserved = await db.reserve();
  try {
    await reserved.unsafe(await readFile('docs/setup-supabase.sql', 'utf8'));
  } finally {
    reserved.release();
  }
  phase = 'temporary-auth-users';
  const tokens: string[] = [];
  for (let i = 0; i < 2; i++) {
    const email = `oneboss-acceptance-${randomUUID()}@example.com`;
    const password = randomBytes(32).toString('base64url');
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { purpose: 'temporary-a-acceptance' },
    });
    assert(!created.error && created.data.user, 'TEMP_USER_CREATE_FAILED');
    userIds.push(created.data.user.id);
    const client = createClient(authUrl, publicKey, options);
    const login = await client.auth.signInWithPassword({ email, password });
    assert(!login.error && login.data.session, 'REAL_SIGNIN_FAILED');
    tokens.push(login.data.session.access_token);
  }
  checks.push('two real Supabase password sign-ins');
  phase = 'http-start';
  const server = start([
    'node_modules/next/dist/bin/next',
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ]);
  let ready = false;
  for (let n = 0; n < 60; n++) {
    assert(server.exitCode === null, 'HTTP_PROCESS_EXITED');
    try {
      const r = await fetch(`${origin}/api/health`);
      ready = r.ok;
    } catch {}
    if (ready) break;
    await pause(500);
  }
  assert(ready, 'HTTP_START_TIMEOUT');
  phase = 'authentication-and-orders';
  assert.equal(
    (await api('core/organizations', undefined, { name: 'Denied' }, undefined, 401)).error.code,
    'UNAUTHENTICATED',
  );
  await api('core/organizations', 'invalid-token', { name: 'Denied' }, undefined, 401);
  const [owner, stranger] = tokens;
  const org = await api(
    'core/organizations',
    owner,
    { name: 'Temporary A acceptance' },
    undefined,
    201,
  );
  const again = await api(
    'core/organizations',
    owner,
    { name: 'Temporary A acceptance' },
    undefined,
    201,
  );
  assert.equal(org.id, again.id);
  checks.push('real bearer validation and repeat-safe organization creation');
  const quoteBody = { orgId: org.id, planCode: 'basic', addons: [] };
  await api('commerce/quotes', stranger, quoteBody, undefined, 403);
  await api('commerce/quotes', owner, { ...quoteBody, amountMinor: 0 }, undefined, 400);
  const key = randomUUID();
  const quote = await api('commerce/quotes', owner, quoteBody, key);
  assert.equal(quote.amount_minor, 19900);
  assert.equal((await api('commerce/quotes', owner, quoteBody, key)).id, quote.id);
  await api('commerce/quotes', owner, { ...quoteBody, planCode: 'professional' }, key, 409);
  const order = await api('commerce/orders', owner, {
    orgId: org.id,
    quoteId: quote.id,
    isDemo: true,
  });
  await api(`commerce/orders/${order.id}`, stranger, undefined, undefined, 403);
  assert.equal(
    (await api('core/projects', owner, { orderId: order.id }, undefined, 403)).error.code,
    'PAYMENT_REQUIRED',
  );
  const checkout = await api(`commerce/orders/${order.id}/checkout`, owner, { channel: 'sandbox' });
  const payment = {
    attemptId: checkout.attempt.id,
    eventId: randomUUID(),
    amountMinor: 19900,
    currency: 'CNY',
    evidenceRef: 'local-disposable-acceptance',
  };
  await api(
    `commerce/orders/${order.id}/confirm-sandbox`,
    owner,
    { ...payment, amountMinor: 0 },
    undefined,
    400,
  );
  const paid = await api(`commerce/orders/${order.id}/confirm-sandbox`, owner, payment);
  assert.equal(paid.payState, 'PAID');
  await api(`commerce/orders/${order.id}/confirm-sandbox`, owner, payment);
  const [counts] =
    await db`select (select count(*)::int from project_entitlements where order_id=${order.id}) entitlements, (select count(*)::int from payment_events where order_id=${order.id}) events`;
  assert.equal(counts.entitlements, 1);
  assert.equal(counts.events, 1);
  checks.push(
    'tenant isolation, server pricing, idempotency, unpaid gate, sandbox exactly-once entitlement',
  );
  const realQuote = await api('commerce/quotes', owner, quoteBody);
  const realOrder = await api('commerce/orders', owner, {
    orgId: org.id,
    quoteId: realQuote.id,
    isDemo: false,
  });
  assert.equal(
    (
      await api(
        `commerce/orders/${realOrder.id}/checkout`,
        owner,
        { channel: 'sandbox' },
        undefined,
        403,
      )
    ).error.code,
    'SANDBOX_DISABLED',
  );
  const manual = await api(`commerce/orders/${realOrder.id}/checkout`, owner, {
    channel: 'manual_verified',
  });
  const manualDenied = await api(
    `commerce/orders/${realOrder.id}/confirm-manual`,
    owner,
    { ...payment, attemptId: manual.attempt.id, eventId: randomUUID() },
    undefined,
    403,
  );
  assert.equal(manualDenied.error.code, 'PLATFORM_ADMIN_REQUIRED');
  await api(`commerce/orders/${realOrder.id}/close`, owner, {});
  checks.push(
    'production sandbox blocked; customer cannot confirm manual payment; unpaid order can close',
  );
  const project = await api('core/projects', owner, { orderId: order.id });
  await api(`core/projects/${project.id}`, stranger, undefined, undefined, 403);
  phase = 'real-background-worker';
  const run = await api(`core/projects/${project.id}/analyze-intake`, owner, {
    customerInput:
      '测试产品：木制椅子。用户只确认产品名称，尚未确认材质、价格、尺寸和认证。请提出一个最关键的问题，不得编造已确认事实。',
  });
  // One billed model attempt is enough for this probe; production retry policy is unchanged.
  await db`update agent_runs set max_attempts=1 where id=${run.id}`;
  start(['--import', 'tsx', 'scripts/worker.ts']);
  let saved: Record<string, any> | undefined;
  for (let n = 0; n < 180; n++) {
    [saved] = await db`select * from agent_runs where id=${run.id}`;
    if (['SUCCEEDED', 'FAILED'].includes(saved!.status)) break;
    await pause(1000);
  }
  assert.equal(saved?.status, 'SUCCEEDED', `WORKER_${saved?.error_class ?? 'TIMEOUT'}`);
  const output = IntakeResult.parse(saved.output);
  assert(output.facts.every((fact) => !fact.verified));
  assert(saved.completed_at && saved.attempt >= 1);
  workerEvidence = {
    runId: run.id,
    attempt: saved.attempt,
    totalTokens: saved.usage?.total_tokens,
  };
  const observed = await api(`core/runs/${run.id}`, owner);
  assert.equal(observed.status, 'SUCCEEDED');
  await api(`core/runs/${run.id}`, stranger, undefined, undefined, 403);
  checks.push(
    'separate worker consumes HTTP job, real MiMo schema output persisted, run access isolated',
  );
} catch (error) {
  failure = true;
  console.error(
    JSON.stringify({
      passed: false,
      phase,
      detail:
        error instanceof assert.AssertionError ? error.message.slice(0, 200) : 'OPERATION_FAILED',
      completedChecks: checks,
    }),
  );
} finally {
  phase = 'cleanup';
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 15000);
    await exited;
    clearTimeout(timeout);
  }
  await db.end();
  for (const id of userIds) {
    const removed = await admin.auth.admin.deleteUser(id);
    if (removed.error) {
      failure = true;
      console.error(
        JSON.stringify({ passed: false, phase: 'temporary-auth-user-cleanup', userId: id }),
      );
    } else removedUsers++;
  }
  console.log(
    JSON.stringify({
      passed: !failure,
      checks,
      workerEvidence,
      temporaryAuthUsersRemoved: removedUsers,
      businessDatabase: 'local-disposable-only',
    }),
  );
  if (failure) process.exitCode = 1;
}
