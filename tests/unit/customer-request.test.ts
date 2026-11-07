import { it, expect, vi } from 'vitest';
import { requestCustomerJSON } from '../../src/lib/customer/request';
it('retries gateway HTML with the same POST body and idempotency key', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('<!DOCTYPE html>', { status: 503, headers: { 'Content-Type': 'text/html' } }),
    )
    .mockResolvedValueOnce(Response.json({ id: 'real-saved-run' }));
  const init = {
    method: 'POST',
    headers: { 'Idempotency-Key': 'one-stable-operation' },
    body: '{"revision":2}',
  };
  const result = await requestCustomerJSON('/api/core/test', init, fetcher, async () => {});
  expect(result.value.id).toBe('real-saved-run');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.map((c) => ({ body: c[1].body, headers: c[1].headers }))).toEqual([
    { body: init.body, headers: init.headers },
    { body: init.body, headers: init.headers },
  ]);
});
it('does not replay a structured business rejection', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(Response.json({ error: { code: 'PAYMENT_REQUIRED' } }, { status: 403 }));
  const result = await requestCustomerJSON(
    '/api/core/test',
    { method: 'POST' },
    fetcher,
    async () => {},
  );
  expect(result.response.status).toBe(403);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('bounds network retries and returns a human-readable transport error', async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
  await expect(requestCustomerJSON('/api/core/test', {}, fetcher, async () => {})).rejects.toThrow(
    '服务暂时繁忙',
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
});
