import { transaction, type Actor } from '../core/db';
import { project, entitlement, facts } from '../core/service';
import { assert } from '../core/errors';
import { Production, DesignSystem } from '../../contracts';
import { creative } from '../core/creative';
import { appOrigin } from '../security/network';
export async function posterPreview(actor: Actor, id: string, revision: number, index: number) {
  const context = await transaction(actor, async (tx) => {
    const p = await project(tx, actor, id);
    await entitlement(tx, p);
    const [version] =
      await tx`select body,fact_version from artifact_versions where project_id=${p.id} and revision=${revision}`;
    assert(version && version.fact_version === p.fact_version, 'STALE_REVISION', 409);
    const body = Production.parse(version.body),
      poster = body.posters[index];
    assert(poster, 'POSTER_NOT_FOUND', 404);
    const [design] =
      await tx`select body from design_systems where project_id=${p.id} and revision=${poster.designSystemVersion} and approved_at is not null`;
    assert(design, 'DESIGN_APPROVAL_REQUIRED');
    return {
      poster,
      design: DesignSystem.parse(design.body),
      facts: await facts(tx, p),
      assets:
        await tx`select id,storage_path,width,height from media_assets where project_id=${p.id} and license_status='customer_authorized'`,
      publicSiteUrl: `${appOrigin()}/p/${p.publish_slug}`,
    };
  });
  const renderer = await creative();
  assert(renderer.renderPosterPreview, 'B_PREVIEW_NOT_AVAILABLE', 503);
  const bytes = await renderer.renderPosterPreview(context);
  assert(bytes.byteLength <= 20 * 1024 * 1024, 'PNG_TOO_LARGE', 413);
  return bytes;
}
