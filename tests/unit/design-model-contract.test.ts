import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { ModelDesignChoices, DesignChoices, type DesignSystemType } from '../../src/contracts';

const baseDirection = {
  version: 1,
  styleId: 'editorial-minimal',
  rationale: '留白布局',
  palette: { background: '#ffffff', accent: '#111111' },
  typography: { display: 'serif', body: 'sans-serif' },
  spacingScale: [8, 16],
  radiusScale: [4],
  layoutMode: 'editorial',
  motionPreset: 'subtle',
};

const direction = (overrides: Record<string, unknown> = {}) => ({
  ...baseDirection,
  approvedByClient: false,
  factVersion: 1,
  ...overrides,
});

describe('model-facing design contract', () => {
  it('accepts directions that omit the bookkeeping fields', () => {
    const parsed = ModelDesignChoices.safeParse({
      choices: [baseDirection, { ...baseDirection, styleId: 'neo-tech' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('swallows bookkeeping claims instead of failing the task', () => {
    const parsed = ModelDesignChoices.safeParse({
      choices: [
        direction({ approvedByClient: 'yes please', factVersion: 'stale' }),
        direction({ styleId: 'neo-tech', approvedByClient: true, factVersion: 99 }),
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('still rejects stray keys at direction level (missingInputs & co)', () => {
    const parsed = ModelDesignChoices.safeParse({
      choices: [
        direction({ missingInputs: ['x'] }),
        direction({ styleId: 'neo-tech' }),
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it('keeps the nested blueprint strict (background enum etc.)', () => {
    const withBlueprint = (background: string) =>
      direction({
        siteBlueprint: {
          pages: [
            {
              slug: '',
              title: 't',
              sections: [{ type: 'hero', layout: { background } }],
            },
          ],
        },
      });
    expect(
      ModelDesignChoices.safeParse({ choices: [withBlueprint('gradient'), withBlueprint('plain')] })
        .success,
    ).toBe(true);
    expect(
      ModelDesignChoices.safeParse({ choices: [withBlueprint('bogus'), withBlueprint('plain')] })
        .success,
    ).toBe(false);
  });

  it('exposes a representable JSON schema for the model contract', () => {
    expect(() => z.toJSONSchema(ModelDesignChoices)).not.toThrow();
  });

  it('the stamped output satisfies the stored DesignChoices contract', () => {
    const parsed = ModelDesignChoices.parse({
      choices: [baseDirection, { ...baseDirection, styleId: 'neo-tech' }],
    });
    const stamped = parsed.choices.map((choice) => ({
      ...choice,
      approvedByClient: false,
      factVersion: 1,
      directionId: '00000000-0000-4000-8000-000000000000',
    })) as DesignSystemType[];
    expect(DesignChoices.safeParse({ choices: stamped }).success).toBe(true);
  });
});
