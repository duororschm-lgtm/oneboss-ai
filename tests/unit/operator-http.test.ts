import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { operatorJSON } from '../../scripts/lib/operator-http';
import {
  createCheckpoint,
  readCheckpoint,
  saveCheckpoint,
  operationKey,
  assertAcceptanceOwner,
} from '../../scripts/lib/acceptance-checkpoint';

describe('operator transport and interrupted acceptance', () => {
  it('replays one identical POST after gateway HTML and lost network response', async () => {
    const seen: RequestInit[] = [],
      delays: number[] = [];
    const result = await operatorJSON(
      'https://example.com/api',
      { method: 'POST', body: '{"a":1}' },
      200,
      {
        fetch: (async (_url, init) => {
          seen.push(init!);
          if (seen.length === 1) return new Response('<html>gateway</html>', { status: 502 });
          if (seen.length === 2) throw new TypeError('connection reset');
          return Response.json({ id: 'existing-run' });
        }) as typeof fetch,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );
    expect(result.id).toBe('existing-run');
    expect(new Set(seen.map((i) => new Headers(i.headers).get('Idempotency-Key'))).size).toBe(1);
    expect(seen.every((i) => i.body === '{"a":1}')).toBe(true);
    expect(delays).toEqual([1000, 2000]);
  });
  it('does not retry structured business rejections, including 503', async () => {
    for (const status of [403, 409, 503]) {
      let calls = 0;
      await expect(
        operatorJSON('https://example.com', {}, 200, {
          fetch: (async () => {
            calls++;
            return Response.json({ error: { code: 'BUSINESS_REJECTED' } }, { status });
          }) as typeof fetch,
        }),
      ).rejects.toThrow(`HTTP_${status}_BUSINESS_REJECTED`);
      expect(calls).toBe(1);
    }
  });
  it('bounds invalid/truncated JSON and honors external cancellation', async () => {
    let calls = 0;
    await expect(
      operatorJSON('https://example.com', {}, 200, {
        fetch: (async () => {
          calls++;
          return new Response('{"secret":');
        }) as typeof fetch,
        sleep: async () => {},
      }),
    ).rejects.toThrow('NON_JSON_EXHAUSTED');
    expect(calls).toBe(3);
    const abort = new AbortController();
    abort.abort();
    await expect(operatorJSON('https://example.com', { signal: abort.signal })).rejects.toThrow();
  });
  it('bounds actual timed-out requests', async () => {
    let calls = 0;
    const request = (async (_url, init) =>
      new Promise((_resolve, reject) => {
        calls++;
        init!.signal!.addEventListener('abort', () => reject(Error('timeout')), { once: true });
      })) as typeof fetch;
    await expect(
      operatorJSON('https://example.com', {}, 200, {
        fetch: request,
        timeoutMs: 10,
        sleep: async () => {},
      }),
    ).rejects.toThrow('TIMEOUT_EXHAUSTED');
    expect(calls).toBe(3);
  });
  it('classifies a stalled body after headers as timeout rather than invalid JSON', async () => {
    let calls = 0;
    await expect(
      operatorJSON('https://example.com', {}, 200, {
        timeoutMs: 10,
        sleep: async () => {},
        fetch: (async (_url, init) => {
          calls++;
          return new Response(
            new ReadableStream({
              start(controller) {
                init!.signal!.addEventListener(
                  'abort',
                  () => controller.error(Error('private body timeout')),
                  { once: true },
                );
              },
            }),
          );
        }) as typeof fetch,
      }),
    ).rejects.toThrow('TIMEOUT_EXHAUSTED');
    expect(calls).toBe(3);
  });
  it('persists operation identity across process restart and rejects unrelated cleanup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'oneboss-checkpoint-'));
    try {
      const path = join(dir, 'state.json');
      const state = await createCheckpoint(
        path,
        'oneboss-hosted-write-test@example.com',
        'private',
      );
      state.userId = 'owner';
      const key = operationKey(state, 'generate', { revision: 1 });
      await saveCheckpoint(path, state);
      const recovered = await readCheckpoint(path);
      expect(operationKey(recovered, 'generate', { revision: 1 })).toBe(key);
      await expect(createCheckpoint(path, state.email, 'different')).rejects.toThrow();
      const user = {
        id: 'owner',
        email: state.email,
        user_metadata: { purpose: state.purpose, acceptanceNonce: state.nonce },
      };
      expect(() => assertAcceptanceOwner(recovered, user, 'other-owner')).toThrow();
      expect(() =>
        assertAcceptanceOwner(recovered, { ...user, user_metadata: {} }, 'owner'),
      ).toThrow();
      expect(() => assertAcceptanceOwner(recovered, user, 'owner')).not.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
