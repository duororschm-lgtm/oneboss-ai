import { outboundFetch } from './http';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError, assert } from '../core/errors';
export function appOrigin() {
  const value = process.env.APP_URL;
  assert(value, 'APP_URL_NOT_CONFIGURED', 503);
  let url:URL;
  try { url = new URL(value); } catch {throw new AppError('HTTPS_ORIGIN_REQUIRED');}
  assert(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash,
    'HTTPS_ORIGIN_REQUIRED',
  );
  assert(
    !isIP(url.hostname) && url.hostname !== 'localhost' && !url.hostname.endsWith('.local'),
    'PUBLIC_HOST_REQUIRED',
  );
  return url.origin;
}
export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  // Permit only global unicast IPv6; reject mapped IPv4, loopback, ULA and link-local.
  return (
    isIP(address) === 6 &&
    /^[23][0-9a-f]{0,3}:/i.test(address) &&
    !address.toLowerCase().startsWith('2001:db8:')
  );
}
export async function verifyPublicUrl(
  value: string,
  expectedPath: string,
  options: { publicationToken?: string } = {},
) {
  const url = new URL(value);
  assert(
    url.origin === appOrigin() && url.pathname === expectedPath && !url.search && !url.hash,
    'UNTRUSTED_PUBLIC_URL',
  );
  let addresses;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new AppError('PUBLIC_DNS_FAILED', 502);
  }
  assert(
    addresses.length && addresses.every((x) => publicAddress(x.address)),
    'PRIVATE_ADDRESS_BLOCKED',
  );
  let response: Response;
  try {
    response = await outboundFetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
      ...(options.publicationToken
        ? { headers: { 'X-OneBoss-Publication': options.publicationToken } }
        : {}),
    });
  } catch {
    throw new AppError('PUBLIC_SITE_UNREACHABLE', 502);
  }
  if (!response.ok) throw new AppError('PUBLIC_SITE_UNREACHABLE', 502);
  const text = await response.text();
  assert(text.includes('data-oneboss-revision='), 'PUBLIC_SITE_INVALID', 502);
  return text;
}
