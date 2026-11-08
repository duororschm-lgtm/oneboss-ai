import { fitText } from '../../vendor/creative-b/lib/creative/poster-renderer/svg';
import {
  posterGeometry,
  type PosterLayout,
} from '../../vendor/creative-b/lib/creative/poster-renderer/geometry';

/** Same font bounds and box as the final B renderer; never shorten the source. */
export function fitPosterSubhead(text: string, layout: PosterLayout, height: 1080 | 1350) {
  const box = posterGeometry(layout, height).subhead;
  const block = fitText(text, box.width, box.height, {
    max: layout === 'future-grid' ? 27 : 30,
    min: layout === 'editorial-premium' ? 22 : layout === 'future-grid' ? 20 : 21,
    maxLines: 2,
  });
  const compact = (value: string) => value.replace(/\s/g, '');
  return {
    block,
    fits:
      compact(block.lines.join('')) === compact(text) &&
      block.lines.length * block.lineHeight <= box.height,
  };
}
