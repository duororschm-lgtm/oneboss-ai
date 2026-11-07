import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { database } from '../core/db';
import { AppError, assert } from '../core/errors';
import { accountEmail, normalizeAccount } from '../customer/account';
import { outboundFetch } from './http';

const Registration = z
  .object({
    username: z.string().min(1).max(128),
    password: z.string().min(10).max(128),
  })
  .strict();

export async function registerAccount(request: Request, body: unknown) {
  const input = Registration.parse(body);
  let username: string;
  try {
    username = normalizeAccount(input.username);
  } catch {
    throw new AppError('ACCOUNT_INVALID', 400);
  }
  const origin = request.headers.get('origin');
  if (origin) {
    const incoming = new URL(request.url);
    const allowed = new Set([incoming.origin]);
    // Next's internal request URL can use localhost behind the actual Host header.
    const host = request.headers.get('host');
    if (host) {
      try {
        allowed.add(new URL(`${incoming.protocol}//${host}`).origin);
      } catch {
        /* Reject below. */
      }
    }
    if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
    assert(allowed.has(origin), 'CROSS_ORIGIN_REQUEST', 403);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(url && key, 'AUTH_NOT_CONFIGURED', 503);
  await registrationLimit(request, username, key);
  const auth = createClient(url, key, {
    global: { fetch: outboundFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = await auth.auth.admin.createUser({
    email: await accountEmail(username),
    password: input.password,
    email_confirm: true,
    app_metadata: { account_kind: 'username' },
    user_metadata: { username },
  });
  if (created.error) {
    if (created.error.code === 'weak_password') throw new AppError('PASSWORD_WEAK', 400);
    if (['email_exists', 'user_already_exists'].includes(created.error.code || ''))
      throw new AppError('ACCOUNT_EXISTS', 409);
    if (created.error.status === 429) throw new AppError('REGISTRATION_RATE_LIMITED', 429);
    throw new AppError('REGISTRATION_UNAVAILABLE', 503);
  }
  assert(created.data.user, 'REGISTRATION_UNAVAILABLE', 503);
  // Never return the service credential, a privileged session, or a platform/organization role.
  return { registered: true };
}

/** Network headers are abuse hints, not identities. A global budget still applies if they are spoofed. */
export async function registrationLimit(request: Request, username: string, secret: string) {
  const header = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const network = header && isIP(header) ? header : 'unknown';
  const budgets = [
    { key: 'global', period: 60_000, max: 20 },
    { key: 'global-hour', period: 3_600_000, max: 100 },
    { key: `network:${network}`, period: 3_600_000, max: 10 },
    { key: `account:${username}`, period: 3_600_000, max: 5 },
  ];
  // Use the existing private rate-limit table; no password or raw network address is stored.
  for (const budget of budgets) {
    const hex = createHmac('sha256', secret).update(`signup:v1:${budget.key}`).digest('hex');
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    const bucket = Math.floor(Date.now() / budget.period);
    const [row] =
      await database()`insert into rate_limits(user_id,bucket,count) values(${id},${bucket},1)
      on conflict(user_id,bucket) do update set count=rate_limits.count+1 returning count`;
    assert(row.count <= budget.max, 'REGISTRATION_RATE_LIMITED', 429);
  }
}
