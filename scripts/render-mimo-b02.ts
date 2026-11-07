/**
 * B-02 交付：校验 MiMo 创意方向 JSON 并渲染双尺寸海报。
 *
 * 输入：docs/B02-creative-output.json（任务包约定的输出结构）
 * 产物：.cache/mimo-b02/*.png + result.json + 控制台校验报告
 *
 * 不连接数据库/网络/模型：只调用 B 渲染引擎的纯函数。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { designPresets } from '../src/vendor/creative-b/data/design-presets';
import { buildPoster } from '../src/vendor/creative-b/lib/creative/composer';
import { buildPosterSvg, fitText, measureText } from '../src/vendor/creative-b/lib/creative/poster-renderer/svg';
import { posterGeometry, type PosterLayout } from '../src/vendor/creative-b/lib/creative/poster-renderer/geometry';
import { projectSeedSchema, type ProjectSeed } from '../src/vendor/creative-b/types/contracts';

const INPUT = path.join('docs', 'B02-creative-output.json');
const OUT = path.join('.cache', 'mimo-b02');
const QR_URL = `${process.env.APP_URL || 'https://oneboss-ai.onrender.com'}/p/demo-poster`;

const seed: ProjectSeed = projectSeedSchema.parse({
  id: 'demo-lanye',
  slug: 'demo-lanye',
  name: '岚野折木椅',
  brand: '岚野 LANYE',
  category: '家居 / 折叠家具',
  scenario: '小户型客餐厅、租房与临时客房',
  summary: '一把可以折起来收进柜子的实木椅',
  story: '把传统榫卯的强度做成可拆折的结构，收起后只占 12 厘米进深。',
  highlights: [
    { title: '折叠进深 12cm', body: '收起后可靠墙或塞进衣柜缝隙，适合小户型。' },
    { title: '实木榫卯节点', body: '主受力点使用榫卯与金属销复合结构，不是单纯螺丝固定。' },
    { title: '可拆洗坐垫', body: '坐垫套可拆下机洗，面料避免使用动物皮革。' },
  ],
  hashtags: ['#小户型家具', '#实木折叠椅', '#租房友好'],
  factVersion: 1,
  products: [
    {
      id: 'chair-01',
      name: '岚野折木椅',
      summary: '一把可以折起来收进柜子的实木椅',
      price: '¥1,299',
      priceLabel: '含税价，不含运费',
      facts: {
        'product.price': {
          key: 'product.price',
          label: '价格',
          value: '¥1,299',
          verified: true,
          source: 'customer',
          priceType: 'fixed',
        },
      },
      assetRefs: [],
      unknown: ['承重上限待补充'],
    },
  ],
  assets: [],
  designStyles: ['editorial-minimal', 'future-tech', 'young-vibrant'],
  constraints: ['不使用未授权图片', '价格必须与已确认事实一致'],
  demoNote: '本机渲染验收用虚构演示数据，非真实客户。',
  publishedSlug: 'demo-poster',
});

const BANNED = ['最', '第一', '唯一', '顶级', '国家级', '史上', '永不', '百分百', '彻底', '承重'];
const LIMITS = {
  headline: 8,
  subhead: 16,
  tag: 6,
  copyTitle: 24,
  copyBody: 120,
  coverCaption: 12,
  cta: 10,
  heroTitle: 12,
  heroSubtitle: 24,
  highlightTitle: 8,
  highlightBody: 30,
};

const TEXT = {
  'editorial-premium': { headline: { max: 98, min: 42 }, subhead: { max: 30, min: 22 } },
  'future-grid': { headline: { max: 92, min: 42 }, subhead: { max: 27, min: 20 } },
  'bold-editorial': { headline: { max: 104, min: 44 }, subhead: { max: 30, min: 21 } },
} as const;

const len = (value: string) => [...value].length;
const compact = (value: string) => value.replace(/\s/g, '');

interface Direction {
  id: string;
  styleId: keyof typeof designPresets;
  name: string;
  rationale: string;
  poster: { headline: string; subhead: string; tags: string[]; priceLabel: string };
  copy: {
    title: string;
    body: string;
    coverCaption: string;
    cta: string;
    hashtags: string[];
  };
  site: {
    heroTitle: string;
    heroSubtitle: string;
    highlights: { title: string; body: string }[];
    cta: string;
  };
  complianceNotes: string[];
}

const problems: { direction: string; field: string; detail: string }[] = [];
const fail = (direction: string, field: string, detail: string) =>
  problems.push({ direction, field, detail });

function checkLengths(direction: Direction) {
  const d = direction.id;
  const pairs: [string, string, number][] = [
    ['poster.headline', direction.poster.headline, LIMITS.headline],
    ['poster.subhead', direction.poster.subhead, LIMITS.subhead],
    ['copy.title', direction.copy.title, LIMITS.copyTitle],
    ['copy.body', direction.copy.body, LIMITS.copyBody],
    ['copy.coverCaption', direction.copy.coverCaption, LIMITS.coverCaption],
    ['copy.cta', direction.copy.cta, LIMITS.cta],
    ['site.heroTitle', direction.site.heroTitle, LIMITS.heroTitle],
    ['site.heroSubtitle', direction.site.heroSubtitle, LIMITS.heroSubtitle],
  ];
  for (const [field, value, limit] of pairs)
    if (len(value) > limit) fail(d, field, `超出 ${len(value) - limit} 字（${len(value)}/${limit}）`);

  direction.poster.tags.forEach((tag, index) => {
    if (len(tag) > LIMITS.tag) fail(d, `poster.tags[${index}]`, `超出 ${len(tag) - LIMITS.tag} 字`);
  });
  direction.site.highlights.forEach((item, index) => {
    if (len(item.title) > LIMITS.highlightTitle)
      fail(d, `site.highlights[${index}].title`, `超出 ${len(item.title) - LIMITS.highlightTitle} 字`);
    if (len(item.body) > LIMITS.highlightBody)
      fail(d, `site.highlights[${index}].body`, `超出 ${len(item.body) - LIMITS.highlightBody} 字`);
  });
}

function checkCompliance(direction: Direction) {
  const d = direction.id;
  const haystack = [
    direction.name,
    direction.rationale,
    direction.poster.headline,
    direction.poster.subhead,
    direction.poster.tags.join(' '),
    direction.poster.priceLabel,
    direction.copy.title,
    direction.copy.body,
    direction.copy.coverCaption,
    direction.copy.cta,
    direction.site.heroTitle,
    direction.site.heroSubtitle,
    ...direction.site.highlights.map((h) => `${h.title}${h.body}`),
  ].join('\n');

  for (const word of BANNED)
    if (haystack.includes(word)) fail(d, 'compliance', `出现禁用词「${word}」`);

  if (!haystack.includes('¥1,299')) fail(d, 'compliance', '未原样引用价格 ¥1,299');
  const pricePatterns = [/仅需/g, /低至/g, /起价/g, /限时/g, /折扣/g, /包邮/g];
  for (const pattern of pricePatterns)
    if (pattern.test(haystack)) fail(d, 'compliance', `价格修饰词 ${pattern.source}`);

  if (direction.poster.tags.length !== 3) fail(d, 'poster.tags', `应为 3 个，实际 ${direction.poster.tags.length}`);
  if (!direction.complianceNotes.length) fail(d, 'complianceNotes', '缺少合规说明');
}

interface Rendered {
  direction: string;
  styleId: string;
  layout: PosterLayout;
  height: number;
  file: string;
  headlineLines: string[];
  subheadLines: string[];
  fontSize: number;
  qrPlacement: string;
  qrReason: string;
  width: number | null;
}

async function main() {
  const raw = JSON.parse(await readFile(INPUT, 'utf8')) as { directions: Direction[] };
  await mkdir(OUT, { recursive: true });

  if (raw.directions.length !== 2) fail('—', 'directions', `应为 2 套，实际 ${raw.directions.length}`);
  const styles = new Set(raw.directions.map((d) => d.styleId));
  if (styles.size !== raw.directions.length) fail('—', 'styleId', '两套方向使用了相同的 styleId');

  for (const direction of raw.directions) {
    checkLengths(direction);
    checkCompliance(direction);
  }

  const rendered: Rendered[] = [];

  for (const direction of raw.directions) {
    const preset = designPresets[direction.styleId];
    if (!preset) {
      fail(direction.id, 'styleId', `未知预设 ${direction.styleId}`);
      continue;
    }
    const layout = preset.posterLayout;

    for (const height of [1350, 1080] as const) {
      const geo = posterGeometry(layout, height);
      const built = buildPoster(
        {
          seed,
          design: { ...preset, approvedByClient: true, factVersion: seed.factVersion },
          siteRevision: 1,
          posterRevision: 1,
          copyRevision: 1,
          factVersion: seed.factVersion,
          qrUrl: QR_URL,
          qrSource: 'published-site',
          qrRequested: 'auto',
        },
        height,
      );

      // 用 MiMo 的创意文案覆盖引擎默认值，其余（尺寸/安全区/二维码）仍由引擎决定。
      const spec = {
        ...built.spec,
        headline: direction.poster.headline,
        subhead: direction.poster.subhead,
        tags: direction.poster.tags,
        priceLabel: direction.poster.priceLabel,
      };

      const headline = fitText(spec.headline, geo.headline.width, geo.headline.height, {
        max: TEXT[layout].headline.max,
        min: TEXT[layout].headline.min,
        maxLines: 3,
      });
      const subhead = fitText(spec.subhead, geo.subhead.width, geo.subhead.height, {
        max: TEXT[layout].subhead.max,
        min: TEXT[layout].subhead.min,
        maxLines: 2,
      });

      if (compact(headline.lines.join('')) !== compact(spec.headline))
        fail(direction.id, `headline@${height}`, '标题被裁切');
      if (compact(subhead.lines.join('')) !== compact(spec.subhead))
        fail(direction.id, `subhead@${height}`, '副标题被裁切');

      const svg = buildPosterSvg(
        spec,
        { ...preset, approvedByClient: true, factVersion: seed.factVersion },
        seed,
      );
      const file = `${direction.id}-${direction.styleId}-${height}.png`;
      const png = await sharp(Buffer.from(svg), { limitInputPixels: 20_000_000 }).png().toBuffer();
      await writeFile(path.join(OUT, file), png);

      rendered.push({
        direction: direction.id,
        styleId: direction.styleId,
        layout,
        height,
        file,
        headlineLines: headline.lines,
        subheadLines: subhead.lines,
        fontSize: headline.fontSize,
        qrPlacement: spec.qr.placement,
        qrReason: built.decision.reason,
        width: Math.round(Math.max(...headline.lines.map((l) => measureText(l, headline.fontSize)))),
      });
    }
  }

  const passed = problems.length === 0;
  await writeFile(
    path.join(OUT, 'result.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), passed, problems, rendered }, null, 2),
    'utf8',
  );

  console.log('=== 校验 ===');
  if (passed) console.log('全部字段符合任务包约束。');
  else for (const p of problems) console.log(`✗ [${p.direction}] ${p.field}: ${p.detail}`);

  console.log('\n=== 渲染 ===');
  for (const item of rendered) {
    console.log(
      `${item.file}\n  版式 ${item.layout} · 标题「${item.headlineLines.join(' / ')}」${item.fontSize}px 宽 ${item.width}px\n  副标题「${item.subheadLines.join(' / ')}」\n  二维码 ${item.qrPlacement}（${item.qrReason}）`,
    );
  }
  console.log(`\n产物：${path.resolve(OUT)}`);
  if (!passed) process.exitCode = 1;
}

await main();
