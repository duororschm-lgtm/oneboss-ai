import type { z } from 'zod';
import type { DesignSystem, Fact, Site, SiteBlueprintType } from '../../contracts';
import { SectionTypes, type SectionLayoutType } from '../../contracts';
import { mapDirectionSite } from '../creative/b-mapping';

export type PreviewAsset = { id: string; url?: string };

const keyOf = (key: string) => key.replace(/^product\./, '');

/**
 * Resolve blueprint semantic references into real fact/asset IDs.
 * factKeys map to verified fact keys; assetRoles are assigned from the
 * authorized asset list in declaration order (hero, gallery-1, detail, ...).
 * Model output never supplies database UUIDs.
 */
function resolveBlueprint(
  blueprint: SiteBlueprintType,
  facts: z.infer<typeof Fact>[],
  factVersion: number,
  assets: PreviewAsset[],
) {
  const verified = facts.filter((f) => f.verified && f.version === factVersion);
  const byKey = new Map(verified.map((f) => [keyOf(f.key), f] as const));
  const allowed = new Set<string>();
  let assetCursor = 0;
  const pages = blueprint.pages.map((page) => ({
    slug: page.slug,
    title: page.title,
    sections: page.sections.map((section) => {
      allowed.add(section.type);
      const factRefs = (section.factKeys ?? [])
        .map((key) => byKey.get(key)?.id)
        .filter((id): id is string => Boolean(id));
      const assetRefs: string[] = [];
      for (const _role of section.assetRoles ?? []) {
        const asset = assets[assetCursor++];
        if (asset) assetRefs.push(asset.id);
      }
      return {
        type: section.type,
        props: { ...section.layout } as SectionLayoutType,
        factRefs,
        assetRefs,
      };
    }),
  }));
  return { pages, allowed: [...allowed] };
}

function buildSite(
  projectId: string,
  factVersion: number,
  design: z.infer<typeof DesignSystem>,
  pages: { slug: string; title: string; sections: { type: (typeof SectionTypes)[number]; props: SectionLayoutType; factRefs: string[]; assetRefs: string[] }[] }[],
  allowed: string[],
): Site {
  const firstTitle = pages[0]?.title ?? '设计方向示意';
  return {
    schemaVersion: '1.0',
    projectId,
    revision: 1,
    designSystemVersion: design.version,
    pages,
    allowedSectionTypes: allowed as (typeof SectionTypes)[number][],
    interactions: ['tabs'],
    seo: {
      title: firstTitle,
      description: '基于本方案页面构图的方向示意，使用已确认资料，非正式成品。',
    },
    factVersion,
  };
}

/** Legacy fallback for designs that predate Site Blueprint (fixed hero + specs). */
function legacyPreview(
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

/**
 * Build a real direction preview from the design's own Site Blueprint.
 * Each direction renders its own page structure, section order and layout —
 * not a shared fixed hero + specs skeleton.
 */
export function directionPreview(
  projectId: string,
  factVersion: number,
  design: z.infer<typeof DesignSystem>,
  facts: z.infer<typeof Fact>[],
  assets: PreviewAsset[] = [],
) {
  const blueprint = design.siteBlueprint;
  if (!blueprint) return legacyPreview(projectId, factVersion, design, facts);
  const { pages, allowed } = resolveBlueprint(blueprint, facts, factVersion, assets);
  const site = buildSite(projectId, factVersion, design, pages, allowed);
  return mapDirectionSite({ site, design, facts, assets });
}
