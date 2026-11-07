import { describe, it, expect } from 'vitest';
import {
  DesignSystem,
  InteractionSpec,
  MotionSpec,
  InteractionKind,
  MotionKind,
} from '../../src/contracts';

describe('V4 Interaction & Motion schemas', () => {
  it('validates InteractionSpec with all kinds', () => {
    for (const kind of ['gallery-carousel', 'image-zoom', 'tabs', 'accordion', 'product-hotspots', 'product-compare', 'image-before-after', 'copy-contact', 'anchor-navigation']) {
      const spec = { id: 'test-1', kind, options: { autoplay: false } };
      expect(InteractionSpec.safeParse(spec).success).toBe(true);
    }
  });

  it('rejects invalid interaction kind', () => {
    expect(InteractionSpec.safeParse({ id: 'x', kind: 'fake-kind', options: {} }).success).toBe(false);
  });

  it('validates MotionSpec', () => {
    const motion = {
      id: 'hero-entrance',
      kind: 'entrance-reveal',
      intensity: 'medium',
      durationMs: 600,
      delayMs: 200,
    };
    expect(MotionSpec.safeParse(motion).success).toBe(true);
  });

  it('rejects MotionSpec with out-of-range duration', () => {
    expect(
      MotionSpec.safeParse({ id: 'x', kind: 'entrance-reveal', intensity: 'low', durationMs: 50 }).success,
    ).toBe(false);
    expect(
      MotionSpec.safeParse({ id: 'x', kind: 'entrance-reveal', intensity: 'low', durationMs: 5000 }).success,
    ).toBe(false);
  });

  it('validates InteractionKind enum', () => {
    expect(InteractionKind.safeParse('gallery-carousel').success).toBe(true);
    expect(InteractionKind.safeParse('invalid').success).toBe(false);
  });

  it('validates MotionKind enum', () => {
    expect(MotionKind.safeParse('scroll-reveal').success).toBe(true);
    expect(MotionKind.safeParse('invalid').success).toBe(false);
  });

  it('DesignSystem accepts V4 enhancement fields', () => {
    const design = DesignSystem.parse({
      version: 1,
      styleId: 'chromatic-pop',
      rationale: '彩色渐变+超大标题',
      palette: { background: '#fff8ec', accent: '#ff4d2a', text: '#111111', muted: '#666666', surface: '#ffffff', accentText: '#ffffff', border: '#111111' },
      typography: { display: 'Arial Black', body: 'sans-serif', mono: 'monospace', scale: '1.1' },
      spacingScale: [8, 16, 24],
      radiusScale: [12],
      layoutMode: 'asymmetric',
      motionPreset: 'energetic',
      approvedByClient: false,
      factVersion: 1,
      // V4 fields
      secondaryAccent: '#ffc830',
      gradientStops: ['#ff4d2a', '#ff8840', '#ffc830'],
      gridStyle: 'asymmetric',
      visualMotif: 'bold-blocks',
      motionLanguage: 'energetic',
    });
    expect(design.secondaryAccent).toBe('#ffc830');
    expect(design.gradientStops).toHaveLength(3);
    expect(design.gridStyle).toBe('asymmetric');
    expect(design.visualMotif).toBe('bold-blocks');
    expect(design.motionLanguage).toBe('energetic');
  });

  it('rejects invalid gradient colors', () => {
    const base = {
      version: 1, styleId: 'x', rationale: 'x',
      palette: { background: '#ffffff' },
      typography: { body: 'sans' },
      spacingScale: [8], radiusScale: [4],
      layoutMode: 'editorial', motionPreset: 'subtle',
      approvedByClient: false, factVersion: 1,
    };
    expect(
      DesignSystem.safeParse({ ...base, gradientStops: ['#fff', 'not-a-color'] }).success,
    ).toBe(false);
  });

  it('rejects invalid visualMotif', () => {
    const base = {
      version: 1, styleId: 'x', rationale: 'x',
      palette: { background: '#ffffff' },
      typography: { body: 'sans' },
      spacingScale: [8], radiusScale: [4],
      layoutMode: 'editorial', motionPreset: 'subtle',
      approvedByClient: false, factVersion: 1,
    };
    expect(
      DesignSystem.safeParse({ ...base, visualMotif: 'unknown-motif' }).success,
    ).toBe(false);
  });

  it('rejects invalid gridStyle', () => {
    const base = {
      version: 1, styleId: 'x', rationale: 'x',
      palette: { background: '#ffffff' },
      typography: { body: 'sans' },
      spacingScale: [8], radiusScale: [4],
      layoutMode: 'editorial', motionPreset: 'subtle',
      approvedByClient: false, factVersion: 1,
    };
    expect(
      DesignSystem.safeParse({ ...base, gridStyle: 'invalid' }).success,
    ).toBe(false);
  });

  it('DesignSystem backward compatible without V4 fields', () => {
    const legacy = DesignSystem.parse({
      version: 1, styleId: 'editorial-minimal', rationale: 'x',
      palette: { background: '#ffffff' },
      typography: { body: 'sans' },
      spacingScale: [8], radiusScale: [4],
      layoutMode: 'editorial', motionPreset: 'subtle',
      approvedByClient: false, factVersion: 1,
    });
    expect(legacy.secondaryAccent).toBeUndefined();
    expect(legacy.gradientStops).toBeUndefined();
    expect(legacy.visualMotif).toBeUndefined();
  });

  it('Blueprint sections accept interactionIds and motionId', () => {
    const design = DesignSystem.parse({
      version: 1, styleId: 'x', rationale: 'x',
      palette: { background: '#ffffff' },
      typography: { body: 'sans' },
      spacingScale: [8], radiusScale: [4],
      layoutMode: 'editorial', motionPreset: 'subtle',
      approvedByClient: false, factVersion: 1,
      siteBlueprint: {
        pages: [
          {
            slug: '',
            title: 'Home',
            sections: [
              {
                type: 'hero',
                layout: { variant: 'full-bleed' },
                interactionIds: ['gallery-1', 'anchor-nav'],
                motionId: 'hero-entrance',
                factKeys: ['name'],
              },
            ],
          },
        ],
      },
    });
    const section = design.siteBlueprint!.pages[0].sections[0];
    expect(section.interactionIds).toEqual(['gallery-1', 'anchor-nav']);
    expect(section.motionId).toBe('hero-entrance');
  });
});
