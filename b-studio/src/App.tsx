import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Home } from './pages/Home';
import { Create } from './pages/Create';
import { Pricing } from './pages/Pricing';
import { Checkout } from './pages/Checkout';
import { Orders } from './pages/Orders';
import { PublicSite } from './pages/PublicSite';
import { StudioLayout } from './pages/studio/StudioLayout';
import { Intake } from './pages/studio/Intake';
import { Creative } from './pages/studio/Creative';
import { SitePreview } from './pages/studio/SitePreview';
import { Posters } from './pages/studio/Posters';
import { Revise } from './pages/studio/Revise';
import { Delivery } from './pages/studio/Delivery';
import { Agents } from './pages/studio/Agents';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/create" element={<Create />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/checkout" element={<Checkout />} />
      <Route path="/orders" element={<Orders />} />
      <Route path="/projects/:projectId" element={<StudioLayout />}>
        <Route index element={<Navigate to="creative" replace />} />
        <Route path="intake" element={<Intake />} />
        <Route path="creative" element={<Creative />} />
        <Route path="site" element={<SitePreview />} />
        <Route path="posters" element={<Posters />} />
        <Route path="revise" element={<Revise />} />
        <Route path="delivery" element={<Delivery />} />
        <Route path="agents" element={<Agents />} />
        <Route path="*" element={<Navigate to="creative" replace />} />
      </Route>
      <Route path="/p/:slug" element={<PublicSite />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <main className="public-missing">
      <span className="eyebrow">404</span>
      <h1>这个页面不存在</h1>
      <p>链接可能已失效，或该演示项目尚未创建。</p>
      <Link className="button dark" to="/">
        返回 OneBoss 首页
      </Link>
    </main>
  );
}
