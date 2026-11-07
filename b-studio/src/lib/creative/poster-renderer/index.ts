import type { DesignSystem, PosterSpec, ProjectSeed } from '../../../types/contracts';
import { qrSvg } from '../qr';
import { buildPosterSvg } from './svg';
import { posterFilename } from './filename';

export interface RenderedPoster {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
  distinctColors: number;
  valid: boolean;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'sync';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('SVG 光栅化失败：浏览器未能载入海报矢量图'));
    image.src = src;
  });
}

async function svgToPng(svg: string, width: number, height: number): Promise<RenderedPoster> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建 2D 画布，当前浏览器不支持 PNG 导出');
    context.drawImage(image, 0, 0, width, height);

    const pixels = context.getImageData(0, 0, width, height).data;
    const colors = new Set<number>();
    const stepX = Math.max(1, Math.floor(width / 72));
    const stepY = Math.max(1, Math.floor(height / 90));
    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        const offset = (y * width + x) * 4;
        colors.add((pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]);
      }
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('PNG 编码失败'))), 'image/png');
    });
    return {
      blob,
      width,
      height,
      bytes: blob.size,
      distinctColors: colors.size,
      valid: blob.size > 20_000 && colors.size >= 4,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function renderPosterPng(spec: PosterSpec, design: DesignSystem, seed: ProjectSeed): Promise<RenderedPoster> {
  return svgToPng(buildPosterSvg(spec, design, seed), spec.canvas.width, spec.canvas.height);
}

export async function renderQrPng(url: string, size = 800): Promise<RenderedPoster> {
  const quiet = Math.round(size * 0.03);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#ffffff"/>
    ${qrSvg(url, quiet, quiet, size - quiet * 2, 4)}
  </svg>`;
  return svgToPng(svg, size, size);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}

export function downloadText(text: string, filename: string, type = 'text/markdown;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type }), filename);
}

export function posterFileName(spec: PosterSpec, seed: ProjectSeed): string {
  return `${seed.publishedSlug}-${spec.styleId}-${spec.canvas.width}x${spec.canvas.height}.png`;
}

