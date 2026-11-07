import { database, transaction, type Actor } from '../core/db';
import { project, entitlement, facts, idempotent, platformAdmin } from '../core/service';
import { recordAudit } from '../core/audit';
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
async function publicationStage(run: Record<string, any>, stage: string) {
  const rows =
    await database()`update agent_runs set stage=${stage} where id=${run.id} and lease_token=${run.lease_token} and status='RUNNING' and lease_until>now() returning id`;
  assert(rows.length, 'LEASE_LOST', 409);
}
export async function publishRevision(run: Record<string, any>) {
  const revision = run.input.revision as number;
  const previous: Record<string, any> = await database().begin(async (tx) => {
    const [lease] =
      await tx`select id from agent_runs where id=${run.id} and lease_token=${run.lease_token} and status='RUNNING' and lease_until>now() for update`;
    assert(lease, 'LEASE_LOST', 409);
    const [p] = await tx`select * from projects where id=${run.project_id} for update`;
    await entitlement(tx, p);
    const [v] =
      await tx`select * from artifact_versions where project_id=${p.id} and revision=${revision} and status in ('APPROVED','PUBLISHED') and approved_by is not null`;
    assert(v && v.fact_version === p.fact_version, 'APPROVAL_REQUIRED', 409);
    const url = `${appOrigin()}/p/${p.publish_slug}`;
    assert(p.fact_version === run.input.factVersion, 'FACT_VERSION_CHANGED', 409);
    // Keep the last verified public pointer intact. A fenced request header exposes
    // this approved candidate only to the publication verifier, never normal visitors.
    await tx`update projects set publication_token=${run.lease_token} where id=${p.id}`;
    return { ...p, url };
  });
  try {
    await publicationStage(run, 'publish-http');
    const html = await verifyPublicUrl(previous.url, `/p/${previous.publish_slug}`, {
      publicationToken: run.lease_token,
    });
    assert(html.includes(`data-oneboss-revision="${revision}"`), 'PUBLIC_REVISION_MISMATCH', 502);
    const browserEvidence = await verifyPublishedBrowser(previous.publish_slug, revision, {
      publicationToken: run.lease_token,
      onStage: (stage) => publicationStage(run, stage),
    });
    await publicationStage(run, 'publish-commit');
    await database().begin(async (tx) => {
      const [lease] =
        await tx`select id from agent_runs where id=${run.id} and lease_token=${run.lease_token} and status='RUNNING' and lease_until>now() for update`;
      const [p] = await tx`select * from projects where id=${run.project_id} for update`;
      await entitlement(tx, p);
      const [approved] =
        await tx`select id from artifact_versions where project_id=${p.id} and revision=${revision} and fact_version=${p.fact_version} and status in ('APPROVED','PUBLISHED') and approved_by is not null`;
      assert(
        lease &&
          approved &&
          p.publication_token === run.lease_token &&
          p.fact_version === run.input.factVersion,
        'PUBLICATION_CONFLICT',
        409,
      );
      await tx`update projects set published_revision=${revision},published_verified=true,browser_verified_revision=${revision},publication_token=null,status='PUBLISHED' where id=${p.id}`;
      await tx`update artifact_versions set status='PUBLISHED' where project_id=${p.id} and revision=${revision}`;
    });
    return { publicUrl: previous.url, revision, verified: true, browserEvidence };
  } catch (error) {
    // Never restore a stale snapshot over another publisher. The public tuple was
    // not modified, so failure only releases our own candidate token.
    await database()`update projects set publication_token=null where id=${run.project_id} and publication_token=${run.lease_token}`;
    throw error;
  }
}

