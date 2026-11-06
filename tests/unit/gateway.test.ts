import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { fetch as transport } from 'undici';
import { callMimo } from '../../src/lib/mimo/gateway';
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
