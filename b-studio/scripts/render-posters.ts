import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import jsQR from 'jsqr';
import sharp from 'sharp';
import { designPresets } from '../src/data/design-presets';
import { projectSeeds } from '../src/data/projects';
import { buildCopies, buildPoster } from '../src/lib/creative/composer';
import { buildPosterSvg } from '../src/lib/creative/poster-renderer/svg';
import { posterSpecSchema } from '../src/types/contracts';
import { createQrMatrix, qrPathData } from '../src/lib/creative/qr';

/**
 * 服务端海报导出演示（Node + Sharp）。
 * 浏览器里的交付中心使用同一份 SVG 构建函数，经 Canvas 输出 PNG；
 * 这里用 Sharp 生成可入库的静态文件，并用 jsQR 从最终像素反解二维码，证明链接可扫。
 */

const outDir = path.resolve('public/output');
const posterDir = path.join(outDir, 'posters');
const copyDir = path.join(outDir, 'copy');
const qrDir = path.join(outDir, 'qrcode');

await mkdir(posterDir, { recursive: true });
await mkdir(copyDir, { recursive: true });
await mkdir(qrDir, { recursive: true });

interface ManifestItem {
  projectId: string;
  projectName: string;
  styleId: string;
  posterId: string;
  filename: string;
  width: number;
  height: number;
  bytes: number;
  factVersion: number;
  layout: string;
  qrPlacement: string;
  qrUrl: string;
  qrDecoded: string | null;
  copyFile: string;
  createdAt: string;
}

const items: ManifestItem[] = [];
const createdAt = new Date().toISOString();
let failures = 0;

for (const seed of projectSeeds) {
  for (const styleId of seed.designStyles) {
    const design = designPresets[styleId];
    for (const height of [1350, 1080] as const) {
      const input = {
        seed,
        design,
        siteRevision: 1,
        posterRevision: 1,
        copyRevision: 1,
        qrUrl: `https://demo.oneboss.local/p/${seed.publishedSlug}`,
        qrSource: 'fixture-preview' as const,
      };
      const { spec } = buildPoster(input, height);
      posterSpecSchema.parse(spec);
      const svg = buildPosterSvg(spec, design, seed);
      const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
      const meta = await sharp(png).metadata();
      const filename = `${seed.publishedSlug}-${styleId}-${spec.canvas.width}x${spec.canvas.height}.png`;
      await writeFile(path.join(posterDir, filename), png);

      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
      const qrDecoded = decoded?.data ?? null;
      const ok = meta.width === 1080 && meta.height === height && png.length > 20_000 && qrDecoded === spec.qr.url;
      if (!ok) failures += 1;

      const copy = buildCopies(input, height);
      const copyFile = `${spec.posterId}.md`;
      const markdown = [
        `# ${copy.title}`,
        '',
        copy.body,
        '',
        copy.hashtags.join(' '),
        '',
        '---',
        `- 海报文件：posters/${filename}`,
        `- 海报尺寸：${spec.canvas.width}×${spec.canvas.height}`,
        `- 二维码位置：${spec.qr.placement === 'bottom-right' ? '右下角' : '左下角'}`,
        `- 二维码目标：${spec.qr.url}（演示预览，不是正式公网地址）`,
        `- 事实版本：V${copy.factVersion}`,
        `- 设计方向：${design.name}（${styleId}）`,
        `- 制作时间：${createdAt}`,
        '',
        '> 本文件为演示物料；未确认的材质、尺寸与性能不会出现在文案中。',
      ].join('\n');
      await writeFile(path.join(copyDir, copyFile), markdown);

      items.push({
        projectId: seed.id,
        projectName: seed.name,
        styleId,
        posterId: spec.posterId,
        filename: `posters/${filename}`,
        width: meta.width ?? 0,
        height: meta.height ?? 0,
        bytes: png.length,
        factVersion: spec.factVersion,
        layout: spec.layout,
        qrPlacement: spec.qr.placement,
        qrUrl: spec.qr.url,
        qrDecoded,
        copyFile: `copy/${copyFile}`,
        createdAt,
      });
      console.log(
        `${ok ? 'OK ' : 'FAIL'} ${filename} · ${meta.width}×${meta.height} · ${(png.length / 1024).toFixed(0)}KB · QR ${spec.qr.placement} · ${qrDecoded === spec.qr.url ? '解码一致' : '解码不一致'}`,
      );
    }
  }

  // 每个项目导出独立二维码文件
  const url = `https://demo.oneboss.local/p/${seed.publishedSlug}`;
  const matrix = createQrMatrix(url, 4);
  const size = 800;
  const scale = size / (matrix.size + 8);
  const qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#ffffff"/>
    <g transform="translate(${(4 * scale).toFixed(2)} ${(4 * scale).toFixed(2)}) scale(${scale.toFixed(4)})" shape-rendering="crispEdges">
      <path d="${qrPathData(matrix)}" fill="#111111"/>
    </g>
  </svg>`;
  await writeFile(path.join(qrDir, `${seed.publishedSlug}-qr-800.png`), await sharp(Buffer.from(qrSvg)).png().toBuffer());
}

const manifest = {
  schema: 'oneboss.poster-export.demo.v1',
  generatedAt: createdAt,
  note: '演示物料：二维码指向本机演示路径；正式交付必须换成 A 组已验证的公开 HTTPS 地址并重新扫码。',
  counts: { posters: items.length, projects: projectSeeds.length },
  failures,
  items,
};
await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\n导出完成：${items.length} 张海报，${failures} 个失败；manifest: public/output/manifest.json`);
if (failures > 0) process.exitCode = 1;
