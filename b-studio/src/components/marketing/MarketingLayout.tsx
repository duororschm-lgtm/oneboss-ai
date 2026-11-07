import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { defaultProjectId } from '../../data/projects';

const navItems = [
  { to: '/', label: '首页', end: true },
  { to: '/create', label: '生成网站' },
  { to: '/pricing', label: '套餐价格' },
  { to: '/orders', label: '我的订单' },
  { to: `/projects/${defaultProjectId}/creative`, label: '创意工作台' },
  { to: '/p/one-living-chair', label: '交付示例' },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  return (
    <header className="marketing-nav">
      <Link className="wordmark" to="/" onClick={() => setOpen(false)} aria-label="OneBoss 首页">
        <i aria-hidden />
        OneBoss<span>AI</span>
      </Link>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-label={open ? '关闭菜单' : '打开菜单'}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      <nav className={open ? 'open' : ''} aria-label="主导航">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? 'active' : '')}
            onClick={() => setOpen(false)}
          >
            {item.label}
          </NavLink>
        ))}
        <Link className="nav-cta" to="/create" onClick={() => setOpen(false)}>
          开始生成 <ArrowRight size={15} />
        </Link>
      </nav>
      <span className="visually-hidden">{location.pathname}</span>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="footer-brand">
        <strong>OneBoss AI</strong>
        <p>AI 创意宣传制作服务。网站、海报、二维码与小红书配套文案，一套已确认事实贯穿全部作品。</p>
        <span className="footer-demo">当前为功能演示 · 非真实付款或正式客户交付</span>
      </div>
      <div className="footer-col">
        <span>服务</span>
        <Link to="/pricing">套餐与权益</Link>
        <Link to={`/projects/${defaultProjectId}/creative`}>创意方向</Link>
        <Link to={`/projects/${defaultProjectId}/site`}>交互网站</Link>
        <Link to={`/projects/${defaultProjectId}/posters`}>海报导出</Link>
      </div>
      <div className="footer-col">
        <span>演示项目</span>
        <Link to="/projects/demo-car-002/creative">汽车 · 指导价</Link>
        <Link to="/projects/demo-noimg-003/creative">无图产品 · 图文兜底</Link>
        <Link to="/projects/demo-multi-004/creative">多产品目录</Link>
      </div>
      <div className="footer-col">
        <span>服务边界</span>
        <p>不做 3D 建模、商品交易、库存物流与广告代投。</p>
        <p>不保证小红书/平台审核通过；二维码与外链规则以平台为准。</p>
      </div>
    </footer>
  );
}

export function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-shell">
      <MarketingNav />
      {children}
      <MarketingFooter />
    </div>
  );
}

