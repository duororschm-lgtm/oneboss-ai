import type { ProjectSeed, StyleId } from '../../../types/contracts';

/** 海报文件的唯一命名规则：网站 slug + 设计方向 + 尺寸，浏览器与 Node 导出共用。 */
export function posterFilename(seed: ProjectSeed, styleId: StyleId, height: 1080 | 1350): string {
  return `${seed.publishedSlug}-${styleId}-1080x${height}.png`;
}
