'use client';
import { useState, useEffect, useCallback, type FormEvent } from 'react';
import Link from 'next/link';
import { customerApi, browserAuth, publicAuthUrl } from './session';
import { Notice, Loading, statusLabel, money } from './shell';
import type { Workspace, Row, Run } from '../../lib/customer/types';
import { mapSite, displayFact } from '../../lib/creative/b-mapping';
import { SiteFrame } from './site-frame';
import { AssetPicker, DraftPosterCards } from './assets';
import { useTaskPolling } from './use-task-polling';
import { directionPreview } from '../../lib/customer/direction-preview';

const roleLabel: Record<string, string> = {
  intake: '产品分析',
  design: '创意方向',
  generate: '作品制作',
  change: '局部修改',
  publish: '网站发布',
  delivery: '文件交付',
};
export function ProjectStudio({ id, section }: { id: string; section: string }) {
  const [data, setData] = useState<Workspace>(),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await customerApi<Workspace>(`core/projects/${id}/workspace`));
      setError('');return true;
    } catch (e) {
      setError((e as Error).message);return false;
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const active = data?.runs.some((r) => ['RUNNING', 'QUEUED'].includes(r.status));
  useTaskPolling(active,load);
  async function action(name: string, body: unknown = {}) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await customerApi(`core/projects/${id}/${name}`, body);
      await load();
      setMessage(
        result.status === 'QUEUED' ? '任务已提交，可在任务记录中查看真实进度。' : '已保存。',
      );
      return result;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <>{error ? <Notice error>{error}</Notice> : <Loading />}</>;
  const title =
    (
      {
        intake: '先把产品讲清楚。',
        creative: '为产品选一个方向。',
        studio: '看看你的作品。',
        site: '看看你的作品。',
        posters: '海报与配套文案。',
        revise: '把想法调整得更准确。',
        delivery: '你的作品，准备带走。',
        agents: '每一步，都有真实记录。',
      } as Record<string, string>
    )[section] || '制作项目';
  const latest = data.versions.find((v) => v.fact_version === data.project.fact_version),
    approved = latest && ['APPROVED', 'PUBLISHED'].includes(latest.status);
  const inactive =
    data.entitlement.revoked || new Date(data.entitlement.expires_at).getTime() <= Date.now();
  return (
    <>
      <div className="ob-workspace-head">
        <div>
          <span className="ob-eyebrow">PROJECT / {id.slice(0, 8)}</span>
          <h1>{title}</h1>
          <span className="ob-state">
            {statusLabel(data.project.status)} · 资料版本 {data.project.fact_version}
          </span>
        </div>
        <div className="ob-inline">
          {data.order.is_demo && <span className="ob-tag ob-tag-demo">演示制作 · 无真实收款</span>}
          <button
            className="ob-button ob-ghost ob-small"
            onClick={() => {
              setError('');
              void load();
            }}
          >
            刷新状态
          </button>
        </div>
      </div>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {inactive && <Notice error>制作权益已冻结或过期，当前不能继续生成、发布或交付。</Notice>}
      {active && (
        <Notice>
          正在
          {roleLabel[data.runs.find((r) => ['RUNNING', 'QUEUED'].includes(r.status))!.role] ||
            '处理任务'}
          ，页面会自动更新。关闭页面不会中断已提交的任务。
        </Notice>
      )}
      {section === 'intake' ? (
        <IntakeEditor
          key={data.project.fact_version}
          data={data}
          disabled={busy || active || inactive}
          action={action}
          reload={async()=>{await load();}}
        />
      ) : section === 'creative' ? (
        <CreativeChoices data={data} disabled={busy || active || inactive} action={action} />
      ) : section === 'revise' ? (
        <RevisionEditor data={data} disabled={busy || active || inactive} action={action} />
      ) : section === 'posters' ? (
        latest ? (
          <div className="ob-stack">
            <DraftPosterCards
              id={id}
              revision={latest.revision}
              count={latest.body.posters.length}
            />
            <CopyCards copy={latest.body.copy} />
            <Link className="ob-button ob-ghost" href={`/dashboard/projects/${id}/delivery`}>
              查看正式交付与下载 →
            </Link>
          </div>
        ) : (
          <Notice>先在作品预览中生成一版作品，再查看海报和文案。</Notice>
        )
      ) : section === 'delivery' ? (
        <Delivery data={data} disabled={busy || active || inactive} action={action} />
      ) : section === 'agents' ? (
        <RunList runs={data.runs} />
      ) : (
        <div className="ob-stack">
          <section className="ob-card">
            <h2>{latest ? `作品版本 ${latest.revision}` : '准备制作你的第一版作品'}</h2>
            <p>
              先在创意方向中批准方案，再开始制作。生成结果会先进入私有预览，确认后才会公开发布。
            </p>
            <div className="ob-actions">
              <button
                className="ob-button"
                disabled={
                  busy ||
                  active ||
                  inactive ||
                  data.designs[0]?.body.factVersion !== data.project.fact_version ||
                  !data.briefs[0]?.approved_at
                }
                onClick={() => void action('generate')}
              >
                {latest ? '重新生成作品' : '开始生成作品'}
              </button>
              {latest && !approved && (
                <button
                  disabled={busy || active || inactive}
                  className="ob-button ob-ghost"
                  onClick={() => void action('approve-revision', { revision: latest.revision })}
                >
                  批准版本 {latest.revision}
                </button>
              )}
              {approved && (
                <button
                  disabled={busy || active || inactive}
                  className="ob-button"
                  onClick={() => void action('publish', { revision: latest.revision })}
                >
                  发布批准版本 →
                </button>
              )}
            </div>
          </section>
          {latest && (
            <>
              <PrivatePreview id={id} revision={latest.revision} />
              <DraftPosterCards
                id={id}
                revision={latest.revision}
                count={latest.body.posters.length}
              />
              <CopyCards copy={latest.body.copy} />
            </>
          )}
          <section className="ob-card">
            <h2>版本历史</h2>
            {data.versions.map((v) => (
              <div className="ob-row" key={v.revision}>
                <div>
                  版本 {v.revision} <span className="ob-tag">{statusLabel(v.status)}</span>
                  <p className="ob-muted">
                    资料版本 {v.fact_version} · {new Date(v.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                {['APPROVED', 'PUBLISHED'].includes(v.status) &&
                  v.fact_version === data.project.fact_version &&
                  v.revision !== data.project.published_revision && (
                    <button
                      disabled={busy || active || inactive}
                      className="ob-button ob-ghost ob-small"
                      onClick={() => void action('rollback', { revision: v.revision })}
                    >
                      发布此版本
                    </button>
                  )}
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}

type Action = (name: string, body?: unknown) => Promise<any>;
type ProductDraft = {
  id: string;
  name: string;
  description: string;
  price: string;
  priceType: string;
  unit: string;
  facts: { key: string; value: string }[];
};
function IntakeEditor({
  data,
  disabled,
  action,
  reload,
}: {
  data: Workspace;
  disabled: boolean | undefined;
  action: Action;
  reload: () => Promise<void>;
}) {
  const [products, setProducts] = useState<ProductDraft[]>(() =>
    (data.products.length
      ? data.products
      : [{ id: crypto.randomUUID(), name: '', description: '' }]
    ).map((p) => {
      const facts = data.facts.filter((f) => f.productId === p.id),
        price = facts.find((f) => f.key === 'price')?.value as Row | undefined;
      return {
        ...p,
        price: price?.amountMinor == null ? '' : String(price.amountMinor / 100),
        priceType: price?.priceType || 'not_disclosed',
        unit: price?.unit || '件',
        facts: facts
          .filter((f) => !['name', 'description', 'price'].includes(f.key))
          .map((f) => ({ key: f.key, value: displayFact(f.value) })),
      };
    }),
  );
  const brief = data.briefs[0];
  const [objective, setObjective] = useState(brief?.body.objective || ''),
    [audience, setAudience] = useState(brief?.body.targetAudience || ''),
    [restrictions, setRestrictions] = useState(
      brief?.body.restrictions.join('\n') || '不编造未经确认的材质、性能、销量或优惠。',
    );
  const [posterCount, setPosterCount] = useState(
      brief?.body.deliverables.posterCount || Math.min(2, data.entitlement.max_posters),
    ),
    [confirmed, setConfirmed] = useState(false),
    [localError, setLocalError] = useState(''),
    [uploading, setUploading] = useState(false),
    [authorized, setAuthorized] = useState(false),
    [question, setQuestion] = useState('');
  const [posterFormats, setPosterFormats] = useState<('portrait' | 'square')[]>(
    brief?.body.deliverables.posterFormats ||
      Array.from({ length: posterCount }, (_, index) => (index % 2 ? 'square' : 'portrait')),
  );
  const [selectedAssets, setSelectedAssets] = useState<string[]>(
    brief?.body.assetRefs || data.assets.map((a) => a.id),
  );
  const analyst = data.runs.find(
    (r) =>
      r.role === 'intake' &&
      r.status === 'SUCCEEDED' &&
      r.factVersion === data.project.fact_version,
  );
  function update(index: number, patch: Partial<ProductDraft>) {
    setProducts((old) => old.map((p, i) => (i === index ? { ...p, ...patch } : p)));
    setConfirmed(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setLocalError('');
    try {
      const facts = products.flatMap((p) => {
        const amount = Math.round(Number(p.price) * 100);
        if (
          p.priceType !== 'not_disclosed' &&
          (!p.price.trim() || !Number.isFinite(amount) || amount < 0 || amount > 2_000_000_000)
        )
          throw Error('请填写有效的产品价格。');
        const raw = [
          { key: 'name', value: p.name },
          { key: 'description', value: p.description },
          {
            key: 'price',
            value: {
              amountMinor: p.priceType === 'not_disclosed' ? null : amount,
              currency: 'CNY',
              unit: p.unit,
              priceType: p.priceType,
            },
          },
          ...p.facts.filter((f) => f.key.trim() && f.value.trim()),
        ];
        if (new Set(raw.map((f) => f.key)).size !== raw.length)
          throw Error('同一产品的资料字段不能重复。');
        return raw.map((f) => ({
          ...f,
          id: crypto.randomUUID(),
          productId: p.id,
          source: 'customer',
          verified: true,
          version: data.project.fact_version,
        }));
      });
      await action('intake', {
        products: products.map(({ id, name, description }) => ({ id, name, description })),
        facts,
        brief: {
          projectId: data.project.id,
          organizationId: data.project.org_id,
          productIds: products.map((p) => p.id),
          objective,
          targetAudience: audience,
          confirmedFacts: facts.map((f) => f.id),
          assetRefs: data.assets
            .filter(
              (a) => a.license_status === 'customer_authorized' && selectedAssets.includes(a.id),
            )
            .map((a) => a.id),
          preferredStyles: brief?.body.preferredStyles || [],
          restrictions: restrictions.split('\n').filter(Boolean),
          deliverables: { site: true, posterCount, posterFormats, xhsCopy: true },
          approval: 'pending',
        },
      });
    } catch (e) {
      setLocalError((e as Error).message);
    }
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setLocalError('');
    try {
      if (!authorized) throw Error('请先确认图片使用授权。');
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
        file.size > 10 * 1024 * 1024
      )
        throw Error('请上传 10MB 以内的 PNG、JPEG 或 WebP。');
      const { data: auth } = await browserAuth().auth.getSession();
      const response = await fetch(`/api/core/projects/${data.project.id}/assets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.session?.access_token}`,
          'X-Asset-License': 'customer_authorized',
          'Content-Type': file.type,
        },
        body: file,
      });
      if (!response.ok) throw Error('图片上传失败，请核对格式、尺寸和制作权益。');
      await reload();
    } catch (e) {
      setLocalError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  function useSuggestions() {
    const suggestions = (analyst?.output as Row)?.facts || [];
    setProducts((old) =>
      old.map((p) => {
        const additions = suggestions.filter(
          (f: Row) =>
            f.productId === p.id &&
            !['name', 'price', 'description'].includes(f.key) &&
            !p.facts.some((k) => k.key === f.key),
        );
        return {
          ...p,
          facts: [
            ...p.facts,
            ...additions.map((f: Row) => ({
              key: f.key,
              value: typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value),
            })),
          ],
        };
      }),
    );
    setConfirmed(false);
  }
  return (
    <div className="ob-stack">
      {localError && <Notice error>{localError}</Notice>}
      <section className="ob-card">
        <h2>产品资料</h2>
        <p>
          只填写你知道并能确认的内容。不提供价格时选择“不公开”；上传图片后，需要再次保存资料才能纳入制作。
        </p>
        <form className="ob-form" onSubmit={save}>
          {products.map((p, index) => (
            <div className="ob-product-card" key={p.id}>
              <div className="ob-row">
                <h3>产品 {index + 1}</h3>
                {products.length > 1 && (
                  <button
                    type="button"
                    className="ob-link"
                    onClick={() => setProducts(products.filter((x) => x.id !== p.id))}
                  >
                    移除此产品
                  </button>
                )}
              </div>
              <div className="ob-form">
                <label>
                  产品名称
                  <input
                    aria-label="产品名称"
                    required
                    maxLength={150}
                    value={p.name}
                    onChange={(e) => update(index, { name: e.target.value })}
                  />
                </label>
                <label>
                  产品介绍
                  <textarea
                    aria-label="产品介绍"
                    required
                    maxLength={2000}
                    value={p.description}
                    onChange={(e) => update(index, { description: e.target.value })}
                  />
                </label>
                <div className="ob-two">
                  <label>
                    宣传价格类型
                    <select
                      value={p.priceType}
                      onChange={(e) => update(index, { priceType: e.target.value })}
                    >
                      <option value="not_disclosed">不公开价格</option>
                      <option value="fixed">固定价</option>
                      <option value="starting_at">起售价</option>
                      <option value="guide_price">指导价</option>
                    </select>
                  </label>
                  {p.priceType !== 'not_disclosed' && (
                    <label>
                      产品价格（元）
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={p.price}
                        onChange={(e) => update(index, { price: e.target.value })}
                        required
                      />
                    </label>
                  )}
                  <label>
                    价格单位
                    <input
                      maxLength={50}
                      value={p.unit}
                      onChange={(e) => update(index, { unit: e.target.value })}
                    />
                  </label>
                </div>
                {p.facts.map((f, n) => (
                  <div className="ob-inline" key={n}>
                    <label style={{ flex: 1 }}>
                      资料字段
                      <input
                        aria-label={`产品 ${index + 1} 资料 ${n + 1} 字段`}
                        required
                        maxLength={100}
                        value={f.key}
                        onChange={(e) =>
                          update(index, {
                            facts: p.facts.map((x, i) =>
                              i === n ? { ...x, key: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label style={{ flex: 2 }}>
                      已知内容
                      <input
                        aria-label={`产品 ${index + 1} 资料 ${n + 1} 内容`}
                        required
                        maxLength={5000}
                        value={f.value}
                        onChange={(e) =>
                          update(index, {
                            facts: p.facts.map((x, i) =>
                              i === n ? { ...x, value: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="ob-link"
                      onClick={() => update(index, { facts: p.facts.filter((_, i) => i !== n) })}
                    >
                      移除
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="ob-button ob-ghost ob-small"
                  onClick={() => update(index, { facts: [...p.facts, { key: '', value: '' }] })}
                >
                  + 添加已知资料
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="ob-button ob-ghost"
            disabled={products.length >= data.entitlement.max_products}
            onClick={() =>
              setProducts([
                ...products,
                {
                  id: crypto.randomUUID(),
                  name: '',
                  description: '',
                  price: '',
                  priceType: 'not_disclosed',
                  unit: '件',
                  facts: [],
                },
              ])
            }
          >
            + 添加产品（最多 {data.entitlement.max_products} 个）
          </button>
          <label>
            这次宣传想达到什么目的？
            <textarea
              required
              maxLength={2000}
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            />
          </label>
          <label>
            目标人群（可选）
            <input
              maxLength={1000}
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
            />
          </label>
          <label>
            不能使用的表达或其他限制
            <textarea
              maxLength={4000}
              value={restrictions}
              onChange={(e) => setRestrictions(e.target.value)}
            />
            <small>每行一条，单条不超过 500 字。</small>
          </label>
          <label>
            本次海报数量
            <select
              aria-label="本次海报数量"
              value={posterCount}
              onChange={(e) => {
                const count = Number(e.target.value);
                setPosterCount(count);
                setPosterFormats((previous) =>
                  Array.from(
                    { length: count },
                    (_, index) => previous[index] || (index % 2 ? 'square' : 'portrait'),
                  ),
                );
                setConfirmed(false);
              }}
            >
              {Array.from({ length: Math.min(20, data.entitlement.max_posters) }, (_, index) => (
                <option key={index} value={index + 1}>
                  {index + 1} 张
                </option>
              ))}
            </select>
            <small>套餐最多 {data.entitlement.max_posters} 张。</small>
          </label>
          <fieldset>
            <legend>海报尺寸</legend>
            <p className="ob-muted">每张单独排版。不同尺寸各计一张海报，可按投放位置选择。</p>
            {posterFormats.map((format, index) => (
              <label key={index}>
                海报 {index + 1} 尺寸
                <select
                  aria-label={`海报 ${index + 1} 尺寸`}
                  value={format}
                  onChange={(e) => {
                    const next = e.target.value as 'portrait' | 'square';
                    setPosterFormats((previous) =>
                      previous.map((value, i) => (i === index ? next : value)),
                    );
                    setConfirmed(false);
                  }}
                >
                  <option value="portrait">竖版 · 1080×1350</option>
                  <option value="square">方形 · 1080×1080</option>
                </select>
              </label>
            ))}
          </fieldset>
          <label className="ob-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />
            我已核对以上产品事实，确认可用于宣传；AI 提议的内容也由我逐项核实。
          </label>
          <button className="ob-button" disabled={disabled || !confirmed || uploading}>
            保存已确认事实
          </button>
        </form>
        {brief && (
          <div className="ob-actions">
            <span className="ob-muted">已保存资料版本 {data.project.fact_version}</span>
            {brief.approved_at ? (
              <span className="ob-tag">需求摘要已批准</span>
            ) : (
              <button
                disabled={disabled}
                className="ob-button"
                onClick={() => void action('approve-brief', { revision: brief.revision })}
              >
                批准已保存的需求摘要 →
              </button>
            )}
            <Link className="ob-text-link" href={`/dashboard/projects/${data.project.id}/creative`}>
              继续选择设计方向 →
            </Link>
          </div>
        )}
      </section>
      <section className="ob-card">
        <h2>产品图片</h2>
        <p>原图保存在私有存储中；批准发布后，引用到的图片会用于公开作品。</p>
        <label className="ob-check">
          <input
            type="checkbox"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
          />
          我拥有这些图片的宣传使用权
        </label>
        <label className="ob-form">
          选择图片（PNG / JPEG / WebP，≤10MB）
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={disabled || uploading || !authorized}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        {uploading && <Notice>正在上传图片…</Notice>}
        <AssetPicker
          id={data.project.id}
          ids={data.assets.map((a) => a.id).join(',')}
          selected={selectedAssets}
          onChange={setSelectedAssets}
        />
      </section>
      <section className="ob-card">
        <h2>请 AI 帮我核对</h2>
        <p>先保存产品资料，再描述想补充的信息。AI 的提议不会自动成为已确认事实。</p>
        <label className="ob-form">
          想补充或询问的内容
          <textarea
            value={question}
            maxLength={10000}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        <button
          className="ob-button ob-ghost"
          disabled={disabled || !data.products.length || !question.trim()}
          onClick={() => void action('analyze-intake', { customerInput: question })}
        >
          分析已保存资料
        </button>
        {analyst && (
          <div style={{ marginTop: 20 }}>
            <p>{(analyst.output as Row).nextQuestion || '已完成资料分析。'}</p>
            {(analyst.output as Row).warnings?.map((w: string) => (
              <Notice key={w}>{w}</Notice>
            ))}
            {(analyst.output as Row).facts?.map((f: Row) => (
              <p className="ob-muted" key={f.id}>
                待确认 · {f.key}：
                {typeof f.value === 'object' ? JSON.stringify(f.value) : String(f.value)}
              </p>
            ))}
            {(analyst.output as Row).facts?.length > 0 && (
              <button className="ob-button ob-ghost" onClick={useSuggestions}>
                加入表单供我核对
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function CreativeChoices({
  data,
  disabled,
  action,
}: {
  data: Workspace;
  disabled: boolean | undefined;
  action: Action;
}) {
  const run = data.runs.find(
    (r) =>
      r.role === 'design' &&
      r.status === 'SUCCEEDED' &&
      r.factVersion === data.project.fact_version,
  );
  const choices = ((run?.output as Row)?.choices || []) as Row[];
  const [signedAssets, setSignedAssets] = useState<{ id: string; url?: string }[]>([]);
  useEffect(() => {
    let live = true;
    void customerApi<{ assets: { id: string; url?: string }[] }>(
      `core/projects/${data.project.id}/assets`,
    )
      .then((v) => {
        if (live) setSignedAssets(v.assets ?? []);
      })
      .catch(() => {
        if (live) setSignedAssets(data.assets.map((a) => ({ id: a.id })));
      });
    return () => {
      live = false;
    };
  }, [data.project.id, data.assets]);
  return (
    <>
      <section className="ob-card">
        <h2>为产品生成不同的创意方向</h2>
        <p>
          每个方案包含独立的设计DNA、页面构图、色彩、字体与设计理由。AI 根据商品特征独立设计不同的页面结构，不是套用固定模板。先批准产品需求摘要，再让创意团队开始。
        </p>
        <div className="ob-actions">
          <button
            disabled={disabled || !data.briefs[0]?.approved_at}
            className="ob-button"
            onClick={() => void action('design-options')}
          >
            {choices.length ? '重新提案' : '生成创意方案'}
          </button>
          {data.designs.length > 0 && (
            <Link
              className="ob-button ob-ghost"
              href={`/dashboard/projects/${data.project.id}/studio`}
            >
              进入作品制作 →
            </Link>
          )}
        </div>
      </section>
      <div className="ob-grid ob-two">
        {choices.map((c: Row) => (
          <article className="ob-choice" key={c.directionId ?? c.styleId}>
            <span className="ob-eyebrow">{c.density || c.layoutMode || '设计方案'}</span>
            <h2>{c.name || c.styleId}</h2>
            {c.tagline && <p className="ob-muted">{c.tagline}</p>}
            <div className="ob-palette">
              {Object.entries(c.palette || {}).map(([key, color]) => (
                <i key={key} style={{ background: String(color) }} title={`${key}: ${color}`} />
              ))}
            </div>
            {Array.isArray(c.visualKeywords) && c.visualKeywords.length > 0 && (
              <p className="ob-muted">视觉关键词：{c.visualKeywords.join(' · ')}</p>
            )}
            <p>{c.visualConcept || c.rationale}</p>
            {c.siteBlueprint && (
              <p className="ob-muted">
                页面构图：{c.siteBlueprint.pages?.[0]?.sections?.map((s: Row) => s.type).join(' → ')}
              </p>
            )}
            <p className="ob-muted">以下是基于已确认资料的方向示意，非最终作品。</p>
            <SiteFrame
              mapped={directionPreview(
                data.project.id,
                data.project.fact_version,
                c as Workspace['designs'][number]['body'],
                data.facts,
                signedAssets,
              )}
              width="100%"
              title={`设计方向 ${c.name || c.styleId}`}
              height={440}
            />
            <p className="ob-muted">
              字体：{Object.values(c.typography || {}).join(' / ')} · 动效：{c.motionPreset}
            </p>
            <button
              disabled={disabled}
              className="ob-button"
              onClick={() =>
                void action('approve-design', {
                  runId: run!.id,
                  ...(c.directionId ? { directionId: c.directionId } : { styleId: c.styleId }),
                })
              }
            >
              选择并批准此方向
            </button>
          </article>
        ))}
      </div>
      {data.designs[0] && (
        <Notice>
          已批准方向：{data.designs[0].body.name || data.designs[0].body.styleId} · 资料版本{' '}
          {data.designs[0].body.factVersion}
        </Notice>
      )}
    </>
  );
}

function PrivatePreview({ id, revision }: { id: string; revision: number }) {
  const [mapped, setMapped] = useState<ReturnType<typeof mapSite>>(),
    [error, setError] = useState(''),
    [width, setWidth] = useState<'mobile' | 'desktop'>('desktop'),
    [preview, setPreview] = useState<Parameters<typeof mapSite>[0]>(),
    [pageSlug, setPageSlug] = useState('');
  useEffect(() => {
    let live = true;
    void customerApi(`core/projects/${id}/preview?revision=${revision}`)
      .then((v) => {
        const m = mapSite(v, true, publicAuthUrl());
        if (live) {
          setMapped(m);
          setPreview(v);
          setPageSlug('');
          setError('');
        }
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [id, revision]);
  return (
    <section className="ob-card">
      <div className="ob-workspace-head">
        <div>
          <h2>私有网站预览</h2>
          <p className="ob-muted">仅当前账户可见，尚未因预览而公开发布。</p>
        </div>
        <div className="ob-inline">
          <button
            aria-pressed={width === 'desktop'}
            className="ob-button ob-ghost ob-small"
            onClick={() => setWidth('desktop')}
          >
            桌面
          </button>
          <button
            aria-pressed={width === 'mobile'}
            className="ob-button ob-ghost ob-small"
            onClick={() => setWidth('mobile')}
          >
            手机
          </button>
        </div>
      </div>
      {preview && preview.site.pages.length > 1 && (
        <label>
          预览页面
          <select
            aria-label="预览页面"
            value={pageSlug}
            onChange={(e) => {
              setPageSlug(e.target.value);
              setMapped(mapSite({ ...preview, pageSlug: e.target.value }, true, publicAuthUrl()));
            }}
          >
            {preview.site.pages.map((page) => (
              <option value={page.slug} key={page.slug}>
                {page.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {error ? (
        <Notice error>{error}</Notice>
      ) : mapped ? (
        <SiteFrame mapped={mapped} width={width === 'mobile' ? 375 : '100%'} />
      ) : (
        <Loading />
      )}
    </section>
  );
}
function RevisionEditor({
  data,
  disabled,
  action,
}: {
  data: Workspace;
  disabled: boolean | undefined;
  action: Action;
}) {
  const [instruction, setInstruction] = useState(''),
    [target, setTarget] = useState('site');
  const base = data.versions.find(
    (v) =>
      ['APPROVED', 'PUBLISHED'].includes(v.status) && v.fact_version === data.project.fact_version,
  );
  const change = data.runs.find((r) => r.role === 'change' && r.status === 'SUCCEEDED');
  return (
    <section className="ob-card">
      <h2>提出一次明确的修改</h2>
      <p>
        剩余 {data.entitlement.remaining_revisions}{' '}
        轮。只修改选定载体，其余保持原样。产品价格、参数等事实变化请回到产品资料重新确认。
      </p>
      <form
        className="ob-form"
        onSubmit={(e) => {
          e.preventDefault();
          void action('revisions', {
            instruction,
            targetArtifacts: target,
            baseRevision: base?.revision,
          });
        }}
      >
        <label>
          修改范围
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="site">只改网站</option>
            <option value="poster">只改海报</option>
            <option value="copy">只改文案</option>
            <option value="all">整套作品</option>
          </select>
        </label>
        <label>
          具体希望如何调整？
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="例如：只将网站首屏改成黑金风格，保持海报和文案不变。"
            minLength={1}
            maxLength={2000}
            required
          />
        </label>
        <button
          disabled={disabled || !base || !data.entitlement.remaining_revisions}
          className="ob-button"
        >
          提交修改，使用一轮次数
        </button>
        {!base && <Notice>请先批准一版作品，再提交修改。</Notice>}
      </form>
      {change && (
        <Notice>
          {(change.output as Row).requiresFactApproval
            ? '这次修改涉及产品事实，请回到产品资料更新并重新确认。'
            : `修改结果已生成，可在作品预览中查看版本 ${(change.output as Row).previewRevision}。`}
        </Notice>
      )}
    </section>
  );
}
function CopyCards({ copy }: { copy: Row[] }) {
  const [message, setMessage] = useState('');
  return (
    <section className="ob-card">
      <h2>小红书配套文案</h2>
      {message && <Notice>{message}</Notice>}
      {copy.map((c, index) => (
        <article key={c.id} className="ob-row" style={{ display: 'block' }}>
          <h3>{c.title}</h3>
          <p className="ob-copy">{c.body}</p>
          <p>{c.hashtags.map((t: string) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}</p>
          <p>{c.cta}</p>
          <button
            className="ob-button ob-ghost ob-small"
            onClick={() =>
              void navigator.clipboard
                .writeText(`${c.title}\n\n${c.body}\n\n${c.hashtags.join(' ')}\n${c.cta}`)
                .then(() => setMessage('文案已复制。'))
                .catch(() => setMessage('无法自动复制，请选中文案手动复制。'))
            }
          >
            复制整套文案
          </button>
          <a
            className="ob-button ob-ghost ob-small"
            href={`data:text/markdown;charset=utf-8,${encodeURIComponent(`${c.title}\n\n${c.body}\n\n${c.hashtags.join(' ')}\n\n${c.cta}\n事实版本：${c.factVersion}\n`)}`}
            download={`xiaohongshu-poster-${index + 1}.md`}
          >
            下载文案 Markdown
          </a>
        </article>
      ))}
    </section>
  );
}
function Delivery({
  data,
  disabled,
  action,
}: {
  data: Workspace;
  disabled: boolean | undefined;
  action: Action;
}) {
  const [delivery, setDelivery] = useState<Row>(),
    [error, setError] = useState('');
  const published = data.project.published_verified && data.project.published_revision;
  const latest = data.versions.find((v) => v.revision === data.project.published_revision);
  const load = useCallback(async () => {
    try {
      setDelivery(await customerApi(`core/projects/${data.project.id}/delivery`));
      setError('');
    } catch (e) {
      if ((e as { code?: string }).code !== 'DELIVERY_NOT_READY') setError((e as Error).message);
    }
  }, [data.project.id]);
  useEffect(() => {
    void load();
  }, [load, data.runs]);
  return (
    <div className="ob-stack">
      {error && <Notice error>{error}</Notice>}
      <section className="ob-card">
        <h2>宣传网站</h2>
        {published ? (
          <>
            <p>已发布版本 {data.project.published_revision}</p>
            <a
              className="ob-button"
              href={`/p/${data.project.publish_slug}`}
              target="_blank"
              rel="noreferrer"
            >
              打开宣传网站 ↗
            </a>
            <p className="ob-muted">
              托管至 {new Date(data.entitlement.expires_at).toLocaleDateString('zh-CN')}
            </p>
          </>
        ) : (
          <p>尚未发布。请先在作品预览中批准并发布作品。</p>
        )}
        <div className="ob-actions">
          <button
            className="ob-button ob-ghost"
            disabled={disabled || !published}
            onClick={() => void action('delivery')}
          >
            {delivery ? '更新交付链接' : '生成正式交付包'}
          </button>
          <button className="ob-link" onClick={() => void load()}>
            刷新下载链接
          </button>
        </div>
        {published && !data.project.browser_verified_revision && (
          <Notice>交付前需要完成网站交互检查。网站已公开，检查通过后才会生成正式文件。</Notice>
        )}
      </section>
      {delivery && (
        <>
          <section className="ob-card">
            <h2>完整交付包</h2>
            <p>
              版本 {delivery.manifest.siteRevision} · 资料版本 {delivery.manifest.factVersion}
            </p>
            <p>
              包含海报、二维码、小红书文案、网站地址与文件校验清单。签名下载链接有效期 5
              分钟，过期后刷新即可。
            </p>
            <div className="ob-actions">
              <a href={delivery.zipDownloadUrl} className="ob-button">
                下载完整 ZIP ↓
              </a>
              {delivery.acceptedAt ? (
                <span className="ob-tag">已验收</span>
              ) : (
                <button
                  disabled={disabled}
                  className="ob-button ob-ghost"
                  onClick={() =>
                    void action('accept', { manifestVersion: delivery.manifest.siteRevision }).then(
                      () => load(),
                    )
                  }
                >
                  我已检查成品，确认验收
                </button>
              )}
            </div>
          </section>
          <div className="ob-grid ob-two">
            {delivery.posterDownloads.map((p: Row, i: number) => (
              <article className="ob-card" key={p.path}>
                <img className="ob-poster" src={p.url} alt={`正式宣传海报 ${i + 1}`} />
                <p>
                  {delivery.manifest.posters[i]?.width} × {delivery.manifest.posters[i]?.height} ·
                  PNG
                </p>
                <a href={p.url} target="_blank" rel="noreferrer" className="ob-button ob-ghost">
                  打开 / 保存海报 ↓
                </a>
              </article>
            ))}
          </div>
          {delivery.qrDownloads?.length > 0 && (
            <section className="ob-card">
              <h2>网站二维码</h2>
              <p>二维码指向当前交付的网站地址，可独立保存后用于其他宣传素材。</p>
              <img
                src={delivery.qrDownloads[0].url}
                alt="已发布宣传网站二维码"
                style={{ width: 220, maxWidth: '100%', height: 'auto' }}
              />
              <a
                href={delivery.qrDownloads[0].url}
                target="_blank"
                rel="noreferrer"
                className="ob-button ob-ghost"
              >
                打开 / 保存二维码 ↓
              </a>
            </section>
          )}
        </>
      )}
      {latest && <CopyCards copy={latest.body.copy} />}
    </div>
  );
}
function RunList({ runs }: { runs: Run[] }) {
  return (
    <section className="ob-card">
      <h2>真实任务记录</h2>
      <p>显示服务器持久化任务，不使用模拟进度。失败任务的错误代码可供排查。</p>
      {runs.length ? (
        runs.map((r) => (
          <div className="ob-row" key={r.id}>
            <div>
              <strong>{roleLabel[r.role] || r.role}</strong>
              <p className="ob-code">{r.id}</p>
              <span className="ob-muted">
                {new Date(r.created_at).toLocaleString('zh-CN')} · 尝试 {r.attempt} 次
                {r.usage?.total_tokens ? ` · ${r.usage.total_tokens} tokens` : ''}
              </span>
              {r.error_class && <p className="ob-code ob-run-error">{r.error_class}</p>}
            </div>
            <span className="ob-tag">{statusLabel(r.status)}{r.stage ? ` · ${r.stage}` : ''}</span>
          </div>
        ))
      ) : (
        <p>还没有任务。先保存产品资料。</p>
      )}
    </section>
  );
}
