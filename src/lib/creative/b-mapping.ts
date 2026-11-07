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
  const styleId =
    input.styleId in designPresets
      ? (input.styleId as keyof typeof designPresets)
      : /tech|future|科技/i.test(input.styleId)
        ? 'future-tech'
        : /young|vibrant|活力/i.test(input.styleId)
          ? 'young-vibrant'
          : 'editorial-minimal';
  const base = designPresets[styleId];
  return designSystemSchema.parse({
    ...base,
    version: input.version,
    factVersion: input.factVersion,
    approvedByClient: input.approvedByClient,
    rationale: input.rationale || base.rationale,
    palette: {
      ...base.palette,
      ...Object.fromEntries(
        Object.keys(base.palette)
          .filter((key) => input.palette[key])
          .map((key) => [key, input.palette[key]]),
      ),
    },
    typography: {
      ...base.typography,
      ...Object.fromEntries(
        ['display', 'body', 'mono']
          .filter((key) => input.typography[key])
          .map((key) => [key, input.typography[key]]),
      ),
    },
    radiusScale: Math.min(48, input.radiusScale[0] ?? base.radiusScale),
    layoutMode: ['editorial', 'split', 'centered', 'staggered'].includes(input.layoutMode)
      ? input.layoutMode
      : base.layoutMode,
    motionPreset:
      input.motionPreset === 'none'
        ? 'reduced'
        : input.motionPreset === 'energetic'
          ? 'dynamic'
          : 'subtle',
  });
}
function renderAssets(
  refs: string[],
  values: unknown[],
  projectId: string,
  publicUrls: boolean,
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
    if (publicUrls) {
      assert(asset.url, 'PUBLIC_ASSET_URL_REQUIRED');
      const url = new URL(asset.url),
        origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
      assert(
        url.origin === origin.origin &&
          url.pathname.startsWith('/storage/v1/object/sign/') &&
          url.pathname.includes(`/${projectId}/assets/${id}.png`),
        'UNAUTHORIZED_ASSET_URL',
      );
    }
    return {
      id,
      alt: '客户授权产品素材',
      art: 'abstract',
      isConcept: false,
      licenseNote: '客户授权素材',
      ...(publicUrls ? { url: asset.url } : {}),
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
export function mapSite(input: Parameters<CreativeAdapter['renderSite']>[0], publicUrls = true) {
  const { site } = input;
  assert(
    input.design.approvedByClient &&
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
  );
  const seed = seedFor(site.projectId, site.factVersion, facts, assets);
  const sections: SiteSection[] = page.sections.flatMap((section, index): SiteSection[] => {
    const list = approved(section.factRefs, input.facts, site.factVersion);
    const id = `${section.type}-${index}`;
    const get = (key: string) => {
      const fact = list.find((f) => keyOf(f.key) === key);
      return fact ? displayFact(fact.value) : undefined;
    };
    if (section.type === 'hero')
      return [
        {
          type: 'hero',
          id: 'hero',
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
      return section.assetRefs.length
        ? [
            {
              type: 'gallery',
              id,
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
          props: {
            title: '已确认的产品重点',
            items: rows(list).map((row) => ({ title: row.label, body: row.value })),
          },
        },
      ];
    if (section.type === 'specs') return [specs(list, id)];
    if (section.type === 'product-grid')
      return [
        {
          type: 'products',
          id,
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
          props: {
            title: '了解更多',
            body: get('contact') || '联系方式以客户确认资料为准。',
            label: '联系商家',
            href,
          },
        },
      ];
    }
    return [
      {
        type: 'story',
        id,
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
