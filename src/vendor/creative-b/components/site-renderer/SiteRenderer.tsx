'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import type {
  Asset,
  DesignSystem,
  ProductFact,
  ProjectSeed,
  SectionLayout,
  SiteSection,
  SiteSpec,
} from '../../types/contracts';
import { isSafePublicUrl } from '../../types/contracts';
import { ProductArt } from './ProductArt';

type Props = {
  spec: SiteSpec;
  designSystem: DesignSystem;
  seed: ProjectSeed;
  mode?: 'preview' | 'public';
};

/** Build CSS modifier classes from a section's layout configuration. */
function layoutClasses(layout: SectionLayout | undefined): string {
  if (!layout) return '';
  const parts: string[] = [];
  if (layout.variant) parts.push(`variant-${layout.variant}`);
  if (layout.width) parts.push(`width-${layout.width}`);
  if (layout.emphasis) parts.push(`emphasis-${layout.emphasis}`);
  if (layout.background) parts.push(`bg-${layout.background}`);
  if (layout.alignment) parts.push(`align-${layout.alignment}`);
  if (layout.columns) parts.push(`cols-${layout.columns}`);
  if (layout.imageRatio) parts.push(`ratio-${layout.imageRatio}`);
  return parts.join(' ');
}

const navLabel: Record<string, string> = {
  gallery: '视觉',
  features: '特点',
  specs: '信息',
  products: '系列',
  story: '品牌',
};

function safeHref(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith('/')) return href;
  return isSafePublicUrl(href) ? href : undefined;
}

