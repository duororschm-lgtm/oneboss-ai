import sharp from 'sharp';
import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { designPresets } from '../src/data/design-presets';
import { projectSeedById } from '../src/data/projects';
import { buildPoster } from '../src/lib/creative/composer';
import { buildPosterSvg, fitText } from '../src/lib/creative/poster-renderer/svg';
import {
  chooseQrPlacement,
  posterGeometry,
  rectsOverlap,
  type PosterLayout,
  type QrRequested,
} from '../src/lib/creative/poster-renderer/geometry';
import type { StyleId } from '../src/types/contracts';

const qrUrl = 'https://demo.oneboss.local/p/one-living-chair';

function compose(seedId: string, styleId: StyleId, requested: QrRequested = 'auto') {
  return {
    seed: projectSeedById(seedId),
    design: designPresets[styleId],
    siteRevision: 1,
    posterRevision: 1,
    copyRevision: 1,
    qrUrl,
    qrSource: 'fixture-preview' as const,
    qrRequested: requested,
  };
}

const layouts: PosterLayout[] = ['editorial-premium', 'future-grid', 'bold-editorial'];

describe('海报版式与二维码安全区', () => {
  it('默认右下；右下与价格冲突时自动移到左下', () => {
    expect(chooseQrPlacement(posterGeometry('editorial-premium', 1350), 'auto').placement).toBe('bottom-right');
    expect(chooseQrPlacement(posterGeometry('future-grid', 1350), 'auto').placement).toBe('bottom-right');
    const boldPortrait = chooseQrPlacement(posterGeometry('bold-editorial', 1350), 'auto');
    expect(boldPortrait.placement).toBe('bottom-left');
    expect(boldPortrait.reason).toContain('价格');
  });

  it('客户强制指定位置时尊重指令，但仍报告冲突', () => {
    const forced = chooseQrPlacement(posterGeometry('bold-editorial', 1350), 'bottom-right');
    expect(forced.placement).toBe('bottom-right');
    expect(forced.conflicts['bottom-right']).toContain('价格信息');
  });

  it('所有自动选择的二维码卡位都没有与主图/价格/标题重叠', () => {
    for (const layout of layouts) {
      for (const height of [1350, 1080] as const) {
        const geometry = posterGeometry(layout, height);
        const decision = chooseQrPlacement(geometry, 'auto');
        const card = geometry.qrCandidates[decision.placement];
        const obstacles = [geometry.art, geometry.price, geometry.headline, geometry.subhead, geometry.footer];
        obstacles.forEach((rect) => expect(rectsOverlap(card, rect, 8)).toBe(0));
        expect(card.y + card.height).toBeLessThanOrEqual(height);
        expect(card.x + card.width).toBeLessThanOrEqual(1080);
      }
    }
  });

  it('竖版与方版是两套独立排版，二维码位置与比例不同', () => {
    const portrait = posterGeometry('bold-editorial', 1350);
    const square = posterGeometry('bold-editorial', 1080);
    expect(portrait.art.height).not.toBe(square.art.height);
    expect(portrait.price.width).not.toBe(square.price.width);
    const portraitQr = chooseQrPlacement(portrait, 'auto').placement;
    const squareQr = chooseQrPlacement(square, 'auto').placement;
    expect(portraitQr).not.toBe(squareQr);
  });

  it('较长标题会换行并完整保留，而不是静默截断', () => {
    const title = '把日常坐得更轻一点同时保留原木的触感与透明价格';
    const block = fitText(title, 880, 210, { max: 98, min: 42, maxLines: 3 });
    expect(block.lines.join('')).toBe(title);
    expect(block.fontSize).toBeGreaterThanOrEqual(42);
    expect(block.lines.length).toBeLessThanOrEqual(3);
  });

  it('SVG 包含尺寸、品牌、中文标题与二维码路径', () => {
    const input = compose('demo-chair-001', 'editorial-minimal');
    for (const height of [1350, 1080] as const) {
      const { spec } = buildPoster(input, height);
      const svg = buildPosterSvg(spec, input.design, input.seed);
      expect(svg).toContain(`width="1080" height="${height}"`);
      expect(svg).toContain('ONE LIVING');
      expect(svg).toContain('原木家用椅');
      expect(svg).toContain('shape-rendering="crispEdges"');
      expect(svg).toContain('扫码查看预览');
    }
  });

  it('用 Sharp 输出真实 PNG，并用 jsQR 从最终像素中扫出同一个网址', async () => {
    for (const height of [1350, 1080] as const) {
      const input = compose('demo-chair-001', 'editorial-minimal');
      const { spec } = buildPoster(input, height);
      const png = await sharp(Buffer.from(buildPosterSvg(spec, input.design, input.seed))).png({ compressionLevel: 9 }).toBuffer();
      const meta = await sharp(png).metadata();
      expect(meta.width).toBe(1080);
      expect(meta.height).toBe(height);
      expect(png.length).toBeGreaterThan(20_000);
      expect(meta.hasAlpha).toBe(true);

      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);
      expect(decoded?.data).toBe(qrUrl);

      // 中文标题区域应该有深色像素（证明文字真的画进了 PNG，而不是空白/图裂）
      const { spec: freshSpec } = buildPoster(input, height);
      const headline = posterGeometry(freshSpec.layout, height).headline;
      const stats = await sharp(png)
        .extract({ left: Math.round(headline.x), top: Math.round(headline.y), width: Math.round(headline.width), height: Math.round(headline.height) })
        .stats();
      expect(stats.channels[0].min).toBeLessThan(90);
      expect(stats.channels[0].mean).toBeLessThan(240);
    }
  }, 30_000);

  it('二维码卡片内保留白色静区', async () => {
    const input = compose('demo-car-002', 'future-tech');
    const { spec } = buildPoster(input, 1350);
    const geometry = posterGeometry(spec.layout, spec.canvas.height);
    const card = geometry.qrCandidates[spec.qr.placement];
    const png = await sharp(Buffer.from(buildPosterSvg(spec, input.design, input.seed))).png().toBuffer();
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixelAt = (x: number, y: number) => {
      const offset = (y * info.width + x) * 4;
      return [data[offset], data[offset + 1], data[offset + 2]];
    };
    const corner = pixelAt(Math.round(card.x + 12), Math.round(card.y + 40));
    corner.forEach((channel) => expect(channel).toBeGreaterThan(245));
  }, 20_000);
});


