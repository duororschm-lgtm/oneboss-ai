/**
 * B-01 本机验收：双尺寸海报渲染 + 自动体检。
 *
 * 不连接数据库、不连接网络、不调用模型：直接使用 B 渲染引擎的纯函数
 * （buildPoster → buildPosterSvg → sharp），因此在没有 .env.local 和托管
 * 正式交付文件时也能跑。
 *
 * 产物：.cache/poster-local/*.png（6 张）+ result.json + 控制台问题清单。
 *
 * 运行：npx tsx scripts/acceptance-poster-local.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { designPresets, styleOrder } from '../src/vendor/creative-b/data/design-presets';
import { buildPoster } from '../src/vendor/creative-b/lib/creative/composer';
import { buildPosterSvg, fitText, measureText } from '../src/vendor/creative-b/lib/creative/poster-renderer/svg';
import {
  posterGeometry,
  rectsOverlap,
  type PosterLayout,
} from '../src/vendor/creative-b/lib/creative/poster-renderer/geometry';
import { projectSeedSchema, type ProjectSeed } from '../src/vendor/creative-b/types/contracts';

const OUT = path.join('.cache', 'poster-local');
const PUBLIC_URL = 'https://oneboss-ai.onrender.com/p/demo-poster';

/**
 * 虚构演示数据，仅用于本机版式验收。不是真实客户资料，也不代表任何真实商品。
 */
const seedInput = {
  id: 'demo-lanye',
  slug: 'demo-lanye',
  name: '岚野折木椅',
  brand: '岚野 LANYE',
  category: '家居 / 折叠家具',
  scenario: '小户型客餐厅、租房与临时客房',
  summary: '一把可以折起来收进柜子的实木椅',
  story: '岚野把传统榫卯的强度做成可拆折的结构，收起后只占 12 厘米进深。',
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
    {
      id: 'chair-02',
      name: '岚野折木凳',
      summary: '与折木椅同结构的矮版方凳',
      price: '¥699',
      priceLabel: '含税价',
      facts: {
        'product.price': {
          key: 'product.price',
          label: '价格',
          value: '¥699',
          verified: true,
          source: 'customer',
          priceType: 'fixed',
        },
      },
      assetRefs: [],
      unknown: [],
    },
  ],
  assets: [],
  designStyles: ['editorial-minimal', 'future-tech', 'young-vibrant'],
  constraints: ['不使用未授权图片', '价格必须与已确认事实一致'],
  demoNote: '本机渲染验收用虚构演示数据，非真实客户；不得作为公开案例。',
  publishedSlug: 'demo-poster',
};

const seed: ProjectSeed = projectSeedSchema.parse(seedInput);

const TEXT_LIMITS: Record<PosterLayout, { headline: { max: number; min: number }; subhead: { max: number; min: number } }> = {
  'editorial-premium': { headline: { max: 98, min: 42 }, subhead: { max: 30, min: 22 } },
  'future-grid': { headline: { max: 92, min: 42 }, subhead: { max: 27, min: 20 } },
  'bold-editorial': { headline: { max: 104, min: 44 }, subhead: { max: 30, min: 21 } },
};

const compact = (value: string) => value.replace(/\s/g, '');

interface Finding {
  styleId: string;
  layout: PosterLayout;
  height: number;
  file: string;
  headline: string;
  subhead: string;
  tags: string[];
  price: string;
  qrPlacement: string;
  qrReason: string;
  warnings: string[];
  checks: { name: string; pass: boolean; detail: string }[];
}

const findings: Finding[] = [];

