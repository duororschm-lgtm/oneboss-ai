import { describe, expect, it } from 'vitest';
import { generateProjectFromBrief } from '../src/lib/creative/project-generator';
import { buildCopies, buildPoster, buildSiteSpec } from '../src/lib/creative/composer';
import { designPresets } from '../src/data/design-presets';
import { posterSpecSchema, projectSeedSchema, siteSpecSchema } from '../src/types/contracts';

const base = {
  name: '晨雾咖啡豆',
  brand: 'MIST ROASTERY',
  price: '¥68 / 200g',
  category: '咖啡',
  scenario: '日常手冲',
  description: '中浅烘焙的日常手冲咖啡豆，适合在家慢慢冲泡。客户确认售价为 ¥68 / 200g，产地与处理法待补充。',
};

function inputFor(seed: ReturnType<typeof generateProjectFromBrief>['seed'], styleId = seed.designStyles[0]) {
  return {
    seed,
    design: designPresets[styleId],
    siteRevision: 1,
    posterRevision: 1,
    copyRevision: 1,
    qrUrl: 'https://demo.oneboss.local/p/custom-test',
    qrSource: 'fixture-preview' as const,
  };
}

describe('描述 → 项目生成器', () => {
  it('把描述生成为合法的 ProjectSeed，并推断出品类、图形与视觉方向', () => {
    const { seed, recommendedStyleId, notes } = generateProjectFromBrief(base, { suffix: 'test1' });
    expect(() => projectSeedSchema.parse(seed)).not.toThrow();
    expect(seed.id).toBe('custom-test1');
    expect(seed.category).toBe('咖啡');
    expect(seed.products[0].assetRefs).toHaveLength(1);
    expect(seed.assets[0].art).toBe('beans');
    expect(recommendedStyleId).toBe('young-vibrant');
    expect(seed.designStyles[0]).toBe('young-vibrant');
    expect(seed.products[0].facts['product.price'].verified).toBe(true);
    expect(seed.products[0].facts['product.name'].value).toBe('晨雾咖啡豆');
    expect(notes.join(' ')).toContain('推荐视觉方向');
  });

  it('生成结果可以直接渲染网站、海报和文案', () => {
    const { seed } = generateProjectFromBrief(base, { suffix: 'test2' });
    const site = buildSiteSpec(inputFor(seed));
    expect(() => siteSpecSchema.parse(site)).not.toThrow();
    expect(JSON.stringify(site)).toContain('晨雾咖啡豆');
    expect(JSON.stringify(site)).toContain('¥68 / 200g');
    expect(site.pages[0].sections.some((section) => section.type === 'gallery')).toBe(true);

    for (const height of [1350, 1080] as const) {
      const { spec, warnings } = buildPoster(inputFor(seed), height);
      expect(() => posterSpecSchema.parse(spec)).not.toThrow();
      expect(spec.price).toBe('¥68 / 200g');
      expect(warnings.some((warning) => warning.includes('价格尚未确认'))).toBe(false);
    }
    const copy = buildCopies(inputFor(seed), 1350);
    expect(copy.body).toContain('¥68 / 200g');
    expect(copy.factVersion).toBe(seed.factVersion);
  });

  it('品牌和价格留空时标记待确认，不猜测金额', () => {
    const { seed, missing } = generateProjectFromBrief(
      {
        name: '拾光台灯',
        description: '一盏适合书桌和床头的台灯，提供暖色阅读光。材质、尺寸与调光参数还没有提供。',
      },
      { suffix: 'test3' },
    );
    expect(missing).toEqual(expect.arrayContaining(['品牌', '价格']));
    expect(seed.brand).toBe('待确认品牌');
    expect(seed.products[0].price).toBe('价格待确认');
    expect(seed.products[0].facts['product.price'].verified).toBe(false);
    expect(seed.products[0].facts['product.brand'].verified).toBe(false);

    const site = buildSiteSpec(inputFor(seed));
    const specs = site.pages[0].sections.find((section) => section.type === 'specs');
    if (specs && specs.type === 'specs') {
      expect(specs.props.tabs.find((tab) => tab.label === '待确认')?.rows.map((row) => row.label)).toEqual(
        expect.arrayContaining(['品牌', '价格']),
      );
    }
    const { spec, warnings } = buildPoster(inputFor(seed), 1350);
    expect(spec.price).toBe('价格待确认');
    expect(warnings.join(' ')).toContain('价格尚未确认');
    const copy = buildCopies(inputFor(seed), 1350);
    expect(copy.body).toContain('价格尚未确认');
    expect(copy.body).not.toMatch(/¥\s*\d/);
  });

  it('描述里写明的价格与品牌会被提取，不会重复要求填写', () => {
    const { seed, missing } = generateProjectFromBrief(
      {
        name: '晨雾咖啡豆',
        description: '品牌：MIST ROASTERY。中浅烘焙的日常手冲咖啡豆，已确认价格 ¥68 / 200g，产地待补充。',
      },
      { suffix: 'extract' },
    );
    expect(seed.brand).toBe('MIST ROASTERY');
    expect(seed.products[0].price).toBe('¥68 / 200g');
    expect(seed.products[0].facts['product.price'].verified).toBe(true);
    expect(seed.summary).toContain('中浅烘焙');
    expect(seed.summary.startsWith('品牌')).toBe(false);
    expect(seed.highlights[0].body).not.toContain('品牌：');
    expect(missing).toEqual([]);
  });

  it('按描述推断图形：椅子 / 汽车 / 咖啡', () => {
    const chair = generateProjectFromBrief(
      { name: '原木扶手椅', description: '一把原木扶手椅，适合阅读角。材质与尺寸待确认。' },
      { suffix: 'chair' },
    );
    const car = generateProjectFromBrief(
      { name: '曜石 C7', description: '一台示例轿车，指导价 18.98 万元，续航与动力参数待确认。', price: '¥18.98 万' },
      { suffix: 'car' },
    );
    expect(chair.seed.assets[0].art).toBe('chair');
    expect(chair.seed.category).toBe('家居');
    expect(car.seed.assets[0].art).toBe('car');
    expect(car.seed.category).toBe('汽车');
    expect(car.recommendedStyleId).toBe('future-tech');
  });

  it('三套设计方向都能消费同一个生成项目', () => {
    const { seed } = generateProjectFromBrief(base, { suffix: 'styles' });
    for (const styleId of seed.designStyles) {
      const site = buildSiteSpec(inputFor(seed, styleId));
      expect(site.styleId).toBe(styleId);
      const { spec } = buildPoster(inputFor(seed, styleId), 1350);
      expect(spec.styleId).toBe(styleId);
    }
  });

  it('避免与已有 slug 冲突', () => {
    const { seed } = generateProjectFromBrief(base, { suffix: 'taken', existingSlugs: ['custom-taken'] });
    expect(seed.id.startsWith('custom-')).toBe(true);
    expect(seed.id).not.toBe('custom-taken');
  });
});
