import { z } from 'zod';
export const Id = z.uuid();
export const Revision = z.number().int().positive();
export const Money = z.number().int().nonnegative().max(2_000_000_000);
export const ProductPrice = z
  .object({
    amountMinor: Money.nullable(),
    currency: z.literal('CNY'),
    unit: z.string().max(50),
    priceType: z.enum(['fixed', 'starting_at', 'guide_price', 'not_disclosed']),
    condition: z.string().max(300).optional(),
    confirmedBy: Id.optional(),
  })
  .strict();
export const Fact = z
  .object({
    id: Id,
    productId: Id,
    key: z.string().min(1).max(100),
    value: z.union([z.string().max(5000), z.number(), z.boolean(), ProductPrice]),
    source: z.enum(['customer', 'document', 'image_inferred']),
    verified: z.boolean(),
    version: Revision,
  })
  .strict();
export const Brief = z
  .object({
    projectId: Id,
    organizationId: Id,
    productIds: z.array(Id).min(1).max(20),
    objective: z.string().min(1).max(2000),
    targetAudience: z.string().max(1000).optional(),
    brandDescription: z.string().max(2000).optional(),
    confirmedFacts: z.array(Id),
    assetRefs: z.array(Id),
    preferredStyles: z.array(z.string().max(100)),
    restrictions: z.array(z.string().max(500)),
    deliverables: z
      .object({
        site: z.literal(true),
        posterCount: z.number().int().min(1).max(20),
        xhsCopy: z.literal(true),
      })
      .strict(),
    approval: z.enum(['pending', 'approved', 'changes_requested']),
  })
  .strict();
export const DesignSystem = z
  .object({
    version: Revision,
    styleId: z.string().min(1).max(100),
    rationale: z.string().max(2000),
    palette: z.record(z.string(), z.string().regex(/^#[a-fA-F0-9]{6}$/)),
    typography: z.record(z.string(), z.string().max(100)),
    spacingScale: z.array(z.number().min(0).max(200)),
    radiusScale: z.array(z.number().min(0).max(100)),
    layoutMode: z.string().max(100),
    motionPreset: z.enum(['none', 'subtle', 'energetic']),
    approvedByClient: z.boolean(),
    factVersion: Revision,
  })
  .strict();
export const SectionTypes = [
  'hero',
  'gallery',
  'features',
  'specs',
  'product-grid',
  'brand',
  'story',
  'contact',
] as const;
// Props deliberately contain presentation primitives only. Customer text/URLs come from references.
export const Section = z
  .object({
    type: z.enum(SectionTypes),
    props: z
      .object({
        variant: z
          .string()
          .regex(/^[a-z0-9-]{1,60}$/)
          .optional(),
        columns: z.number().int().min(1).max(4).optional(),
        alignment: z.enum(['left', 'center', 'right']).optional(),
      })
      .strict(),
    factRefs: z.array(Id),
    assetRefs: z.array(Id),
  })
  .strict();
export const SiteSpec = z
  .object({
    schemaVersion: z.literal('1.0'),
    projectId: Id,
    revision: Revision,
    designSystemVersion: Revision,
    pages: z
      .array(
        z
          .object({
            slug: z
              .string()
              .regex(/^[a-z0-9-]*$/)
              .max(80),
            title: z.string().max(150),
            sections: z.array(Section).min(1).max(30),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    allowedSectionTypes: z.array(z.enum(SectionTypes)),
    interactions: z.array(z.enum(['carousel', 'tabs', 'accordion', 'scrollReveal'])).min(1),
    seo: z.object({ title: z.string().max(150), description: z.string().max(300) }).strict(),
    factVersion: Revision,
  })
  .strict();
export const PosterSpec = z
  .object({
    schemaVersion: z.literal('1.0'),
    projectId: Id,
    revision: Revision,
    designSystemVersion: Revision,
    canvas: z.union([
      z.object({ width: z.literal(1080), height: z.literal(1350) }).strict(),
      z.object({ width: z.literal(1080), height: z.literal(1080) }).strict(),
    ]),
    layers: z
      .array(
        z
          .object({
            type: z.enum(['background', 'image', 'text']),
            ref: z.string().max(100).optional(),
            assetRef: Id.optional(),
            factRef: Id.optional(),
            role: z.string().max(50).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    productFactRefs: z.array(Id),
    assetRefs: z.array(Id),
    textRefs: z.array(Id),
    qr: z
      .object({
        placement: z.enum(['auto_bottom_right_or_left', 'bottom-right', 'bottom-left']),
        caption: z.string().max(50),
      })
      .strict(),
    copyPackRef: Id,
    factVersion: Revision,
  })
  .strict();
export const CopyPack = z
  .object({
    id: Id,
    posterId: Id,
    title: z.string().max(100),
    body: z.string().max(5000),
    hashtags: z.array(z.string().max(60)).max(20),
    cta: z.string().max(200),
    factVersion: Revision,
    factRefs: z.array(Id),
  })
  .strict();
export const ChangeRequest = z
  .object({
    targetArtifacts: z.enum(['site', 'poster', 'copy', 'all']),
    instruction: z.string().min(1).max(2000),
    baseRevision: Revision,
  })
  .strict();
export const ParsedChange = z
  .object({
    targetArtifacts: z.array(z.enum(['site', 'poster', 'copy'])).min(1),
    isFactChange: z.boolean(),
    operations: z
      .array(
        z
          .object({
            kind: z.enum(['replace', 'add', 'remove']),
            path: z.string().max(200),
            proposedValue: z.union([z.string().max(2000), z.number(), z.boolean()]).optional(),
          })
          .strict(),
      )
      .max(30),
    summary: z.string().max(1000),
  })
  .strict();
export const Production = z
  .object({
    site: SiteSpec,
    posters: z.array(PosterSpec).min(1).max(20),
    copy: z.array(CopyPack).min(1).max(20),
  })
  .strict();
export const IntakeResult = z
  .object({
    facts: z.array(Fact).max(100),
    nextQuestion: z.string().max(500).nullable(),
    draftReady: z.boolean(),
    warnings: z.array(z.string().max(500)),
  })
  .strict();
export const DesignChoices = z.object({ choices: z.array(DesignSystem).min(2).max(3) }).strict();
export const DeliveryManifest = z
  .object({
    schemaVersion: z.literal('1.0'),
    orderId: Id,
    projectId: Id,
    publicSiteUrl: z.url(),
    siteRevision: Revision,
    factVersion: Revision,
    posters: z.array(
      z.object({
        path: z.string(),
        width: z.number(),
        height: z.number(),
        sha256: z.string(),
        size: z.number(),
        qrTargetUrl: z.url(),
      }),
    ),
    files: z.array(z.object({ path: z.string(), sha256: z.string(), size: z.number() })),
    createdAt: z.iso.datetime(),
  })
  .strict();
export type FactType = z.infer<typeof Fact>;
export type Site = z.infer<typeof SiteSpec>;
export type Poster = z.infer<typeof PosterSpec>;
export type ProductionType = z.infer<typeof Production>;
