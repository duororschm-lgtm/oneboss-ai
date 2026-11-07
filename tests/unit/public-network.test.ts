import { afterEach, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import * as http from '../../src/lib/security/http';
import { verifyPublicUrl } from '../../src/lib/security/network';
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it('keeps public-origin/path and private DNS protections for candidate verification', async () => {
  vi.stubEnv('APP_URL', 'https://oneboss.example');
  vi.mocked(lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as any);
  const fetch = vi.spyOn(http, 'outboundFetch');
  await expect(
    verifyPublicUrl('https://oneboss.example/p/test', '/p/test', { publicationToken: 'test' }),
  ).rejects.toThrow('PRIVATE_ADDRESS_BLOCKED');
  expect(fetch).not.toHaveBeenCalled();
  await expect(verifyPublicUrl('https://other.example/p/test', '/p/test')).rejects.toThrow(
    'UNTRUSTED_PUBLIC_URL',
  );
});
it('sends the candidate header only after origin/DNS checks with no redirects or TLS bypass', async () => {
  vi.stubEnv('APP_URL', 'https://oneboss.example');
  vi.mocked(lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as any);
  const fetch = vi
    .spyOn(http, 'outboundFetch')
    .mockResolvedValue(new Response('data-oneboss-revision="2"'));
  await verifyPublicUrl('https://oneboss.example/p/test', '/p/test', { publicationToken: 'test' });
  expect(fetch.mock.calls[0][1]).toMatchObject({
    redirect: 'error',
    cache: 'no-store',
    headers: { 'X-OneBoss-Publication': 'test' },
  });
});
it('reports DNS and HTTPS/navigation failures safely', async () => {
  vi.stubEnv('APP_URL', 'https://oneboss.example');
  vi.mocked(lookup).mockRejectedValue(new Error('secret diagnostic'));
  await expect(verifyPublicUrl('https://oneboss.example/p/test', '/p/test')).rejects.toThrow(
    'PUBLIC_DNS_FAILED',
  );
  vi.mocked(lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as any);
  vi.spyOn(http, 'outboundFetch').mockRejectedValue(new Error('certificate or redirect'));
  await expect(verifyPublicUrl('https://oneboss.example/p/test', '/p/test')).rejects.toThrow(
    'PUBLIC_SITE_UNREACHABLE',
  );
});