export function SiteRenderer({ spec, designSystem, seed, mode = 'preview' }: Props) {
  const page = spec.pages[0];
  const rawId = useId();
  const uid = useMemo(() => `site${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [rawId]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(page.sections[0]?.id ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const sectionId = (id: string) => `${uid}-${id}`;
  const scrollTo = (id: string) => {
    const doc = rootRef.current?.ownerDocument;
    const node = doc?.getElementById(sectionId(id));
    const reduceMotion = doc?.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
    node?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    setMenuOpen(false);
  };

  const variables = {
    '--st-bg': designSystem.palette.background,
    '--st-surface': designSystem.palette.surface,
    '--st-text': designSystem.palette.text,
    '--st-muted': designSystem.palette.muted,
    '--st-accent': designSystem.palette.accent,
    '--st-accent-text': designSystem.palette.accentText,
    '--st-border': designSystem.palette.border,
    '--st-display': designSystem.typography.display,
    '--st-body': designSystem.typography.body,
    '--st-mono': designSystem.typography.mono,
    '--st-scale': String(designSystem.typography.scale),
    '--st-space': String(designSystem.spacingScale),
    '--st-radius': `${designSystem.radiusScale}px`,
  } as React.CSSProperties;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.getAttribute('data-section') ?? '');
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0.05, 0.35, 0.7] },
    );
    root.querySelectorAll<HTMLElement>('[data-section]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [page.sections]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('.site-section'));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('is-visible');
        });
      },
      { threshold: 0.12 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [page.sections]);

  const assetOf = (ref?: string): Asset | undefined =>
    seed.assets.find((asset) => asset.id === ref);
  const navSections = page.sections.filter((section) => !['hero', 'cta'].includes(section.type));
  const heroIndex = page.sections.findIndex((section) => section.type === 'hero');
  const nextAfterHero = page.sections[heroIndex + 1];
  const firstSection = page.sections[heroIndex >= 0 ? heroIndex : 0];
  const contactSection = page.sections.find((section) => section.type === 'cta');

  return (
    <div
      ref={rootRef}
      className={`site style-${designSystem.styleId} layout-${designSystem.layoutMode} hero-${designSystem.heroComposition || designSystem.layoutMode} motion-${designSystem.motionPreset}${designSystem.density ? ` density-${designSystem.density}` : ''}${designSystem.imageTreatment ? ` img-${designSystem.imageTreatment}` : ''}`}
      style={variables}
      data-mode={mode}
      data-style={designSystem.styleId}
    >
      <header className="site-nav">
        <button
          className="site-brand"
          type="button"
          onClick={() => firstSection && scrollTo(firstSection.id)}
          aria-label="回到顶部"
        >
          <i aria-hidden />
          {seed.brand}
        </button>
        <button
          className="site-menu-toggle"
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? '关闭导航' : '打开导航'}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <nav className={menuOpen ? 'open' : ''} aria-label="产品网站导航">
          {navSections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={active === section.id ? 'active' : ''}
              onClick={() => scrollTo(section.id)}
            >
              {navLabel[section.type] ?? section.type}
            </button>
          ))}
          {contactSection && (
            <button type="button" className="nav-cta" onClick={() => scrollTo(contactSection.id)}>
              了解更多 <ArrowRight size={15} />
            </button>
          )}
        </nav>
      </header>

      <div className="site-content">
        {page.sections.map((section, index) => (
          <div
            key={section.id}
            data-section={section.id}
            id={sectionId(section.id)}
            className="site-anchor"
          >
            <SectionView
              section={section}
              index={index}
              design={designSystem}
              seed={seed}
              assetOf={assetOf}
              onJump={scrollTo}
              nextAfterHero={nextAfterHero?.id}
              factVersion={spec.factVersion}
            />
          </div>
        ))}
      </div>

      <footer className="site-footer">
        <strong>{seed.brand}</strong>
        <span>产品信息以客户已确认事实为准 · 事实版本 V{spec.factVersion}</span>
        <span className="site-footer-note">未确认信息不会补写</span>
      </footer>
    </div>
  );
}

function SectionView({
  section,
  index,
  design,
  seed,
  assetOf,
  onJump,
  nextAfterHero,
  factVersion,
}: {
  section: SiteSection;
  index: number;
  design: DesignSystem;
  seed: ProjectSeed;
  assetOf: (ref?: string) => Asset | undefined;
  onJump: (id: string) => void;
  nextAfterHero?: string;
  factVersion: number;
}) {
  const order = String(index + 1).padStart(2, '0');
  const lc = layoutClasses(section.layout);
  switch (section.type) {
    case 'hero': {
      const asset = assetOf(section.props.assetRef);
      return (
        <section id={`${section.id}-hero`} className={`site-section hero-section ${lc}`}>
          <div className="hero-copy">
            <span className="eyebrow">{section.props.eyebrow}</span>
            <h1>{section.props.title}</h1>
            <p className="hero-sub">{section.props.subtitle}</p>
            <div className="hero-actions">
              <button
                type="button"
                className="site-primary"
                onClick={() => nextAfterHero && onJump(nextAfterHero)}
              >
                {section.props.ctaLabel} <ArrowRight size={17} />
              </button>
              <div className="hero-price">
                <small>{section.props.priceLabel}</small>
                <strong>{section.props.price}</strong>
              </div>
            </div>
            <p className="hero-fact">事实版本 V{factVersion} · 由 OneBoss 依据已确认资料生成</p>
          </div>
          {section.props.assetRef ? (
            <div className="hero-visual">
              <ProductArt asset={asset} palette={design.palette} styleId={design.styleId} />
              <span className="art-badge">
                {asset?.url ? '客户授权素材' : '概念图形 · 非商家实拍'}
              </span>
            </div>
          ) : (
            <div className="hero-type-only" aria-hidden>
              <span>{seed.category}</span>
              <span>{seed.brand}</span>
            </div>
          )}
        </section>
      );
    }
    case 'gallery':
      return (
        <Gallery
          key={section.id}
          section={section}
          order={order}
          design={design}
          assetOf={assetOf}
          lc={lc}
        />
      );
    case 'features':
      return (
        <section className={`site-section content-section ${lc}`}>
          <SectionHead order={order} title={section.props.title} />
          <div className={`feature-grid ${section.layout?.variant === 'numbered-list' ? 'feature-list' : section.layout?.variant === 'editorial-columns' ? 'feature-columns' : section.layout?.variant === 'horizontal-steps' ? 'feature-steps' : section.layout?.variant === 'bento' ? 'feature-bento' : ''}`}>
            {section.props.items.map((item, itemIndex) => (
              <article className="feature-card" key={item.title + itemIndex}>
                <span className="feature-index">{String(itemIndex + 1).padStart(2, '0')}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      );
    case 'specs':
      return <Specs key={section.id} section={section} order={order} lc={lc} />;
    case 'products':
      return (
        <Products
          key={section.id}
          section={section}
          order={order}
          design={design}
          assetOf={assetOf}
          lc={lc}
        />
      );
    case 'story':
      return (
        <section className={`site-section story-section ${lc}`}>
          <div className="story-copy">
            <SectionHead order={order} title={section.props.title} />
            <p>{section.props.body}</p>
            <ul className="story-points">
              {section.props.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
          {section.props.assetRef && (
            <div className="story-visual">
              <ProductArt
                asset={assetOf(section.props.assetRef)}
                palette={design.palette}
                styleId={design.styleId}
              />
            </div>
          )}
        </section>
      );
    case 'cta': {
      const href = safeHref(section.props.href);
      return (
        <section className={`site-section cta-section ${lc}`}>
          <div>
            <span className="eyebrow">NEXT</span>
            <h2>{section.props.title}</h2>
            <p>{section.props.body}</p>
          </div>
          {href ? (
            <a className="cta-button" href={href}>
              {section.props.label} <ArrowUpRight size={18} />
            </a>
          ) : (
            <span className="cta-muted">联系方式待客户确认后展示</span>
          )}
        </section>
      );
    }
    case 'product-3d':
      return (
        <Product3DSection
          key={section.id}
          section={section}
          order={order}
          lc={lc}
          design={design}
        />
      );
    default:
      return null;
  }
}

function SectionHead({ order, title }: { order: string; title: string }) {
  return (
    <div className="section-head">
      <span>{order}</span>
      <h2>{title}</h2>
    </div>
  );
}

function Gallery({
  section,
  order,
  design,
  assetOf,
  lc,
}: {
  section: Extract<SiteSection, { type: 'gallery' }>;
  order: string;
  design: DesignSystem;
  assetOf: (ref?: string) => Asset | undefined;
  lc?: string;
}) {
  const total = section.props.assetRefs.length;
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const move = (delta: number) => setIndex((current) => (current + delta + total) % total);
  const variant = section.layout?.variant ?? '';
  const isGrid = variant === 'masonry' || variant === 'editorial-grid';
  const isStrip = variant === 'horizontal-strip';
  const isPair = variant === 'featured-pair';

  if (isGrid) {
    return (
      <section className={`site-section gallery-section ${lc} gallery-grid-variant`}>
        <SectionHead order={order} title={section.props.title} />
        <div className={`gallery-masonry ${variant === 'editorial-grid' ? 'gallery-editorial' : ''}`}>
          {section.props.assetRefs.map((ref, i) => (
            <figure key={ref + i} className="gallery-cell">
              <ProductArt asset={assetOf(ref)} palette={design.palette} styleId={design.styleId} />
              <figcaption>{section.props.captions[i] || '客户授权素材'}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    );
  }

  if (isStrip) {
    return (
      <section className={`site-section gallery-section ${lc} gallery-strip-variant`}>
        <SectionHead order={order} title={section.props.title} />
        <div className="gallery-strip" role="group" aria-label="产品图片横排">
          {section.props.assetRefs.map((ref, i) => (
            <figure key={ref + i} className="gallery-strip-item">
              <ProductArt asset={assetOf(ref)} palette={design.palette} styleId={design.styleId} />
              <figcaption>{section.props.captions[i] || '客户授权素材'}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    );
  }

  if (isPair && total >= 2) {
    return (
      <section className={`site-section gallery-section ${lc} gallery-pair-variant`}>
        <SectionHead order={order} title={section.props.title} />
        <div className="gallery-pair">
          <figure className="gallery-pair-main">
            <ProductArt
              asset={assetOf(section.props.assetRefs[0])}
              palette={design.palette}
              styleId={design.styleId}
            />
            <figcaption>{section.props.captions[0] || '客户授权素材'}</figcaption>
          </figure>
          <figure className="gallery-pair-side">
            <ProductArt
              asset={assetOf(section.props.assetRefs[1])}
              palette={design.palette}
              styleId={design.styleId}
            />
            <figcaption>{section.props.captions[1] || '客户授权素材'}</figcaption>
          </figure>
        </div>
      </section>
    );
  }

  // Default carousel
  return (
    <section className={`site-section gallery-section ${lc}`}>
      <SectionHead order={order} title={section.props.title} />
      <div
        className="gallery-stage"
        role="group"
        aria-label="产品图片轮播"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') move(-1);
          if (event.key === 'ArrowRight') move(1);
        }}
        onPointerDown={(event) => {
          startX.current = event.clientX;
        }}
        onPointerUp={(event) => {
          if (startX.current === null) return;
          const delta = event.clientX - startX.current;
          if (Math.abs(delta) > 40) move(delta > 0 ? -1 : 1);
          startX.current = null;
        }}
      >
        <ProductArt
          asset={assetOf(section.props.assetRefs[index])}
          palette={design.palette}
          styleId={design.styleId}
        />
        <div className="gallery-caption">
          <span>{section.props.captions[index]}</span>
          {total > 1 && (
            <small>
              {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </small>
          )}
        </div>
        {total > 1 && (
          <div className="gallery-controls">
            <button type="button" onClick={() => move(-1)} aria-label="上一张图片">
              <ChevronLeft size={18} />
            </button>
            <button type="button" onClick={() => move(1)} aria-label="下一张图片">
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>
      {total > 1 && (
        <div className="gallery-thumbs" role="tablist" aria-label="选择图片">
          {section.props.assetRefs.map((ref, thumbIndex) => (
            <button
              key={ref + thumbIndex}
              type="button"
              role="tab"
              aria-selected={thumbIndex === index}
              aria-label={`查看第 ${thumbIndex + 1} 张`}
              className={thumbIndex === index ? 'active' : ''}
              onClick={() => setIndex(thumbIndex)}
            >
              <ProductArt asset={assetOf(ref)} palette={design.palette} styleId={design.styleId} />
            </button>
          ))}
          {section.props.assetRefs.length === 0 && <span>暂无图片</span>}
        </div>
      )}
    </section>
  );
}

function Specs({
  section,
  order,
  lc,
}: {
  section: Extract<SiteSection, { type: 'specs' }>;
  order: string;
  lc?: string;
}) {
  const [active, setActive] = useState(0);
  const tabs = section.props.tabs;
  const rows = tabs[active]?.rows ?? [];
  const tabId = useId();
  const variant = section.layout?.variant ?? '';
  const isCards = variant === 'spec-cards';
  const isAccordion = variant === 'accordion';
  const isTable = variant === 'technical-table';

  return (
    <section className={`site-section specs-section ${lc}`}>
      <SectionHead order={order} title={section.props.title} />
      {isCards ? (
        <div className="spec-cards">
          {tabs[0]?.rows.map((row) => (
            <div key={row.label} className={`spec-card ${row.verified ? '' : 'pending'}`}>
              <small>{row.label}</small>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      ) : isAccordion ? (
        <div className="spec-accordion">
          {tabs.map((tab, tabIndex) => (
            <details key={tab.label} open={tabIndex === 0}>
              <summary>{tab.label}</summary>
              <div className="spec-table">
                {tab.rows.map((row) => (
                  <div key={row.label} className={row.verified ? '' : 'pending'}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                    <small>{row.verified ? '已确认' : '待确认'}</small>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <>
          <div
            className="spec-tabs"
            role="tablist"
            aria-label="产品信息分类"
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (active + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (active - 1 + tabs.length) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : undefined;
              if (next === undefined) return;
              event.preventDefault();
              setActive(next);
              event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
            }}
          >
            {tabs.map((tab, tabIndex) => (
              <button
                key={tab.label}
                type="button"
                role="tab"
                id={`${tabId}-tab-${tabIndex}`}
                aria-controls={`${tabId}-panel`}
                aria-selected={tabIndex === active}
                data-oneboss-interaction={tabIndex === 1 ? 'tabs' : undefined}
                tabIndex={tabIndex === active ? 0 : -1}
                className={tabIndex === active ? 'active' : ''}
                onClick={() => setActive(tabIndex)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div
            className={`spec-table ${isTable ? 'spec-technical' : ''}`}
            role="tabpanel"
            id={`${tabId}-panel`}
            aria-labelledby={`${tabId}-tab-${active}`}
          >
            {rows.map((row) => (
              <div key={row.label} className={row.verified ? '' : 'pending'}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
                <small>{row.verified ? '已确认' : '待确认'}</small>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Products({
  section,
  order,
  design,
  assetOf,
  lc,
}: {
  section: Extract<SiteSection, { type: 'products' }>;
  order: string;
  design: DesignSystem;
  assetOf: (ref?: string) => Asset | undefined;
  lc?: string;
}) {
  const [selectedId, setSelectedId] = useState(section.props.items[0]?.id ?? '');
  const selected =
    section.props.items.find((item) => item.id === selectedId) ?? section.props.items[0];
  if (!selected) return null;
  return (
    <section className={`site-section products-section ${lc}`}>
      <SectionHead order={order} title={section.props.title} />
      <div className="product-grid">
        {section.props.items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`product-card ${item.id === selected.id ? 'active' : ''}`}
            onClick={() => setSelectedId(item.id)}
            aria-pressed={item.id === selected.id}
          >
            <span className="product-art">
              <ProductArt
                asset={assetOf(item.assetRef)}
                palette={design.palette}
                styleId={design.styleId}
              />
            </span>
            <span className="product-card-copy">
              <strong>{item.name}</strong>
              <span>{item.price}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="product-detail">
        <div className="product-detail-copy">
          <span className="eyebrow">{selected.priceLabel}</span>
          <h3>{selected.name}</h3>
          <p>{selected.summary}</p>
          <dl>
            {selected.rows.slice(0, 4).map((row) => (
              <div key={row.label} className={row.verified ? '' : 'pending'}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="product-tags">
            {selected.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </div>
        <div className="product-detail-art">
          <ProductArt
            asset={assetOf(selected.assetRef)}
            palette={design.palette}
            styleId={design.styleId}
          />
        </div>
      </div>
    </section>
  );
}

function Product3DSection({
  section,
  order,
  lc,
  design,
}: {
  section: Extract<SiteSection, { type: 'product-3d' }>;
  order: string;
  lc?: string;
  design: DesignSystem;
}) {
  const [LazyViewer, setLazyViewer] = useState<React.ComponentType<Record<string, any>> | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let live = true;
    import('../../../../components/creative/three-d-viewer')
      .then((mod) => {
        if (live) setLazyViewer(() => mod.LazyProductViewer);
      })
      .catch(() => {
        if (live) setLoadError(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const trustLabel =
    section.props.modelTrust === 'verified_exploded'
      ? 'verified_exploded · 真实分件拆解'
      : section.props.modelTrust === 'conceptual_exploded'
        ? 'conceptual_exploded · 概念结构示意 · 非商家实拍'
        : section.props.modelTrust === 'appearance_3d'
          ? 'appearance_3d · 外观展示 · 3D 旋转'
          : 'static_fallback · 概念示意';

  return (
    <section className={`site-section product-3d-section ${lc}`}>
      <SectionHead order={order} title={section.props.title} />
      <p style={{ color: 'var(--st-muted)', maxWidth: 680, marginBottom: 24, lineHeight: 1.7 }}>
        {section.props.description}
      </p>
      {loadError ? (
        <div
          style={{
            padding: 32,
            background: 'var(--st-surface)',
            borderRadius: 12,
            textAlign: 'center',
            border: '1px solid var(--st-border)',
          }}
        >
          <p style={{ color: 'var(--st-muted)', fontSize: 14 }}>
            3D 内容暂时无法加载，以下为概念结构示意。
          </p>
          <p style={{ color: 'var(--st-muted)', fontSize: 12, marginTop: 8 }}>{trustLabel}</p>
        </div>
      ) : LazyViewer ? (
        <LazyViewer
          variant={section.props.variant3d ?? 'full-width-stage'}
          palette={{
            accent: design.palette.accent,
            surface: design.palette.surface,
            text: design.palette.text,
          }}
          trustLabel={trustLabel}
          height={440}
        />
      ) : (
        <div
          style={{
            height: 440,
            background: 'var(--st-surface)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--st-muted)',
          }}
        >
          3D 内容加载中…
        </div>
      )}
      <p
        style={{
          marginTop: 12,
          fontSize: 11,
          color: 'var(--st-muted)',
          opacity: 0.7,
        }}
      >
        {section.props.modelTrust === 'verified_exploded'
          ? '真实分件模型，拆解为工程验证结构。'
          : '概念结构示意，拆解为 AI 概念展示，非商家实拍。'}
      </p>
    </section>
  );
}
