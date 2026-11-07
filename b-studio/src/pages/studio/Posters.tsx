import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileDown, ImageDown, QrCode, ShieldAlert, Smartphone } from 'lucide-react';
import { Badge, CopyButton, Notice, SectionHeading } from '../../components/ui';
import { useProjectBundle, useStudio } from '../../lib/store';
import { buildPosterSvg } from '../../lib/creative/poster-renderer/svg';
import { downloadBlob, downloadText, posterFileName, renderPosterPng, renderQrPng, type RenderedPoster } from '../../lib/creative/poster-renderer';
import { placementLabel } from '../../lib/creative/composer';
import type { QrRequested } from '../../lib/creative/poster-renderer/geometry';

const sizeOptions = [1350, 1080] as const;
type Size = (typeof sizeOptions)[number];

export function Posters() {
  const { projectId = '' } = useParams();
  const bundle = useProjectBundle(projectId);
  const { setQrRequested } = useStudio();
  const [size, setSize] = useState<Size>(1350);
  const [overlay, setOverlay] = useState(false);
  const [busy, setBusy] = useState<'png' | 'qr' | null>(null);
  const [verified, setVerified] = useState<Record<string, RenderedPoster>>({});
  const [error, setError] = useState<string | null>(null);

  const spec = bundle.posters.find((poster) => poster.canvas.height === size) ?? bundle.posters[0];
  const copy = bundle.copies.find((item) => item.posterId === spec.posterId) ?? bundle.copies[0];
  const decision = bundle.posterDecisions[size];
  const svg = useMemo(() => buildPosterSvg(spec, bundle.designBase, bundle.seed), [spec, bundle.designBase, bundle.seed]);
  const previewUrl = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, [svg]);
  const current = verified[`${spec.canvas.height}`];

  const downloadPng = async () => {
    setBusy('png');
    setError(null);
    try {
      const result = await renderPosterPng(spec, bundle.designBase, bundle.seed);
      downloadBlob(result.blob, posterFileName(spec, bundle.seed));
      setVerified((prev) => ({ ...prev, [String(spec.canvas.height)]: result }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'PNG 导出失败');
    } finally {
      setBusy(null);
    }
  };

  const downloadQr = async () => {
    setBusy('qr');
    setError(null);
    try {
      const result = await renderQrPng(spec.qr.url, 800);
      downloadBlob(result.blob, `${bundle.seed.publishedSlug}-qr-800.png`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '二维码导出失败');
    } finally {
      setBusy(null);
    }
  };

  const copyMarkdown = `# ${copy.title}\n\n${copy.body}\n\n${copy.hashtags.join(' ')}\n\n> 事实版本 V${copy.factVersion} · 海报文件 ${copy.posterFile}\n> 引导语：${copy.cta}\n`;

  return (
    <div className="studio-page posters-page">
      <SectionHeading
        eyebrow="POSTER RENDERER"
        title="真实 PNG 海报与配套文案"
        description="竖版与方版分别排版，不靠裁切。二维码默认右下，若与价格/主图冲突会自动移到左下，并保留白色静区与引导语。"
        actions={
          <Badge tone={bundle.qrSource === 'published-site' ? 'good' : 'warn'}>
            {bundle.qrSource === 'published-site' ? '二维码：已发布地址' : '二维码：未发布预览'}
          </Badge>
        }
      />

      <div className="poster-controls">
        <div className="segmented" role="group" aria-label="海报尺寸">
          {sizeOptions.map((option) => (
            <button key={option} type="button" className={size === option ? 'active' : ''} onClick={() => setSize(option)}>
              {option === 1350 ? '竖版 1080×1350' : '方版 1080×1080'}
            </button>
          ))}
        </div>
        <div className="poster-controls-right">
          <label className="toggle">
            <input type="checkbox" checked={overlay} onChange={(event) => setOverlay(event.target.checked)} />
            <span>显示安全区</span>
          </label>
          <span className="poster-style">{bundle.designBase.name} · {bundle.designBase.posterLayout}</span>
        </div>
      </div>

      {error && (
        <Notice tone="error" title="导出失败">
          {error}
        </Notice>
      )}

      <div className="poster-layout">
        <div className="poster-preview-column">
          <div className={`poster-preview aspect-${size}`}>
            <img src={previewUrl} alt={`${spec.canvas.width}×${spec.canvas.height} 海报预览，${spec.headline}`} />
            {overlay && (
              <div className="safe-overlay" aria-hidden>
                {spec.safeZones.map((zone) => (
                  <div
                    key={zone.label}
                    className={`safe-zone ${zone.label === '二维码安全区' ? 'qr' : ''}`}
                    style={{
                      left: `${(zone.x / spec.canvas.width) * 100}%`,
                      top: `${(zone.y / spec.canvas.height) * 100}%`,
                      width: `${(zone.width / spec.canvas.width) * 100}%`,
                      height: `${(zone.height / spec.canvas.height) * 100}%`,
                    }}
                  >
                    <span>{zone.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="poster-actions">
            <button type="button" className="button primary" onClick={downloadPng} disabled={busy === 'png'}>
              <ImageDown size={16} /> {busy === 'png' ? '正在光栅化…' : '下载真 PNG'}
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => downloadText(svg, posterFileName(spec, bundle.seed).replace(/\.png$/, '.svg'), 'image/svg+xml;charset=utf-8')}
            >
              <FileDown size={16} /> 下载 SVG
            </button>
            <button type="button" className="button ghost" onClick={downloadQr} disabled={busy === 'qr'}>
              <QrCode size={16} /> 独立二维码 PNG
            </button>
          </div>
          {current && (
            <div className={`verify-strip ${current.valid ? 'ok' : 'bad'}`}>
              <span>{current.valid ? 'PNG 已生成并校验' : 'PNG 可能为空白，请检查'}</span>
              <strong>
                {current.width}×{current.height} · {(current.bytes / 1024).toFixed(0)} KB · {current.distinctColors} 种取色
              </strong>
            </div>
          )}
          <div className="poster-meta-strip">
            <span>
              <Smartphone size={14} /> {spec.canvas.width} × {spec.canvas.height}
            </span>
            <span>
              <QrCode size={14} /> {placementLabel(spec.qr.placement)}
            </span>
            <span>事实 V{spec.factVersion}</span>
            <span>海报 V{spec.revision}</span>
          </div>
        </div>

        <div className="poster-side">
          <section className="panel">
            <span className="card-kicker">QR SAFETY</span>
            <h2>二维码位置</h2>
            <div className="segmented vertical" role="group" aria-label="二维码位置">
              {(['auto', 'bottom-right', 'bottom-left'] as QrRequested[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={bundle.state.posterQrRequested === option ? 'active' : ''}
                  onClick={() => setQrRequested(projectId, option)}
                >
                  {option === 'auto' ? '自动（默认右下）' : option === 'bottom-right' ? '强制右下' : '强制左下'}
                </button>
              ))}
            </div>
            <p className="qr-reason">{decision.reason}</p>
            {decision.conflicts[decision.placement].length > 0 && (
              <Notice tone="warn" title="安全区冲突">
                {decision.conflicts[decision.placement].join('、')} 与二维码卡位重叠，请调整版式而不是缩小二维码。
              </Notice>
            )}
            <dl className="kv-list">
              <div>
                <dt>二维码链接</dt>
                <dd className="mono break">{spec.qr.url}</dd>
              </div>
              <div>
                <dt>链接来源</dt>
                <dd>{spec.qr.urlSource === 'published-site' ? '已发布演示站点' : '未发布预览地址'}</dd>
              </div>
              <div>
                <dt>静区</dt>
                <dd>{spec.qr.quietZoneModules} 个模块 · 白色卡片</dd>
              </div>
              <div>
                <dt>引导语</dt>
                <dd>{spec.qr.caption}</dd>
              </div>
            </dl>
            {bundle.qrSource === 'published-site' && (
              <Notice tone="info" title="演示发布地址">
                该二维码指向本机演示站点，手机如需扫码请使用同一局域网可访问的地址；正式交付前必须由 A 组核验公网 HTTPS 链接并重新导出。
              </Notice>
            )}
            {bundle.qrSource === 'fixture-preview' && (
              <Notice tone="warn" title="正式交付前必须替换链接">
                当前二维码指向预览地址。请先在网站预览页发布演示站点，或等待 A 组返回已验证的公开 HTTPS 网址。
                <div className="notice-actions">
                  <Link className="button ghost small" to={`/projects/${projectId}/site`}>
                    去发布站点
                  </Link>
                </div>
              </Notice>
            )}
            <div className="panel-actions">
              <CopyButton text={spec.qr.url} label="复制二维码链接" className="button ghost small" />
            </div>
          </section>

          <section className="panel copy-panel">
            <span className="card-kicker">POSTER COPY</span>
            <h2>{copy.title}</h2>
            <p>{copy.body}</p>
            <div className="tag-row">
              {copy.hashtags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <dl className="kv-list">
              <div>
                <dt>海报文件</dt>
                <dd className="mono break">{copy.posterFile}</dd>
              </div>
              <div>
                <dt>事实版本</dt>
                <dd>V{copy.factVersion}</dd>
              </div>
              <div>
                <dt>引导语</dt>
                <dd>{copy.cta}</dd>
              </div>
            </dl>
            <ul className="compliance-list">
              {copy.complianceNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <div className="panel-actions">
              <CopyButton text={`${copy.title}\n\n${copy.body}\n\n${copy.hashtags.join(' ')}`} label="复制文案" className="button dark small" />
              <button type="button" className="button ghost small" onClick={() => downloadText(copyMarkdown, `${copy.posterId}.md`)}>
                <Download size={14} /> 下载 Markdown
              </button>
            </div>
          </section>

          {bundle.warnings.length > 0 && (
            <section className="panel panel-warn">
              <span className="card-kicker">
                <ShieldAlert size={14} /> CHECKS
              </span>
              <h2>渲染前检查</h2>
              <ul className="plain-list">
                {bundle.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

