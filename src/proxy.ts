import { NextResponse } from 'next/server';
/** Runtime public Auth origin supports Docker builds without inlining deployment keys. */
export function proxy() {
  const response = NextResponse.next(),
    env = process.env;
  let authOrigin = '';
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL || '');
    if (url.protocol === 'https:') authOrigin = url.origin;
  } catch {}
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; connect-src 'self' ${authOrigin}; frame-ancestors 'none'; object-src 'none'; base-uri 'self'`,
  );
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
