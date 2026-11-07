import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { database, type Tx } from '../core/db';
import { assert, AppError } from '../core/errors';
import { entitlement, facts } from '../core/service';
import { DesignChoices, Production, ParsedChange, IntakeResult } from '../../contracts';
import { callMimo } from '../mimo/gateway';
import { validateProduction } from '../core/validation';
import { publishRevision } from '../publishing/service';
import { createDelivery } from '../delivery/service';
export async function claimRun() {
  const token = randomUUID();
  // Expired leases can be reclaimed; final expired attempt becomes terminal, never stranded.
  await database().begin(async (tx) => {
    const expired =
      await tx`update agent_runs set status='FAILED',error_class='LEASE_EXHAUSTED',lease_token=null,lease_until=null,completed_at=now() where status='RUNNING' and lease_until<now() and attempt>=max_attempts returning project_id,role,input`;
    for (const job of expired) {
      await tx`update projects set status='GENERATION_FAILED' where id=${job.project_id}`;
      if (job.role === 'change') {
        await tx`update project_entitlements set remaining_revisions=remaining_revisions+1 where project_id=${job.project_id}`;
        await tx`update change_requests set status='FAILED' where id=${job.input.changeId}`;
      }
    }
  });
  const [run] =
    await database()`update agent_runs set status='RUNNING',attempt=attempt+1,lease_token=${token},lease_until=now()+interval '5 minutes' where id=(select id from agent_runs where ((status='QUEUED' and next_attempt_at<=now()) or (status='RUNNING' and lease_until<now())) and attempt<max_attempts order by created_at for update skip locked limit 1) returning *`;
  return run;
}
async function snapshot(run: Record<string, any>) {
  return database().begin(async (tx) => {
    const [p] = await tx`select * from projects where id=${run.project_id} for update`;
    const e = await entitlement(tx, p);
    assert(p.fact_version === run.input.factVersion, 'FACT_VERSION_CHANGED', 409);
    const fs = await facts(tx, p);
    const assets =
      await tx`select id,storage_path,kind,width,height from media_assets where project_id=${p.id} and license_status='customer_authorized'`;
    const [latestBrief] =
      await tx`select * from creative_briefs where project_id=${p.id} order by revision desc limit 1`;
    const brief = latestBrief?.approved_at ? latestBrief : undefined;
    const [design] =
      await tx`select * from design_systems where project_id=${p.id} and approved_at is not null order by revision desc limit 1`;
    const currentDesign = design?.body.factVersion === p.fact_version ? design : undefined;
    return {
      p,
      e,
      facts: fs.filter((x) => x.verified),
      assets: assets.filter((asset) => latestBrief?.body.assetRefs.includes(asset.id)),
      brief: brief?.body,
      design: currentDesign?.body,
    };
  });
}
export async function runOne() {
  const run = await claimRun();
  if (!run) return false;
  let usage: unknown = {};
  const heartbeat = setInterval(() => {
    void database()`update agent_runs set lease_until=now()+interval '5 minutes' where id=${run.id} and lease_token=${run.lease_token} and status='RUNNING'`.catch(
      () => {},
    );
  }, 30000);
  try {
    const context = await snapshot(run);
    let output: unknown;
    if (run.role === 'publish') output = await publishRevision(run);
    else if (run.role === 'delivery') output = await createDelivery(run, context);
    else if (run.role === 'design') {
      assert(context.brief, 'BRIEF_APPROVAL_REQUIRED');
      const result = await callMimo(DesignChoices, 'creative director', {
        ...context,
        task: 'Generate 2–3 substantially different design directions. Use distinct supported styleId values: editorial-minimal, future-tech, young-vibrant. Each choice must use a different layoutMode from editorial, split, centered, staggered, with different composition and product-specific rationale, not only swapped colors. Palette keys: background,surface,text,muted,accent,accentText,border. Typography keys display,body,mono. approvedByClient must be false; factVersion must match current facts.',
      });
      usage = result.usage;
      assert(
        new Set(result.output.choices.map((c) => c.styleId)).size ===
          result.output.choices.length &&
          new Set(result.output.choices.map((c) => c.layoutMode)).size ===
            result.output.choices.length,
        'DUPLICATE_DESIGN_DIRECTION',
      );
      assert(
        result.output.choices.every(
          (x) => !x.approvedByClient && x.factVersion === context.p.fact_version,
        ),
        'INVALID_DESIGN_APPROVAL',
      );
      output = result.output;
    } else if (run.role === 'intake') {
      const result = await callMimo(IntakeResult, 'product analyst', {
        ...context,
        customerInput: run.input.customerInput,
        task: 'Propose facts and one critical question. All newly proposed facts must be unverified. Output exactly facts, nextQuestion, draftReady, warnings. Fact IDs and productId values must be valid UUIDs. When no product IDs are supplied, return an empty facts array and use nextQuestion to ask for the missing product information; never invent a product ID.',
      });
      usage = result.usage;
      assert(
        result.output.facts.every((x) => !x.verified),
        'MODEL_CANNOT_CONFIRM_FACTS',
      );
      output = result.output;
    } else if (run.role === 'generate') {
      assert(context.design && context.brief, 'DESIGN_APPROVAL_REQUIRED');
      const result = await callMimo(Production, 'production team', {
        ...context,
        previousValidationError: run.error_class ?? null,
        task: `Generate site, posters and copy referencing only supplied verified facts. BUSINESS CONTRACT: site.pages MUST contain exactly one root page whose slug is the EMPTY STRING "", never "home" or "/". Other page slugs must be unique lowercase a-z, digits or hyphens. Every section type must also appear in site.allowedSectionTypes. Include specs information tabs as a real interaction. If more than one product is supplied, the root page MUST include product-grid with factRefs containing the name, description and price facts of every approved product; the catalog must offer associated details, not unrelated standalone pages. Fact refs must be actual supplied approved fact IDs, never keys or invented UUIDs. Asset refs must be actual supplied asset IDs; return [] when none exist. Set all projectId and factVersion values to the supplied project. Use the approved design version for site and all posters. Generate exactly the brief deliverables.posterCount posters and the same number of copy packs, each poster referencing a different existing copy ID. When brief.deliverables.posterFormats is present, preserve its order and set each canvas to portrait=1080x1350 or square=1080x1080; both formats use independent layout, never crop a rendered image. If a previousValidationError is supplied, correct that invariant; do not repeat the rejected structure.`,
      });
      usage = result.usage;
      validateProduction(
        result.output,
        context.p.id,
        context.p.fact_version,
        context.facts,
        context.assets.map((x) => x.id),
        context.e.max_posters,
        context.brief.deliverables,
      );
      assert(
        result.output.site.designSystemVersion === context.design.version,
        'DESIGN_VERSION_MISMATCH',
      );
      output = result.output;
    } else if (run.role === 'change') {
      const [change] =
        await database()`select * from change_requests where id=${run.input.changeId}`;
      const [base] =
        await database()`select * from artifact_versions where project_id=${run.project_id} and revision=${change.base_revision}`;
      const parsed = await callMimo(ParsedChange, 'change analyst', {
        ...context,
        change,
        base: base.body,
        task: 'Parse requested scope. Never expand scope. Price or claim changes require fact confirmation.',
      });
      usage = { parse: parsed.usage };
      const target = change.target === 'all' ? ['site', 'poster', 'copy'] : [change.target];
      assert(
        parsed.output.targetArtifacts.every((x) => target.includes(x)),
        'CHANGE_SCOPE_EXPANDED',
      );
      if (parsed.output.isFactChange)
        output = { parsed: parsed.output, requiresFactApproval: true };
      else {
        const revised = await callMimo(Production, 'revision editor', {
          ...context,
          base: base.body,
          operations: parsed.output,
          task: 'Return the full production bundle, changing only the requested artifacts. Preserve all other fields exactly. For a website-only black-and-gold style request, set only the hero section props.variant to black-gold; this is a supported site presentation preset. Do not change the approved design system version or the posters/copy for a site-only request.',
        });
        usage = { parse: parsed.usage, revision: revised.usage };
        const b = Production.parse(base.body),
          r = revised.output;
        if (!target.includes('site'))
          assert(JSON.stringify(r.site) === JSON.stringify(b.site), 'SITE_OUTSIDE_SCOPE');
        if (!target.includes('poster'))
          assert(JSON.stringify(r.posters) === JSON.stringify(b.posters), 'POSTER_OUTSIDE_SCOPE');
        if (!target.includes('copy'))
          assert(JSON.stringify(r.copy) === JSON.stringify(b.copy), 'COPY_OUTSIDE_SCOPE');
        validateProduction(
          r,
          context.p.id,
          context.p.fact_version,
          context.facts,
          context.assets.map((x) => x.id),
          context.e.max_posters,
        );
        output = { parsed: parsed.output, production: r, requiresFactApproval: false };
      }
    } else throw new AppError('UNKNOWN_TASK');
    await database().begin(async (tx) => {
      const [locked] =
        await tx`select * from agent_runs where id=${run.id} and status='RUNNING' and lease_token=${run.lease_token} for update`;
      assert(locked, 'LEASE_LOST', 409);
      const [p] = await tx`select * from projects where id=${run.project_id} for update`;
      await entitlement(tx, p);
      assert(p.fact_version === run.input.factVersion, 'FACT_VERSION_CHANGED', 409);
      if (run.role === 'generate') {
        const artifactRevision = await saveProduction(tx, run, p, Production.parse(output));
        output = { ...(output as object), artifactRevision };
      }
      if (run.role === 'change') {
        const value = output as {
          parsed: unknown;
          requiresFactApproval: boolean;
          production?: z.infer<typeof Production>;
        };
        const revision = value.production
          ? await saveProduction(tx, run, p, value.production)
          : null;
        output = { ...value, previewRevision: revision };
        await tx`update change_requests set parsed=${tx.json(value.parsed as any)},status=${value.requiresFactApproval ? 'FACT_APPROVAL_REQUIRED' : 'PREVIEW'},preview_revision=${revision} where id=${run.input.changeId}`;
        if (value.requiresFactApproval)
          await tx`update project_entitlements set remaining_revisions=remaining_revisions+1 where order_id=${p.service_order_id}`;
      }
      await tx`update agent_runs set status='SUCCEEDED',error_class=null,output=${tx.json(output as any)},usage=${tx.json(usage as any)},lease_token=null,lease_until=null,completed_at=now() where id=${run.id}`;
    });
  } catch (error) {
    const code =
      error instanceof AppError
        ? error.code
        : error instanceof z.ZodError
          ? 'SCHEMA_INVALID'
          : 'TASK_FAILED';
    const terminal =
      run.attempt >= run.max_attempts ||
      [
        'FACT_VERSION_CHANGED',
        'ENTITLEMENT_REQUIRED',
        'B_RENDERER_NOT_CONNECTED',
        'MIMO_NOT_CONFIGURED',
        'DESIGN_FACT_VERSION_CHANGED',
        'FACT_APPROVAL_REQUIRED',
      ].includes(code);
    await database().begin(async (tx) => {
      const rows =
        await tx`update agent_runs set status=${terminal ? 'FAILED' : 'QUEUED'},error_class=${code},usage=${tx.json(usage as any)},lease_token=null,lease_until=null,completed_at=${terminal ? new Date() : null},next_attempt_at=now()+${run.attempt * 10}*interval '1 second' where id=${run.id} and lease_token=${run.lease_token} returning id`;
      if (rows.length && terminal) {
        await tx`update projects set status='GENERATION_FAILED' where id=${run.project_id}`;
        if (run.role === 'change') {
          await tx`update project_entitlements set remaining_revisions=remaining_revisions+1 where project_id=${run.project_id}`;
          await tx`update change_requests set status='FAILED' where id=${run.input.changeId}`;
        }
      }
    });
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
async function saveProduction(
  tx: Tx,
  run: Record<string, any>,
  p: Record<string, any>,
  body: z.infer<typeof Production>,
) {
  const [{ revision }] =
    await tx`select coalesce(max(revision),0)+1 revision from artifact_versions where project_id=${p.id}`;
  // Database bundle revision is authoritative; nested revisions only change for artifacts actually revised.
  await tx`insert into artifact_versions(org_id,project_id,revision,fact_version,body) values(${p.org_id},${p.id},${revision},${p.fact_version},${tx.json(body)})`;
  await tx`update projects set status='QA_REVIEW' where id=${p.id}`;
  return revision;
}
