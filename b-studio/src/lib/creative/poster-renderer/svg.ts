import type { DesignSystem, Palette, PosterSpec, ProjectSeed } from '../../../types/contracts';
import { qrSvg } from '../qr';
import { conceptArt, type ArtKind, type ArtMode } from './art';
import { posterGeometry, type PosterGeometry } from './geometry';

// 注意：这些字符串会直接写进 SVG 的 font-family="..." 属性。
// 内部必须使用单引号，否则双引号会提前闭合属性，导致 librsvg / 浏览器解析失败。
const FONT_BODY = "'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC', sans-serif";
const FONT_SERIF = "Georgia, 'Songti SC', 'SimSun', 'Noto Serif SC', serif";
const FONT_MONO = "'Cascadia Mono', 'JetBrains Mono', Consolas, 'Microsoft YaHei', monospace";

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]!);

const isCjk = (char: string) => /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/.test(char);

export function measureText(text: string, fontSize: number, letterSpacing = 0): number {
  let width = 0;
  for (const char of text) {
    if (isCjk(char)) width += fontSize;
    else if (char === ' ') width += fontSize * 0.3;
    else if (/[A-Z0-9]/.test(char)) width += fontSize * 0.62;
    else width += fontSize * 0.52;
    width += letterSpacing;
  }
  return width;
}

