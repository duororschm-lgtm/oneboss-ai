import { outboundFetch } from './http';
import { createClient } from '@supabase/supabase-js';
import { AppError } from '../core/errors';
export async function authenticate(request: Request) {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) throw new AppError('UNAUTHENTICATED', 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new AppError('AUTH_NOT_CONFIGURED', 503);
  const { data, error } = await createClient(url, key, {
    global: { fetch: outboundFetch },
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.getUser(header.slice(7));
  // A transport outage is not an invalid credential. Keep retryable service
  // failures distinct so clients do not discard a valid session or misdiagnose RBAC.
  if (error && (error.name === 'AuthRetryableFetchError' || error.status === 0 || (error.status ?? 0) >= 500))
    throw new AppError('AUTH_SERVICE_UNAVAILABLE', 503);
  if (error || !data.user) throw new AppError('UNAUTHENTICATED', 401);
  return { userId: data.user.id };
}
