export type PosterLayout = 'editorial-premium' | 'future-grid' | 'bold-editorial';
export type QrRequested = 'auto' | 'bottom-right' | 'bottom-left';
export type QrPlacement = 'bottom-right' | 'bottom-left';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PosterGeometry {
  width: number;
  height: number;
  margin: number;
  /** 标题可用区域（左上） */
  headline: Rect;
  /** 副标题区域 */
  subhead: Rect;
  /** 概念图形绘制区域 */
  art: Rect;
  /** 价格信息块 */
  price: Rect;
  /** 二维码卡片（含引导语）在左右两侧的候选区域 */
  qrCandidates: Record<QrPlacement, Rect>;
  footer: Rect;
  tags: Rect;
}

const QR_PORTRAIT = { width: 244, height: 300 };
const QR_SQUARE = { width: 220, height: 270 };

/**
 * 每个版式都预留了右侧与左侧两个二维码安全卡位。
 * 先尝试右下，与主图 / 价格 / 标题冲突时才移到左下；
 * 两侧都冲突时返回重叠面积较小的一侧，并在 PosterSpec 中写 warning。
 */
export function posterGeometry(layout: PosterLayout, height: 1080 | 1350): PosterGeometry {
  const width = 1080;
  const margin = height === 1080 ? 64 : 72;
  const square = height === 1080;
  const qr = square ? QR_SQUARE : QR_PORTRAIT;
  const qrRight: Rect = { x: width - margin - qr.width, y: height - margin - qr.height, ...qr };
  const qrLeft: Rect = { x: margin, y: height - margin - qr.height, ...qr };

  if (layout === 'editorial-premium') {
    return {
      width,
      height,
      margin,
      headline: square ? { x: 72, y: 176, width: 900, height: 170 } : { x: 72, y: 188, width: 880, height: 210 },
      subhead: square ? { x: 72, y: 358, width: 760, height: 42 } : { x: 72, y: 410, width: 760, height: 46 },
      art: square ? { x: 72, y: 458, width: 540, height: 312 } : { x: 72, y: 520, width: 560, height: 490 },
      price: square ? { x: 660, y: 428, width: 348, height: 132 } : { x: 700, y: 600, width: 308, height: 160 },
      qrCandidates: { 'bottom-right': qrRight, 'bottom-left': qrLeft },
      footer: square ? { x: 72, y: 1020, width: 420, height: 26 } : { x: 72, y: 1288, width: 560, height: 26 },
      tags: square ? { x: 72, y: 408, width: 900, height: 32 } : { x: 72, y: 462, width: 900, height: 34 },
    };
  }

  if (layout === 'future-grid') {
    return {
      width,
      height,
      margin,
      headline: square ? { x: 72, y: 196, width: 920, height: 160 } : { x: 72, y: 214, width: 920, height: 190 },
      subhead: square ? { x: 72, y: 364, width: 820, height: 42 } : { x: 72, y: 412, width: 820, height: 46 },
      art: square ? { x: 72, y: 460, width: 620, height: 340 } : { x: 72, y: 540, width: 936, height: 420 },
      price: square ? { x: 72, y: 848, width: 380, height: 104 } : { x: 72, y: 1046, width: 400, height: 112 },
      qrCandidates: { 'bottom-right': qrRight, 'bottom-left': qrLeft },
      footer: square ? { x: 72, y: 1016, width: 420, height: 26 } : { x: 72, y: 1288, width: 460, height: 26 },
      tags: square ? { x: 72, y: 414, width: 900, height: 30 } : { x: 72, y: 466, width: 900, height: 32 },
    };
  }

  // bold-editorial：价格压在右下，二维码通常需要自动移到左下
  return {
    width,
    height,
    margin,
    headline: square ? { x: 72, y: 164, width: 800, height: 186 } : { x: 72, y: 196, width: 760, height: 240 },
    subhead: square ? { x: 72, y: 356, width: 800, height: 42 } : { x: 72, y: 446, width: 780, height: 46 },
    art: square ? { x: 340, y: 460, width: 660, height: 270 } : { x: 340, y: 550, width: 660, height: 420 },
    price: square ? { x: 72, y: 800, width: 380, height: 112 } : { x: 600, y: 1092, width: 408, height: 164 },
    qrCandidates: { 'bottom-right': qrRight, 'bottom-left': qrLeft },
    footer: square ? { x: 72, y: 1024, width: 360, height: 24 } : { x: 340, y: 1312, width: 740, height: 24 },
    tags: square ? { x: 72, y: 406, width: 900, height: 34 } : { x: 72, y: 500, width: 900, height: 36 },
  };
}

export function rectsOverlap(a: Rect, b: Rect, padding = 0): number {
  const left = Math.max(a.x - padding, b.x - padding);
  const right = Math.min(a.x + a.width + padding, b.x + b.width + padding);
  const top = Math.max(a.y - padding, b.y - padding);
  const bottom = Math.min(a.y + a.height + padding, b.y + b.height + padding);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
}

export interface QrDecision {
  placement: QrPlacement;
  reason: string;
  conflicts: Record<QrPlacement, string[]>;
}

export function chooseQrPlacement(geometry: PosterGeometry, requested: QrRequested): QrDecision {
  const obstacles: { rect: Rect; label: string }[] = [
    { rect: geometry.art, label: '产品主视觉' },
    { rect: geometry.price, label: '价格信息' },
    { rect: geometry.headline, label: '标题' },
    { rect: geometry.subhead, label: '副标题' },
    { rect: geometry.footer, label: '页脚' },
  ];
  const conflicts: Record<QrPlacement, string[]> = { 'bottom-right': [], 'bottom-left': [] };
  (['bottom-right', 'bottom-left'] as QrPlacement[]).forEach((side) => {
    const card = geometry.qrCandidates[side];
    obstacles.forEach(({ rect, label }) => {
      if (rectsOverlap(card, rect, 8) > 0) conflicts[side].push(label);
    });
  });

  if (requested !== 'auto') {
    return { placement: requested, reason: `客户指定${requested === 'bottom-right' ? '右下' : '左下'}角`, conflicts };
  }
  if (conflicts['bottom-right'].length === 0) {
    return { placement: 'bottom-right', reason: '右下角安全区无冲突（默认位置）', conflicts };
  }
  if (conflicts['bottom-left'].length === 0) {
    return { placement: 'bottom-left', reason: `右下与${conflicts['bottom-right'].join('、')}冲突，自动移至左下`, conflicts };
  }
  const rightOverlap = obstacles.reduce((sum, item) => sum + rectsOverlap(geometry.qrCandidates['bottom-right'], item.rect, 8), 0);
  const leftOverlap = obstacles.reduce((sum, item) => sum + rectsOverlap(geometry.qrCandidates['bottom-left'], item.rect, 8), 0);
  const placement: QrPlacement = leftOverlap < rightOverlap ? 'bottom-left' : 'bottom-right';
  return {
    placement,
    reason: `两侧都有冲突，选择重叠更小的${placement === 'bottom-left' ? '左下' : '右下'}；建议设计师调整版式`,
    conflicts,
  };
}
