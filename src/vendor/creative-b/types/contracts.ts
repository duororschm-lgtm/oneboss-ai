import { z } from 'zod';

/**
 * OneBoss V7 shared contracts (B side subset).
 * A maintains the single source of truth; B must not fork price/order state.
 * Everything rendered by the site/poster engines passes through these schemas.
 */

export const styleIdSchema = z.string().min(1).max(60);
export type StyleId = z.infer<typeof styleIdSchema>;
/** Legacy preset keys — kept for backward compatibility with existing designs. */
export const presetStyleIds = ['editorial-minimal', 'future-tech', 'young-vibrant'] as const;
export type PresetStyleId = (typeof presetStyleIds)[number];

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, '必须为 6 位十六进制颜色');

export const paletteSchema = z.object({
  background: hexColorSchema,
  surface: hexColorSchema,
  text: hexColorSchema,
  muted: hexColorSchema,
  accent: hexColorSchema,
  accentText: hexColorSchema,
  border: hexColorSchema,
});
export type Palette = z.infer<typeof paletteSchema>;

export const typographySchema = z.object({
  display: z.string().min(1),
  body: z.string().min(1),
  mono: z.string().min(1),
  // 模型常把字号比例写成 "1.15" 这样的字符串；它只是数，不该让整页崩掉。
  scale: z.coerce.number().min(0.8).max(1.4),
});

export const designSystemSchema = z.object({
  version: z.number().int().positive(),
  styleId: styleIdSchema,
  name: z.string().min(1),
  tagline: z.string().min(1),
  rationale: z.string().min(1),
  palette: paletteSchema,
  typography: typographySchema,
  spacingScale: z.number().min(0.8).max(1.6),
  radiusScale: z.number().min(0).max(48),
  layoutMode: z.string().min(1).max(60),
  motionPreset: z.enum(['subtle', 'dynamic', 'reduced']),
  heroComposition: z.string().min(1).max(60),
  posterLayout: z.enum(['editorial-premium', 'future-grid', 'bold-editorial']),
  copyTone: z.string().min(1),
  sectionFlow: z.array(z.string()).min(1),
  density: z.enum(['airy', 'balanced', 'dense']).optional(),
  imageTreatment: z.enum(['full-bleed', 'framed', 'collage', 'minimal']).optional(),
  approvedByClient: z.boolean(),
  factVersion: z.number().int().nonnegative(),
});
export type DesignSystem = z.infer<typeof designSystemSchema>;

export const factSourceSchema = z.enum(['customer', 'document', 'image_inferred', 'fixture']);

export const productFactSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
  verified: z.boolean(),
  source: factSourceSchema,
  /** 商品宣传价格类型，与 OneBoss 服务订单金额完全独立 */
  priceType: z.enum(['fixed', 'starting_at', 'guide_price', 'not_disclosed']).optional(),
});
export type ProductFact = z.infer<typeof productFactSchema>;

export const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  summary: z.string().min(1),
  price: z.string().min(1),
  priceLabel: z.string().min(1),
  facts: z.record(z.string(), productFactSchema),
  assetRefs: z.array(z.string()),
  unknown: z.array(z.string()),
});
export type Product = z.infer<typeof productSchema>;

export const assetSchema = z.object({
  id: z.string().min(1),
  /** A-only bridge: server-authorized short-lived Storage URL, never customer input. */
  url: z.string().url().optional(),
  alt: z.string().min(1),
  art: z.enum(['chair', 'sofa', 'table', 'shelf', 'car', 'beans', 'abstract']),
  isConcept: z.boolean(),
  licenseNote: z.string().min(1),
});
export type Asset = z.infer<typeof assetSchema>;

export const highlightSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});
export type Highlight = z.infer<typeof highlightSchema>;

