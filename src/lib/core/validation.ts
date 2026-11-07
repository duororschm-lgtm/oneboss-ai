import { type ProductionType, type FactType, type Brief, type DesignSystemType } from '../../contracts';
import type { z } from 'zod';
import { assert } from './errors';

/** Verify production site structure follows the approved blueprint section types in order. */
export function validateBlueprintAdherence(
  output: ProductionType,
  design: DesignSystemType,
) {
  const blueprint = design.siteBlueprint;
  if (!blueprint) return; // Legacy design without blueprint: no structural constraint.
  const rootPage = output.site.pages.find((p) => p.slug === '');
  if (!rootPage) return; // Root page validation is handled by validateProduction.
  const blueprintTypes = (blueprint.pages[0]?.sections ?? []).map((s) => s.type);
  const outputTypes = rootPage.sections.map((s) => s.type);
  // Every blueprint section type must appear in the production output (order can gain
  // sections but must not lose approved structure).
  const missing = blueprintTypes.filter((t) => !outputTypes.includes(t));
  assert(
    missing.length === 0,
    `BLUEPRINT_STRUCTURE_MISMATCH: missing section types ${missing.join(', ')}`,
  );
}

export function validateProduction(
  output: ProductionType,
  projectId: string,
  factVersion: number,
  approvedFacts: FactType[],
  assetIds: string[],
  maxPosters: number,
  requested?: z.infer<typeof Brief>['deliverables'],
) {
  assert(approvedFacts.length > 0, 'APPROVED_FACTS_REQUIRED');
  assert(
    output.site.interactions.some((x) => ['carousel', 'tabs', 'accordion'].includes(x)),
    'REAL_INTERACTION_REQUIRED',
  );
  assert(
    new Set(output.posters.map((x) => x.copyPackRef)).size === output.posters.length,
    'DUPLICATE_POSTER_COPY',
  );
  assert(
    output.site.projectId === projectId && output.site.factVersion === factVersion,
    'STALE_OR_FOREIGN_SITE',
  );
  assert(
    output.posters.length <= maxPosters && output.copy.length === output.posters.length,
    'POSTER_PLAN_LIMIT',
  );
  if (requested) {
    assert(output.posters.length === requested.posterCount, 'POSTER_COUNT_MISMATCH');
    if (requested.posterFormats)
      assert(
        output.posters.every(
          (poster, index) =>
            poster.canvas.width === 1080 &&
            poster.canvas.height === (requested.posterFormats![index] === 'square' ? 1080 : 1350),
        ),
        'POSTER_FORMAT_MISMATCH',
      );
  }
  const factIds = new Set(approvedFacts.filter((x) => x.verified).map((x) => x.id)),
    assets = new Set(assetIds);
  const checkFacts = (ids: string[]) =>
    assert(
      ids.every((x) => factIds.has(x)),
      'UNAPPROVED_FACT',
    );
  const checkAssets = (ids: string[]) =>
    assert(
      ids.every((x) => assets.has(x)),
      'UNAUTHORIZED_ASSET',
    );
  const slugs = output.site.pages.map((x) => x.slug);
  assert(new Set(slugs).size === slugs.length && slugs.includes(''), 'INVALID_SITE_PAGES');
  const productIds = new Set(
    approvedFacts.filter((fact) => fact.verified).map((fact) => fact.productId),
  );
  if (productIds.size > 1) {
    const catalogRefs = new Set(
      output.site.pages
        .find((page) => page.slug === '')!
        .sections.filter((section) => section.type === 'product-grid')
        .flatMap((section) => section.factRefs),
    );
    assert(
      [...productIds].every((productId) =>
        approvedFacts.some((fact) => fact.productId === productId && catalogRefs.has(fact.id)),
      ),
      'MULTIPRODUCT_CATALOG_REQUIRED',
    );
  }
  for (const page of output.site.pages)
    for (const section of page.sections) {
      checkFacts(section.factRefs);
      checkAssets(section.assetRefs);
      assert(output.site.allowedSectionTypes.includes(section.type), 'SECTION_NOT_ALLOWED');
    }
  const copyIds = new Set(output.copy.map((x) => x.id));
  assert(copyIds.size === output.copy.length, 'DUPLICATE_COPY');
  for (const poster of output.posters) {
    assert(
      poster.projectId === projectId && poster.factVersion === factVersion,
      'STALE_OR_FOREIGN_POSTER',
    );
    assert(
      poster.designSystemVersion === output.site.designSystemVersion,
      'DESIGN_VERSION_MISMATCH',
    );
    checkFacts(poster.productFactRefs);
    assert(
      poster.textRefs.every((x) => factIds.has(x) || copyIds.has(x)),
      'INVALID_TEXT_REF',
    );
    checkAssets(poster.assetRefs);
    for (const layer of poster.layers) {
      if (layer.factRef) checkFacts([layer.factRef]);
      if (layer.assetRef) checkAssets([layer.assetRef]);
    }
    assert(copyIds.has(poster.copyPackRef), 'COPY_MISSING');
  }
  for (const copy of output.copy) {
    assert(copy.factVersion === factVersion, 'STALE_COPY');
    checkFacts(copy.factRefs);
  }
}
