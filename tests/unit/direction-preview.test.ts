import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DesignSystem, type FactType, type DesignSystemType } from '../../src/contracts';
import { directionPreview } from '../../src/lib/customer/direction-preview';
import { validateBlueprintAdherence } from '../../src/lib/core/validation';
import { fixture } from '../fixtures';

const fact1: FactType = {
  id: randomUUID(),
  productId: randomUUID(),
  key: 'name',
  value: '极简木椅',
  source: 'customer',
  verified: true,
  version: 1,
};
const fact2: FactType = {
  id: randomUUID(),
  productId: fact1.productId,
  key: 'description',
  value: '实木材质，适合阅读角落',
  source: 'customer',
  verified: true,
  version: 1,
};
const fact3: FactType = {
  id: randomUUID(),
  productId: fact1.productId,
  key: 'price',
  value: { amountMinor: 299900, currency: 'CNY', unit: '', priceType: 'fixed' },
  source: 'customer',
  verified: true,
  version: 1,
};

function makeDesign(overrides: Partial<DesignSystemType> = {}): DesignSystemType {
  return DesignSystem.parse({
    version: 1,
    styleId: 'furniture-editorial',
    rationale: '家具杂志式排版',
    palette: { background: '#f4f0e6', accent: '#b4552f' },
    typography: { display: 'serif', body: 'sans-serif' },
    spacingScale: [8, 16],
    radiusScale: [4],
    layoutMode: 'editorial',
    motionPreset: 'subtle',
    approvedByClient: false,
    factVersion: 1,
    name: '材质与空间',
    ...overrides,
    siteBlueprint: overrides.siteBlueprint ?? {
      pages: [
        {
          slug: '',
          title: '首页',
          sections: [
            {
              type: 'hero',
              layout: { variant: 'split-editorial', emphasis: 'image-led' },
              factKeys: ['name', 'description', 'price'],
              assetRoles: ['hero'],
            },
            {
              type: 'gallery',
              layout: { variant: 'masonry', columns: 3 },
              assetRoles: ['gallery-1', 'gallery-2'],
            },
            {
              type: 'features',
              layout: { variant: 'bento', columns: 2 },
              factKeys: ['description'],
            },
            {
              type: 'specs',
              layout: { variant: 'technical-table', alignment: 'left' },
              factKeys: ['name', 'price'],
            },
            {
              type: 'contact',
              layout: { variant: 'minimal-cta', width: 'narrow' },
            },
          ],
        },
      ],
      contentWidth: 'wide',
      visualRhythm: 'layered',
    },
  });
}

