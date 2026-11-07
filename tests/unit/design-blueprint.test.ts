import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  DesignSystem,
  SiteBlueprint,
  SectionLayout,
  DesignChoices,
  SiteSpec,
  type DesignSystemType,
} from '../../src/contracts';

const legacyDesign = {
  version: 1,
  styleId: 'editorial-minimal',
  rationale: '留白布局',
  palette: { background: '#ffffff', accent: '#111111' },
  typography: { display: 'serif', body: 'sans-serif' },
  spacingScale: [8, 16],
  radiusScale: [4],
  layoutMode: 'editorial',
  motionPreset: 'subtle',
  approvedByClient: false,
  factVersion: 1,
};

const blueprint = {
  pages: [
    {
      slug: '',
      title: '首页',
      sections: [
        {
          type: 'hero',
          layout: { variant: 'full-bleed', emphasis: 'image-led', imageRatio: 'wide' },
          factKeys: ['name', 'description'],
          assetRoles: ['hero'],
        },
        {
          type: 'gallery',
          layout: { variant: 'masonry', columns: 3 },
          assetRoles: ['gallery-1', 'gallery-2'],
        },
        { type: 'specs', layout: { variant: 'technical-table', alignment: 'left' } },
        { type: 'contact', layout: { variant: 'minimal-cta', width: 'narrow' } },
      ],
    },
  ],
  contentWidth: 'wide',
  visualRhythm: 'layered',
};

describe('Design DNA and Site Blueprint schemas', () => {
  it('parses a legacy DesignSystem without new fields (backward compatible)', () => {
    const parsed = DesignSystem.parse(legacyDesign);
    expect(parsed.styleId).toBe('editorial-minimal');
    expect(parsed.siteBlueprint).toBeUndefined();
    expect(parsed.directionId).toBeUndefined();
    expect(parsed.heroComposition).toBeUndefined();
  });

  it('parses a DesignSystem carrying full Design DNA and Blueprint', () => {
    const directionId = randomUUID();
    const parsed = DesignSystem.parse({
      ...legacyDesign,
      directionId,
      name: '材质与空间',
      tagline: '家具杂志式排版',
      visualConcept: '强调木纹、结构与空间感',
      visualKeywords: ['木纹', '留白', '结构'],
      density: 'airy',
      imageTreatment: 'framed',
      heroComposition: 'split-editorial',
      pageGrid: { contentWidth: 'wide', columns: 12, gutter: 24 },
      siteBlueprint: blueprint,
    });
    expect(parsed.directionId).toBe(directionId);
    expect(parsed.siteBlueprint?.pages[0].sections).toHaveLength(4);
    expect(parsed.siteBlueprint?.contentWidth).toBe('wide');
  });

  it('rejects an invalid directionId (must be uuid)', () => {
    expect(
      DesignSystem.safeParse({ ...legacyDesign, directionId: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  it('rejects unknown Design DNA keys under strict mode', () => {
    expect(DesignSystem.safeParse({ ...legacyDesign, unknownField: 1 }).success).toBe(false);
  });

  it('validates SiteBlueprint structure and section types', () => {
    expect(SiteBlueprint.safeParse(blueprint).success).toBe(true);
    expect(
      SiteBlueprint.safeParse({
        pages: [{ slug: '', title: 'x', sections: [{ type: 'unknown-type', layout: {} }] }],
      }).success,
    ).toBe(false);
  });

  it('requires at least one section per page and one page per blueprint', () => {
    expect(SiteBlueprint.safeParse({ pages: [{ slug: '', title: 'x', sections: [] }] }).success).toBe(
      false,
    );
    expect(SiteBlueprint.safeParse({ pages: [] }).success).toBe(false);
  });

  it('accepts semantic factKeys and assetRoles but rejects oversized arrays', () => {
    const ok = SiteBlueprint.safeParse(blueprint);
    expect(ok.success).toBe(true);
    const tooManyKeys = {
      pages: [
        {
          slug: '',
          title: 'x',
          sections: [
            { type: 'hero', layout: {}, factKeys: Array.from({ length: 21 }, (_, i) => `k${i}`) },
          ],
        },
      ],
    };
    expect(SiteBlueprint.safeParse(tooManyKeys).success).toBe(false);
  });

  it('SectionLayout accepts new layout primitives and rejects unknown keys', () => {
    expect(
      SectionLayout.safeParse({
        variant: 'bento',
        columns: 3,
        alignment: 'left',
        width: 'standard',
        emphasis: 'balanced',
        background: 'surface',
        imageRatio: 'landscape',
      }).success,
    ).toBe(true);
    expect(SectionLayout.safeParse({ variant: 'bento', nope: true }).success).toBe(false);
  });

  it('SiteSpec sections carry optional layout fields', () => {
    const id = randomUUID();
    const spec = SiteSpec.parse({
      schemaVersion: '1.0',
      projectId: id,
      revision: 1,
      designSystemVersion: 1,
      pages: [
        {
          slug: '',
          title: '首页',
          sections: [
            {
              type: 'hero',
              props: { variant: 'full-bleed', emphasis: 'image-led', imageRatio: 'wide' },
              factRefs: [],
              assetRefs: [],
            },
          ],
        },
      ],
      allowedSectionTypes: ['hero'],
      interactions: ['tabs'],
      seo: { title: 't', description: 'd' },
      factVersion: 1,
    });
    expect(spec.pages[0].sections[0].props.emphasis).toBe('image-led');
  });

  it('DesignChoices accepts 2–3 directions each with its own blueprint', () => {
    const make = (i: number, variant: string): DesignSystemType =>
      DesignSystem.parse({
        ...legacyDesign,
        directionId: randomUUID(),
        name: `方向 ${i}`,
        siteBlueprint: {
          pages: [
            {
              slug: '',
              title: '首页',
              sections: [{ type: 'hero', layout: { variant }, factKeys: ['name'] }],
            },
          ],
        },
      });
    expect(DesignChoices.safeParse({ choices: [make(1, 'full-bleed'), make(2, 'split-editorial')] }).success).toBe(true);
    expect(DesignChoices.safeParse({ choices: [make(1, 'a')] }).success).toBe(false);
    expect(
      DesignChoices.safeParse({ choices: [make(1, 'a'), make(2, 'b'), make(3, 'c'), make(4, 'd')] })
        .success,
    ).toBe(false);
  });
});