export const projectSeedSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  brand: z.string().min(1),
  category: z.string().min(1),
  scenario: z.string().min(1),
  summary: z.string().min(1),
  story: z.string().min(1),
  highlights: z.array(highlightSchema).min(2),
  hashtags: z.array(z.string()).min(1),
  factVersion: z.number().int().positive(),
  products: z.array(productSchema).min(1),
  assets: z.array(assetSchema),
  designStyles: z.array(styleIdSchema).min(2),
  constraints: z.array(z.string()).min(1),
  demoNote: z.string().min(1),
  publishedSlug: z.string().min(1),
});
export type ProjectSeed = z.infer<typeof projectSeedSchema>;

/* ------------------------------- SiteSpec ------------------------------- */

export const sectionLayoutSchema = z
  .object({
    variant: z
      .string()
      .regex(/^[a-z0-9-]{1,60}$/)
      .optional(),
    columns: z.number().int().min(1).max(4).optional(),
    // 布局枚举一律用 catch 兜底：模型偶尔给出枚举外的值（如 background:"gradient"），
    // 那是内容偏差，不该让整个预览/发布链路抛 ZodError 崩掉。
    alignment: z.enum(['left', 'center', 'right']).optional().catch('left'),
    width: z.enum(['narrow', 'standard', 'wide', 'full']).optional().catch('standard'),
    emphasis: z.enum(['image-led', 'text-led', 'balanced']).optional().catch('balanced'),
    background: z.enum(['plain', 'surface', 'inverted', 'accent']).optional().catch('plain'),
    imageRatio: z.enum(['square', 'portrait', 'landscape', 'wide']).optional().catch('landscape'),
  })
  .partial()
  .optional();
export type SectionLayout = z.infer<typeof sectionLayoutSchema>;

export const sectionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hero'),
    id: z.string().min(1),
    layout: sectionLayoutSchema,
    props: z.object({
      eyebrow: z.string(),
      title: z.string().min(1),
      subtitle: z.string(),
      ctaLabel: z.string(),
      /** 仅使用经确认的链接；渲染器会再次校验协议 */
      ctaHref: z.string().min(1).optional(),
      priceLabel: z.string(),
      price: z.string(),
      assetRef: z.string().optional(),
      factRefs: z.array(z.string()),
    }),
  }),
  z.object({
    type: z.literal('gallery'),
    id: z.string().min(1),
    layout: sectionLayoutSchema,
    props: z.object({
      title: z.string(),
      assetRefs: z.array(z.string()),
      captions: z.array(z.string()),
    }),
  }),
  z.object({
    type: z.literal('features'),
    id: z.string().min(1),
    layout: sectionLayoutSchema,
    props: z.object({
      title: z.string(),
      items: z.array(
        z.object({
          title: z.string().min(1),
          body: z.string().min(1),
          factRef: z.string().optional(),
        }),
      ),
    }),
  }),
  z.object({
    type: z.literal('specs'),
    id: z.string().min(1),
    layout: sectionLayoutSchema,
    props: z.object({
      title: z.string(),
      tabs: z.array(
        z.object({
          label: z.string().min(1),
          rows: z.array(
            z.object({
              label: z.string().min(1),
              value: z.string().min(1),
              verified: z.boolean(),
            }),
          ),
        }),
      ),
    }),
  }),
  z.object({
    type: z.literal('products'),
    id: z.string().min(1),
    layout: sectionLayoutSchema,
    props: z.object({
      title: z.string(),
      items: z.array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1),
          summary: z.string().min(1),
          price: z.string().min(1),
          priceLabel: z.string().min(1),
          tags: z.array(z.string()),
          assetRef: z.string().optional(),
          rows: z.array(z.object({ label: z.string(), value: z.string(), verified: z.boolean() })),
        }),
      ),
    }),
  }),
  z.object({
    type: z.literal('story'),
    id: z.string().min(1),
    layout: sectionLayoutSchema,
    props: z.object({
      title: z.string(),
      body: z.string(),
      assetRef: z.string().optional(),
      points: z.array(z.string()),
    }),
  }),
  z.object({
    type: z.literal('product-3d'),
    id: z.string().min(1),
    layout: sectionLayoutSchema,
    props: z.object({
      title: z.string(),
      description: z.string(),
      /** Trust level: appearance_3d | conceptual_exploded | verified_exploded | static_fallback */
      modelTrust: z.enum(['appearance_3d', 'conceptual_exploded', 'verified_exploded', 'static_fallback']),
      /** Variant: full-width-stage | split-annotation | immersive-section */
      variant3d: z.enum(['full-width-stage', 'split-annotation', 'immersive-section']).optional(),
      /** Part labels for exploded view (labels only, no external URLs) */
      parts: z
        .array(
          z.object({
            id: z.string().min(1),
            label: z.string().min(1),
            description: z.string().optional(),
          }),
        )
        .optional(),
    }),
  }),
  z.object({
    type: z.literal('cta'),
    id: z.string().min(1),
    layout: sectionLayoutSchema,
    props: z.object({
      title: z.string(),
      body: z.string(),
      label: z.string(),
      /** 仅使用经确认的 http(s) 或站内链接；缺省时不渲染按钮 */
      href: z.string().min(1).optional(),
    }),
  }),
]);
export type SiteSection = z.infer<typeof sectionSchema>;

