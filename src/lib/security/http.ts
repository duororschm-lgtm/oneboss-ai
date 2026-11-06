import { EnvHttpProxyAgent, fetch as undiciFetch } from 'undici';
let agent: EnvHttpProxyAgent | undefined;
// This dispatcher preserves inherited proxy routing and configured Node CA trust.
export const outboundFetch: typeof fetch = (input, init) =>
  undiciFetch(
    input as string,
    { ...init, dispatcher: (agent ??= new EnvHttpProxyAgent()) } as Parameters<
      typeof undiciFetch
    >[1],
  ) as unknown as Promise<Response>;
