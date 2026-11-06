import { z } from 'zod';
import { callMimo } from '../src/lib/mimo/gateway';
const outcomes: Record<string, unknown> = {};
let failed = false;
for (const check of ['json', 'tools', 'vision'] as const) {
  try {
    const schema: z.ZodType<unknown> =
      check === 'tools'
        ? z.object({ toolCalls: z.array(z.unknown()).min(1) })
        : z.object({ ok: z.literal(true) });
    const result = await callMimo(
      schema,
      'compatibility tester',
      {
        task:
          check === 'tools'
            ? 'Call read_project_facts once.'
            : 'Return {"ok":true}. This is a connectivity check.',
      },
      check === 'tools'
        ? { tools: true }
        : check === 'vision'
          ? {
              imageUrl:
                'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
            }
          : {},
    );
    outcomes[check] = { passed: true, usage: result.usage };
  } catch (error) {
    failed = true;
    outcomes[check] = {
      passed: false,
      errorClass: (error as { code?: string }).code ?? 'COMPATIBILITY_FAILED',
    };
  }
}
console.log(JSON.stringify({ at: new Date().toISOString(), outcomes }, null, 2));
if (failed) process.exitCode = 1;