export const siteSpecSchema = z.object({
  schemaVersion: z.literal('1.0'),
  projectId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  designSystemVersion: z.number().int().positive(),
  factVersion: z.number().int().nonnegative(),
  styleId: styleIdSchema,
  pages: z
    .array(
      z.object({
        slug: z.string().min(1),
        title: z.string().min(1),
        sections: z.array(sectionSchema).min(1),
      }),
    )
    .min(1),
  interactions: z.array(z.enum(['carousel', 'tabs', 'accordion', 'scrollReveal'])).min(1),
  seo: z.object({ title: z.string().min(1), description: z.string().min(1) }),
  warnings: z.array(z.string()),
});
export type SiteSpec = z.infer<typeof siteSpecSchema>;

/* ------------------------------ PosterSpec ------------------------------ */

export const posterSpecSchema = z.object({
  schemaVersion: z.literal('1.0'),
  projectId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  designSystemVersion: z.number().int().positive(),
  factVersion: z.number().int().nonnegative(),
  posterId: z.string().min(1),
  canvas: z.object({
    width: z.literal(1080),
    height: z.union([z.literal(1350), z.literal(1080)]),
  }),
  layout: z.enum(['editorial-premium', 'future-grid', 'bold-editorial']),
  styleId: styleIdSchema,
  brand: z.string().min(1),
  productName: z.string().min(1),
  headline: z.string().min(1),
  subhead: z.string(),
  price: z.string().min(1),
  priceLabel: z.string().min(1),
  tags: z.array(z.string()),
  assetRef: z.string().optional(),
  qr: z.object({
    placement: z.enum(['bottom-right', 'bottom-left']),
    requested: z.enum(['auto', 'bottom-right', 'bottom-left']),
    urlSource: z.enum(['fixture-preview', 'published-site']),
    url: z.string().url(),
    caption: z.string().min(1),
    quietZoneModules: z.number().int().min(2).max(8),
  }),
  copyPackId: z.string().min(1),
  safeZones: z.array(
    z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      label: z.string(),
    }),
  ),
});
export type PosterSpec = z.infer<typeof posterSpecSchema>;

export const posterCopyBundleSchema = z.object({
  posterId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  hashtags: z.array(z.string()).min(1),
  coverCaption: z.string().min(1),
  cta: z.string().min(1),
  factVersion: z.number().int().nonnegative(),
  posterFile: z.string().min(1),
  complianceNotes: z.array(z.string()),
});
export type PosterCopyBundle = z.infer<typeof posterCopyBundleSchema>;

/* ----------------------------- ChangeRequest ---------------------------- */

export const changeOperationSchema = z.object({
  kind: z.enum(['sitePalette', 'posterQrPlacement', 'copyHeadline', 'productFact', 'note']),
  path: z.string().min(1),
  from: z.string(),
  to: z.string(),
  description: z.string().min(1),
});
export type ChangeOperation = z.infer<typeof changeOperationSchema>;

