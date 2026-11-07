import { database, transaction, type Actor } from '../core/db';
import { project, entitlement, facts, idempotent } from '../core/service';
import { assert } from '../core/errors';
import { Production, DesignSystem } from '../../contracts';
import { validateProduction } from '../core/validation';
import { creative } from '../core/creative';
import { appOrigin, verifyPublicUrl } from '../security/network';
import { signed } from '../core/storage';
import { verifyPublishedBrowser } from './browser';
export async function approveArtifact(
  actor: Actor,
  projectId: string,
  revision: number,
  key: string,
) {
  // Render/semantic QA outside write transaction, then recheck version under lock.
  const context = await transaction(actor, async (tx) => {
    const p = await project(tx, actor, projectId);
    await entitlement(tx, p);
    const [v] =
      await tx`select * from artifact_versions where project_id=${p.id} and revision=${revision}`;
    assert(v && v.fact_version === p.fact_version, 'STALE_REVISION', 409);
    const fs = await facts(tx, p),
      assets =
        await tx`select id,storage_path from media_assets where project_id=${p.id} and license_status='customer_authorized'`;
    const [d] =
      await tx`select body from design_systems where project_id=${p.id} and approved_at is not null order by revision desc limit 1`;
    assert(d, 'DESIGN_APPROVAL_REQUIRED');
    const body = Production.parse(v.body);
    validateProduction(
      body,
      p.id,
      p.fact_version,
      fs,
      assets.map((x) => x.id),
      100,
    );
    assert(body.site.designSystemVersion === d.body.version, 'DESIGN_VERSION_MISMATCH');
    return { p, v, fs, assets, body, design: DesignSystem.parse(d.body) };
  });
  const qa = await (
    await creative()
  ).validateProduction({
    production: context.body,
    design: context.design,
    facts: context.fs,
    assets: context.assets,
  });
  assert(qa.pass && qa.issues.length === 0, 'CREATIVE_QA_FAILED', 409);
  return idempotent(
    actor,
    key,
    `approve:${projectId}`,
    { revision },
    context.p.org_id,
    async (tx) => {
      const p = await project(tx, actor, projectId);
      await entitlement(tx, p);
      assert(p.fact_version === context.v.fact_version, 'FACT_VERSION_CHANGED', 409);
      await tx`update artifact_versions set status='APPROVED',approved_by=${actor.userId} where id=${context.v.id}`;
      await tx`update projects set status='CLIENT_REVIEW' where id=${p.id}`;
      return { approved: true, revision };
    },
  );
}
export async function publishRevision(run: Record<string, any>) {
  const revision = run.input.revision as number;
  const previous: Record<string, any> = await database().begin(async (tx) => {
    const [lease] =
      await tx`select id from agent_runs where id=${run.id} and lease_token=${run.lease_token} and status='RUNNING' for update`;
    assert(lease, 'LEASE_LOST', 409);
    const [p] = await tx`select * from projects where id=${run.project_id} for update`;
    await entitlement(tx, p);
    const [v] =
      await tx`select * from artifact_versions where project_id=${p.id} and revision=${revision} and status in ('APPROVED','PUBLISHED') and approved_by is not null`;
    assert(v && v.fact_version === p.fact_version, 'APPROVAL_REQUIRED', 409);
    const url = `${appOrigin()}/p/${p.publish_slug}`;
    await tx`update projects set published_revision=${revision},published_verified=false,publication_token=${run.lease_token} where id=${p.id}`;
    return { ...p, url };
  });
  try {
    const html = await verifyPublicUrl(previous.url, `/p/${previous.publish_slug}`);
    assert(html.includes(`data-oneboss-revision="${revision}"`), 'PUBLIC_REVISION_MISMATCH', 502);
    const browserEvidence = await verifyPublishedBrowser(previous.publish_slug, revision);
    await database().begin(async (tx) => {
      const [p] = await tx`select * from projects where id=${run.project_id} for update`;
      await entitlement(tx, p);
      const [lease] =
        await tx`select id from agent_runs where id=${run.id} and lease_token=${run.lease_token} and status='RUNNING'`;
      assert(
        lease &&
          p.published_revision === revision &&
          p.publication_token === run.lease_token &&
          p.fact_version === run.input.factVersion,
        'PUBLICATION_CONFLICT',
        409,
      );
      await tx`update projects set published_verified=true,browser_verified_revision=${revision},status='PUBLISHED' where id=${p.id}`;
      await tx`update artifact_versions set status='PUBLISHED' where project_id=${p.id} and revision=${revision}`;
    });
    return { publicUrl: previous.url, revision, verified: true, browserEvidence };
  } catch (error) {
    await database()`update projects set published_revision=${previous.published_revision},published_verified=${previous.published_verified} where id=${run.project_id} and published_revision=${revision} and publication_token=${run.lease_token}`;
    throw error;
  }
}
export async function publicProject(slug: string) {
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) return null;
  const [p] =
    await database()`select p.id,p.published_revision from projects p join project_entitlements e on e.project_id=p.id where p.publish_slug=${slug} and not e.revoked and e.expires_at>now()`;
  if (!p?.published_revision) return null;
  const [v] =
    await database()`select body,fact_version from artifact_versions where project_id=${p.id} and revision=${p.published_revision} and status in ('APPROVED','PUBLISHED') and approved_by is not null`;
  if (!v) return null;
  const body = Production.parse(v.body);
  const refs = [...new Set(body.site.pages.flatMap((x) => x.sections.flatMap((s) => s.factRefs)))];
  const fs =
    await database()`select id,product_id as "productId",key,value,version,verified from product_facts where project_id=${p.id} and verified and id=any(${refs}::uuid[])`;
  const assetRefs = [
    ...new Set(body.site.pages.flatMap((x) => x.sections.flatMap((s) => s.assetRefs))),
  ];
  const assets =
    await database()`select id,storage_path,width,height from media_assets where project_id=${p.id} and id=any(${assetRefs}::uuid[]) and license_status='customer_authorized'`;
  const publicAssets = await Promise.all(
    assets.map(async (a) => ({
      id: a.id,
      width: a.width,
      height: a.height,
      url: await signed(a.storage_path),
    })),
  );
  const [d] =
    await database()`select body from design_systems where project_id=${p.id} and revision=${body.site.designSystemVersion} and approved_at is not null`;
  assert(d, 'DESIGN_MISSING', 503);
  return {
    site: body.site,
    design: DesignSystem.parse(d.body),
    facts: fs,
    assets: publicAssets,
    revision: p.published_revision,
  };
}

