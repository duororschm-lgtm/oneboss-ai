import type {
  DesignSystem,
  Palette,
  PosterCopyBundle,
  PosterSpec,
  Product,
  ProjectSeed,
  SiteSection,
  SiteSpec,
} from '../../types/contracts';
import { posterFilename } from './poster-renderer/filename';
import {
  chooseQrPlacement,
  posterGeometry,
  type QrDecision,
  type QrPlacement,
  type QrRequested,
} from './poster-renderer/geometry';

export interface ComposeInput {
  seed: ProjectSeed;
  design: DesignSystem;
  siteRevision: number;
  posterRevision: number;
  copyRevision: number;
  /** key = `${productId}:${factKey}`，例如 demo-chair-001 的 `chair-01:product.price` */
  factOverrides?: Record<string, string>;
  factVersion?: number;
  qrUrl: string;
  qrSource: 'fixture-preview' | 'published-site';
  qrRequested?: QrRequested;
  headlineOverride?: string | null;
}

export function resolveProducts(seed: ProjectSeed, factOverrides: Record<string, string> = {}): Product[] {
  return seed.products.map((product) => {
    const priceOverride = factOverrides[`${product.id}:product.price`];
    if (!priceOverride || priceOverride === product.price) return product;
    const priceFact = product.facts['product.price'];
    return {
      ...product,
      price: priceOverride,
      facts: priceFact
        ? { ...product.facts, 'product.price': { ...priceFact, value: priceOverride } }
        : product.facts,
    };
  });
}

/** 只改网站的配色时，海报继续使用原设计基线 */
export function applyDesignOverride(design: DesignSystem, override: Partial<Palette> | null, nameSuffix?: string): DesignSystem {
  if (!override) return design;
  return {
    ...design,
    name: nameSuffix ? `${design.name} · ${nameSuffix}` : design.name,
    palette: { ...design.palette, ...override },
  };
}

