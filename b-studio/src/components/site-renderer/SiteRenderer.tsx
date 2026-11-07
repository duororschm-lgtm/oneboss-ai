import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import type { Asset, DesignSystem, ProductFact, ProjectSeed, SiteSection, SiteSpec } from '../../types/contracts';
import { isSafePublicUrl } from '../../types/contracts';
import { ProductArt } from './ProductArt';

type Props = {
  spec: SiteSpec;
  designSystem: DesignSystem;
  seed: ProjectSeed;
  mode?: 'preview' | 'public';
};

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
    const node = document.getElementById(sectionId(id));
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  const assetOf = (ref?: string): Asset | undefined => seed.assets.find((asset) => asset.id === ref);
  const navSections = page.sections.filter((section) => !['hero', 'cta'].includes(section.type));
  const heroIndex = page.sections.findIndex((section) => section.id === 'hero');
  const nextAfterHero = page.sections[heroIndex + 1];

  return (
    <div
      ref={rootRef}
      className={`site style-${designSystem.styleId} layout-${designSystem.layoutMode} hero-${designSystem.heroComposition} motion-${designSystem.motionPreset}`}
      style={variables}
      data-mode={mode}
    >
      <header className="site-nav">
        <button className="site-brand" type="button" onClick={() => scrollTo('hero')} aria-label="回到顶部">
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
          <button type="button" className="nav-cta" onClick={() => scrollTo('cta')}>
            了解更多 <ArrowRight size={15} />
          </button>
        </nav>
      </header>

      <main>
        {page.sections.map((section, index) => (
          <div key={section.id} data-section={section.id} id={sectionId(section.id)} className="site-anchor">
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
      </main>

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
  switch (section.type) {
    case 'hero': {
      const asset = assetOf(section.props.assetRef);
      return (
        <section id={`${section.id}-hero`} className="site-section hero-section">
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
              <span className="art-badge">概念图形 · 非商家实拍</span>
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
      return <Gallery key={section.id} section={section} order={order} design={design} assetOf={assetOf} />;
    case 'features':
      return (
        <section className="site-section content-section">
          <SectionHead order={order} title={section.props.title} />
          <div className="feature-grid">
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
      return <Specs key={section.id} section={section} order={order} />;
    case 'products':
      return <Products key={section.id} section={section} order={order} design={design} assetOf={assetOf} />;
    case 'story':
      return (
        <section className="site-section story-section">
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
              <ProductArt asset={assetOf(section.props.assetRef)} palette={design.palette} styleId={design.styleId} />
            </div>
          )}
        </section>
      );
    case 'cta': {
      const href = safeHref(section.props.href);
      return (
        <section className="site-section cta-section">
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
}: {
  section: Extract<SiteSection, { type: 'gallery' }>;
  order: string;
  design: DesignSystem;
  assetOf: (ref?: string) => Asset | undefined;
}) {
  const total = section.props.assetRefs.length;
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const move = (delta: number) => setIndex((current) => (current + delta + total) % total);

  return (
    <section className="site-section gallery-section">
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
        <ProductArt asset={assetOf(section.props.assetRefs[index])} palette={design.palette} styleId={design.styleId} />
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

function Specs({ section, order }: { section: Extract<SiteSection, { type: 'specs' }>; order: string }) {
  const [active, setActive] = useState(0);
  const tabs = section.props.tabs;
  const rows = tabs[active]?.rows ?? [];
  return (
    <section className="site-section specs-section">
      <SectionHead order={order} title={section.props.title} />
      <div className="spec-tabs" role="tablist" aria-label="产品信息分类" onKeyDown={(event) => {
        if (event.key === 'ArrowRight') setActive((current) => (current + 1) % tabs.length);
        if (event.key === 'ArrowLeft') setActive((current) => (current - 1 + tabs.length) % tabs.length);
      }}>
        {tabs.map((tab, tabIndex) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={tabIndex === active}
            tabIndex={tabIndex === active ? 0 : -1}
            className={tabIndex === active ? 'active' : ''}
            onClick={() => setActive(tabIndex)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="spec-table" role="tabpanel">
        {rows.map((row) => (
          <div key={row.label} className={row.verified ? '' : 'pending'}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <small>{row.verified ? '已确认' : '待确认'}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function Products({
  section,
  order,
  design,
  assetOf,
}: {
  section: Extract<SiteSection, { type: 'products' }>;
  order: string;
  design: DesignSystem;
  assetOf: (ref?: string) => Asset | undefined;
}) {
  const [selectedId, setSelectedId] = useState(section.props.items[0]?.id ?? '');
  const selected = section.props.items.find((item) => item.id === selectedId) ?? section.props.items[0];
  if (!selected) return null;
  return (
    <section className="site-section products-section">
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
              <ProductArt asset={assetOf(item.assetRef)} palette={design.palette} styleId={design.styleId} />
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
          <ProductArt asset={assetOf(selected.assetRef)} palette={design.palette} styleId={design.styleId} />
        </div>
      </div>
    </section>
  );
}
