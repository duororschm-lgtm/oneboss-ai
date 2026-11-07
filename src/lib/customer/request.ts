export class CustomerTransportError extends Error {
  code = 'SERVICE_TEMPORARILY_UNAVAILABLE';
  constructor() {
    super('服务暂时繁忙，请稍后刷新状态再重试。');
  }
}
/** Replays the SAME request/idempotency key only for transport failures, never business errors. */
export async function requestCustomerJSON(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetcher(url, { ...init, signal: init.signal || controller.signal });
      const type = response.headers.get('content-type') || '';
      if (type.includes('application/json')) return { response, value: await response.json() };
    } catch {
      if (init.signal?.aborted) throw new CustomerTransportError();
    } finally {
      clearTimeout(timer);
    }
    if (attempt < 2) await pause((attempt + 1) * 1000);
  }
  throw new CustomerTransportError();
}