/** Authenticated preview never changes the public pointer or grants publication evidence. */
export async function previewProject(actor: Actor, projectId: string, revision: number) {
  const context = await transaction(actor, async (tx) => {
    const p = await project(tx, actor, projectId);
    await entitlement(tx, p);
    const [version] =
      await tx`select body,fact_version from artifact_versions where project_id=${p.id} and revision=${revision}`;
    assert(version && version.fact_version === p.fact_version, 'STALE_REVISION', 409);
    const body = Production.parse(version.body);
    const refs = [
      ...new Set(
        body.site.pages.flatMap((page) => page.sections.flatMap((section) => section.factRefs)),
      ),
    ];
    const assetRefs = [
      ...new Set(
        body.site.pages.flatMap((page) => page.sections.flatMap((section) => section.assetRefs)),
      ),
    ];
    const fs =
      await tx`select id,product_id as "productId",key,value,version,verified from product_facts where project_id=${p.id} and verified and version=${version.fact_version} and id=any(${refs}::uuid[])`;
    const assets =
      await tx`select id,storage_path,width,height from media_assets where project_id=${p.id} and id=any(${assetRefs}::uuid[]) and license_status='customer_authorized'`;
    const [design] =
      await tx`select body from design_systems where project_id=${p.id} and revision=${body.site.designSystemVersion} and approved_at is not null`;
    assert(design, 'DESIGN_MISSING', 503);
    return {
      site: body.site,
      design: DesignSystem.parse(design.body),
      facts: fs,
      assets,
      revision,
    };
  });
  return {
    ...context,
    assets: await Promise.all(
      context.assets.map(async (asset) => ({
        id: asset.id,
        width: asset.width,
        height: asset.height,
        url: await signed(asset.storage_path),
      })),
    ),
  };
}
