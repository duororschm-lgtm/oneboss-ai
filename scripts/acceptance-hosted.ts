import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { outboundFetch } from '../src/lib/security/http';

// Creates one temporary Auth user, but no organizations, orders, projects or payments.
// Authenticated API probes can leave ordinary rate-limit counters for the deleted UUID.
assert(process.env.RUN_HOSTED_ACCEPTANCE === 'true', 'EXPLICIT_HOSTED_OPT_IN_REQUIRED');
const origin = 'https://oneboss-ai.onrender.com';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && publicKey && serviceKey, 'AUTH_CONFIG_REQUIRED');
const options = {
  global: { fetch: outboundFetch },
  auth: { persistSession: false, autoRefreshToken: false },
};
const admin = createClient(url, serviceKey, options);
let userId: string | undefined;
let phase = 'public-http';
let passed = false;
let userRemoved = false;
const checks: string[] = [];
async function api(path: string, token?: string, body?: unknown, status = 200) {
  const response = await outboundFetch(`${origin}/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(90000),
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
  assert.equal((await api('health')).status, 'running');
  const plans = await api('core/plans');
  assert.equal(
    plans.plans.find((plan: { code: string }) => plan.code === 'basic').price_minor,
    199,
  );
  assert.equal(plans.addons.length, 3);
  assert.equal(
    (await api('core/organizations', undefined, { name: 'denied' }, 401)).error.code,
    'UNAUTHENTICATED',
  );
  await api('core/organizations', 'invalid-token', { name: 'denied' }, 401);
  assert.equal(
    (await api('commerce/payments/webhook/unconfigured', undefined, {}, 503)).error.code,
    'LIVE_PROVIDER_NOT_CONFIGURED',
  );
  checks.push(
    'health, real database pricing, anonymous/invalid-token denial, unsigned webhook rejection',
  );
  phase = 'real-authentication';
  const email = `oneboss-hosted-check-${randomUUID()}@example.com`;
  const password = randomBytes(32).toString('base64url');
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: 'temporary-hosted-a-acceptance' },
  });
  assert(!created.error && created.data.user, 'USER_CREATE_FAILED');
  userId = created.data.user.id;
  const client = createClient(url, publicKey, options);
  const login = await client.auth.signInWithPassword({ email, password });
  assert(!login.error && login.data.session, 'SIGNIN_FAILED');
  const token = login.data.session.access_token;
  // A missing job must produce 404 after real Auth validation and a native database query.
  assert.equal(
    (await api(`core/runs/${randomUUID()}`, token, undefined, 404)).error.code,
    'NOT_FOUND',
  );
  checks.push(
    'real Supabase password sign-in; Render accepts valid bearer and executes authenticated DB query',
  );
  phase = 'client-database-permissions';
  for (const table of ['service_orders', 'projects', 'project_entitlements']) {
    const result = await client.from(table).select('*').limit(1);
    assert(!result.error, 'RLS_READ_FAILED');
    assert.deepEqual(result.data, []);
  }
  const denied = await client
    .from('service_orders')
    .update({ pay_state: 'PAID' })
    .eq('id', randomUUID());
  assert.equal(denied.error?.code, '42501');
  checks.push('real authenticated RLS hides other tenants; direct client payment mutation denied');
  passed = true;
} catch (error) {
  console.error(
    JSON.stringify({
      passed: false,
      phase,
      detail:
        error instanceof assert.AssertionError ? error.message.slice(0, 160) : 'OPERATION_FAILED',
    }),
  );
} finally {
  if (userId) {
    userRemoved = !(await admin.auth.admin.deleteUser(userId)).error;
    if (!userRemoved)
      console.error(JSON.stringify({ phase: 'temporary-auth-user-cleanup', userId }));
  }
  console.log(
    JSON.stringify({
      passed: passed && userRemoved,
      checks,
      temporaryAuthUsersRemoved: userRemoved ? 1 : 0,
      businessRecordsCreated: 0,
    }),
  );
  if (!passed || !userRemoved) process.exitCode = 1;
}
