import sharp from 'sharp';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { callMimo, NativeToolCall } from '../src/lib/mimo/gateway';
const colors = ['red', 'green', 'blue'] as const;
const expectedColor = colors[randomInt(colors.length)];
const image = await sharp({
  create: { width: 128, height: 128, channels: 3, background: expectedColor },
})
  .png()
  .toBuffer();
const outcomes: Record<string, unknown> = {};
let failed = false;
for (const check of ['json', 'tools', 'vision'] as const) {
  try {
    const schema: z.ZodType<unknown> =
      check === 'tools'
        ? z.object({ toolCalls: z.array(NativeToolCall).min(1) })
        : check === 'vision'
          ? z.object({ dominantColor: z.enum(colors) })
          : z.object({ ok: z.literal(true) });
    const result = await callMimo(
      schema,
      'compatibility tester',
      {
        task:
          check === 'tools'
            ? 'Call read_project_facts once.'
            : check === 'vision'
              ? 'Identify the dominant color of the attached image. Return dominantColor as red, green or blue.'
              : 'Return {"ok":true}. This is a connectivity check.',
      },
      check === 'tools'
        ? { tools: true }
        : check === 'vision'
          ? {
              imageUrl: `data:image/png;base64,${image.toString('base64')}`,
            }
          : {},
    );
    if (
      check === 'vision' &&
      (result.output as { dominantColor: string }).dominantColor !== expectedColor
    )
      throw Object.assign(new Error('Vision mismatch'), { code: 'MIMO_VISION_MISMATCH' });
    outcomes[check] = { passed: true, usage: result.usage, requestId: result.requestId };
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