export function buildSiteSpec(input: ComposeInput): SiteSpec {
  const { seed, design } = input;
  const products = resolveProducts(seed, input.factOverrides);
  const primary = products[0];
  const factVersion = input.factVersion ?? seed.factVersion;
  const assets = seed.assets.filter((asset) => primary.assetRefs.includes(asset.id) || products.some((product) => product.assetRefs.includes(asset.id)));
  const primaryAssets = assets.filter((asset) => primary.assetRefs.includes(asset.id));
  // 多产品项目展示整个系列的视觉；单品项目只展示当前产品，避免出现与产品无关的图库。
  const galleryAssets = products.length > 1 ? assets : primaryAssets.length > 0 ? primaryAssets : assets;
  const hasImages = galleryAssets.length > 0;
  const priceVerified = primary.facts['product.price']?.verified !== false;
  const specFactKeys = ['product.name', 'product.brand', 'product.price', 'product.scenario'];
  const confirmedRows = specFactKeys.flatMap((key) => {
    const fact = primary.facts[key];
    return fact && fact.verified ? [{ label: fact.label, value: fact.value, verified: true }] : [];
  });
  const pendingFactRows = Object.values(primary.facts)
    .filter((fact) => !fact.verified && specFactKeys.includes(fact.key))
    .map((fact) => ({ label: fact.label, value: fact.value, verified: false }));
  const pendingRows = [
    ...pendingFactRows,
    ...primary.unknown.map((label) => ({ label, value: '待客户确认', verified: false })),
  ].filter((row, index, list) => list.findIndex((item) => item.label === row.label) === index);

  const sections: Record<string, SiteSection> = {
    hero: {
      type: 'hero',
      id: 'hero',
      props: {
        eyebrow: `${seed.brand} / ${seed.category}`,
        title: primary.name,
        subtitle: primary.summary,
        ctaLabel: hasImages ? '查看产品视觉' : '查看已确认信息',
        priceLabel: primary.priceLabel,
        price: primary.price,
        assetRef: hasImages ? galleryAssets[0].id : undefined,
        factRefs: ['product.name', 'product.price', 'product.brand'],
      },
    },
    gallery: {
      type: 'gallery',
      id: 'gallery',
      props: {
        title: products.length > 1 ? '系列视觉' : '产品视觉',
        assetRefs: galleryAssets.map((asset) => asset.id),
        captions: galleryAssets.map((asset) => asset.alt),
      },
    },
    features: {
      type: 'features',
      id: 'features',
      props: {
        title: '已确认的产品重点',
        items: seed.highlights.map((highlight) => {
          const fill = (value: string) => value.replace(/\{\{price\}\}/g, primary.price);
          return { title: fill(highlight.title), body: fill(highlight.body) };
        }),
      },
    },
    specs: {
      type: 'specs',
      id: 'specs',
      props: {
        title: '产品信息',
        tabs: [
          {
            label: '已确认',
            rows: confirmedRows.length > 0 ? confirmedRows : [{ label: '产品名称', value: primary.name, verified: true }],
          },
          {
            label: '待确认',
            rows:
              pendingRows.length > 0
                ? pendingRows
                : [{ label: '资料完整性', value: '已确认完整', verified: true }],
          },
        ],
      },
    },
    products: {
      type: 'products',
      id: 'products',
      props: {
        title: `${seed.brand} 系列`,
        items: products.map((product) => ({
          id: product.id,
          name: product.name,
          summary: product.summary,
          price: product.price,
          priceLabel: product.priceLabel,
          tags: [seed.category, product.unknown.length > 0 ? '部分待确认' : '信息完整'],
          assetRef: product.assetRefs[0],
          rows: Object.values(product.facts).map((fact) => ({ label: fact.label, value: fact.value, verified: fact.verified })),
        })),
      },
    },
    story: {
      type: 'story',
      id: 'story',
      props: {
        title: '关于 ' + seed.brand,
        body: seed.story,
        assetRef: hasImages ? galleryAssets[galleryAssets.length - 1].id : undefined,
        points: seed.constraints,
      },
    },
    cta: {
      type: 'cta',
      id: 'cta',
      props: {
        title: '想为你的产品做一套宣传作品？',
        body: 'OneBoss 依据已确认的产品事实生成交互网站、海报与配套文案，客户可以只改需要改的部分。',
        label: '了解制作服务',
        href: '/pricing',
      },
    },
  };

  const flow = design.sectionFlow.filter((type) => type !== 'products' || products.length > 1);
  if (products.length > 1 && !flow.includes('products')) flow.splice(flow.length - 2, 0, 'products');
  if (!hasImages) {
    // 无图项目：不渲染图库，主视觉使用文字布局
    return finalize(flow.filter((type) => type !== 'gallery').map((type) => sections[type]).filter(Boolean));
  }
  return finalize(flow.map((type) => sections[type]).filter(Boolean));

  function finalize(list: SiteSection[]): SiteSpec {
    const warnings: string[] = [];
    if (!hasImages) warnings.push('未提供商家实拍，网站使用文字与图形版式，不生成虚构商品照片。');
    if (!seed.assets.every((asset) => asset.isConcept)) warnings.push('存在非概念素材，发布前需核对授权。');
    if (primary.unknown.length > 0) warnings.push(`以下信息未确认，宣传中保持“待确认”：${primary.unknown.join('、')}。`);
    const galleryCount = galleryAssets.length;
    return {
      schemaVersion: '1.0',
      projectId: seed.id,
      revision: input.siteRevision,
      designSystemVersion: design.version,
      factVersion,
      styleId: design.styleId,
      pages: [{ slug: 'home', title: primary.name, sections: list }],
      interactions: [
        ...(galleryCount > 1 ? (['carousel'] as const) : []),
        ...(['tabs'] as const),
        ...(['scrollReveal'] as const),
      ],
      seo: {
        title: `${seed.brand.includes('待确认') ? '' : `${seed.brand} `}${primary.name}｜产品宣传`,
        description: `${primary.summary} ${priceVerified ? `已确认价格：${primary.price}。` : '价格待客户确认，暂不展示具体金额。'}未确认的信息不会写入宣传。`,
      },
      warnings,
    };
  }
}

