import { describe, expect, it } from 'vitest';
import { designPresets } from '../src/data/design-presets';
import { projectSeedById } from '../src/data/projects';
import { buildCopies, buildPoster, buildSiteSpec } from '../src/lib/creative/composer';
import type { StyleId } from '../src/types/contracts';

const qrUrl = 'https://demo.oneboss.local/p/demo-chair-001';

function input(seedId: string, styleId: StyleId, overrides: Record<string, string> = {}) {
  return {
    seed: projectSeedById(seedId),
    design: designPresets[styleId],
    siteRevision: 2,
    posterRevision: 3,
    copyRevision: 4,
    qrUrl,
    qrSource: 'fixture-preview' as const,
    factOverrides: overrides,
  };
}

describe('SiteSpec 组合器', () => {
  it('只使用受控章节，并按设计方向改变章节顺序（不只是换色）', () => {
    const minimal = buildSiteSpec(input('demo-chair-001', 'editorial-minimal'));
    const tech = buildSiteSpec(input('demo-chair-001', 'future-tech'));
    const vivid = buildSiteSpec(input('demo-chair-001', 'young-vibrant'));
    const types = (spec: typeof minimal) => spec.pages[0].sections.map((section) => section.type);
    expect(types(minimal)).toEqual(['hero', 'gallery', 'features', 'specs', 'story', 'cta']);
    expect(types(tech)).toEqual(['hero', 'specs', 'features', 'gallery', 'story', 'cta']);
    expect(types(vivid)).toEqual(['hero', 'features', 'gallery', 'story', 'specs', 'cta']);
    for (const spec of [minimal, tech, vivid]) {
      const allowed = ['hero', 'gallery', 'features', 'specs', 'products', 'story', 'cta'];
      types(spec).forEach((type) => expect(allowed).toContain(type));
    }
  });

  it('单图项目不生成轮播，双图项目才启用 carousel', () => {
    const chair = buildSiteSpec(input('demo-chair-001', 'editorial-minimal'));
    expect(chair.interactions).not.toContain('carousel');
    const gallery = chair.pages[0].sections.find((section) => section.type === 'gallery');
    expect(gallery && gallery.type === 'gallery' ? gallery.props.assetRefs : []).toHaveLength(1);

    const car = buildSiteSpec(input('demo-car-002', 'future-tech'));
    expect(car.interactions).toContain('carousel');
    const carGallery = car.pages[0].sections.find((section) => section.type === 'gallery');
    expect(carGallery && carGallery.type === 'gallery' ? carGallery.props.assetRefs.length : 0).toBe(2);
  });

  it('无图项目使用文字兜底：不生成图库、不伪造图片', () => {
    const spec = buildSiteSpec(input('demo-noimg-003', 'editorial-minimal'));
    expect(spec.pages[0].sections.some((section) => section.type === 'gallery')).toBe(false);
    const hero = spec.pages[0].sections.find((section) => section.type === 'hero');
    expect(hero && hero.type === 'hero' ? hero.props.assetRef : undefined).toBeUndefined();
    expect(spec.warnings.join(' ')).toContain('未提供商家实拍');

    const { spec: poster } = buildPoster(input('demo-noimg-003', 'editorial-minimal'), 1350);
    expect(poster.assetRef).toBeUndefined();
  });

  it('多产品项目生成产品目录与可切换详情数据', () => {
    const spec = buildSiteSpec(input('demo-multi-004', 'editorial-minimal'));
    const products = spec.pages[0].sections.find((section) => section.type === 'products');
    expect(products).toBeTruthy();
    if (products && products.type === 'products') {
      expect(products.props.items).toHaveLength(3);
      expect(products.props.items.map((item) => item.price)).toEqual(['¥129 / 把', '¥299 / 件', '¥899 / 件']);
      expect(products.props.items[0].rows.length).toBeGreaterThan(2);
    }
    const gallery = spec.pages[0].sections.find((section) => section.type === 'gallery');
    expect(gallery && gallery.type === 'gallery' ? gallery.props.assetRefs.length : 0).toBe(3);
    expect(spec.interactions).toContain('carousel');
  });

  it('汽车项目不编造续航/动力数字，未知项保持待确认', () => {
    const spec = buildSiteSpec(input('demo-car-002', 'future-tech'));
    const text = JSON.stringify(spec);
    expect(text).not.toMatch(/\d+\s*(km|公里|kWh|马力)/i);
    expect(text).toContain('续航里程');
    const specs = spec.pages[0].sections.find((section) => section.type === 'specs');
    if (specs && specs.type === 'specs') {
      const pending = specs.props.tabs.find((tab) => tab.label === '待确认');
      expect(pending?.rows.map((row) => row.value)).toEqual(expect.arrayContaining(['待客户确认']));
    }
    expect(spec.seo.description).not.toContain('续航');
  });

  it('价格事实变更后网站、海报、文案同步换价，且版本号一起升级', () => {
    const overrides = { 'chair-01:product.price': '¥139 / 把' };
    const changed = input('demo-chair-001', 'editorial-minimal', overrides);
    const site = buildSiteSpec(changed);
    const { spec } = buildPoster(changed, 1350);
    const copy = buildCopies(changed, 1350);
    expect(JSON.stringify(site)).toContain('¥139 / 把');
    expect(JSON.stringify(site)).not.toContain('¥129');
    expect(spec.price).toBe('¥139 / 把');
    expect(copy.body).toContain('¥139 / 把');
    expect(copy.body).not.toContain('¥129');
  });

  it('标题改写只作用于海报与文案，不篡改网站里的产品名', () => {
    const overridden = { ...input('demo-chair-001', 'editorial-minimal'), headlineOverride: '把日常坐得更轻一点' };
    const site = buildSiteSpec(overridden);
    const { spec } = buildPoster(overridden, 1350);
    const copy = buildCopies(overridden, 1350);
    expect(spec.headline).toBe('把日常坐得更轻一点');
    expect(copy.title).toBe('把日常坐得更轻一点');
    expect(JSON.stringify(site)).toContain('原木家用椅');
    expect(site.pages[0].title).toBe('原木家用椅');
  });
});
