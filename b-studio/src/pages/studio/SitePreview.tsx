import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Copy, ExternalLink, Monitor, RefreshCw, Rocket, Smartphone, Tablet, TriangleAlert } from 'lucide-react';
import { SiteRenderer } from '../../components/site-renderer/SiteRenderer';
import { Badge, CopyButton, Notice, SectionHeading, formatDateTime } from '../../components/ui';
import { useProjectBundle, useStudio } from '../../lib/store';

type Device = 'desktop' | 'tablet' | 'phone';

const deviceMeta: Record<Device, { label: string; width: string; icon: typeof Monitor }> = {
  desktop: { label: '桌面', width: '100%', icon: Monitor },
  tablet: { label: '平板 768', width: '768px', icon: Tablet },
  phone: { label: '手机 375', width: '375px', icon: Smartphone },
};

export function SitePreview() {
  const { projectId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const generated = searchParams.get('generated') === '1';
  const bundle = useProjectBundle(projectId);
  const { publish } = useStudio();
  const [device, setDevice] = useState<Device>('desktop');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const handlePublish = async () => {
    setBusy(true);
    setError(null);
    try {
      await publish(projectId);
      setReloadKey((key) => key + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '发布失败');
    } finally {
      setBusy(false);
    }
  };

  const publicUrl = `${bundle.origin}/p/${bundle.seed.publishedSlug}`;

  return (
    <div className="studio-page site-page">
      <SectionHeading
        eyebrow="SITE RENDERER"
        title="真实交互网站预览"
        description="由 SiteSpec + DesignSystem 渲染的真实 React 页面：轮播、参数选项卡、产品目录与锚点导航都可操作。切换设备宽度检查响应式。"
        actions={
          <Badge tone={bundle.state.published ? 'good' : 'warn'}>{bundle.state.published ? `已发布 V${bundle.state.published.siteRevision}` : '尚未发布'}</Badge>
        }
      />

      {generated && (
        <Notice tone="good" title="已根据你的描述生成网站">
          这是由 SiteSpec + DesignSystem 实时渲染的页面。未在描述中出现的材质、参数与优惠保持“待确认”，不会由模板补写。
          <div className="notice-actions">
            <Link className="button ghost small" to={`/projects/${projectId}/creative`}>
              更换创意方向
            </Link>
            <Link className="button ghost small" to={`/projects/${projectId}/posters`}>
              查看海报与文案
            </Link>
            <Link className="button ghost small" to={`/projects/${projectId}/revise`}>
              提出修改
            </Link>
          </div>
        </Notice>
      )}

      <div className="site-toolbar">
        <div className="segmented" role="group" aria-label="预览尺寸">
          {(Object.keys(deviceMeta) as Device[]).map((key) => {
            const meta = deviceMeta[key];
            const Icon = meta.icon;
            return (
              <button key={key} type="button" className={device === key ? 'active' : ''} onClick={() => setDevice(key)}>
                <Icon size={15} /> {meta.label}
              </button>
            );
          })}
        </div>
        <div className="site-toolbar-actions">
          <button type="button" className="button ghost small" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw size={14} /> 重新加载
          </button>
          <Link className="button ghost small" to={`/p/${bundle.seed.publishedSlug}`} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> 独立页打开
          </Link>
          <button type="button" className="button dark small" onClick={handlePublish} disabled={busy}>
            <Rocket size={14} /> {busy ? '发布中…' : bundle.state.published ? '重新发布演示站点' : '发布演示站点'}
          </button>
        </div>
      </div>

      {error && (
        <Notice tone="error" title="发布失败">
          {error}
        </Notice>
      )}

      {bundle.state.published ? (
        <Notice tone="good" title={`已生成演示公开地址 · V${bundle.state.published.siteRevision}`}>
          <span className="mono">{publicUrl}</span> · {formatDateTime(bundle.state.published.at)} · 海报二维码已指向该地址。
          <div className="notice-actions">
            <CopyButton text={publicUrl} label="复制链接" className="button ghost small" />
            <a className="button ghost small" href={publicUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> 打开
            </a>
          </div>
        </Notice>
      ) : (
        <Notice tone="warn" title="当前为草稿版本">
          二维码暂时指向预览地址。发布演示站点后，二维码会切换到公开路径；正式环境必须由 A 组验证 HTTPS 可达后再交付。
        </Notice>
      )}

      {bundle.siteSpec.warnings.length > 0 && (
        <div className="warning-list">
          <TriangleAlert size={16} />
          <div>
            {bundle.siteSpec.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </div>
      )}

      <div className="site-preview-wrap">
        <div className={`site-preview-frame device-${device}`} style={{ width: deviceMeta[device].width }}>
          <div className="frame-bar">
            <span className="frame-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="frame-url">{bundle.state.published ? publicUrl.replace(/^https?:\/\//, '') : `${bundle.seed.publishedSlug}.preview`}</span>
            <span className="frame-size">{deviceMeta[device].label}</span>
          </div>
          <div className="site-preview-scroll">
            <SiteRenderer
              key={`${bundle.state.styleId}-${bundle.state.siteRevision}-${device}-${reloadKey}`}
              spec={bundle.siteSpec}
              designSystem={bundle.designSite}
              seed={bundle.seed}
            />
          </div>
        </div>
      </div>

      <div className="site-bottom">
        <div className="panel">
          <span className="card-kicker">SPEC</span>
          <h2>本次渲染依据</h2>
          <dl className="kv-list">
            <div>
              <dt>SiteSpec 版本</dt>
              <dd>V{bundle.siteSpec.revision}</dd>
            </div>
            <div>
              <dt>设计基线</dt>
              <dd>{bundle.designSite.name}（v{bundle.designSite.version}）</dd>
            </div>
            <div>
              <dt>事实版本</dt>
              <dd>V{bundle.siteSpec.factVersion}</dd>
            </div>
            <div>
              <dt>交互能力</dt>
              <dd>{bundle.siteSpec.interactions.join(' / ')}</dd>
            </div>
            <div>
              <dt>章节数</dt>
              <dd>{bundle.siteSpec.pages[0].sections.length} 个受控组件</dd>
            </div>
          </dl>
        </div>
        <div className="panel panel-muted">
          <span className="card-kicker">ACCESSIBILITY</span>
          <h2>交互与可访问性</h2>
          <ul className="plain-list">
            <li>轮播支持点击、键盘左右键与触摸滑动；单图时不显示无效控件。</li>
            <li>参数选项卡使用 role=tab，支持方向键切换。</li>
            <li>图片均为受控图形，带 aria-label 标注“非实拍”。</li>
            <li>遵循 prefers-reduced-motion，减少动画时直接展示内容。</li>
          </ul>
        </div>
        <div className="panel copy-panel">
          <span className="card-kicker">NEXT</span>
          <h2>下一步</h2>
          <p>网站确认后，海报会使用同一设计基线与事实版本重新导出。</p>
          <div className="panel-actions">
            <Link className="button dark small" to={`/projects/${projectId}/posters`}>
              查看海报
            </Link>
            <Link className="button ghost small" to={`/projects/${projectId}/revise`}>
              提出修改
            </Link>
            <CopyButton text={publicUrl} label="复制网址" className="button ghost small" />
            <Copy size={14} aria-hidden />
          </div>
        </div>
      </div>

    </div>
  );
}



