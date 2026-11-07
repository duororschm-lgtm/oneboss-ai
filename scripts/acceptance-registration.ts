import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import postgres from 'postgres';
import { chromium, type Browser } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import { outboundFetch } from '../src/lib/security/http';
import { accountEmail, normalizeAccount } from '../src/lib/customer/account';

// Real username registration/Auth/browser. No organization, order, model call or payment is created.
const hosted = process.env.RUN_HOSTED_REGISTRATION_ACCEPTANCE === 'true';
const options = {
  global: { fetch: outboundFetch },
  auth: { persistSession: false, autoRefreshToken: false },
};
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  options,
);
const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  options,
);
const username = `ObTest_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
const alias = await accountEmail(username),
  password = randomBytes(28).toString('base64url');
const legacyEmail = `oneboss-registration-${randomUUID()}@example.com`;
let legacyId: string | undefined, registeredId: string | undefined;
let server: ChildProcess | undefined,
  browser: Browser | undefined,
  db: ReturnType<typeof postgres> | undefined;
let origin = 'https://oneboss-ai.onrender.com',
  passed = false,
  removed = 0,
  phase = 'setup';
const started = Date.now(),
  dir = `.cache/registration-${hosted ? 'hosted' : 'local'}`;
await mkdir(dir, { recursive: true });
async function api(path: string, token?: string, body?: unknown, status = 200) {
  const response = await outboundFetch(`${origin}/api/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    signal: AbortSignal.timeout(60000),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  assert(
    (response.headers.get('content-type') || '').includes('application/json'),
    'API_GATEWAY_RESPONSE',
  );
  const result = await response.json();
  assert.equal(
    response.status,
    status,
    `HTTP_${response.status}_${result.error?.code || 'UNEXPECTED'}`,
  );
  return result;
}
try {
  if (!hosted) {
    const target = new URL(process.env.TEST_DATABASE_URL || '');
    assert(
      ['localhost', '127.0.0.1'].includes(target.hostname) &&
        /^\/oneboss_acceptance_[a-z0-9_]+$/.test(target.pathname),
      'LOCAL_DISPOSABLE_DB_REQUIRED',
    );
    db = postgres(target.href, { ssl: false, onnotice: () => {} });
    const [tables] = await db`select count(*)::int n from pg_tables where schemaname='public'`;
    assert.equal(tables.n, 0, 'EMPTY_DB_REQUIRED');
    await db.unsafe(
      "create schema auth; do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$; create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to authenticated;",
    );
    const connection = await db.reserve();
    try {
      await connection.unsafe(await readFile('docs/setup-supabase.sql', 'utf8'));
    } finally {
      connection.release();
    }
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const address = reservation.address();
    assert(address && typeof address !== 'string');
    const port = address.port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    origin = `http://127.0.0.1:${port}`;
    server = spawn(
      process.execPath,
      [
        'node_modules/next/dist/bin/next',
        'start',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
      ],
      {
        windowsHide: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          DATABASE_URL: target.href,
          DATABASE_PASSWORD: '',
          CUSTOMER_EMAIL_READY: 'false',
        },
      },
    );
    for (let n = 0; n < 60; n++) {
      try {
        if ((await fetch(origin)).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const created = await admin.auth.admin.createUser({
    email: legacyEmail,
    password,
    email_confirm: true,
    user_metadata: { purpose: 'temporary-registration-acceptance' },
  });
  assert(!created.error && created.data.user, 'LEGACY_TEST_USER_FAILED');
  legacyId = created.data.user.id;
  browser = await chromium.launch({
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    ...(process.env.HTTPS_PROXY
      ? { proxy: { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } }
      : {}),
  });
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(90000);
  page.on('response', async (response) => {
    if (response.url().endsWith('/api/auth/register') && response.status() >= 400) {
      const data = await response.json().catch(() => ({}));
      console.log(
        JSON.stringify({
          registrationHttpStatus: response.status(),
          registrationErrorCode: data.error?.code,
        }),
      );
    }
  });
  phase = 'legacy-email-login';
  await page.goto(`${origin}/login`);
  await page.getByLabel('账号', { exact: true }).fill(legacyEmail);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录并继续', exact: true }).click();
  await page.waitForURL('**/dashboard');
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByRole('link', { name: '登录 / 开始制作', exact: true }).waitFor();
  await page.goto(`${origin}/login`);
  phase = 'two-field-registration';
  await page.getByRole('button', { name: '还没有账户？注册', exact: true }).click();
  assert.equal(await page.locator('form input').count(), 2, 'ONLY_ACCOUNT_AND_PASSWORD_REQUIRED');
  assert.equal(
    await page.locator('form input[type="email"],form input[type="checkbox"]').count(),
    0,
  );
  await page.screenshot({ path: `${dir}/registration.png`, fullPage: true });
  await page.getByLabel('账号', { exact: true }).fill(username);
  await page.getByLabel('密码', { exact: true }).fill(password);
  const registrationResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/register') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '创建账户', exact: true }).click();
  const registration = await registrationResponse;
  const registrationResult = await registration.json();
  assert.equal(
    registration.status(),
    201,
    `REGISTRATION_${registrationResult.error?.code || registration.status()}`,
  );
  await page.waitForURL('**/dashboard');
  const login = await client.auth.signInWithPassword({ email: alias, password });
  assert(!login.error && login.data.user && login.data.session, 'NEW_ACCOUNT_LOGIN_FAILED');
  registeredId = login.data.user.id;
  await page.getByText(normalizeAccount(username), { exact: true }).waitFor();
  assert(
    !(await page.locator('body').innerText()).includes('accounts.oneboss.invalid'),
    'INTERNAL_IDENTITY_MUST_NOT_APPEAR_IN_CUSTOMER_UI',
  );
  assert.equal(login.data.user.app_metadata.account_kind, 'username');
  const token = login.data.session.access_token;
  phase = 'ordinary-customer-only';
  const account = await api('core/account', token);
  assert.equal(account.isAdmin, false);
  assert.equal(account.orders.length, 0);
  assert.equal(account.projects.length, 0);
  await api('core/admin', token, undefined, 403);
  await api('auth/register', undefined, { username, password, role: 'admin' }, 400);
  assert.equal(
    (await api('auth/register', undefined, { username: username.toUpperCase(), password }, 409))
      .error.code,
    'ACCOUNT_EXISTS',
  );
  phase = 'refresh-signout-and-password-login';
  await page.reload();
  await page.getByRole('heading', { name: '让下一个作品，开始发生。', exact: true }).waitFor();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByRole('link', { name: '登录 / 开始制作', exact: true }).waitFor();
  await page.goto(`${origin}/login`);
  await page.getByLabel('账号', { exact: true }).fill(username.toUpperCase());
  await page.getByLabel('密码', { exact: true }).fill(randomBytes(24).toString('hex'));
  await page.getByRole('button', { name: '登录并继续', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '登录失败' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/login');
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录并继续', exact: true }).click();
  await page.waitForURL('**/dashboard');
  assert(
    !(await page.locator('body').evaluate((element) => element.scrollWidth > innerWidth + 1)),
    'MOBILE_OVERFLOW',
  );
  await page.screenshot({ path: `${dir}/customer-dashboard.png`, fullPage: true });
  passed = true;
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({ path: `${dir}/failure.png`, fullPage: true }).catch(() => {});
    console.log(
      JSON.stringify({
        visibleErrors: await page
          .getByRole('alert')
          .allTextContents()
          .catch(() => []),
      }),
    );
  }
  console.error(
    JSON.stringify({
      phase,
      errorClass:
        error instanceof assert.AssertionError
          ? error.message.slice(0, 160)
          : error instanceof Error
            ? error.name
            : 'UNKNOWN',
    }),
  );
} finally {
  await browser?.close();
  server?.kill();
  await db?.end({ timeout: 5 });
  if (!registeredId) {
    const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    assert(!users.error, 'TEMP_USER_LOOKUP_FAILED');
    registeredId = users.data.users.find(
      (user) => user.email === alias && new Date(user.created_at).getTime() >= started - 5000,
    )?.id;
  }
  for (const id of [legacyId, registeredId].filter(Boolean) as string[]) {
    const check = await admin.auth.admin.getUserById(id);
    assert(!check.error && check.data.user);
    assert(
      check.data.user.email === legacyEmail ||
        (check.data.user.email === alias &&
          check.data.user.user_metadata.username === normalizeAccount(username)),
    );
    assert(!(await admin.auth.admin.deleteUser(id)).error, 'TEMP_AUTH_DELETE_FAILED');
    removed++;
  }
  const result = {
    passed: passed && removed === 2,
    hosted,
    temporaryAuthUsersRemoved: removed,
    smtpRequired: false,
    realPayment: false,
    organizationOrOrderCreated: false,
    fullProjectResumed: false,
  };
  await writeFile(`${dir}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
}