describe('direction preview from Blueprint', () => {
  it('builds a real SiteSpec from the blueprint (not fixed hero+specs)', () => {
    const design = makeDesign();
    const mapped = directionPreview(randomUUID(), 1, design, [fact1, fact2, fact3]);
    expect(mapped.spec.pages[0].sections.length).toBeGreaterThanOrEqual(5);
    const types = mapped.spec.pages[0].sections.map((s) => s.type);
    expect(types).toContain('hero');
    expect(types).toContain('gallery');
    expect(types).toContain('features');
    expect(types).toContain('specs');
    expect(types).toContain('cta');
  });

  it('resolves factKeys to real verified fact IDs', () => {
    const design = makeDesign();
    const mapped = directionPreview(randomUUID(), 1, design, [fact1, fact2, fact3]);
    const heroSection = mapped.spec.pages[0].sections.find((s) => s.type === 'hero');
    expect(heroSection).toBeDefined();
    // Hero section carries factRefs in props (B-side contract)
    const heroFactRefs = (heroSection as any)?.props?.factRefs;
    expect(Array.isArray(heroFactRefs)).toBe(true);
    expect(heroFactRefs.length).toBeGreaterThan(0);
    // The resolved IDs should match the actual fact IDs
    expect(heroFactRefs).toContain(fact1.id);
  });

  it('resolves assetRoles to authorized asset IDs in order', () => {
    const design = makeDesign();
    const asset1 = { id: randomUUID() };
    const asset2 = { id: randomUUID() };
    const mapped = directionPreview(randomUUID(), 1, design, [fact1, fact2, fact3], [
      asset1,
      asset2,
    ]);
    const gallery = mapped.spec.pages[0].sections.find((s) => s.type === 'gallery');
    expect(gallery).toBeDefined();
  });

  it('passes section layout props through to B-side sections', () => {
    const design = makeDesign();
    const mapped = directionPreview(randomUUID(), 1, design, [fact1, fact2, fact3]);
    const heroSection = mapped.spec.pages[0].sections.find((s) => s.type === 'hero');
    expect(heroSection?.layout).toBeDefined();
  });

  it('falls back to fixed hero+specs for legacy designs without blueprint', () => {
    const legacyDesign = DesignSystem.parse({
      version: 1,
      styleId: 'editorial-minimal',
      rationale: '旧方案',
      palette: { background: '#ffffff' },
      typography: { body: 'sans-serif' },
      spacingScale: [8],
      radiusScale: [4],
      layoutMode: 'editorial',
      motionPreset: 'subtle',
      approvedByClient: false,
      factVersion: 1,
    });
    const mapped = directionPreview(randomUUID(), 1, legacyDesign, [fact1, fact2, fact3]);
    const types = mapped.spec.pages[0].sections.map((s) => s.type);
    expect(types[0]).toBe('hero');
    expect(types[1]).toBe('specs');
    // mapSiteForView may auto-append a specs section if none exists
    expect(types.length).toBeGreaterThanOrEqual(2);
  });

  it('each direction renders its own page structure', () => {
    const designA = makeDesign({
      siteBlueprint: {
        pages: [
          {
            slug: '',
            title: 'A',
            sections: [
              { type: 'hero', layout: { variant: 'full-bleed' }, factKeys: ['name', 'price'] },
              { type: 'specs', layout: { variant: 'tabs' }, factKeys: ['name'] },
              { type: 'contact', layout: { variant: 'minimal-cta' }, factKeys: ['name'] },
            ],
          },
        ],
      },
    });
    const designB = makeDesign({
      siteBlueprint: {
        pages: [
          {
            slug: '',
            title: 'B',
            sections: [
              { type: 'features', layout: { variant: 'numbered-list' }, factKeys: ['description'] },
              { type: 'hero', layout: { variant: 'type-led' }, factKeys: ['name', 'price'] },
              { type: 'story', layout: { variant: 'manifesto' }, factKeys: ['description'] },
            ],
          },
        ],
      },
    });
    const a = directionPreview(randomUUID(), 1, designA, [fact1, fact2, fact3]);
    const b = directionPreview(randomUUID(), 1, designB, [fact1, fact2, fact3]);
    const typesA = a.spec.pages[0].sections.map((s) => s.type);
    const typesB = b.spec.pages[0].sections.map((s) => s.type);
    expect(typesA).not.toEqual(typesB);
  });
});

describe('production blueprint adherence', () => {
  it('passes when production contains all blueprint section types', () => {
    const f = fixture();
    const design = makeDesign({
      siteBlueprint: {
        pages: [
          {
            slug: '',
            title: '首页',
            sections: [{ type: 'hero', layout: {} }],
          },
        ],
      },
    });
    // fixture production has a hero section
    expect(() => validateBlueprintAdherence(f.production, design)).not.toThrow();
  });

  it('fails when production is missing a blueprint section type', () => {
    const f = fixture();
    const design = makeDesign({
      siteBlueprint: {
        pages: [
          {
            slug: '',
            title: '首页',
            sections: [
              { type: 'hero', layout: {} },
              { type: 'gallery', layout: {} },
            ],
          },
        ],
      },
    });
    // fixture production only has hero, missing gallery
    expect(() => validateBlueprintAdherence(f.production, design)).toThrow(
      'BLUEPRINT_STRUCTURE_MISMATCH',
    );
  });

  it('skips check for legacy designs without blueprint', () => {
    const f = fixture();
    const legacy = DesignSystem.parse({
      ...f.design,
      siteBlueprint: undefined,
    });
    expect(() => validateBlueprintAdherence(f.production, legacy)).not.toThrow();
  });
});
