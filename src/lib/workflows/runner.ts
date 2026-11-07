import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { database, type Tx } from '../core/db';
import { assert, AppError } from '../core/errors';
import { entitlement, facts } from '../core/service';
import { DesignChoices, Production, ParsedChange, IntakeResult } from '../../contracts';
import { callMimo } from '../mimo/gateway';
import { validateProduction, validateBlueprintAdherence } from '../core/validation';
import { checkDesignDistinctness } from '../creative/design-distinctness';
import { assessAssetQuality } from '../visual-assets/asset-quality';
import { publishRevision } from '../publishing/service';
import { createDelivery } from '../delivery/service';

const DESIGN_TASK = `You are a commercial brand Creative Director and Interactive Web Art Director. Generate 2–3 design directions for this product — each a complete art direction with distinct visual language, page composition, interaction plan and motion rhythm. Not a template pick, not a palette swap.

First analyze the product: category, form, material evidence, target audience, use scenario, customer emphasis, and the images' composition/light. Design FROM the product. Do not default to a SaaS tech landing page for every product.

Each direction must carry a full Design DNA and a Site Blueprint:

DESIGN DNA fields:
- styleId: short lowercase slug (a-z, hyphens) naming this visual identity. Free-form.
- name: direction name (max 100 chars)
- tagline: one-line visual positioning
- visualConcept: the design concept (why this fits the product)
- visualKeywords: 2–5 visual keywords
- rationale: why this design serves this product
- palette: semantic hex tokens — keys MUST include background,surface,text,muted,accent,accentText,border. Optionally add secondaryAccent (hex).
- gradientStops: optional array of 2–4 hex colors for controlled gradients (e.g. hero background). Keep low-frequency; not every section.
- typography: font tokens — keys MUST include display,body,mono (font stack strings); optionally scale (0.8–1.4). Every typography value including scale is a STRING (e.g. "1.1"), never a number.
- spacingScale: array of 1–4 numbers (px rhythm)
- radiusScale: array of 1–2 numbers (px)
- layoutMode: free-form short slug describing overall layout character
- motionPreset: one of none | subtle | energetic
- motionLanguage: calm | expressive | energetic (drives animation intensity and rhythm)
- density: airy | balanced | dense
- gridStyle: the page grid character — exactly one of editorial | asymmetric | modular | full-bleed (never a motif value)
- imageTreatment: full-bleed | framed | collage | minimal
- visualMotif: the decorative motif — exactly one of clean-lines | organic-shapes | geometric-grid | soft-glow | bold-blocks | fine-details (never a grid value)
- heroComposition: split-editorial | full-bleed | centered-stage | type-led | asymmetric
- pageGrid: { contentWidth: narrow|standard|wide|full, columns: 4–12, gutter: 0–64 }
- siteBlueprint: see below

SITE BLUEPRINT (each direction carries one siteBlueprint object; nesting MUST match this exactly):
siteBlueprint = {
  "contentWidth": "narrow|standard|wide|full",   // blueprint level — sibling of "pages", NEVER inside a page
  "visualRhythm": "calm|layered|punchy",         // blueprint level — sibling of "pages", NEVER inside a page
  "pages": [                                     // 1–3 pages
    {
      "slug": "",                                // "" for the root page; lowercase hyphen slugs otherwise
      "title": "…",
      "sections": [                              // 1–12 sections
        {
          "type": "…",                           // one of: hero, gallery, features, specs, product-grid, brand, story, contact
          "layout": {
            "variant": "…",                      // from the variant vocabulary below
            "columns": 1,                        // integer 1–4
            "alignment": "left|center|right",
            "width": "narrow|standard|wide|full",
            "emphasis": "image-led|text-led|balanced",
            "background": "plain|surface|inverted|accent|gradient",
            "imageRatio": "square|portrait|landscape|wide"
          },
          "factKeys": ["name", "description"],   // semantic fact keys. NEVER UUIDs.
          "assetRoles": ["hero", "gallery-1"],   // semantic image roles. NEVER UUIDs.
          "interactionIds": ["gallery-1"],       // short ids referenced from the INTERACTION PLAN below
          "motionId": "hero-entrance",           // short id referenced from the MOTION PLAN below
          "note": "…"                            // interaction options + layout notes
        }
      ]
    }
  ]
}
- A page object has ONLY slug, title, sections. contentWidth/visualRhythm belong to siteBlueprint itself.
- variant vocabulary (pick DIFFERENT variants per direction):
  hero: split-editorial | full-bleed | centered-stage | type-led | asymmetric
  gallery: editorial-grid | masonry-lite | image-rail | cinematic-stage
  features: bento | numbered-story | illustrated-list | side-by-side
  specs: tabs | information-cards | technical-table | accordion
  product-grid: interactive-product-selector | comparison | horizontal-showcase
  story: sticky-split | staggered-story | full-width-manifesto
  contact: editorial-banner | floating-cta | compact-contact

INTERACTION PLAN (embed in siteBlueprint sections via interactionIds):
Supported kinds: gallery-carousel, image-zoom, tabs, accordion, product-hotspots, product-compare, image-before-after, copy-contact, anchor-navigation
For each interaction, describe its options in the blueprint note field (e.g. "gallery-carousel with zoom, keyboard nav").
Prioritize: gallery-carousel, tabs, accordion, anchor-navigation, copy-contact as P0.
Only include interactions that make sense for this product's content.

MOTION PLAN (embed via motionId):
Supported kinds: entrance-reveal, stagger-text, scroll-reveal, sticky-story, parallax-light, hover-feedback, section-transition
Use entrance-reveal for hero, scroll-reveal for content sections, stagger-text for headlines.
Match motion intensity to the motionLanguage: calm = subtle fades, expressive = layered reveals, energetic = dynamic transitions.

CRITICAL — the 2–3 directions must be visibly different pages, not recolors:
- different hero composition and visual narrative
- different section ORDER and content emphasis
- different gallery/features/story layout variants
- different grid style, type character, density, image treatment, visual motif
- different interaction plans and motion rhythms
Aim for 4+ observable structural differences. Only swapping palette colors does NOT count.

VISUAL QUALITY:
- Bold color is welcome (gradients, vivid accents) when it serves the product
- Product images must remain the visual hero
- Typography must have clear hierarchy (headline > subhead > body > label)
- Every screen needs one clear focal point — not everything competing
- Mobile layout must REORGANIZE, not just shrink
- Avoid: default purple gradients for everything, glassmorphism overload, every section as identical cards

Constraints:
- approvedByClient must be false. factVersion must match the current facts version exactly.
- version must be 1 for all new directions.
- Only reference fact keys that exist in the supplied verified facts. Do not invent product claims.
- Do not invent database UUIDs anywhere.
- All numbers must be bare JSON numbers — version and factVersion as integers, columns/gutter/spacingScale/radiusScale as numbers. Never strings, never "px" values. Exception: typography values (including scale) are always strings.
- approvedByClient (boolean, always false) and factVersion (integer, equal to the current facts version) are REQUIRED on every direction — never omit them.
- Emit every field exactly once. Add no fields beyond the schema — no missingInputs, assumptionsToConfirm, recommendedStyleId or similar; caveats go into rationale or section note.
- Each direction is one coherent art direction, not a random mix.`;

