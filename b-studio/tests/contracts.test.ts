import { describe, expect, it } from 'vitest';
import { designPresets } from '../src/data/design-presets';
import { projectSeeds } from '../src/data/projects';
import { buildCopies, buildPoster, buildSiteSpec } from '../src/lib/creative/composer';
import {
  deliveryManifestSchema,
  designSystemSchema,
  posterCopyBundleSchema,
  posterSpecSchema,
  productFactSchema,
  projectSeedSchema,
  siteSpecSchema,
} from '../src/types/contracts';
import type { StyleId } from '../src/types/contracts';

const qrUrl = 'https://demo.oneboss.local/p/one-living-chair';

function compose(seedId: string, styleId: StyleId, overrides: Record<string, string> = {}) {
  const seed = projectSeeds.find((item) => item.id === seedId)!;
  return {
    seed,
    design: designPresets[styleId],
    siteRevision: 1,
    posterRevision: 1,
    copyRevision: 1,
    qrUrl,
    qrSource: 'fixture-preview' as const,
    factOverrides: overrides,
  };
}

describe('共享合同（SiteSpec / PosterSpec / DeliveryManifest）', () => {
  it('四个 fixture 都符合 ProjectSeed 合同，且至少有两套设计方向', () => {
    expect(projectSeeds.length).toBe(4);
    projectSeeds.forEach((seed) => {
      expect(() => projectSeedSchema.parse(seed)).not.toThrow();
      expect(seed.designStyles.length).toBeGreaterThanOrEqual(2);
      seed.products.forEach((product) => Object.values(product.facts).forEach((fact) => productFactSchema.parse(fact)));
    });
  });

  it('三套 DesignSystem 均通过合同校验，且有实质差异（章节顺序/版式/动效）', () => {
    const systems = Object.values(designPresets);
    expect(systems).toHaveLength(3);
    systems.forEach((design) => designSystemSchema.parse(design));
    const flows = new Set(systems.map((design) => design.sectionFlow.join('>')));
    const layouts = new Set(systems.map((design) => design.layoutMode));
    const motions = new Set(systems.map((design) => design.motionPreset));
    expect(flows.size).toBe(3);
    expect(layouts.size).toBe(3);
    expect(motions.size).toBeGreaterThanOrEqual(2);
  });

  it('所有项目 × 所有方向都能生成合法的 SiteSpec 与两种尺寸的 PosterSpec', () => {
    for (const seed of projectSeeds) {
      for (const styleId of seed.designStyles) {
        const input = compose(seed.id, styleId);
        const site = buildSiteSpec(input);
        expect(() => siteSpecSchema.parse(site)).not.toThrow();
        expect(site.projectId).toBe(seed.id);
        expect(site.factVersion).toBe(seed.factVersion);

        for (const height of [1350, 1080] as const) {
          const { spec } = buildPoster(input, height);
          expect(() => posterSpecSchema.parse(spec)).not.toThrow();
          expect(spec.canvas).toEqual({ width: 1080, height });
          expect(spec.copyPackId).toContain(spec.posterId);
        }
      }
    }
  });

  it('海报文案与海报、网站使用同一个事实版本与价格', () => {
    const input = compose('demo-chair-001', 'editorial-minimal');
    const site = buildSiteSpec(input);
    const { spec } = buildPoster(input, 1350);
    const copy = buildCopies(input, 1350);
    expect(() => posterCopyBundleSchema.parse(copy)).not.toThrow();
    expect(copy.factVersion).toBe(spec.factVersion);
    expect(copy.posterFile).toBe(`one-living-chair-editorial-minimal-1080x1350.png`);
    expect(copy.body).toContain(spec.price);
    const hero = site.pages[0].sections.find((section) => section.type === 'hero');
    expect(hero && 'price' in hero.props ? hero.props.price : '').toBe(spec.price);
  });

  it('DeliveryManifest 只能由真实文件字段组成', () => {
    const manifest = {
      orderId: 'order-demo-001',
      projectId: 'demo-chair-001',
      publicSiteUrl: 'https://demo.oneboss.local/p/one-living-chair',
      siteRevision: 3,
      posters: [
        {
          posterId: 'demo-chair-001-editorial-minimal-1350',
          format: 'png' as const,
          width: 1080,
          height: 1350,
          qrTargetUrl: qrUrl,
          factVersion: 1,
          filename: 'one-living-chair-editorial-minimal-1080x1350.png',
        },
      ],
      xiaohongshuCopy: [{ posterId: 'demo-chair-001-editorial-minimal-1350', title: '标题', body: '正文', hashtags: ['#家居'] }],
      qrAssets: [{ label: '站点二维码', url: qrUrl }],
      zipPath: '/delivery/one-living-chair.zip',
      deliveryStatus: 'verified' as const,
      createdAt: new Date().toISOString(),
    };
    expect(() => deliveryManifestSchema.parse(manifest)).not.toThrow();
    expect(() => deliveryManifestSchema.parse({ ...manifest, publicSiteUrl: 'not-a-url' })).toThrow();
  });
});
