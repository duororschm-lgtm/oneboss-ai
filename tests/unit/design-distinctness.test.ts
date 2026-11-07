import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DesignSystem, type DesignSystemType } from '../../src/contracts';
import { checkDesignDistinctness } from '../../src/lib/creative/design-distinctness';

const base = {
  version: 1,
  styleId: 'editorial-minimal',
  rationale: '留白',
  palette: { background: '#ffffff', accent: '#111111' },
  typography: { display: 'serif', body: 'sans-serif' },
  spacingScale: [8],
  radiusScale: [4],
  layoutMode: 'editorial',
  motionPreset: 'subtle' as const,
  approvedByClient: false,
  factVersion: 1,
};

function direction(overrides: Partial<DesignSystemType>, name: string): DesignSystemType {
  return DesignSystem.parse({
    ...base,
    directionId: randomUUID(),
    name,
    ...overrides,
    palette: overrides.palette ?? base.palette,
    typography: overrides.typography ?? base.typography,
    siteBlueprint: overrides.siteBlueprint ?? {
      pages: [
        {
          slug: '',
          title: '首页',
          sections: [
            { type: 'hero', layout: { variant: 'split-editorial' }, factKeys: ['name'] },
            { type: 'specs', layout: { variant: 'technical-table' } },
            { type: 'contact', layout: { variant: 'minimal-cta' } },
          ],
        },
      ],
    },
  });
}

describe('design direction distinctness', () => {
  it('fails when directions differ only in palette (not a real difference)', () => {
    const a = direction({}, 'A');
    const b = direction({ palette: { background: '#000000', accent: '#ffffff' } }, 'B');
    const report = checkDesignDistinctness([a, b]);
    expect(report.pass).toBe(false);
    expect(report.feedback).toContain('结构差异不足');
  });

  it('passes when directions differ in 4+ structural dimensions', () => {
    const a = direction(
      {
        heroComposition: 'split-editorial',
        density: 'airy',
        imageTreatment: 'framed',
        motionPreset: 'subtle',
        typography: { display: 'serif', body: 'sans-serif' },
        siteBlueprint: {
          pages: [
            {
              slug: '',
              title: '首页',
              sections: [
                { type: 'hero', layout: { variant: 'split-editorial' }, factKeys: ['name'] },
                { type: 'gallery', layout: { variant: 'editorial-grid' } },
                { type: 'specs', layout: { variant: 'technical-table' } },
                { type: 'contact', layout: { variant: 'minimal-cta' } },
              ],
            },
          ],
          contentWidth: 'standard',
        },
      },
      'A',
    );
    const b = direction(
      {
        heroComposition: 'full-bleed',
        density: 'dense',
        imageTreatment: 'full-bleed',
        motionPreset: 'energetic',
        typography: { display: 'monospace', body: 'sans-serif' },
        siteBlueprint: {
          pages: [
            {
              slug: '',
              title: '首页',
              sections: [
                { type: 'hero', layout: { variant: 'full-bleed' }, factKeys: ['name'] },
                { type: 'specs', layout: { variant: 'accordion' } },
                { type: 'story', layout: { variant: 'manifesto' } },
                { type: 'contact', layout: { variant: 'editorial-banner' } },
              ],
            },
          ],
          contentWidth: 'full',
        },
      },
      'B',
    );
    const report = checkDesignDistinctness([a, b]);
    expect(report.pass).toBe(true);
    expect(report.distinctDimensions.length).toBeGreaterThanOrEqual(4);
  });

  it('counts hero composition, section order, layout variants, grid, type, density, image treatment and motion', () => {
    const a = direction(
      {
        heroComposition: 'type-led',
        siteBlueprint: {
          pages: [
            {
              slug: '',
              title: '首页',
              sections: [
                { type: 'hero', layout: { variant: 'type-led' } },
                { type: 'features', layout: { variant: 'bento' } },
              ],
            },
          ],
          contentWidth: 'narrow',
        },
      },
      'A',
    );
    const b = direction(
      {
        heroComposition: 'asymmetric',
        siteBlueprint: {
          pages: [
            {
              slug: '',
              title: '首页',
              sections: [
                { type: 'features', layout: { variant: 'numbered-list' } },
                { type: 'hero', layout: { variant: 'asymmetric' } },
              ],
            },
          ],
          contentWidth: 'wide',
        },
      },
      'B',
    );
    const report = checkDesignDistinctness([a, b]);
    expect(report.distinctDimensions).toEqual(
      expect.arrayContaining(['heroComposition', 'sectionSequence', 'featuresLayout', 'contentWidth']),
    );
    expect(report.pass).toBe(true);
  });

  it('reports identical dimensions so the model can fix them', () => {
    const a = direction({}, 'A');
    const b = direction({}, 'B');
    const report = checkDesignDistinctness([a, b]);
    expect(report.identicalDimensions).toContain('heroComposition');
    expect(report.identicalDimensions).toContain('sectionSequence');
    expect(report.feedback).toContain('必须调整构图');
  });
});
