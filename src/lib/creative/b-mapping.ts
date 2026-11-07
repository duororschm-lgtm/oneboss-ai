import { z } from 'zod';
import { ProductPrice, type Site, type Poster } from '../../contracts';
import { assert } from '../core/errors';
import { designPresets } from '../../vendor/creative-b/data/design-presets';
import { buildPoster } from '../../vendor/creative-b/lib/creative/composer';
import {
  designSystemSchema,
  projectSeedSchema,
  siteSpecSchema,
  posterSpecSchema,
  type DesignSystem,
  type ProjectSeed,
  type SiteSection,
  type Asset,
} from '../../vendor/creative-b/types/contracts';
import type { CreativeAdapter } from '../core/creative';

const RenderFact = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  key: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), ProductPrice]),
  version: z.number().int(),
  verified: z.boolean(),
});
export type RenderFactType = z.infer<typeof RenderFact>;
const RenderAsset = z.object({
  id: z.uuid(),
  url: z.string().optional(),
  storage_path: z.string().optional(),
});
const labels: Record<string, string> = {
  name: '产品名称',
  brand: '品牌',
  price: '价格',
  description: '产品介绍',
  category: '品类',
  scenario: '使用场景',
  contact: '联系方式',
  contact_url: '联系链接',
};
const keyOf = (key: string) => key.replace(/^product\./, '');
export function displayFact(value: RenderFactType['value']): string {
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value !== 'object') return String(value);
  if (value.priceType === 'not_disclosed' || value.amountMinor === null) return '价格未公开';
  const prefix = value.priceType === 'guide_price' ? '指导价 ' : '';
  return `${prefix}¥${(value.amountMinor / 100).toFixed(2).replace(/\.00$/, '')}${value.unit ? `/${value.unit}` : ''}${value.priceType === 'starting_at' ? '起' : ''}${value.condition ? `（${value.condition}）` : ''}`;
}
function approved(refs: string[], values: unknown[], version: number) {
  const byId = new Map(
    values.map((value) => {
      const fact = RenderFact.parse(value);
      return [fact.id, fact] as const;
    }),
  );
  return [...new Set(refs)].map((id) => {
    const fact = byId.get(id);
    assert(fact?.verified && fact.version === version, 'UNAPPROVED_FACT');
    return fact;
  });
}
export function mapDesign(
  input: Parameters<CreativeAdapter['renderSite']>[0]['design'],
): DesignSystem {
  // Known legacy presets serve as fallback for missing tokens only.
  // Custom Design DNA tokens are the primary render basis when present.
  const presetKey =
    input.styleId in designPresets
      ? (input.styleId as keyof typeof designPresets)
      : /tech|future|科技/i.test(input.styleId)
        ? 'future-tech'
        : /young|vibrant|活力/i.test(input.styleId)
          ? 'young-vibrant'
          : 'editorial-minimal';
  const base = designPresets[presetKey];
  const palette = {
    ...base.palette,
    ...Object.fromEntries(
      Object.keys(base.palette)
        .filter((key) => input.palette[key])
        .map((key) => [key, input.palette[key]]),
    ),
    // Also accept semantic palette keys beyond the preset's fixed set.
    ...Object.fromEntries(
      Object.entries(input.palette).filter(
        ([key]) => !(key in base.palette) && /^#[a-fA-F0-9]{6}$/.test(input.palette[key]),
      ),
    ),
  };
  const typography = {
    ...base.typography,
    ...Object.fromEntries(
      ['display', 'body', 'mono', 'scale']
        .filter((key) => input.typography[key] !== undefined)
        .map((key) => [key, input.typography[key]]),
    ),
  };
  return designSystemSchema.parse({
    ...base,
    styleId: input.styleId || base.styleId,
    version: input.version,
    factVersion: input.factVersion,
    approvedByClient: input.approvedByClient,
    rationale: input.rationale || base.rationale,
    name: input.name || base.name,
    tagline: input.tagline || base.tagline,
    palette,
    typography,
    spacingScale:
      input.spacingScale.length > 0
        ? Math.min(1.6, Math.max(0.8, input.spacingScale.reduce((a, b) => a + b, 0) / input.spacingScale.length / 16))
        : base.spacingScale,
    radiusScale: Math.min(48, input.radiusScale[0] ?? base.radiusScale),
    layoutMode: input.layoutMode || base.layoutMode,
    motionPreset:
      input.motionPreset === 'none'
        ? 'reduced'
        : input.motionPreset === 'energetic'
          ? 'dynamic'
          : 'subtle',
    heroComposition: input.heroComposition || base.heroComposition,
    density: input.density ?? base.density,
    imageTreatment: input.imageTreatment ?? base.imageTreatment,
    // Section flow is derived from the blueprint when available.
    sectionFlow:
      input.siteBlueprint?.pages[0]?.sections.map((s) => s.type) ?? base.sectionFlow,
  });
}
function renderAssets(
  refs: string[],
  values: unknown[],
  projectId: string,
  publicUrls: boolean,
  expectedOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL,
): Asset[] {
  const byId = new Map(
    values.map((value) => {
      const asset = RenderAsset.parse(value);
      return [asset.id, asset] as const;
    }),
  );
  return [...new Set(refs)].map((id) => {
    const asset = byId.get(id);
    assert(asset, 'UNAUTHORIZED_ASSET');
    // URLs are always validated against the Supabase signed-URL pattern when present.
    let url: string | undefined;
    if (asset.url) {
      let valid = false;
      try {
        const parsed = new URL(asset.url);
        const expected = expectedOrigin || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const origin = expected ? new URL(expected) : undefined;
        valid =
          !!origin &&
          parsed.origin === origin.origin &&
          parsed.pathname.startsWith('/storage/v1/object/sign/') &&
          parsed.pathname.includes(`/${projectId}/assets/${id}.png`);
      } catch {
        valid = false;
      }
      if (valid) url = asset.url;
      // In production mode an invalid URL is a hard failure, not a silent fallback.
      else if (publicUrls) assert(false, 'UNAUTHORIZED_ASSET_URL');
    }
    if (publicUrls) assert(url, 'PUBLIC_ASSET_URL_REQUIRED');
    return {
      id,
      alt: url ? '客户授权产品素材' : '概念图形 · 非商家实拍',
      art: 'abstract',
      isConcept: !url,
      licenseNote: url ? '客户授权素材' : '概念示意，非商家实拍',
      ...(url ? { url } : {}),
    };
  });
}
function seedFor(
  projectId: string,
  version: number,
  facts: RenderFactType[],
  assets: Asset[],
): ProjectSeed {
  const value = (key: string, list = facts) => {
    const fact = list.find((f) => keyOf(f.key) === key);
    return fact ? displayFact(fact.value) : undefined;
  };
  const groups = [...new Set(facts.map((f) => f.productId))];
  assert(groups.length, 'APPROVED_FACTS_REQUIRED');
  const highlights = facts
    .slice(0, 4)
    .map((f) => ({ title: labels[keyOf(f.key)] || f.key, body: displayFact(f.value) || '已确认' }));
  while (highlights.length < 2)
    highlights.push({ title: '资料说明', body: '仅展示客户已确认的信息。' });
  return projectSeedSchema.parse({
    id: projectId,
    slug: projectId,
    publishedSlug: projectId,
    name: value('name') || '产品资料',
    brand: value('brand') || '产品介绍',
    category: value('category') || '产品',
    scenario: value('scenario') || '产品介绍',
    summary: value('description') || '依据客户已确认资料展示。',
    story: value('description') || '本页展示客户已确认的产品资料。',
    highlights,
    hashtags: ['产品介绍'],
    factVersion: version,
    assets,
    designStyles: ['editorial-minimal', 'future-tech'],
    constraints: ['未确认资料不作为商品宣传依据。'],
    demoNote: '依据已确认资料渲染。',
    products: groups.map((id, index) => {
      const list = facts.filter((f) => f.productId === id);
      return {
        id,
        name: value('name', list) || '产品资料',
        summary: value('description', list) || '依据客户已确认资料展示。',
        price: value('price', list) || '价格未公开',
        priceLabel: '商品宣传价格',
        assetRefs: index === 0 ? assets.map((a) => a.id) : [],
        unknown: [],
        facts: Object.fromEntries(
          list.map((f) => [
            `product.${keyOf(f.key)}`,
            {
              key: `product.${keyOf(f.key)}`,
              label: labels[keyOf(f.key)] || f.key,
              value: displayFact(f.value) || '已确认',
              verified: true,
              source: 'customer',
            },
          ]),
        ),
      };
    }),
  });
}
function rows(facts: RenderFactType[]) {
  return facts.map((f) => ({
    label: labels[keyOf(f.key)] || f.key,
    value: displayFact(f.value) || '已确认',
    verified: true,
  }));
}
function specs(facts: RenderFactType[], id: string): SiteSection {
  return {
    type: 'specs',
    id,
    props: {
      title: '产品信息',
      tabs: [
        { label: '已确认资料', rows: rows(facts) },
        {
          label: '资料说明',
          rows: [
            { label: '信息来源', value: '客户确认资料，未确认信息不作宣传。', verified: true },
          ],
        },
      ],
    },
  };
}
export function mapSite(
  input: Parameters<CreativeAdapter['renderSite']>[0],
  publicUrls = true,
  expectedOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL,
) {
  return mapSiteForView(input, publicUrls, expectedOrigin, false);
}
/** A direction is a proposal, never an approval or publication. Asset URLs pass through only when they are valid server-signed URLs; otherwise concept placeholders are shown. */
export function mapDirectionSite(input: Parameters<CreativeAdapter['renderSite']>[0]) {
  return mapSiteForView(input, false, process.env.NEXT_PUBLIC_SUPABASE_URL, true);
}
function mapSiteForView(
  input: Parameters<CreativeAdapter['renderSite']>[0],
  publicUrls = true,
  expectedOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL,
  proposal = false,
) {
  const { site } = input;
  assert(
    (proposal || input.design.approvedByClient) &&
      input.design.version === site.designSystemVersion &&
      input.design.factVersion === site.factVersion,
    'DESIGN_VERSION_MISMATCH',
  );
  const page = site.pages.find((p) => p.slug === (input.pageSlug || ''));
  assert(page, 'PAGE_NOT_FOUND', 404);
  const refs = page.sections.flatMap((s) => s.factRefs);
  const facts = approved(refs, input.facts, site.factVersion);
  const assets = renderAssets(
    page.sections.flatMap((s) => s.assetRefs),
    input.assets,
    site.projectId,
    publicUrls,
    expectedOrigin,
  );
  const seed = seedFor(site.projectId, site.factVersion, facts, assets);
  const sections: SiteSection[] = page.sections.flatMap((section, index): SiteSection[] => {
    const list = approved(section.factRefs, input.facts, site.factVersion);
    const id = `${section.type}-${index}`;
    const layout = section.props as SiteSection extends { layout?: infer L } ? L : never;
    const get = (key: string) => {
      const fact = list.find((f) => keyOf(f.key) === key);
      return fact ? displayFact(fact.value) : undefined;
    };
    if (section.type === 'hero')
      return [
        {
          type: 'hero',
          id: 'hero',
          layout,
          props: {
            eyebrow: get('brand') || '产品介绍',
            title: get('name') || seed.name,
            subtitle: get('description') || '依据客户已确认资料展示。',
            price: get('price') || '价格未公开',
            priceLabel: '商品宣传价格',
            ctaLabel: '查看产品资料',
            assetRef: section.assetRefs[0],
            factRefs: section.factRefs,
          },
        },
      ];
    if (section.type === 'gallery')
      return section.assetRefs.length || proposal
        ? [
            {
              type: 'gallery',
              id,
              layout,
              props: {
                title: '产品素材',
                assetRefs: section.assetRefs,
                captions: section.assetRefs.map(() => '客户授权素材'),
              },
            },
          ]
        : [];
    if (section.type === 'features')
      return [
        {
          type: 'features',
          id,
          layout,
          props: {
            title: '已确认的产品重点',
            items: rows(list).map((row) => ({ title: row.label, body: row.value })),
          },
        },
      ];
    if (section.type === 'specs') return [{ ...specs(list, id), layout }];
    if (section.type === 'product-grid')
      return [
        {
          type: 'products',
          id,
          layout,
          props: {
            title: '产品资料',
            items: seed.products.map((p) => ({
              id: p.id,
              name: p.name,
              summary: p.summary,
              price: p.price,
              priceLabel: p.priceLabel,
              tags: [],
              assetRef: p.assetRefs[0],
              rows: rows(list.filter((f) => f.productId === p.id)),
            })),
          },
        },
      ];
    if (section.type === 'contact') {
      const candidate = get('contact_url');
      let href: string | undefined;
      if (candidate) {
        try {
          const parsed = new URL(candidate);
          if (parsed.protocol === 'https:' && !parsed.username && !parsed.password)
            href = parsed.href;
        } catch {
          /* Display no untrusted link. */
        }
      }
      return [
        {
          type: 'cta',
          id: 'cta',
          layout,
          props: {
            title: '了解更多',
            body: get('contact') || '联系方式以客户确认资料为准。',
            label: '联系商家',
            href,
          },
        },
      ];
    }
    if (section.type === 'product-3d')
      return [
        {
          type: 'product-3d',
          id,
          layout,
          props: {
            title: get('name') ? `${get('name')} · 3D 展示` : '3D 产品展示',
            description: '交互式 3D 产品模型，可旋转、缩放和拆解查看。',
            modelTrust: 'conceptual_exploded',
            variant3d: (section.props as any).variant3d || 'full-width-stage',
          },
        },
      ];
    return [
      {
        type: 'story',
        id,
        layout,
        props: {
          title: section.type === 'brand' ? '品牌资料' : '产品介绍',
          body: list.map((f) => displayFact(f.value)).join(' · '),
          points: [],
          assetRef: section.assetRefs[0],
        },
      },
    ];
  });
  // B's information tabs remain available even for sparse hero-only model output.
  if (!sections.some((s) => s.type === 'specs'))
    sections.push(specs(facts, 'confirmed-information'));
  const design = mapDesign(input.design);
  if (
    page.sections.some(
      (section) => section.type === 'hero' && section.props.variant === 'black-gold',
    )
  ) {
    design.palette = {
      background: '#101010',
      surface: '#1c1b18',
      text: '#f5e8c8',
      muted: '#b7ad94',
      accent: '#c9a45c',
      accentText: '#17130a',
      border: '#4b422d',
    };
  }
  return {
    seed,
    design,
    spec: siteSpecSchema.parse({
      schemaVersion: '1.0',
      projectId: site.projectId,
      revision: site.revision,
      designSystemVersion: site.designSystemVersion,
      factVersion: site.factVersion,
      styleId: mapDesign(input.design).styleId,
      pages: [{ slug: page.slug || 'home', title: page.title, sections }],
      interactions: ['tabs'],
      seo: site.seo,
      warnings: [],
    }),
  };
}
export function mapPoster(input: Parameters<CreativeAdapter['renderPoster']>[0]) {
  const { poster } = input;
  assert(
    input.design.approvedByClient &&
      input.design.version === poster.designSystemVersion &&
      input.design.factVersion === poster.factVersion,
    'DESIGN_VERSION_MISMATCH',
  );
  const refs = [
    ...poster.productFactRefs,
    ...poster.layers.flatMap((l) => (l.factRef ? [l.factRef] : [])),
  ];
  const facts = approved(refs, input.facts, poster.factVersion);
  const assetRefs = [
    ...poster.assetRefs,
    ...poster.layers.flatMap((l) => (l.assetRef ? [l.assetRef] : [])),
  ];
  const assets = renderAssets(assetRefs, input.assets, poster.projectId, false);
  const seed = seedFor(poster.projectId, poster.factVersion, facts, assets);
  const design = mapDesign(input.design);
  const headline = poster.layers.find(
    (l) => l.type === 'text' && l.factRef && l.role === 'headline',
  );
  const result = buildPoster(
    {
      seed,
      design,
      siteRevision: 1,
      posterRevision: poster.revision,
      copyRevision: 1,
      factVersion: poster.factVersion,
      qrUrl: input.publicSiteUrl,
      qrSource: 'published-site',
      qrRequested:
        poster.qr.placement === 'auto_bottom_right_or_left' ? 'auto' : poster.qr.placement,
      headlineOverride: headline
        ? displayFact(facts.find((f) => f.id === headline.factRef)!.value)
        : null,
    },
    poster.canvas.height,
  );
  return { seed, design, spec: posterSpecSchema.parse(result.spec), warnings: result.warnings };
}