export function buildPoster(
  input: ComposeInput,
  height: 1080 | 1350,
): { spec: PosterSpec; decision: QrDecision; warnings: string[] } {
  const { seed, design, qrUrl, qrSource } = input;
  const products = resolveProducts(seed, input.factOverrides);
  const primary = products[0];
  const factVersion = input.factVersion ?? seed.factVersion;
  const geometry = posterGeometry(design.posterLayout, height);
  const requested = input.qrRequested ?? 'auto';
  const decision = chooseQrPlacement(geometry, requested);
  const posterId = `${seed.id}-${design.styleId}-${height}`;
  const headline = input.headlineOverride?.trim() || primary.name;
  const warnings: string[] = [];
  if (decision.conflicts[decision.placement].length > 0) {
    warnings.push(`二维码安全区与${decision.conflicts[decision.placement].join('、')}存在重叠，请设计师调整版式。`);
  }
  if (qrSource === 'fixture-preview') {
    warnings.push('二维码指向演示预览地址；正式交付前必须替换为 A 组已验证的公开网址。');
  }
  if (primary.facts['product.price']?.verified === false) {
    warnings.push('价格尚未确认：海报显示“价格待确认”，不会猜测金额。');
  }
  const selectedQr = geometry.qrCandidates[decision.placement];

  return {
    spec: {
      schemaVersion: '1.0',
      projectId: seed.id,
      revision: input.posterRevision,
      designSystemVersion: design.version,
      factVersion,
      posterId,
      canvas: { width: 1080, height },
      layout: design.posterLayout,
      styleId: design.styleId,
      brand: seed.brand,
      productName: primary.name,
      headline,
      subhead: primary.summary,
      price: primary.price,
      priceLabel: primary.priceLabel,
      tags: seed.hashtags.map((tag) => tag.replace(/^#/, '')).slice(0, 3),
      assetRef: primary.assetRefs[0],
      qr: {
        placement: decision.placement,
        requested,
        urlSource: qrSource,
        url: qrUrl,
        caption: qrSource === 'published-site' ? '扫码查看产品页面' : '扫码查看预览（未发布）',
        quietZoneModules: 4,
      },
      copyPackId: `copy-${posterId}`,
      safeZones: [
        { ...geometry.art, label: '产品主视觉' },
        { ...geometry.price, label: '价格信息' },
        { ...geometry.headline, label: '标题' },
        { ...selectedQr, label: '二维码安全区' },
      ],
    },
    decision,
    warnings,
  };
}

export function buildCopies(input: ComposeInput, height: 1080 | 1350): PosterCopyBundle {
  const { seed, design } = input;
  const products = resolveProducts(seed, input.factOverrides);
  const primary = products[0];
  const factVersion = input.factVersion ?? seed.factVersion;
  const posterId = `${seed.id}-${design.styleId}-${height}`;
  const priceVerified = primary.facts['product.price']?.verified !== false;
  const unknownForNote = primary.unknown.filter((item) => item !== '价格' || priceVerified);
  const unknownNote = unknownForNote.length
    ? `${unknownForNote.join('、')}尚未确认，我们不会在宣传里补写这些信息。`
    : priceVerified
      ? '产品资料已确认完整。'
      : '其余产品资料仍待确认。';
  const titleByStyle: Record<string, string> = {
    'editorial-minimal': `${primary.name}｜${seed.category}里的安静提案`,
    'future-tech': `${primary.name}｜先把已确认的信息讲清楚`,
    'young-vibrant': priceVerified ? `${primary.name}｜${primary.price}` : `${primary.name}｜最新产品页面`,
  };
  const title = input.headlineOverride?.trim() || titleByStyle[design.styleId] || primary.name;
  const priceLine = priceVerified ? `已确认价格：${primary.price}。` : '价格尚未确认，暂不展示具体金额。';
  const body = `${primary.summary}\n\n${priceLine}${unknownNote}\n\n想了解完整产品资料，可扫码查看产品页面。`;

  return {
    posterId,
    title,
    body,
    hashtags: seed.hashtags,
    coverCaption: input.headlineOverride?.trim() || primary.name,
    cta: '扫码查看产品页面',
    factVersion,
    posterFile: posterFilename(seed, design.styleId, height),
    complianceNotes: [
      `价格与产品信息来自事实版本 V${factVersion}，网站、海报、文案同源。`,
      '未使用未经确认的材质、尺寸、性能或销量描述。',
      ...(priceVerified ? [] : ['价格未确认：没有填写猜测金额，海报显示“价格待确认”。']),
      input.qrSource === 'fixture-preview'
        ? '当前二维码为演示预览地址，不是 A 组正式发布链接。'
        : '二维码指向 A 组演示发布地址，正式上线后需再次核验。',
    ],
  };
}

export function buildProjectArtifacts(input: ComposeInput) {
  const site = buildSiteSpec(input);
  const portrait = buildPoster(input, 1350);
  const square = buildPoster(input, 1080);
  const copies = [buildCopies(input, 1350), buildCopies(input, 1080)];
  return {
    site,
    posters: [portrait.spec, square.spec],
    copies,
    warnings: [...new Set([...portrait.warnings, ...square.warnings, ...site.warnings])],
    decisions: { portrait: portrait.decision, square: square.decision },
  };
}

export function placementLabel(placement: QrPlacement): string {
  return placement === 'bottom-right' ? '右下角' : '左下角';
}