export function wrapText(text: string, fontSize: number, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    const candidate = line + char;
    if (measureText(candidate, fontSize) > maxWidth && line) {
      lines.push(line.trimEnd());
      line = char === ' ' ? '' : char;
      if (lines.length === maxLines) return lines;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines.slice(0, maxLines);
}

interface TextBlock {
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

export function fitText(
  text: string,
  width: number,
  height: number,
  options: { max: number; min: number; maxLines: number; lineHeight?: number },
): TextBlock {
  const lineHeightFactor = options.lineHeight ?? 1.16;
  for (let fontSize = options.max; fontSize >= options.min; fontSize -= 2) {
    const lines = wrapText(text, fontSize, width, options.maxLines);
    const joined = lines.join('');
    const consumedAll = joined.length >= text.replace(/\s/g, '').length;
    const blockHeight = lines.length * fontSize * lineHeightFactor;
    if (consumedAll && blockHeight <= height) {
      return { lines, fontSize, lineHeight: fontSize * lineHeightFactor };
    }
  }
  const lines = wrapText(text, options.min, width, options.maxLines);
  return { lines, fontSize: options.min, lineHeight: options.min * lineHeightFactor };
}

function textBlock(
  block: TextBlock,
  x: number,
  top: number,
  attrs: { fill: string; family: string; weight?: number; letterSpacing?: number; anchor?: 'start' | 'middle' | 'end' },
): string {
  const baseline = top + block.fontSize * 0.84;
  const tspans = block.lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : block.lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
  const anchor = attrs.anchor ? ` text-anchor="${attrs.anchor}"` : '';
  return `<text x="${x}" y="${round(baseline)}" fill="${attrs.fill}" font-family="${attrs.family}" font-size="${round(block.fontSize)}" font-weight="${attrs.weight ?? 400}"${attrs.letterSpacing ? ` letter-spacing="${attrs.letterSpacing}"` : ''}${anchor}>${tspans}</text>`;
}

function singleLine(text: string, width: number, max: number, min: number): { text: string; size: number } {
  for (let size = max; size >= min; size -= 2) {
    if (measureText(text, size) <= width) return { text, size };
  }
  return { text, size: min };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function artModeFor(layout: PosterSpec['layout'], art: ArtKind): ArtMode {
  if (layout === 'future-grid') return 'wire';
  if (layout === 'bold-editorial') return 'flat';
  return art === 'car' ? 'flat' : 'wood';
}

function artPanel(
  geo: PosterGeometry,
  art: ArtKind,
  mode: ArtMode,
  palette: Palette,
  variant: 'editorial' | 'future' | 'bold',
): string {
  const box = geo.art;
  const pad = variant === 'bold' ? 26 : 12;
  const inner = { x: box.x + pad, y: box.y + pad, width: box.width - pad * 2, height: box.height - pad * 2 };
  const scale = Math.min(inner.width / 600, inner.height / 480);
  const tx = inner.x + (inner.width - 600 * scale) / 2;
  const ty = inner.y + (inner.height - 480 * scale) / 2;
  const panel =
    variant === 'future'
      ? `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="${palette.surface}" stroke="${palette.border}" stroke-width="1.5"/>
         <path d="M${box.x + 24} ${box.y} V${box.y + box.height} M${box.x + box.width - 24} ${box.y} V${box.y + box.height} M${box.x} ${box.y + 24} H${box.x + box.width} M${box.x} ${box.y + box.height - 24} H${box.x + box.width}" stroke="${palette.accent}" stroke-opacity=".16" stroke-width="1"/>`
      : variant === 'bold'
        ? `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="28" fill="${palette.surface}" stroke="${palette.text}" stroke-width="4"/>`
        : `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="${palette.surface}" stroke="${palette.border}" stroke-width="1.5"/>`;
  const labelX = box.x + 16;
  const labelY = box.y + box.height - 18;
  const label = `<text x="${labelX}" y="${labelY}" fill="${palette.muted}" font-family="${FONT_MONO}" font-size="17" letter-spacing="2">${escapeXml('概念图形 · 非实拍')}</text>`;
  return `${panel}<g transform="translate(${round(tx)} ${round(ty)}) scale(${round(scale, 4)})">${conceptArt(art, mode, palette)}</g>${label}`;
}

function qrCard(spec: PosterSpec, geo: PosterGeometry, palette: Palette, dark: boolean): string {
  const card = geo.qrCandidates[spec.qr.placement];
  const pad = 14;
  const captionHeight = 40;
  const qrSize = Math.min(card.width - pad * 2, card.height - pad * 2 - captionHeight);
  const qrX = card.x + pad;
  const qrY = card.y + pad;
  const captionY = card.y + card.height - 15;
  const caption = singleLine(spec.qr.caption, card.width - 16, 20, 12);
  const captionText = `<text x="${card.x + card.width / 2}" y="${captionY}" text-anchor="middle" fill="#1b1b1b" font-family="${FONT_BODY}" font-size="${caption.size}">${escapeXml(caption.text)}</text>`;
  const border = dark
    ? `<rect x="${card.x}" y="${card.y}" width="${card.width}" height="${card.height}" rx="10" fill="#ffffff" stroke="#111111" stroke-width="2"/>`
    : `<rect x="${card.x}" y="${card.y}" width="${card.width}" height="${card.height}" rx="10" fill="#ffffff" stroke="${palette.border}" stroke-width="1"/>`;
  return `${border}${qrSvg(spec.qr.url, qrX, qrY, qrSize, spec.qr.quietZoneModules)}${captionText}`;
}

function tagsRow(spec: PosterSpec, geo: PosterGeometry, palette: Palette, variant: 'editorial' | 'future' | 'bold'): string {
  const rect = geo.tags;
  if (spec.tags.length === 0) return '';
  let cursor = rect.x;
  const parts: string[] = [];
  spec.tags.forEach((tag, index) => {
    const fontSize = variant === 'bold' ? 22 : 18;
    const label = variant === 'future' ? `[ ${tag} ]` : `# ${tag}`;
    const width = measureText(label, fontSize) + (variant === 'bold' ? 30 : 6);
    if (cursor + width > rect.x + rect.width) return;
    if (variant === 'bold') {
      parts.push(
        `<g transform="translate(${round(cursor)} ${rect.y + (index % 2 === 0 ? 0 : 10)}) rotate(${index % 2 === 0 ? -3 : 2})">
          <rect width="${round(width)}" height="36" rx="18" fill="${palette.accent}"/>
          <text x="${round(width / 2)}" y="25" text-anchor="middle" fill="${palette.accentText}" font-family="${FONT_BODY}" font-size="${fontSize}" font-weight="700">${escapeXml(tag)}</text>
        </g>`,
      );
    } else if (variant === 'future') {
      parts.push(
        `<g transform="translate(${round(cursor)} ${rect.y})">
          <rect width="${round(width)}" height="30" fill="none" stroke="${palette.accent}" stroke-opacity=".5"/>
          <text x="${round(width / 2)}" y="21" text-anchor="middle" fill="${palette.accent}" font-family="${FONT_MONO}" font-size="${fontSize}">${escapeXml(tag)}</text>
        </g>`,
      );
    } else {
      parts.push(
        `<text x="${round(cursor)}" y="${rect.y + 22}" fill="${palette.muted}" font-family="${FONT_MONO}" font-size="${fontSize}" letter-spacing="1">${escapeXml(label)}</text>`,
      );
    }
    cursor += width + 18;
  });
  return parts.join('');
}

function priceBlock(spec: PosterSpec, geo: PosterGeometry, palette: Palette, variant: 'editorial' | 'future' | 'bold'): string {
  const box = geo.price;
  const labelSize = variant === 'future' ? 18 : 17;
  const priceFamily = variant === 'editorial' ? FONT_SERIF : FONT_MONO;
  const price = singleLine(spec.price, box.width, variant === 'bold' ? 50 : 56, 26);
  const label = singleLine(spec.priceLabel, box.width, labelSize, 13);
  if (variant === 'bold') {
    const pillHeight = 74;
    const pillWidth = Math.min(box.width, measureText(price.text, price.size) + 56);
    return `<text x="${box.x}" y="${box.y}" fill="${palette.text}" font-family="${FONT_BODY}" font-size="${label.size}" font-weight="700" letter-spacing="2">${escapeXml(label.text)}</text>
      <g transform="translate(${box.x} ${box.y + 34})">
        <rect width="${round(pillWidth)}" height="${pillHeight}" rx="${pillHeight / 2}" fill="${palette.text}"/>
        <text x="${round(pillWidth / 2)}" y="${round(pillHeight / 2 + price.size * 0.34)}" text-anchor="middle" fill="${palette.background}" font-family="${FONT_MONO}" font-size="${price.size}" font-weight="700">${escapeXml(price.text)}</text>
      </g>`;
  }
  const accentLine =
    variant === 'future'
      ? `<path d="M${box.x} ${box.y - 22} H${box.x + box.width}" stroke="${palette.accent}" stroke-opacity=".5"/>`
      : `<path d="M${box.x} ${box.y - 16} H${box.x + 64}" stroke="${palette.accent}" stroke-width="4"/>`;
  return `${accentLine}
    <text x="${box.x}" y="${box.y + 18}" fill="${palette.muted}" font-family="${FONT_BODY}" font-size="${label.size}" letter-spacing="3">${escapeXml(label.text)}</text>
    <text x="${box.x}" y="${box.y + 52 + price.size * 0.78}" fill="${variant === 'future' ? palette.accent : palette.text}" font-family="${priceFamily}" font-size="${price.size}" font-weight="700">${escapeXml(price.text)}</text>`;
}

function brandRow(spec: PosterSpec, geo: PosterGeometry, palette: Palette, variant: 'editorial' | 'future' | 'bold'): string {
  const y = geo.margin + 16;
  const brandFamily = variant === 'editorial' ? FONT_SERIF : FONT_MONO;
  const index = variant === 'editorial' ? 'PRODUCT 01' : variant === 'future' ? 'OBJECT / 01' : 'NEW DROP 01';
  const right = `${index} · FACT V${spec.factVersion}`;
  const rule =
    variant === 'future'
      ? `<path d="M${geo.margin} ${y + 26} H${geo.width - geo.margin}" stroke="${palette.accent}" stroke-opacity=".35"/>`
      : `<path d="M${geo.margin} ${y + 22} H${geo.width - geo.margin}" stroke="${palette.border}" stroke-width="1.5"/>`;
  return `${rule}
    <text x="${geo.margin}" y="${y}" fill="${palette.text}" font-family="${brandFamily}" font-size="24" font-weight="700" letter-spacing="6">${escapeXml(spec.brand.toUpperCase())}</text>
    <text x="${geo.width - geo.margin}" y="${y}" text-anchor="end" fill="${palette.muted}" font-family="${FONT_MONO}" font-size="16" letter-spacing="2">${escapeXml(right)}</text>`;
}

function footerRow(spec: PosterSpec, geo: PosterGeometry, palette: Palette, variant: 'editorial' | 'future' | 'bold'): string {
  const rect = geo.footer;
  const note = spec.qr.urlSource === 'published-site' ? '演示发布链接 · 交付前需 A 组核验' : '演示物料 · 未正式发布';
  const line = `${note} · FACT V${spec.factVersion}`;
  const color = variant === 'editorial' ? palette.muted : variant === 'future' ? palette.muted : palette.text;
  return `<text x="${rect.x}" y="${rect.y + 18}" fill="${color}" font-family="${FONT_MONO}" font-size="16" letter-spacing="1">${escapeXml(line)}</text>`;
}

function editorialBody(spec: PosterSpec, geo: PosterGeometry, palette: Palette, art: ArtKind): string {
  const headline = fitText(spec.headline, geo.headline.width, geo.headline.height, { max: 98, min: 42, maxLines: 3 });
  const subhead = fitText(spec.subhead, geo.subhead.width, geo.subhead.height, { max: 30, min: 22, maxLines: 2 });
  return `
    ${brandRow(spec, geo, palette, 'editorial')}
    ${textBlock(headline, geo.headline.x, geo.headline.y, { fill: palette.text, family: FONT_SERIF, weight: 700 })}
    ${textBlock(subhead, geo.subhead.x, geo.subhead.y, { fill: palette.muted, family: FONT_BODY })}
    ${tagsRow(spec, geo, palette, 'editorial')}
    ${artPanel(geo, art, artModeFor(spec.layout, art), palette, 'editorial')}
    ${priceBlock(spec, geo, palette, 'editorial')}
    ${qrCard(spec, geo, palette, false)}
    ${footerRow(spec, geo, palette, 'editorial')}`;
}

function futureBody(spec: PosterSpec, geo: PosterGeometry, palette: Palette, art: ArtKind): string {
  const headline = fitText(spec.headline, geo.headline.width, geo.headline.height, { max: 92, min: 42, maxLines: 3 });
  const subhead = fitText(spec.subhead, geo.subhead.width, geo.subhead.height, { max: 27, min: 20, maxLines: 2 });
  const grid: string[] = [];
  for (let x = geo.margin; x <= geo.width - geo.margin; x += 84) {
    grid.push(`<path d="M${x} 0 V${geo.height}" stroke="${palette.accent}" stroke-opacity=".055"/>`);
  }
  for (let y = geo.margin; y <= geo.height - geo.margin; y += 84) {
    grid.push(`<path d="M0 ${y} H${geo.width}" stroke="${palette.accent}" stroke-opacity=".045"/>`);
  }
  const corner = 38;
  return `
    ${grid.join('')}
    <path d="M${corner} ${corner + 34} V${corner} H${corner + 34} M${geo.width - corner - 34} ${corner} H${geo.width - corner} V${corner + 34}" stroke="${palette.accent}" stroke-width="2" fill="none"/>
    ${brandRow(spec, geo, palette, 'future')}
    ${textBlock(headline, geo.headline.x, geo.headline.y, { fill: palette.text, family: FONT_MONO, weight: 700 })}
    ${textBlock(subhead, geo.subhead.x, geo.subhead.y, { fill: palette.muted, family: FONT_BODY })}
    ${tagsRow(spec, geo, palette, 'future')}
    ${artPanel(geo, art, artModeFor(spec.layout, art), palette, 'future')}
    ${priceBlock(spec, geo, palette, 'future')}
    ${qrCard(spec, geo, palette, true)}
    ${footerRow(spec, geo, palette, 'future')}`;
}

function boldBody(spec: PosterSpec, geo: PosterGeometry, palette: Palette, art: ArtKind): string {
  const headline = fitText(spec.headline, geo.headline.width, geo.headline.height, { max: 104, min: 44, maxLines: 3 });
  const subhead = fitText(spec.subhead, geo.subhead.width, geo.subhead.height, { max: 30, min: 21, maxLines: 2 });
  const baselineStart = geo.headline.y + headline.fontSize * 0.84;
  const tspans = headline.lines
    .map(
      (line, index) =>
        `<tspan x="${geo.headline.x}" dy="${index === 0 ? 0 : headline.lineHeight}" fill="${index === 0 ? palette.text : palette.accent}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  return `
    <g transform="rotate(-4 ${geo.width - 180} 240)"><rect x="${geo.width - 420}" y="60" width="420" height="${geo.height * 0.52}" fill="${palette.accent}" opacity=".18"/></g>
    <path d="M0 0 H${geo.width}" stroke="${palette.text}" stroke-width="14"/>
    <path d="M0 ${geo.height - 8} H${geo.width}" stroke="${palette.text}" stroke-width="14"/>
    ${brandRow(spec, geo, palette, 'bold')}
    <text x="${geo.headline.x}" y="${round(baselineStart)}" font-family="${FONT_SERIF}" font-size="${round(headline.fontSize)}" font-weight="800" letter-spacing="-1">${tspans}</text>
    ${textBlock(subhead, geo.subhead.x, geo.subhead.y, { fill: palette.muted, family: FONT_BODY })}
    ${tagsRow(spec, geo, palette, 'bold')}
    ${artPanel(geo, art, artModeFor(spec.layout, art), palette, 'bold')}
    ${priceBlock(spec, geo, palette, 'bold')}
    ${qrCard(spec, geo, palette, true)}
    ${footerRow(spec, geo, palette, 'bold')}`;
}

export function buildPosterSvg(spec: PosterSpec, design: DesignSystem, seed: ProjectSeed): string {
  const geo = posterGeometry(spec.layout, spec.canvas.height as 1080 | 1350);
  const palette = design.palette;
  const asset = seed.assets.find((item) => item.id === spec.assetRef);
  const art: ArtKind = asset?.art ?? 'abstract';
  const background =
    spec.layout === 'future-grid'
      ? `<rect width="1080" height="${spec.canvas.height}" fill="${palette.background}"/>`
      : spec.layout === 'bold-editorial'
        ? `<rect width="1080" height="${spec.canvas.height}" fill="${palette.background}"/><circle cx="930" cy="${spec.canvas.height * 0.22}" r="230" fill="${palette.surface}" opacity=".55"/>`
        : `<rect width="1080" height="${spec.canvas.height}" fill="${palette.background}"/><rect x="0" y="0" width="14" height="${spec.canvas.height}" fill="${palette.accent}"/>`;
  const body =
    spec.layout === 'editorial-premium'
      ? editorialBody(spec, geo, palette, art)
      : spec.layout === 'future-grid'
        ? futureBody(spec, geo, palette, art)
        : boldBody(spec, geo, palette, art);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${spec.canvas.height}" viewBox="0 0 1080 ${spec.canvas.height}">
    ${background}
    ${body}
  </svg>`;
}

export function buildPosterDataUrl(spec: PosterSpec, design: DesignSystem, seed: ProjectSeed): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildPosterSvg(spec, design, seed))}`;
}

export const posterFonts = { body: FONT_BODY, serif: FONT_SERIF, mono: FONT_MONO };