export const changeRequestSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  instruction: z.string().min(1),
  targetArtifacts: z.array(z.enum(['site', 'poster', 'copy'])).min(1),
  parsedOperations: z.array(changeOperationSchema),
  isFactChange: z.boolean(),
  factChangeNeedsApproval: z.boolean(),
  affectedArtifactIds: z.array(z.string()),
  baseRevision: z.number().int().nonnegative(),
  previewRevision: z.number().int().nonnegative(),
  approvalState: z.enum(['draft', 'pending-fact-approval', 'preview', 'approved', 'rejected']),
  needsRegenerate: z.array(z.enum(['site', 'poster', 'copy'])),
  previewSummary: z.string().min(1),
  potentialRisks: z.array(z.string()),
  createdAt: z.string(),
});
export type ChangeRequest = z.infer<typeof changeRequestSchema>;

/* --------------------------- Commerce (A-owned) -------------------------- */

export const planSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  priceMinor: z.number().int().positive(),
  currency: z.literal('CNY'),
  description: z.string().min(1),
  entitlements: z.array(z.string()).min(1),
  productLimit: z.number().int().positive(),
  posterCount: z.number().int().positive(),
  revisionRounds: z.number().int().nonnegative(),
  hostingDays: z.number().int().positive(),
  featured: z.boolean().optional(),
});
export type Plan = z.infer<typeof planSchema>;

export const payStateSchema = z.enum([
  'UNPAID',
  'PENDING_CONFIRMATION',
  'DEMO_PAID',
  'PAID',
  'REFUNDED',
]);
export type PayState = z.infer<typeof payStateSchema>;

export const workStateSchema = z.enum([
  'WAITING_INPUT',
  'BRIEF_APPROVAL',
  'DESIGN_APPROVAL',
  'GENERATING',
  'QA_REVIEW',
  'CLIENT_REVIEW',
  'DELIVERED',
  'ACCEPTED',
]);
export type WorkState = z.infer<typeof workStateSchema>;

export const orderSchema = z.object({
  id: z.string().min(1),
  orderNo: z.string().min(1),
  planCode: z.string().min(1),
  planName: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.literal('CNY'),
  payState: payStateSchema,
  workState: workStateSchema,
  isDemo: z.boolean(),
  paymentMode: z.enum(['SANDBOX', 'MANUAL_VERIFIED']),
  projectId: z.string().min(1),
  customerName: z.string().min(1),
  createdAt: z.string(),
  projectSlug: z.string(),
});
export type Order = z.infer<typeof orderSchema>;

/* --------------------------- DeliveryManifest --------------------------- */

export const deliveryPosterSchema = z.object({
  posterId: z.string().min(1),
  format: z.literal('png'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  qrTargetUrl: z.string().url(),
  factVersion: z.number().int().nonnegative(),
  filename: z.string().min(1),
});
export type DeliveryPoster = z.infer<typeof deliveryPosterSchema>;

export const deliveryManifestSchema = z.object({
  orderId: z.string().min(1),
  projectId: z.string().min(1),
  publicSiteUrl: z.string().url(),
  siteRevision: z.number().int().nonnegative(),
  posters: z.array(deliveryPosterSchema).min(1),
  xiaohongshuCopy: z.array(
    z.object({
      posterId: z.string().min(1),
      title: z.string(),
      body: z.string(),
      hashtags: z.array(z.string()),
    }),
  ),
  qrAssets: z.array(z.object({ label: z.string(), url: z.string().url() })),
  zipPath: z.string(),
  deliveryStatus: z.enum(['draft', 'rendered', 'verified', 'delivered', 'accepted']),
  createdAt: z.string(),
  acceptedAt: z.string().optional(),
});
export type DeliveryManifest = z.infer<typeof deliveryManifestSchema>;

/* ------------------------------- Utilities ------------------------------ */

export function parseOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
  label: string,
): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`${label} 校验失败 — ${detail}`);
  }
  return result.data;
}

/** 受控链接：只允许 http(s)，不使用 javascript: / data: / 相对外链 */
export function isSafePublicUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
