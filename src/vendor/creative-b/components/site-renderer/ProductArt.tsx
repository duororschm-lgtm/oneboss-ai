import type { Asset, Palette, StyleId } from '../../types/contracts';
import { conceptArt, type ArtMode } from '../../lib/creative/poster-renderer/art';

const modeFor = (styleId: StyleId): ArtMode =>
  styleId === 'future-tech' ? 'wire' : styleId === 'young-vibrant' ? 'flat' : 'wood';

export function ProductArt({
  asset,
  palette,
  styleId,
  className = '',
  label,
}: {
  asset?: Asset;
  palette: Palette;
  styleId: StyleId;
  className?: string;
  label?: string;
}) {
  const art = asset?.art ?? 'abstract';
  const alt = label ?? asset?.alt ?? '产品概念图形，非商家实拍';
  if (asset?.url) {
    return <img className={className} src={asset.url} alt={alt} loading="eager" />;
  }
  return (
    <svg
      className={className}
      viewBox="0 0 600 480"
      role="img"
      aria-label={alt}
      // 图形由受控枚举生成，不包含任何用户输入或脚本
      dangerouslySetInnerHTML={{ __html: conceptArt(art, modeFor(styleId), palette) }}
    />
  );
}
