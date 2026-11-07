import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fetch as transport } from 'undici';
import { callMimo } from '../../src/lib/mimo/gateway';
it('classifies model timeout, transport failure and invalid envelopes without exposing provider data', async () => {
  for (const [error, expected] of [
    [new DOMException('private timeout details', 'TimeoutError'), 'MIMO_TIMEOUT'],
    [new TypeError('private network details'), 'MIMO_NETWORK_ERROR'],
  ] as const) {
    vi.mocked(transport).mockRejectedValueOnce(error);
    await expect(callMimo(z.object({}), 'production team', {})).rejects.toThrow(expected);
  }
  vi.mocked(transport).mockResolvedValueOnce(new Response('<html>private gateway</html>') as any);
  await expect(callMimo(z.object({}), 'production team', {})).rejects.toThrow(
    'MIMO_ENVELOPE_INVALID',
  );
});
vi.mock('undici', async (importOriginal) => ({
  ...(await importOriginal<typeof import('undici')>()),
  fetch: vi.fn(),
}));
const mock = vi.mocked(transport);
const schema = z.object({ ok: z.literal(true) }).strict();
beforeEach(() => {
  vi.stubEnv('MIMO_API_KEY', 'unit-test-placeholder');
  vi.stubEnv('MIMO_MODEL', 'unit-test-model');
  vi.stubEnv('MIMO_BASE_URL', 'https://api.xiaomimimo.com/v1');
});
afterEach(() => {
  vi.unstubAllEnvs();
  mock.mockReset();
});
it('uses official api-key header and validates JSON before returning', async () => {
  mock.mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { total_tokens: 10 },
      }),
    ) as never,
  );
  const result = await callMimo(schema, 'test', { text: 'untrusted input' });
  expect(result.output).toEqual({ ok: true });
  expect(result.usage).toEqual({ total_tokens: 10 });
  const [url, options] = mock.mock.calls[0];
  expect(url).toBe('https://api.xiaomimimo.com/v1/chat/completions');
  expect((options!.headers as Record<string, string>)['api-key']).toBe('unit-test-placeholder');
  const body = JSON.parse(options!.body as string);
  expect(body.response_format.type).toBe('json_object');
  expect(body.messages[0].content).toContain('untrusted data');
  expect(body.messages[0].content).toContain('AUTHORITATIVE OUTPUT CONTRACT');
  expect(body.messages[0].content).toContain('omit every legacy field absent from it');
});
it.each(['not json', '{"ok":false}', '{"ok":true,"extra":"unsafe"}'])(
  'rejects malformed or out-of-schema content: %s',
  async (content) => {
    mock.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content } }] })) as never,
    );
    await expect(callMimo(schema, 'test', {})).rejects.toThrow(
      /MIMO_INVALID_JSON|MIMO_SCHEMA_INVALID/,
    );
  },
);
it('redacts remote error bodies', async () => {
  mock.mockResolvedValue(new Response('sensitive remote error', { status: 401 }) as never);
  await expect(callMimo(schema, 'test', {})).rejects.toThrow('MIMO_HTTP_401');
});
it('schema diagnostics contain issue codes without model values or extra field contents', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    mock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":false,"legacy":"private-customer-input"}' } }],
        }),
      ) as never,
    );
    await expect(callMimo(schema, 'test', {})).rejects.toThrow('MIMO_SCHEMA_INVALID');
    const diagnostic = JSON.parse(log.mock.calls[0][0]);
    expect(diagnostic).toEqual({
      errorClass: 'MIMO_SCHEMA_INVALID',
      issueCodes: ['invalid_value', 'unrecognized_keys'],
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-customer-input');
  } finally {
    log.mockRestore();
  }
});
it('rejects user-controlled endpoints without a request', async () => {
  vi.stubEnv('MIMO_BASE_URL', 'https://attacker.example/v1');
  await expect(callMimo(schema, 'test', {})).rejects.toThrow('MIMO_ENDPOINT_NOT_ALLOWED');
  expect(mock).not.toHaveBeenCalled();
});
it('requests native function calling without conflicting JSON output mode', async () => {
  const native = {
    id: 'call-test',
    type: 'function',
    function: { name: 'read_project_facts', arguments: '{}' },
  };
  mock.mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { tool_calls: [native] } }] })) as never,
  );
  const result = await callMimo(
    z.object({ toolCalls: z.array(z.unknown()).min(1) }),
    'test',
    {},
    { tools: true },
  );
  expect(result.output.toolCalls).toEqual([native]);
  const body = JSON.parse(mock.mock.calls[0][1]!.body as string);
  expect(body).not.toHaveProperty('response_format');
  expect(body.messages[0].content).not.toContain('Use ONLY the exact JSON schema');
  expect(body.tool_choice.function.name).toBe('read_project_facts');
});
it('rejects JSON text pretending to be a native tool call', async () => {
  mock.mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ message: { content: '{"toolCalls":[]}' } }] }),
    ) as never,
  );
  await expect(callMimo(z.unknown(), 'test', {}, { tools: true })).rejects.toThrow(
    'MIMO_TOOL_CALLS_MISSING',
  );
});
it('rejects non-whitelisted native tools', async () => {
  const tool = {
    id: 'bad-call',
    type: 'function',
    function: { name: 'execute_sql', arguments: '{}' },
  };
  mock.mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { tool_calls: [tool] } }] })) as never,
  );
  await expect(callMimo(z.unknown(), 'test', {}, { tools: true })).rejects.toThrow(
    'MIMO_TOOL_NOT_ALLOWED',
  );
});
it.each(['not json', '{"projectId":"foreign-project"}'])(
  'rejects invalid read-only tool arguments: %s',
  async (args) => {
    const tool = {
      id: 'bad-args',
      type: 'function',
      function: { name: 'read_project_facts', arguments: args },
    };
    mock.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { tool_calls: [tool] } }] })) as never,
    );
    await expect(callMimo(z.unknown(), 'test', {}, { tools: true })).rejects.toThrow(
      'MIMO_TOOL_ARGUMENTS_INVALID',
    );
  },
);
