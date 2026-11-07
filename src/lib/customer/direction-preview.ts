import type { z } from 'zod';
import type { DesignSystem, Fact, Site } from '../../contracts';
import { mapDirectionSite } from '../creative/b-mapping';
export function directionPreview(
  projectId: string,
  factVersion: number,
  design: z.infer<typeof DesignSystem>,
  facts: z.infer<typeof Fact>[],
) {
  const refs = facts.filter((f) => f.verified && f.version === factVersion).map((f) => f.id);
  const site: Site = {
    schemaVersion: '1.0',
    projectId,
    revision: 1,
    designSystemVersion: design.version,
    pages: [
      {
        slug: '',
        title: '设计方向示意',
        sections: [
          { type: 'hero', props: {}, factRefs: refs, assetRefs: [] },
          { type: 'specs', props: {}, factRefs: refs, assetRefs: [] },
        ],
      },
    ],
    allowedSectionTypes: ['hero', 'specs'],
    interactions: ['tabs'],
    seo: { title: '设计方向示意', description: '使用已确认事实的方向示意，非正式成品。' },
    factVersion,
  };
  return mapDirectionSite({ site, design, facts, assets: [] });
}
