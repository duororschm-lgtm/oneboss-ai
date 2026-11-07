import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { SiteRenderer } from '../components/site-renderer/SiteRenderer';
import { designPresets } from '../data/design-presets';
import { useStudio } from '../lib/store';
import { buildPublishedSite } from '../lib/store';
import { applyDesignOverride } from '../lib/creative/composer';

export function PublicSite() {
  const { slug = '' } = useParams();
  const { state, getSeedBySlug } = useStudio();
  const seed = getSeedBySlug(slug);
  const project = seed ? state.projects[seed.id] : undefined;
  const snapshot = project?.published ?? null;

  const spec = useMemo(() => (seed && snapshot ? buildPublishedSite(seed, snapshot) : null), [seed, snapshot]);
  const design = useMemo(
    () => (snapshot ? applyDesignOverride(designPresets[snapshot.styleId], snapshot.paletteOverride, snapshot.nameOverride ?? undefined) : null),
    [snapshot],
  );

  useEffect(() => {
    if (!spec) return;
    document.title = spec.seo.title;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', spec.seo.description);
    return () => {
      document.title = 'OneBoss AI · 创意宣传制作';
    };
  }, [spec]);

  if (!seed) {
    return (
      <main className="public-missing">
        <h1>页面不存在</h1>
        <p>请检查链接是否正确，或返回 OneBoss 官网。</p>
        <Link className="button dark" to="/">
          返回首页
        </Link>
      </main>
    );
  }

  if (!snapshot || !spec || !design) {
    return (
      <main className="public-missing">
        <span className="eyebrow">ONEBOSS / DEMO</span>
        <h1>{seed.name} 尚未发布</h1>
        <p>该项目还没有已批准的公开版本。发布演示站点后，这个地址会展示已批准的事实与设计。</p>
        <div className="public-missing-actions">
          <Link className="button dark" to={`/projects/${seed.id}/site`}>
            前往发布
          </Link>
          <Link className="button ghost" to="/">
            返回官网
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="public-site-shell">
      <div className="public-bar">
        <span>
          <i aria-hidden /> OneBoss 演示站点 · 网站 V{snapshot.siteRevision} · 事实 V{snapshot.factVersion}
        </span>
        <div>
          <Link to={`/projects/${seed.id}/site`}>
            <ArrowLeft size={13} /> 工作台
          </Link>
          <span className="public-bar-note">正式发布由 A 组完成并核验 HTTPS</span>
        </div>
      </div>
      <SiteRenderer spec={spec} designSystem={design} seed={seed} mode="public" />
      <div className="public-footnote">
        <span>由 OneBoss 依据客户已确认事实生成</span>
        <Link to="/pricing">
          了解制作服务 <ExternalLink size={13} />
        </Link>
      </div>
    </div>
  );
}
