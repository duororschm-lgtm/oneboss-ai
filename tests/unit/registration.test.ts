import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { accountEmail, loginEmail, normalizeAccount } from '../../src/lib/customer/account';
import { registerAccount } from '../../src/lib/security/registration';

const mocks = vi.hoisted(() => ({ createUser: vi.fn(), query: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { createUser: mocks.createUser } } }),
}));
vi.mock('../../src/lib/core/db', () => ({ database: () => mocks.query }));
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only-secret');
  mocks.createUser
    .mockReset()
    .mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null });
  mocks.query.mockReset().mockResolvedValue([{ count: 1 }]);
});
afterEach(() => vi.unstubAllEnvs());
const request = () =>
  new Request('https://oneboss.example/api/auth/register', {
    method: 'POST',
    headers: { origin: 'https://oneboss.example' },
  });
const input = () => ({ username: '客户_001', password: 'test-only-unique-password' });

it('uses the same canonical username identity on client and server without claiming a real mailbox', async () => {
  expect(normalizeAccount('  ＴＥＳＴ_客户  ')).toBe('test_客户');
  const expected =
    createHash('sha256').update('oneboss:username:v1:test_客户').digest('hex') +
    '@accounts.oneboss.invalid';
  expect(await accountEmail('ＴＥＳＴ_客户')).toBe(expected);
  expect(await loginEmail('test_客户')).toBe(expected);
  expect(await loginEmail(' owner@example.com ')).toBe('owner@example.com');
});
it.each(['ab', 'owner@example.com', 'a/b', 'test-name', 'a'.repeat(33), 'a\u200bb'])(
  'rejects an ambiguous or invalid registration name %s',
  (value) => {
    expect(() => normalizeAccount(value)).toThrow('ACCOUNT_INVALID');
  },
);
it('creates only a normal username account and returns no key, password or session', async () => {
  expect(await registerAccount(request(), input())).toEqual({ registered: true });
  expect(mocks.createUser).toHaveBeenCalledWith({
    email: await accountEmail(input().username),
    password: input().password,
    email_confirm: true,
    app_metadata: { account_kind: 'username' },
    user_metadata: { username: input().username },
  });
  expect(mocks.query).toHaveBeenCalledTimes(4);
});
it('rejects client privilege fields and weak passwords before account creation', async () => {
  await expect(registerAccount(request(), { ...input(), role: 'admin' })).rejects.toThrow();
  await expect(registerAccount(request(), { ...input(), password: '123' })).rejects.toThrow();
  expect(mocks.createUser).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
});
it('accepts the browser Host when Next normalizes its internal origin to localhost', async () => {
  const local = new Request('http://localhost:3101/api/auth/register', {
    method: 'POST',
    headers: { host: '127.0.0.1:3101', origin: 'http://127.0.0.1:3101' },
  });
  await expect(registerAccount(local, input())).resolves.toEqual({ registered: true });
  const foreign = new Request('http://localhost:3101/api/auth/register', {
    method: 'POST',
    headers: { host: '127.0.0.1:3101', origin: 'https://outside.example' },
  });
  await expect(registerAccount(foreign, input())).rejects.toThrow('CROSS_ORIGIN_REQUEST');
});
it('rejects cross-origin registration and enforces persistent budgets before contacting Auth', async () => {
  await expect(
    registerAccount(
      new Request('https://oneboss.example/api/auth/register', {
        headers: { origin: 'https://outside.example' },
      }),
      input(),
    ),
  ).rejects.toThrow('CROSS_ORIGIN_REQUEST');
  mocks.query.mockResolvedValue([{ count: 21 }]);
  await expect(registerAccount(request(), input())).rejects.toThrow('REGISTRATION_RATE_LIMITED');
  expect(mocks.createUser).not.toHaveBeenCalled();
});
it.each([
  ['email_exists', 422, 'ACCOUNT_EXISTS'],
  ['weak_password', 422, 'PASSWORD_WEAK'],
  ['over_request_rate_limit', 429, 'REGISTRATION_RATE_LIMITED'],
  ['unexpected_failure', 500, 'REGISTRATION_UNAVAILABLE'],
])('maps Auth error %s without returning provider detail', async (code, status, expected) => {
  mocks.createUser.mockResolvedValue({
    data: { user: null },
    error: { code, status, message: 'private provider detail' },
  });
  await expect(registerAccount(request(), input())).rejects.toThrow(expected as string);
});