const GENERATE_BLUEPRINT_RULES = `DESIGN BLUEPRINT ADHERENCE: the approved design includes a siteBlueprint. Your site MUST keep its page structure: same page slugs, same section types in the same order, same layout variants (props.variant / props.columns / props.alignment / props.width / props.emphasis / props.background / props.imageRatio). You may fill in full content and real factRefs/assetRefs, but you may NOT change the approved composition. If a layout cannot be realized due to missing assets, keep the section and return empty assetRefs rather than switching to a different composition.`;

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
      const attempt = (feedback?: string) =>
        callMimo(DesignChoices, 'creative director', {
          ...context,
          previousDesignFeedback: feedback ?? null,
          task: feedback ? `${DESIGN_TASK}\n\nPREVIOUS ATTEMPT FEEDBACK (must fix):\n${feedback}` : DESIGN_TASK,
        });
      // The model drifts on the big strict schema; one feedback retry with the exact
      // field-level issues recovers far more often than a blind re-run.
      const attemptWithSchemaRetry = async (): ReturnType<typeof attempt> => {
        try {
          return await attempt();
        } catch (error) {
          if (
            error instanceof AppError &&
            error.code === 'MIMO_SCHEMA_INVALID' &&
            error.schemaIssues?.length
          ) {
            return attempt(
              `Your previous JSON violated the output contract. Fix EXACTLY these issues and change nothing else: ${error.schemaIssues
                .map((i) => `${i.path || '(root)'}: ${i.code}`)
                .join('; ')}. Every required field (approvedByClient, factVersion, …) must be present. typography values including scale are strings; other numbers are bare JSON numbers.`,
            );
          }
          throw error;
        }
      };
      let result = await attemptWithSchemaRetry();
      usage = { attempt1: result.usage };
      // New directions must carry a Site Blueprint; legacy stored outputs may lack it.
      assert(
        result.output.choices.every((c) => c.siteBlueprint),
        'SITE_BLUEPRINT_REQUIRED',
      );
      assert(
        result.output.choices.every(
          (x) => !x.approvedByClient && x.factVersion === context.p.fact_version,
        ),
        'INVALID_DESIGN_APPROVAL',
      );
      let distinct = checkDesignDistinctness(result.output.choices);
      if (!distinct.pass) {
        const retry = await attempt(distinct.feedback);
        usage = { attempt1: (usage as any).attempt1, attempt2: retry.usage };
        assert(
          retry.output.choices.every((c) => c.siteBlueprint),
          'SITE_BLUEPRINT_REQUIRED',
        );
        assert(
          retry.output.choices.every(
            (x) => !x.approvedByClient && x.factVersion === context.p.fact_version,
          ),
          'INVALID_DESIGN_APPROVAL',
        );
        result = retry;
        distinct = checkDesignDistinctness(result.output.choices);
        assert(distinct.pass, 'DESIGN_DIRECTIONS_NOT_DISTINCT');
      }
      // directionId is assigned server-side after schema validation, never taken from model output.
      output = {
        choices: result.output.choices.map((choice) => ({
          ...choice,
          directionId: randomUUID(),
        })),
        distinctness: {
          distinctDimensions: distinct.distinctDimensions,
          identicalDimensions: distinct.identicalDimensions,
        },
      };
    } else if (run.role === 'intake') {
      const assetReport = assessAssetQuality({
        imageCount: context.assets.length,
        productDescription: run.input.customerInput?.slice(0, 200) || '',
        customerConfidence: 'unknown',
      });
      const result = await callMimo(IntakeResult, 'product analyst', {
        ...context,
        assetQuality: assetReport,
        customerInput: run.input.customerInput,
        task: `Propose facts and one critical question. All newly proposed facts must be unverified. Output exactly facts, nextQuestion, draftReady, warnings. Fact IDs and productId values must be valid UUIDs. When no product IDs are supplied, return an empty facts array and use nextQuestion to ask for the missing product information; never invent a product ID.

ASSET QUALITY: ${JSON.stringify(assetReport)}.
Based on the asset quality assessment:
- ${assetReport.recommendedStrategy}
- ${assetReport.followUpQuestions.length} suggested follow-up questions available
- Customer can skip questions they cannot answer
- Use nextQuestion to ask the MOST IMPORTANT question first (${assetReport.followUpQuestions[0] || 'product identification'})
- Distinguish customer facts from image inference and concept assumptions
- Never present concept/inferred details as confirmed product facts`,
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
        task: `Generate site, posters and copy referencing only supplied verified facts. BUSINESS CONTRACT: site.pages MUST contain exactly one root page whose slug is the EMPTY STRING "", never "home" or "/". Other page slugs must be unique lowercase a-z, digits or hyphens. Every section type must also appear in site.allowedSectionTypes. Include specs information tabs as a real interaction. If more than one product is supplied, the root page MUST include product-grid with factRefs containing the name, description and price facts of every approved product; the catalog must offer associated details, not unrelated standalone pages. Fact refs must be actual supplied approved fact IDs, never keys or invented UUIDs. Asset refs must be actual supplied asset IDs; return [] when none exist. Set all projectId and factVersion values to the supplied project. Use the approved design version for site and all posters. Generate exactly the brief deliverables.posterCount posters and the same number of copy packs, each poster referencing a different existing copy ID. When brief.deliverables.posterFormats is present, preserve its order and set each canvas to portrait=1080x1350 or square=1080x1080; both formats use independent layout, never crop a rendered image. Every poster MUST set qr.placement to "auto_bottom_right_or_left" unless the customer explicitly named a side in their approved brief; a hard-coded corner can collide with the price block and fail layout QA. If a previousValidationError is supplied, correct that invariant; do not repeat the rejected structure. ${GENERATE_BLUEPRINT_RULES}`,
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
      validateBlueprintAdherence(result.output, context.design);
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
        'DESIGN_DIRECTIONS_NOT_DISTINCT',
        'SITE_BLUEPRINT_REQUIRED',
      ].includes(code);
    console.error(
      JSON.stringify({
        runId: run.id,
        role: run.role,
        attempt: run.attempt,
        errorClass: code,
        errorName:
          error instanceof Error && /^[A-Za-z0-9_]{1,50}$/.test(error.name)
            ? error.name
            : 'Unknown',
        terminal,
      }),
    );
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
