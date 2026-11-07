import type { DesignSystem, StyleId } from '../types/contracts';

const BODY = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", sans-serif';
const MONO = '"Cascadia Mono", "JetBrains Mono", ui-monospace, "Microsoft YaHei", monospace';
const SERIF = 'Georgia, "Songti SC", "SimSun", "Noto Serif SC", serif';
const BLACK = '"Arial Black", "Microsoft YaHei", "PingFang SC", sans-serif';

export const designPresets: Record<StyleId, DesignSystem> = {
  'editorial-minimal': {
    version: 1,
    styleId: 'editorial-minimal',
    name: '精致极简',
    tagline: '留白、材质与克制的秩序',
    rationale: '用大面积留白和克制的字阶让产品成为唯一主角，适合家居与高端生活方式。',
    palette: {
      background: '#f4f0e6',
      surface: '#fbf8f1',
      text: '#23241e',
      muted: '#6f6a5d',
      accent: '#b4552f',
      accentText: '#fff8ee',
      border: '#dcd3c1',
    },
    typography: { display: SERIF, body: BODY, mono: MONO, scale: 1 },
    spacingScale: 1.18,
    radiusScale: 4,
    layoutMode: 'editorial',
    motionPreset: 'subtle',
    heroComposition: 'image-right',
    posterLayout: 'editorial-premium',
    copyTone: '安静、具体、不夸大',
    sectionFlow: ['hero', 'gallery', 'features', 'specs', 'story', 'cta'],
    approvedByClient: false,
    factVersion: 0,
  },
  'future-tech': {
    version: 2,
    styleId: 'future-tech',
    name: '未来科技',
    tagline: '深色信息架构与冷色导线',
    rationale: '深色底、网格与等宽标签把参数和结构推到前面，适合数码、汽车等需要讲清信息的品类。',
    palette: {
      background: '#071311',
      surface: '#0e1d1a',
      text: '#eaf7f2',
      muted: '#93aba2',
      accent: '#57f0bd',
      accentText: '#04211a',
      border: '#1e332d',
    },
    typography: { display: MONO, body: BODY, mono: MONO, scale: 1.04 },
    spacingScale: 1,
    radiusScale: 2,
    layoutMode: 'split',
    motionPreset: 'subtle',
    heroComposition: 'image-bottom',
    posterLayout: 'future-grid',
    copyTone: '克制、参数优先、说明边界',
    sectionFlow: ['hero', 'specs', 'features', 'gallery', 'story', 'cta'],
    approvedByClient: false,
    factVersion: 0,
  },
  'young-vibrant': {
    version: 3,
    styleId: 'young-vibrant',
    name: '年轻活力',
    tagline: '高饱和色块与更快的视觉节奏',
    rationale: '不对称卡片、超大标题和醒目的价格标签形成社交媒体节奏，适合潮流与快消品类。',
    palette: {
      background: '#f1ff5e',
      surface: '#fffdf2',
      text: '#161616',
      muted: '#55554d',
      accent: '#ef4a2e',
      accentText: '#fffdf2',
      border: '#161616',
    },
    typography: { display: BLACK, body: BODY, mono: MONO, scale: 1.14 },
    spacingScale: 0.94,
    radiusScale: 22,
    layoutMode: 'staggered',
    motionPreset: 'dynamic',
    heroComposition: 'image-right',
    posterLayout: 'bold-editorial',
    copyTone: '直接、轻快、突出价格与场景',
    sectionFlow: ['hero', 'features', 'gallery', 'products', 'story', 'specs', 'cta'],
    approvedByClient: false,
    factVersion: 0,
  },
};

export const styleOrder: StyleId[] = ['editorial-minimal', 'future-tech', 'young-vibrant'];

export const paletteSwatches = (styleId: StyleId) => {
  const { palette } = designPresets[styleId];
  return [palette.background, palette.accent, palette.text, palette.surface];
};
