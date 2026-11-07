import qrcodeCore from 'qrcode/lib/core/qrcode';

export interface QrMatrix {
  /** 模块数（不含静区） */
  size: number;
  /** 行优先的模块矩阵，1 表示深色 */
  data: Uint8Array;
  quietZone: number;
}

/**
 * 生成二维码模块矩阵。这里只输出纯数据，浏览器与 Node 共用同一套排版：
 * 不把外部图片地址塞进海报 SVG，因此离线也能导出、也不会出现跨域污染画布。
 */
export function createQrMatrix(url: string, quietZone = 4): QrMatrix {
  const qr = qrcodeCore.create(url, { errorCorrectionLevel: 'H' });
  const size = qr.modules.size;
  const data = qr.modules.data as unknown as Uint8Array;
  return { size, data, quietZone };
}

/**
 * 把深色模块合并成水平游程，输出单个 path 的 d 属性。
 * 坐标单位为模块，调用方通过 transform 缩放到目标像素。
 */
export function qrPathData(matrix: QrMatrix): string {
  const { size, data, quietZone } = matrix;
  const parts: string[] = [];
  for (let row = 0; row < size; row += 1) {
    let runStart = -1;
    for (let col = 0; col <= size; col += 1) {
      const dark = col < size && data[row * size + col] === 1;
      if (dark && runStart < 0) runStart = col;
      if (!dark && runStart >= 0) {
        const x = runStart + quietZone;
        const y = row + quietZone;
        parts.push(`M${x} ${y}h${col - runStart}v1h-${col - runStart}z`);
        runStart = -1;
      }
    }
  }
  return parts.join('');
}

export function qrSvg(url: string, x: number, y: number, sizePx: number, quietZone = 4): string {
  const matrix = createQrMatrix(url, quietZone);
  const total = matrix.size + quietZone * 2;
  const scale = sizePx / total;
  return `<g transform="translate(${round(x)} ${round(y)}) scale(${round(scale, 4)})" shape-rendering="crispEdges"><path d="${qrPathData(matrix)}" fill="#111111"/></g>`;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
