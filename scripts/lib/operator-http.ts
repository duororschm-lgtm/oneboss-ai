import { randomUUID } from 'node:crypto';
import { outboundFetch } from '../../src/lib/security/http';

/** Never log response bodies: a gateway may return credentials or customer content. */
export async function operatorJSON(
  url: string,
  init: RequestInit = {},
  expected = 200,
  options: {
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    timeoutMs?: number;
    trace?: (event: Record<string, unknown>) => void;
  } = {},
): Promise<any> {
  const headers = new Headers(init.headers);
  if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', randomUUID());
  const request = options.fetch || outboundFetch;
  const sleep = options.sleep || ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  let failure = 'NETWORK';
  for (let attempt = 1; attempt <= 3; attempt++) {
    init.signal?.throwIfAborted();
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 90000);
    let response: Response | undefined;
    let result: any;
    try {
      response = await request(url, {
        ...init,
        headers,
        signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
      });
      result = JSON.parse(await response.text());
      if (!result || typeof result !== 'object') throw Error('NON_OBJECT_JSON');
    } catch {
      init.signal?.throwIfAborted();
      failure = response ? 'NON_JSON' : timeout.aborted ? 'TIMEOUT' : 'NETWORK';
      options.trace?.({
        attempt,
        failure,
        status: response?.status,
        requestId: response?.headers.get('x-request-id'),
        ray: response?.headers.get('cf-ray'),
      });
      if (attempt < 3) {
        await sleep(attempt * 1000);
        continue;
      }
      throw new Error(`OPERATOR_HTTP_${failure}_EXHAUSTED`);
    }
    // A valid business response, including 4xx/5xx, is authoritative and never retried here.
    if (response!.status !== expected) {
      const code =
        typeof result.error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(result.error.code)
          ? result.error.code
          : 'UNEXPECTED';
      throw new Error(`HTTP_${response!.status}_${code}`);
    }
    return result;
  }
  throw new Error(`OPERATOR_HTTP_${failure}_EXHAUSTED`);
}
