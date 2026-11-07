import type { DesignSystemType } from '../../contracts';

/**
 * Design directions must differ in structure and composition, not only palette.
 * A dimension counts as distinct when at least two directions expose different values.
 * Palette and background color are deliberately excluded from the counted dimensions.
 */
export type DistinctnessReport = {
  pass: boolean;
  distinctDimensions: string[];
  identicalDimensions: string[];
  feedback: string;
};

const MIN_DISTINCT_DIMENSIONS = 4;

type Dimension = {
  key: string;
  label: string;
  value: (choice: DesignSystemType) => string;
};

const firstSection = (choice: DesignSystemType, type: string) =>
  choice.siteBlueprint?.pages[0]?.sections.find((section) => section.type === type);

const sectionSequence = (choice: DesignSystemType) =>
  (choice.siteBlueprint?.pages[0]?.sections ?? []).map((section) => section.type).join('>');

const dimensions: Dimension[] = [
  {
    key: 'heroComposition',
    label: '首屏构图',
    value: (c) => c.heroComposition || firstSection(c, 'hero')?.layout.variant || 'default',
  },
  {
    key: 'sectionSequence',
    label: '页面 Section 顺序',
    value: (c) => sectionSequence(c) || 'none',
  },
  {
    key: 'galleryLayout',
    label: 'Gallery 图片编排',
    value: (c) => firstSection(c, 'gallery')?.layout.variant || 'no-gallery',
  },
  {
    key: 'featuresLayout',
    label: 'Features 布局',
    value: (c) => firstSection(c, 'features')?.layout.variant || 'no-features',
  },
  {
    key: 'specsLayout',
    label: 'Specs 展示形式',
    value: (c) => firstSection(c, 'specs')?.layout.variant || 'no-specs',
  },
  {
    key: 'contentWidth',
    label: '页面网格与内容宽度',
    value: (c) =>
      c.siteBlueprint?.contentWidth || c.pageGrid?.contentWidth || String(c.pageGrid?.columns ?? 'default'),
  },
  {
    key: 'typography',
    label: '字体风格',
    value: (c) => String(c.typography.display ?? 'default'),
  },
  {
    key: 'density',
    label: '信息密度',
    value: (c) => c.density || 'balanced',
  },
  {
    key: 'imageTreatment',
    label: '图片处理方式',
    value: (c) => c.imageTreatment || 'default',
  },
  {
    key: 'motionPreset',
    label: '动效策略',
    value: (c) => c.motionPreset,
  },
];

export function checkDesignDistinctness(choices: DesignSystemType[]): DistinctnessReport {
  const distinctDimensions: string[] = [];
  const identicalDimensions: string[] = [];
  for (const dimension of dimensions) {
    const values = new Set(choices.map((choice) => dimension.value(choice)));
    if (values.size >= 2) distinctDimensions.push(dimension.key);
    else identicalDimensions.push(dimension.key);
  }
  const pass = distinctDimensions.length >= MIN_DISTINCT_DIMENSIONS;
  const feedback = pass
    ? `结构差异达标（${distinctDimensions.length} 维）。`
    : `结构差异不足：${distinctDimensions.length} 维不同，要求至少 ${MIN_DISTINCT_DIMENSIONS} 维。` +
      `以下维度完全相同，必须调整构图而不是只换颜色：${identicalDimensions.join('、')}。` +
      `可观察差异包括：Hero 构图、Section 顺序、Gallery/Features/Specs 布局变体、页面网格、字体、密度、图片处理、动效。`;
  return { pass, distinctDimensions, identicalDimensions, feedback };
}
