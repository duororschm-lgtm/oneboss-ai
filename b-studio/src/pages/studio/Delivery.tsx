import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight, Check, CheckCircle2, Download, FileArchive, ImageDown, Link2, QrCode, Rocket, ShieldCheck } from 'lucide-react';
import { Badge, CopyButton, EmptyState, Notice, SectionHeading, formatDateTime } from '../../components/ui';
import { useProjectBundle, useStudio } from '../../lib/store';
import { buildPosterSvg } from '../../lib/creative/poster-renderer/svg';
import { downloadBlob, downloadText, posterFileName, renderPosterPng, renderQrPng, type RenderedPoster } from '../../lib/creative/poster-renderer';
import { blobToBytes, createZip, textEntry, type ZipEntry } from '../../lib/zip';
import { deliveryManifestSchema, parseOrThrow } from '../../types/contracts';
import type { DeliveryManifest } from '../../types/contracts';

export function Delivery() {
  const { projectId = '' } = useParams();
  const bundle = useProjectBundle(projectId);
  const { state, publish, acceptDelivery } = useStudio();
  const [busy, setBusy] = useState<'publish' | 'verify' | 'zip' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState<{ posters: RenderedPoster[]; qr: RenderedPoster; at: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [zipSaved, setZipSaved] = useState(false);

  const order = state.orders.find(
    (item) => item.projectId === bundle.seed.id && (item.payState === 'DEMO_PAID' || item.payState === 'PAID'),
  );
  const published = bundle.state.published;
  const accepted = Boolean(bundle.state.acceptedAt);
  const deliveryStatus: DeliveryManifest['deliveryStatus'] = accepted
    ? 'accepted'
    : zipSaved
      ? 'delivered'
      : rendered
        ? 'verified'
        : published
          ? 'rendered'
          : 'draft';

  const posterPreviews = useMemo(
    () =>
      bundle.posters.map((spec) => ({
        spec,
        copy: bundle.copies.find((item) => item.posterId === spec.posterId),
        url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildPosterSvg(spec, bundle.designBase, bundle.seed))}`,
      })),
    [bundle],
  );

  const manifest = useMemo<DeliveryManifest>(() => {
    const candidate = {
      orderId: order?.id ?? 'demo-order-unbound',
      projectId: bundle.seed.id,
      publicSiteUrl: bundle.publishedUrl,
      siteRevision: published?.siteRevision ?? 0,
      posters: bundle.posters.map((spec) => ({
        posterId: spec.posterId,
        format: 'png' as const,
        width: spec.canvas.width,
        height: spec.canvas.height,
        qrTargetUrl: spec.qr.url,
        factVersion: spec.factVersion,
        filename: posterFileName(spec, bundle.seed),
      })),
      xiaohongshuCopy: bundle.copies.map((copy) => ({
        posterId: copy.posterId,
        title: copy.title,
        body: copy.body,
        hashtags: copy.hashtags,
      })),
      qrAssets: [{ label: '站点二维码 800×800', url: bundle.qrUrl }],
      zipPath: `/delivery/${bundle.seed.publishedSlug}.zip`,
      deliveryStatus,
      createdAt: rendered?.at ?? new Date().toISOString(),
      ...(bundle.state.acceptedAt ? { acceptedAt: bundle.state.acceptedAt } : {}),
    };
    return parseOrThrow(deliveryManifestSchema, candidate, 'DeliveryManifest');
  }, [bundle, published, rendered?.at, order?.id, bundle.state.acceptedAt, deliveryStatus]);

  const handlePublish = async () => {
    setBusy('publish');
    setError(null);
    try {
      await publish(projectId);
      setNotice('演示站点已发布，二维码链接已同步更新。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '发布失败');
    } finally {
      setBusy(null);
    }
  };

  const handleVerify = async () => {
    setBusy('verify');
    setError(null);
    try {
      const posters = await Promise.all(bundle.posters.map((spec) => renderPosterPng(spec, bundle.designBase, bundle.seed)));
      const qr = await renderQrPng(bundle.qrUrl, 800);
      if (!posters.every((poster) => poster.valid)) throw new Error('至少一张海报未通过有效像素检查');
      setRendered({ posters, qr, at: new Date().toISOString() });
      setNotice('已生成并校验 2 张 PNG 与 1 张二维码；可以下载交付包或确认验收。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '核验失败');
    } finally {
      setBusy(null);
    }
  };

  const handleZip = async () => {
    if (!rendered) return;
    setBusy('zip');
    setError(null);
    try {
      const entries: ZipEntry[] = [
        textEntry(
          'site-url.txt',
          `宣传网站：${bundle.publishedUrl}\n网站版本：V${published?.siteRevision ?? 0}\n事实版本：V${bundle.factVersion}\n演示状态：未正式发布（Demo）\n`,
        ),
        textEntry('manifest.json', JSON.stringify(manifest, null, 2)),
        textEntry(
          'README-交付说明.md',
          [
            `# ${bundle.seed.name} · 演示交付包`,
            '',
            `- 项目：${bundle.seed.name}`,
            `- 品牌：${bundle.seed.brand}`,
            `- 网站：${bundle.publishedUrl}`,
            `- 事实版本：V${bundle.factVersion}`,
            `- 生成时间：${formatDateTime(rendered.at)}`,
            '',
            '## 内容',
            '- posters/：1080×1350 与 1080×1080 PNG 海报（含二维码）',
            '- qrcode/：独立二维码 PNG',
            '- copy/：小红书配套文案 Markdown',
            '- site-url.txt / manifest.json',
            '',
            '## 重要说明',
            '- 本交付包来自 Demo 演示环境，不代表真实付款或 A 组正式发布。',
            '- 海报中的图形为概念图形，不是商家实拍；正式交付需替换为已授权素材。',
            '- 二维码指向演示站点，正式上线前必须替换为已验证的公开 HTTPS 网址并扫码复核。',
          ].join('\n'),
        ),
      ];

      // 二进制内容需要异步读取，单独构造，避免与文本条目混排遗漏
      const posterEntries = await Promise.all(
        bundle.posters.map(async (spec, index) => ({
          name: `posters/${posterFileName(spec, bundle.seed)}`,
          data: await blobToBytes(rendered.posters[index].blob),
        })),
      );
      posterEntries.forEach((entry) => entries.push(entry));
      entries.push({ name: 'qrcode/site-qr-800.png', data: await blobToBytes(rendered.qr.blob) });
      bundle.copies.forEach((copy) => {
        entries.push(
          textEntry(
            `copy/${copy.posterId}.md`,
            `# ${copy.title}\n\n${copy.body}\n\n${copy.hashtags.join(' ')}\n\n- 海报：${copy.posterFile}\n- 引导语：${copy.cta}\n- 事实版本：V${copy.factVersion}\n- 网站：${bundle.publishedUrl}\n`,
          ),
        );
      });

      downloadBlob(createZip(entries), `${bundle.seed.publishedSlug}-delivery-demo.zip`);
      setZipSaved(true);
      setNotice('交付包 ZIP 已生成并下载（包含 PNG、二维码、文案与 manifest）。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ZIP 生成失败');
    } finally {
      setBusy(null);
    }
  };

  if (!published) {
    return (
      <div className="studio-page">
        <SectionHeading eyebrow="DELIVERY" title="交付中心" description="先发布网站，再把真实的公开链接交给二维码与交付包。" />
        <div className="panel">
          <EmptyState
            title="网站尚未发布"
            body="交付要求网站与海报同时存在且核验通过。请先发布演示站点，二维码会切换到公开路径。"
            action={
              <button type="button" className="button dark" onClick={handlePublish} disabled={busy === 'publish'}>
                <Rocket size={16} /> {busy === 'publish' ? '发布中…' : '发布演示站点'}
              </button>
            }
          />
          {error && (
            <Notice tone="error" title="发布失败">
              {error}
            </Notice>
          )}
          {notice && <Notice tone="good">{notice}</Notice>}
        </div>
      </div>
    );
  }

  return (
    <div className="studio-page delivery-page">
      <SectionHeading
        eyebrow="DELIVERY"
        title="交付中心"
        description="网站、海报、二维码与文案按客户可验收的顺序展示。状态由真实生成结果派生，不伪造“已完成”。"
        actions={<Badge tone={accepted ? 'good' : rendered ? 'good' : 'warn'}>{accepted ? '客户已验收' : rendered ? '已核验' : '已发布 · 待核验'}</Badge>}
      />

      <div className="delivery-metrics">
        <div>
          <span>网站版本</span>
          <strong>V{published.siteRevision}</strong>
        </div>
        <div>
          <span>海报文件</span>
          <strong>2 张 PNG</strong>
        </div>
        <div>
          <span>文案</span>
          <strong>2 份</strong>
        </div>
        <div>
          <span>事实版本</span>
          <strong>V{bundle.factVersion}</strong>
        </div>
        <div>
          <span>订单</span>
          <strong>{order?.orderNo ?? '演示项目'}</strong>
        </div>
      </div>

      {error && (
        <Notice tone="error" title="操作失败">
          {error}
        </Notice>
      )}
      {notice && <Notice tone="good">{notice}</Notice>}

      <div className="delivery-layout">
        <div className="delivery-main">
          <article className="delivery-card site-card">
            <div className="delivery-card-head">
              <span className="card-kicker">01 · 宣传网站</span>
              <Badge tone="good">HTTPS 演示站点</Badge>
            </div>
            <h2>{bundle.seed.name}</h2>
            <p className="mono break">{bundle.publishedUrl}</p>
            <p className="muted">
              版本 V{published.siteRevision} · 发布于 {formatDateTime(published.at)} · 事实版本 V{bundle.factVersion}
            </p>
            <div className="delivery-card-actions">
              <a className="button dark small" href={bundle.publishedUrl} target="_blank" rel="noreferrer">
                <ArrowUpRight size={14} /> 打开网站
              </a>
              <CopyButton text={bundle.publishedUrl} label="复制网址" className="button ghost small" />
              <Link className="button ghost small" to={`/projects/${projectId}/site`}>
                手机预览
              </Link>
            </div>
          </article>

          <div className="poster-delivery-grid">
            {posterPreviews.map(({ spec, copy, url }) => (
              <article className="delivery-card poster-card" key={spec.posterId}>
                <div className="delivery-card-head">
                  <span className="card-kicker">02 · 海报 {spec.canvas.height === 1350 ? '竖版' : '方版'}</span>
                  <Badge tone="neutral">
                    {spec.canvas.width}×{spec.canvas.height}
                  </Badge>
                </div>
                <div className={`delivery-poster-thumb ${spec.canvas.height === 1080 ? 'square' : ''}`}>
                  <img src={url} alt={`${spec.headline} 海报`} />
                </div>
                <dl className="kv-list compact">
                  <div>
                    <dt>二维码</dt>
                    <dd>{spec.qr.placement === 'bottom-right' ? '右下角' : '左下角'}</dd>
                  </div>
                  <div>
                    <dt>事实版本</dt>
                    <dd>V{spec.factVersion}</dd>
                  </div>
                </dl>
                <div className="delivery-card-actions">
                  <button
                    type="button"
                    className="button ghost small"
                    onClick={async () => {
                      try {
                        const result = await renderPosterPng(spec, bundle.designBase, bundle.seed);
                        downloadBlob(result.blob, posterFileName(spec, bundle.seed));
                      } catch (reason) {
                        setError(reason instanceof Error ? reason.message : '下载失败');
                      }
                    }}
                  >
                    <ImageDown size={14} /> 下载 PNG
                  </button>
                  {copy && <CopyButton text={`${copy.title}\n\n${copy.body}\n\n${copy.hashtags.join(' ')}`} label="复制文案" className="button ghost small" />}
                </div>
              </article>
            ))}
          </div>

          <article className="delivery-card copy-delivery">
            <div className="delivery-card-head">
              <span className="card-kicker">03 · 小红书配套文案</span>
              <Badge tone="neutral">与海报同源</Badge>
            </div>
            {bundle.copies.map((copy) => (
              <div className="copy-row" key={copy.posterId}>
                <div>
                  <span className="copy-size">
                    {copy.posterId.endsWith('1350') ? '竖版 1080×1350' : '方版 1080×1080'} · {copy.posterFile}
                  </span>
                  <strong>{copy.title}</strong>
                  <p>{copy.body}</p>
                  <div className="tag-row">
                    {copy.hashtags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="copy-row-actions">
                  <CopyButton text={`${copy.title}\n\n${copy.body}\n\n${copy.hashtags.join(' ')}`} label="复制" className="button ghost small" />
                  <button
                    type="button"
                    className="button ghost small"
                    onClick={() => downloadText(`# ${copy.title}\n\n${copy.body}\n\n${copy.hashtags.join(' ')}\n\n- 海报：${copy.posterFile}\n- 事实版本：V${copy.factVersion}\n`, `${copy.posterId}.md`)}
                  >
                    <Download size={14} /> .md
                  </button>
                </div>
              </div>
            ))}
          </article>
        </div>

        <aside className="delivery-side">
          <section className="panel">
            <span className="card-kicker">PACKAGE</span>
            <h2>交付包</h2>
            <ul className="package-list">
              <li>
                <Link2 size={15} strokeWidth={1.8} /> 网站链接（site-url.txt）
              </li>
              <li>
                <ImageDown size={15} strokeWidth={1.8} /> 2 张 PNG 海报
              </li>
              <li>
                <QrCode size={15} strokeWidth={1.8} /> 独立二维码 PNG
              </li>
              <li>
                <Download size={15} strokeWidth={1.8} /> 2 份小红书文案
              </li>
              <li>
                <FileArchive size={15} strokeWidth={1.8} /> manifest.json
              </li>
            </ul>
            <div className="panel-actions column">
              <button type="button" className="button dark" onClick={handleVerify} disabled={busy !== null}>
                <ShieldCheck size={16} /> {busy === 'verify' ? '正在生成并校验…' : rendered ? '重新核验 PNG' : '核验并生成交付文件'}
              </button>
              <button type="button" className="button ghost" onClick={handleZip} disabled={!rendered || busy !== null}>
                <FileArchive size={16} /> {busy === 'zip' ? '正在打包…' : '下载 ZIP 交付包'}
              </button>
              <button
                type="button"
                className="button ghost"
                onClick={() => {
                  acceptDelivery(projectId);
                  setNotice('客户已确认验收（演示）。正式验收由 A 组记录。');
                }}
                disabled={accepted || !rendered}
              >
                <CheckCircle2 size={16} /> {accepted ? '已验收' : '模拟客户验收'}
              </button>
            </div>
            {!rendered && <p className="muted">下载 ZIP 前需要先生成并校验真实 PNG；未核验时不会显示“已交付”。</p>}
          </section>

          <section className="panel">
            <span className="card-kicker">STATUS</span>
            <h2>状态机</h2>
            <ul className="status-flow">
              {[
                ['DRAFT', '草稿'],
                ['RENDERED', '已渲染'],
                ['VERIFIED', '已核验'],
                ['DELIVERED', '已交付'],
                ['ACCEPTED', '已验收'],
              ].map(([key, label]) => {
                const current = deliveryStatus.toUpperCase();
                const orderIndex = ['DRAFT', 'RENDERED', 'VERIFIED', 'DELIVERED', 'ACCEPTED'].indexOf(current);
                const index = ['DRAFT', 'RENDERED', 'VERIFIED', 'DELIVERED', 'ACCEPTED'].indexOf(key);
                return (
                  <li key={key} className={index <= orderIndex ? 'done' : ''}>
                    <i>{index <= orderIndex ? <Check size={12} /> : index + 1}</i>
                    <span>{label}</span>
                    <code>{key}</code>
                  </li>
                );
              })}
            </ul>
            <p className="muted">
              当前状态：<strong>{deliveryStatus}</strong>。网站已发布不等于整套交付完成；PNG 核验失败时不能宣称已交付。
            </p>
          </section>

          <section className="panel panel-warn">
            <span className="card-kicker">HONESTY</span>
            <h2>演示边界</h2>
            <ul className="plain-list">
              <li>二维码指向本机演示站点，不是 A 组正式公网地址。</li>
              <li>海报中的产品图为概念图形，未冒充商家实拍。</li>
              <li>未确认的材质、尺寸与性能不会出现在任何交付物中。</li>
              <li>ZIP 由浏览器真实生成，可解压查看内容。</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}