/** Operator retry is constrained to failed publish/delivery, never model production. */
export async function retryPublication(actor: Actor, runId: string, key: string) {
  const scope = await transaction(actor, async (tx) => {
    await platformAdmin(tx, actor, 'act.release');
    const [run] = await tx`select org_id from agent_runs where id=${runId}`;
    assert(run, 'NOT_FOUND', 404);
    return run.org_id;
  });
  return idempotent(
    actor,
    key,
    `publication-retry:${runId}`,
    {},
    scope,
    async (tx) => {
      await platformAdmin(tx, actor, 'act.release');
      const [old] = await tx`select * from agent_runs where id=${runId} for update`;
      assert(old && ['publish', 'delivery'].includes(old.role), 'PUBLICATION_RETRY_ONLY', 409);
      assert(old.status === 'FAILED', 'TASK_NOT_TERMINAL', 409);
      const [p] = await tx`select * from projects where id=${old.project_id} for update`;
      await entitlement(tx, p);
      assert(old.input.factVersion === p.fact_version, 'FACT_VERSION_CHANGED', 409);
      const [active] =
        await tx`select id from agent_runs where project_id=${p.id} and status in ('QUEUED','RUNNING')`;
      assert(!active, 'TASK_ALREADY_ACTIVE', 409);
      const [{ n }] = await tx`select count(*)::int n from agent_runs where project_id=${p.id}`;
      assert(n < 100, 'PROJECT_RUN_BUDGET_EXCEEDED', 429);
      if (old.role === 'publish') {
        const [v] =
          await tx`select id from artifact_versions where project_id=${p.id} and revision=${old.input.revision} and fact_version=${p.fact_version} and status in ('APPROVED','PUBLISHED') and approved_by is not null`;
        assert(v, 'APPROVAL_REQUIRED', 409);
      } else
        assert(
          p.published_verified && p.browser_verified_revision === p.published_revision,
          'VERIFIED_SITE_REQUIRED',
          409,
        );
      const [run] =
        await tx`insert into agent_runs(org_id,project_id,role,input) values(${old.org_id},${p.id},${old.role},${tx.json({ ...old.input, retryOf: old.id })}) returning id,status`;
      await recordAudit(tx, actor, {
        action: 'retry-publication',
        target: p.id,
        targetId: p.id,
        result: 'success',
        details: { previousRunId: old.id, runId: run.id, role: old.role },
      });
      return { runId: run.id, status: run.status, role: old.role, retryOf: old.id };
    },
    'platform',
  );
}
export async function publicProject(slug: string, publicationToken?: string | null) {
  if (!/^[a-z0-9-]{1,100}$/.test(slug)) return null;
  const [p] =
    await database()`select p.id,p.publish_slug,p.published_revision,p.published_verified,p.browser_verified_revision,p.publication_token,p.fact_version,e.is_demo,e.expires_at from projects p join project_entitlements e on e.project_id=p.id where p.publish_slug=${slug} and not e.revoked and e.expires_at>now()`;
  if (!p) return null;
  let revision = p.published_revision;
  if (publicationToken) {
    if (!/^[0-9a-f-]{36}$/i.test(publicationToken) || p.publication_token !== publicationToken)
      return null;
    const [candidate] =
      await database()`select input from agent_runs where project_id=${p.id} and role='publish' and status='RUNNING' and lease_token=${publicationToken} and lease_until>now()`;
    if (!candidate || candidate.input.factVersion !== p.fact_version) return null;
    revision = candidate.input.revision;
  } else if (!p.published_verified || p.browser_verified_revision !== revision) return null;
  if (!revision) return null;
  const [v] =
    await database()`select body,fact_version from artifact_versions where project_id=${p.id} and revision=${revision} and status in ('APPROVED','PUBLISHED') and approved_by is not null`;
  if (!v || (publicationToken && v.fact_version !== p.fact_version)) return null;
  const body = Production.parse(v.body);
  const refs = [...new Set(body.site.pages.flatMap((x) => x.sections.flatMap((s) => s.factRefs)))];
  const fs =
    await database()`select id,product_id as "productId",key,value,version,verified from product_facts where project_id=${p.id} and verified and id=any(${refs}::uuid[])`;
  const assetRefs = [
    ...new Set(body.site.pages.flatMap((x) => x.sections.flatMap((s) => s.assetRefs))),
  ];
  const assets =
    await database()`select id,storage_path,width,height from media_assets where project_id=${p.id} and id=any(${assetRefs}::uuid[]) and license_status='customer_authorized'`;
  const publicAssets = assets.map((a) => ({
    id: a.id,
    width: a.width,
    height: a.height,
    // Resolve against the current approved public artifact on every request.
    // A lazy image no longer expires after a five-minute Storage signature.
    url: `${appOrigin()}/p/${p.publish_slug}/assets/${a.id}`,
  }));
  const [d] =
    await database()`select body from design_systems where project_id=${p.id} and revision=${body.site.designSystemVersion} and approved_at is not null`;
  assert(d, 'DESIGN_MISSING', 503);
  return {
    site: body.site,
    design: DesignSystem.parse(d.body),
    facts: fs,
    assets: publicAssets,
    revision,
    demo: p.is_demo ? { expiresAt: new Date(p.expires_at).toISOString() } : undefined,
    publicBasePath: `/p/${p.publish_slug}`,
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
