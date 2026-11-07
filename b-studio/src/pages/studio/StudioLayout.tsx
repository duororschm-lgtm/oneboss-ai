import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, ChevronDown, ExternalLink, RotateCcw } from 'lucide-react';
import { Badge } from '../../components/ui';
import { useStudio } from '../../lib/store';

const tabs = [
  { path: 'intake', label: '产品资料' },
  { path: 'creative', label: '创意方向' },
  { path: 'site', label: '网站预览' },
  { path: 'posters', label: '海报与文案' },
  { path: 'revise', label: '修改与版本' },
  { path: 'delivery', label: '交付中心' },
  { path: 'agents', label: '运行记录' },
];

export function StudioLayout() {
  const { projectId = '' } = useParams();
  const { getBundle, resetDemo, allSeeds } = useStudio();
  const navigate = useNavigate();
  const location = useLocation();

  let bundle;
  try {
    bundle = getBundle(projectId);
  } catch {
    return (
      <div className="studio-shell">
        <div className="studio-missing">
          <h1>项目不存在</h1>
          <p>请从项目列表重新进入，或描述一个新产品生成网站。</p>
          <div className="public-missing-actions">
            <Link className="button dark" to="/create">
              描述产品，生成网站
            </Link>
            <Link className="button ghost" to="/">
              返回首页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { seed } = bundle;
  const { state } = bundle;
  const activeTab = tabs.find((tab) => location.pathname.endsWith(`/${tab.path}`))?.path ?? 'creative';

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <Link className="studio-brand" to="/">
          <i aria-hidden />
          OneBoss<span>STUDIO</span>
        </Link>
        <div className="studio-project-switch">
          <label htmlFor="project-switch" className="visually-hidden">
            切换演示项目
          </label>
          <select
            id="project-switch"
            value={seed.id}
            onChange={(event) => navigate(`/projects/${event.target.value}/${activeTab}`)}
          >
            {allSeeds.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
                {project.id.startsWith('custom-') ? '（描述生成）' : ''}
              </option>
            ))}
          </select>
          <ChevronDown size={16} aria-hidden />
        </div>
        <div className="studio-top-actions">
          <Link className="button ghost small" to="/create">
            新建项目
          </Link>
          <Badge tone="warn">DEMO 项目</Badge>
          {state.published ? (
            <Link className="button ghost small" to={`/p/${seed.publishedSlug}`} target="_blank" rel="noreferrer">
              查看公开站点 <ExternalLink size={14} />
            </Link>
          ) : (
            <Link className="button ghost small" to={`/projects/${seed.id}/site`}>
              尚未发布 <ArrowUpRight size={14} />
            </Link>
          )}
          <Link className="button dark small" to={`/projects/${seed.id}/delivery`}>
            交付中心
          </Link>
        </div>
      </header>

      <section className="studio-project-head">
        <div>
          <span className="eyebrow">PROJECT / {seed.id}</span>
          <h1>{seed.name}</h1>
          <p>{bundle.designSite.name} · {bundle.designSite.tagline}</p>
        </div>
        <dl className="studio-metrics">
          <div>
            <dt>事实版本</dt>
            <dd>V{bundle.factVersion}</dd>
          </div>
          <div>
            <dt>网站版本</dt>
            <dd>V{state.siteRevision}</dd>
          </div>
          <div>
            <dt>海报版本</dt>
            <dd>V{state.posterRevision}</dd>
          </div>
          <div>
            <dt>状态</dt>
            <dd>{state.acceptedAt ? '已验收' : state.published ? '已发布' : '草稿'}</dd>
          </div>
        </dl>
      </section>

      <nav className="studio-tabs" aria-label="项目工作台">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={`/projects/${seed.id}/${tab.path}`}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {tab.label}
          </NavLink>
        ))}
        <button type="button" className="studio-reset" onClick={resetDemo} title="清空本地演示状态">
          <RotateCcw size={14} /> 重置演示
        </button>
      </nav>

      <main className="studio-main">
        <Outlet />
      </main>

      <footer className="studio-footer">
        <span>本页为 B 组渲染与工作台演示；订单、支付、发布与存储由 A 组负责。</span>
        <span>事实版本 V{bundle.factVersion} · {seed.demoNote}</span>
      </footer>
    </div>
  );
}