async function main() {
  await mkdir(OUT, { recursive: true });

  for (const styleId of styleOrder) {
    const preset = designPresets[styleId];
    const layout = preset.posterLayout;
    const limits = TEXT_LIMITS[layout];

    for (const height of [1350, 1080] as const) {
      const geo = posterGeometry(layout, height);
      const { spec, decision, warnings } = buildPoster(
        {
          seed,
          design: { ...preset, approvedByClient: true, factVersion: seed.factVersion },
          siteRevision: 1,
          posterRevision: 1,
          copyRevision: 1,
          factVersion: seed.factVersion,
          qrUrl: PUBLIC_URL,
          qrSource: 'published-site',
          qrRequested: 'auto',
        },
        height,
      );

      const headline = fitText(spec.headline, geo.headline.width, geo.headline.height, {
        max: limits.headline.max,
        min: limits.headline.min,
        maxLines: 3,
      });
      const subhead = fitText(spec.subhead, geo.subhead.width, geo.subhead.height, {
        max: limits.subhead.max,
        min: limits.subhead.min,
        maxLines: 2,
      });

      const headlineFits = compact(headline.lines.join('')) === compact(spec.headline);
      const subheadFits = compact(subhead.lines.join('')) === compact(spec.subhead);
      const qrCard = geo.qrCandidates[spec.qr.placement as 'bottom-right' | 'bottom-left'];
      const qrOverlap = [
        { rect: geo.art, label: '产品主视觉' },
        { rect: geo.price, label: '价格信息' },
        { rect: geo.headline, label: '标题' },
        { rect: geo.subhead, label: '副标题' },
        { rect: geo.footer, label: '页脚' },
      ]
        .map((item) => ({ label: item.label, area: rectsOverlap(qrCard, item.rect, 8) }))
        .filter((item) => item.area > 0);

      const headlineWidth = Math.max(...headline.lines.map((l) => measureText(l, headline.fontSize)));
      const subheadWidth = Math.max(...subhead.lines.map((l) => measureText(l, subhead.fontSize)));

      const svg = buildPosterSvg(spec, { ...preset, approvedByClient: true, factVersion: seed.factVersion }, seed);
      const file = `${styleId}-${height}.png`;
      const png = await sharp(Buffer.from(svg), { limitInputPixels: 20_000_000 }).png().toBuffer();
      await writeFile(path.join(OUT, file), png);

      const meta = await sharp(png).metadata();

      findings.push({
        styleId,
        layout,
        height,
        file,
        headline: headline.lines.join(' / '),
        subhead: subhead.lines.join(' / '),
        tags: spec.tags,
        price: `${spec.price} · ${spec.priceLabel}`,
        qrPlacement: spec.qr.placement,
        qrReason: decision.reason,
        warnings,
        checks: [
          {
            name: '标题不裁切',
            pass: headlineFits,
            detail: `${headline.lines.length} 行，字号 ${headline.fontSize}，最宽 ${Math.round(headlineWidth)} / 可用 ${geo.headline.width}`,
          },
          {
            name: '副标题不裁切',
            pass: subheadFits,
            detail: `${subhead.lines.length} 行，字号 ${subhead.fontSize}，最宽 ${Math.round(subheadWidth)} / 可用 ${geo.subhead.width}`,
          },
          {
            name: '二维码安全区无冲突',
            pass: qrOverlap.length === 0,
            detail: qrOverlap.length === 0 ? `${spec.qr.placement} 无重叠` : `与 ${qrOverlap.map((o) => o.label).join('、')} 重叠`,
          },
          {
            name: '画布尺寸',
            pass: meta.width === 1080 && meta.height === height,
            detail: `${meta.width}×${meta.height}`,
          },
          {
            name: '渲染无告警',
            pass: warnings.length === 0,
            detail: warnings.length === 0 ? '无' : warnings.join('；'),
          },
        ],
      });
    }
  }

  const flat = findings.flatMap((f) => f.checks.filter((c) => !c.pass).map((c) => ({ ...c, ...f })));
  const passed = flat.length === 0;

  await writeFile(
    path.join(OUT, 'result.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), seed: seed.id, passed, findings, failures: flat }, null, 2),
    'utf8',
  );

  for (const f of findings) {
    const bad = f.checks.filter((c) => !c.pass);
    console.log(`${bad.length === 0 ? 'PASS' : 'FAIL'}  ${f.styleId.padEnd(18)} ${f.height}  ${f.file}`);
    console.log(`        标题 ${f.headline}`);
    console.log(`        副标题 ${f.subhead}`);
    console.log(`        价格 ${f.price}  |  标签 ${f.tags.join(' / ')}`);
    console.log(`        二维码 ${f.qrPlacement}（${f.qrReason}）`);
    for (const c of bad) console.log(`        ✗ ${c.name}: ${c.detail}`);
  }

  console.log(`\n${passed ? '全部通过' : `发现 ${flat.length} 项问题`}，产物见 ${path.resolve(OUT)}`);
  if (!passed) process.exitCode = 1;
}

await main();
