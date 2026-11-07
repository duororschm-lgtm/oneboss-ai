'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCustomer, customerApi } from './session';
import { Notice, Loading, money, statusLabel } from './shell';
import type { Account, Row } from '../../lib/customer/types';
import { ProjectStudio } from './studio';
import { ProductionProgress } from './production-progress';
import { usePaymentMethods } from './payment-methods';
import { ManualPayment } from './manual-payment';

export function Dashboard({ path }: { path: string[] }) {
  const { session, ready } = useCustomer();
  const router = useRouter();
  const [account, setAccount] = useState<Account>(),
    [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setAccount(await customerApi<Account>('core/account'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (session) void load();
    else setAccount(undefined);
  }, [session, load]);
  // 旧的内嵌审核页已下线：管理员统一走独立的 /admin 后台，旧链接直接跳过去。
  useEffect(() => {
    if (path[0] === 'admin') router.replace('/admin');
  }, [path, router]);
  if (!ready)
    return (
      <main className="ob-container">
        <Loading />
      </main>
    );
  if (!session)
    return (
      <main className="ob-container ob-section">
        <h1>你的创意工作台</h1>
        <p>请先登录，查看自己的订单和项目。</p>
        <Link
          className="ob-button"
          href={`/login?next=${encodeURIComponent('/dashboard/' + path.join('/'))}`}
        >
          登录并继续 →
        </Link>
      </main>
    );
  const projectId = path[0] === 'projects' && path[1] !== 'new' ? path[1] : undefined;
  const links = projectId
    ? [
        ['intake', '产品资料'],
        ['creative', '创意方向'],
        ['studio', '作品预览'],
        ['posters', '海报文案'],
        ['revise', '提出修改'],
        ['delivery', '作品交付'],
        ['agents', '任务记录'],
      ]
    : [
        ['', '总览'],
        ['orders', '我的订单'],
        ['projects', '我的项目'],
      ];
  return (
    <main className="ob-workspace">
      <aside className="ob-sidebar">
        <p className="ob-eyebrow">{projectId ? 'YOUR PROJECT' : 'WORKSPACE'}</p>
        {projectId && <Link href="/dashboard">← 返回工作台</Link>}
        {links.map(([key, label]) => {
          const href = projectId
            ? `/dashboard/projects/${projectId}/${key}`
            : `/dashboard${key ? '/' + key : ''}`;
          return (
            <Link
              key={key}
              href={href}
              aria-current={
                (projectId ? (path[2] || 'intake') === key : (path[0] || '') === key)
                  ? 'page'
                  : undefined
              }
            >
              {label}
            </Link>
          );
        })}
      </aside>
      <div className="ob-workspace-content">
        {error && (
          <Notice error>
            {error}
            <button className="ob-link" onClick={() => void load()}>
              重新读取
            </button>
          </Notice>
        )}
        {path[0] === 'admin' ? (
          <p>管理员平台已迁至独立的 <Link href="/admin">/admin</Link> 入口，正在跳转…</p>
        ) : projectId ? (
          <>
            {/* 生产进度中心：真实 agent_runs + task_events，不显示虚构百分比 */}
            <ProductionProgress projectId={projectId} />
            <ProjectStudio key={projectId} id={projectId} section={path[2] || 'intake'} />
          </>
        ) : path[0] === 'orders' && path[1] ? (
          <OrderDetail id={path[1]} onChanged={load} />
        ) : !account ? (
          <Loading />
        ) : (
          <>
            <div className="ob-workspace-head">
              <div>
                <span className="ob-eyebrow">YOUR CREATIVE WORKSPACE</span>
                <h1>
                  {path[0] === 'orders'
                    ? '我的订单'
                    : path[0] === 'projects'
                      ? '我的项目'
                      : '让下一个作品，开始发生。'}
                </h1>
                <p className="ob-muted">
                  {session.user.app_metadata.account_kind === 'username'
                    ? session.user.user_metadata.username || '我的账号'
                    : session.user.email}
                </p>
              </div>
              <Link className="ob-button" href="/pricing">
                开始新项目 ↗
              </Link>
            </div>
            {(!path[0] || path[0] === 'projects') && (
              <section className="ob-card">
                <h2>制作项目</h2>
                {account.projects.length ? (
                  account.projects.map((p) => (
                    <div className="ob-row" key={p.id}>
                      <div>
                        <span className="ob-row-title">
                          {p.plan_snapshot.name} · 项目 {p.id.slice(0, 8)}
                        </span>
                        <p className="ob-muted">
                          {statusLabel(p.status)} · 资料版本 {p.fact_version}{' '}
                          {p.is_demo && <span className="ob-tag ob-tag-demo">演示项目</span>}
                        </p>
                      </div>
                      <Link
                        className="ob-button ob-ghost ob-small"
                        href={`/dashboard/projects/${p.id}/intake`}
                      >
                        继续制作 →
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="ob-empty">
                    <h3>还没有制作项目</h3>
                    <p>创建订单并确认付款后，即可提交产品资料。</p>
                    <Link href="/pricing" className="ob-text-link">
                      选择服务套餐 →
                    </Link>
                  </div>
                )}
              </section>
            )}
            {(!path[0] || path[0] === 'orders') && (
              <section className="ob-card" style={{ marginTop: 24 }}>
                <h2>服务订单</h2>
                {account.orders.length ? (
                  account.orders.map((o) => (
                    <div className="ob-row" key={o.id}>
                      <div>
                        <span className="ob-row-title">
                          {o.plan_snapshot.name} · {money(o.amount_minor)}
                        </span>
                        <p className="ob-muted">
                          付款：{statusLabel(o.pay_state)} · 制作：
                          {o.work_state ? statusLabel(o.work_state) : '尚未开始'}{' '}
                          {o.is_demo && (
                            <span className="ob-tag ob-tag-demo">演示 · 无真实收款</span>
                          )}
                        </p>
                      </div>
                      <Link
                        className="ob-button ob-ghost ob-small"
                        href={`/dashboard/orders/${o.id}`}
                      >
                        查看订单 →
                      </Link>
                    </div>
                  ))
                ) : (
                  <p>还没有订单。</p>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function OrderDetail({ id, onChanged }: { id: string; onChanged: () => Promise<void> }) {
  const methods = usePaymentMethods();
  const [payment, setPayment] = useState<Row>();
  const [order, setOrder] = useState<Row>(),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setOrder(await customerApi<Row>(`commerce/orders/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (order?.pay_state !== 'PENDING_CONFIRMATION') return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 6000);
    return () => clearInterval(timer);
  }, [payment, order?.pay_state, load]);
  async function pay(reconcile = false) {
    setBusy(true);
    setError('');
    try {
      if (reconcile) {
        const result = await customerApi<Row>(`commerce/orders/${id}/reconcile-wechat`, {});
        setMessage(
          result.payState === 'PAID' ? '微信已确认付款。' : '微信尚未确认付款，请稍后再查。',
        );
      } else
        setPayment(
          await customerApi(`commerce/orders/${id}/checkout`, { channel: 'wechat_native' }),
        );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(type: 'project' | 'close' | 'refund') {
    setBusy(true);
    setError('');
    try {
      if (type === 'project') {
        const p = await customerApi<Row>('core/projects', { orderId: id });
        window.location.assign(`/dashboard/projects/${p.id}/intake`);
      } else if (type === 'refund') {
        await customerApi(`commerce/orders/${id}/refunds`, { amountMinor: order!.amount_minor });
        setMessage('退款申请已提交，制作权益暂时冻结。申请不代表退款到账。');
      } else await customerApi(`commerce/orders/${id}/close`, {});
      await load();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="ob-text-link ob-tight" href="/dashboard/orders">
        ← 我的订单
      </Link>
      <h1 style={{ marginTop: 20 }}>订单详情</h1>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {!order ? (
        <Loading />
      ) : (
        <div className="ob-stack">
          <section className="ob-card">
            <div className="ob-workspace-head">
              <h2>{order.plan_snapshot.name}</h2>
              {order.is_demo && <span className="ob-tag ob-tag-demo">演示订单 · 无真实收款</span>}
            </div>
            <p className="ob-code">{order.order_no}</p>
            <p className="ob-price">{money(order.amount_minor)}</p>
            <p>付款状态：{statusLabel(order.pay_state)}</p>
            {order.plan_snapshot.addons?.length > 0 && (
              <p className="ob-muted">
                加购：
                {order.plan_snapshot.addons.map((a: Row) => `${a.name} × ${a.qty}`).join('、')}
              </p>
            )}
            <div className="ob-metrics">
              <span>
                <strong>{order.plan_snapshot.product_limit}</strong>个产品
              </span>
              <span>
                <strong>{order.plan_snapshot.poster_count}</strong>张海报
              </span>
              <span>
                <strong>{order.plan_snapshot.revision_rounds}</strong>轮修改
              </span>
              <span>
                <strong>{order.plan_snapshot.hosting_days}</strong>天托管
              </span>
            </div>
            {order.pay_state === 'PAID' ? (
              <button disabled={busy} className="ob-button" onClick={() => void action('project')}>
                进入制作项目 →
              </button>
            ) : ['UNPAID', 'PENDING_CONFIRMATION'].includes(order.pay_state) ? (
              <>
                {!order.is_demo ? (
                  (methods.manualChannels?.[order.payment_channel === 'alipay' ? 'alipay' : 'wechat'] || (order.payment_channel !== 'alipay' && methods.manual)) ?
                  <ManualPayment order={order} method={(methods.manualChannels?.[order.payment_channel === 'alipay' ? 'alipay' : 'wechat'] || methods.manual)!} onChanged={load} />
                  : <Notice>{order.payment_channel === 'alipay' ? '支付宝' : '微信'}人工核验通道待配置，暂不可付款。</Notice>
                ) : methods.wechatNative && !order.is_demo ? (
                  <>
                    <Notice>
                      收款服务提供方：BlackCode。请核对订单金额后，使用微信扫一扫完成付款；付款结果由商户核验。
                    </Notice>
                    <button
                      disabled={busy || order.checkout_blocked}
                      className="ob-button"
                      onClick={() => void pay()}
                    >
                      微信支付 {money(order.amount_minor)}
                    </button>
                    {payment && (
                      <div className="ob-card" style={{ marginTop: 20 }}>
                        <h3>微信扫码支付</h3>
                        <img
                          src={payment.qrDataUrl}
                          alt="微信付款二维码"
                          width={280}
                          height={280}
                          style={{ maxWidth: '100%', height: 'auto' }}
                        />
                        <p>应付 {money(payment.amountMinor)} · 请使用另一台设备上的微信扫一扫。</p>
                        <p className="ob-muted">
                          二维码有效至 {new Date(payment.expiresAt).toLocaleTimeString('zh-CN')}
                          。未付款可关闭订单，超时后重新获取二维码。
                        </p>
                        <button
                          disabled={busy}
                          className="ob-button ob-ghost"
                          onClick={() => void pay(true)}
                        >
                          我已付款，查询结果
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <Notice>在线商户支付尚未开通，此订单未扣费。开通后可继续付款。</Notice>
                )}
                <button
                  disabled={busy}
                  className="ob-button ob-ghost"
                  onClick={() => void action('close')}
                >
                  关闭未付款订单
                </button>
              </>
            ) : null}
          </section>
          <section className="ob-card">
            <h2>交付约定</h2>
            <p>{order.terms_snapshot.service}</p>
            <p>退款：{order.terms_snapshot.refundPolicy}</p>
            <Link href="/terms" className="ob-text-link">
              完整服务说明 →
            </Link>
            {order.pay_state === 'PAID' && !order.is_demo && (
              <details style={{ marginTop: 24 }}>
                <summary>申请退款</summary>
                <p>
                  将申请退回 {money(order.amount_minor)}
                  。提交后制作权益暂时冻结，实际处理需要核实服务履约与商户结果。
                </p>
                <button
                  disabled={busy}
                  className="ob-button ob-ghost"
                  onClick={() => void action('refund')}
                >
                  确认提交退款申请
                </button>
              </details>
            )}
          </section>
        </div>
      )}
    </>
  );
}
