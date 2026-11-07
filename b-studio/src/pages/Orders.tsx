import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Clock3, CreditCard, PackageCheck, ShieldCheck } from 'lucide-react';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { Badge, DemoBanner, EmptyState, formatDateTime, Notice } from '../components/ui';
import { formatCny } from '../data/plans';
import { useStudio } from '../lib/store';
import type { Order, PayState, WorkState } from '../types/contracts';

const payLabels: Record<PayState, string> = {
  UNPAID: '待付款',
  PENDING_CONFIRMATION: '人工核对中',
  DEMO_PAID: '已支付（演示）',
  PAID: '已支付',
  REFUNDED: '已退款',
};

const workLabels: Record<WorkState, string> = {
  WAITING_INPUT: '等待资料',
  BRIEF_APPROVAL: '简报待确认',
  DESIGN_APPROVAL: '待确认创意',
  GENERATING: '生成中',
  QA_REVIEW: '质检中',
  CLIENT_REVIEW: '待客户验收',
  DELIVERED: '已交付',
  ACCEPTED: '已验收',
};

const payTone = (state: PayState): 'good' | 'warn' | 'neutral' | 'accent' =>
  state === 'DEMO_PAID' || state === 'PAID' ? 'good' : state === 'PENDING_CONFIRMATION' || state === 'UNPAID' ? 'warn' : 'neutral';

export function Orders() {
  const { state, payDemo, requestManual, getSeed } = useStudio();
  const [params] = useSearchParams();
  const focusId = params.get('focus');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId) return;
    const node = document.getElementById(`order-${focusId}`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node?.classList.add('order-focus');
    const timer = window.setTimeout(() => node?.classList.remove('order-focus'), 2400);
    return () => window.clearTimeout(timer);
  }, [focusId]);

  const act = async (order: Order, kind: 'pay' | 'manual') => {
    setBusy(order.id);
    setError(null);
    try {
      if (kind === 'pay') await payDemo(order.id);
      else await requestManual(order.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败');
    } finally {
      setBusy(null);
    }
  };

  const unpaid = state.orders.filter((order) => order.payState === 'UNPAID').length;
  const active = state.orders.filter((order) => order.payState === 'DEMO_PAID' || order.payState === 'PAID').length;

  return (
    <MarketingLayout>
      <main className="orders-page">
        <header className="page-head compact">
          <span className="eyebrow">DASHBOARD / ORDERS</span>
          <h1>我的服务订单</h1>
          <p>支付状态与制作状态分离；正式环境由 A 组服务端维护，客户端不能修改金额或直接把订单置为已付。</p>
          <DemoBanner>演示订单与演示支付 · 不代表真实收款或正式权益</DemoBanner>
        </header>

        <section className="order-metrics" aria-label="订单概览">
          <div>
            <strong>{state.orders.length}</strong>
            <span>全部订单</span>
          </div>
          <div>
            <strong>{unpaid}</strong>
            <span>待付款</span>
          </div>
          <div>
            <strong>{active}</strong>
            <span>已支付 · 制作中</span>
          </div>
          <Link className="button dark" to="/pricing">
            新建制作订单 <ArrowRight size={16} />
          </Link>
        </section>

        {error && (
          <Notice tone="error" title="操作失败">
            {error}
          </Notice>
        )}

        <section className="order-list">
          {state.orders.length === 0 && (
            <EmptyState
              title="还没有订单"
              body="选择一个制作套餐，创建演示订单后即可进入创意工作台。"
              action={
                <Link className="button dark" to="/pricing">
                  选择套餐
                </Link>
              }
            />
          )}
          {state.orders.map((order) => {
            const seed = getSeed(order.projectId);
            return (
              <article className="order-card" key={order.id} id={`order-${order.id}`}>
                <header>
                  <div>
                    <span className="order-no">{order.orderNo}</span>
                    <h2>{order.planName}</h2>
                    <p>
                      {order.customerName} · {seed.name} · {formatDateTime(order.createdAt)}
                    </p>
                  </div>
                  <div className="order-tags">
                    {order.isDemo && <Badge tone="warn">DEMO</Badge>}
                    <Badge tone={payTone(order.payState)}>{payLabels[order.payState]}</Badge>
                    <Badge tone="neutral">{workLabels[order.workState]}</Badge>
                  </div>
                </header>
                <div className="order-body">
                  <dl>
                    <div>
                      <dt>服务金额</dt>
                      <dd>{formatCny(order.amountMinor)}</dd>
                    </div>
                    <div>
                      <dt>支付模式</dt>
                      <dd>{order.paymentMode === 'SANDBOX' ? '演示沙箱' : '人工核验'}</dd>
                    </div>
                    <div>
                      <dt>套餐权益</dt>
                      <dd>
                        {seed.products.length} 个产品 · 事实版本 V{seed.factVersion}
                      </dd>
                    </div>
                  </dl>
                  <div className="order-actions">
                    {order.payState === 'UNPAID' && (
                      <>
                        <button className="button dark" type="button" onClick={() => act(order, 'pay')} disabled={busy === order.id}>
                          <CreditCard size={16} /> 演示支付
                        </button>
                        <button className="button ghost" type="button" onClick={() => act(order, 'manual')} disabled={busy === order.id}>
                          <ShieldCheck size={16} /> 人工核验
                        </button>
                      </>
                    )}
                    {order.payState === 'PENDING_CONFIRMATION' && (
                      <button className="button dark" type="button" onClick={() => act(order, 'pay')} disabled={busy === order.id}>
                        <Clock3 size={16} /> 模拟管理员确认
                      </button>
                    )}
                    {(order.payState === 'DEMO_PAID' || order.payState === 'PAID') && (
                      <Link className="button dark" to={`/projects/${order.projectId}/creative`}>
                        <PackageCheck size={16} /> 进入制作工作台
                      </Link>
                    )}
                    <Link className="button ghost" to={`/projects/${order.projectId}/delivery`}>
                      交付中心
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="orders-note">
          <h2>状态说明</h2>
          <div>
            <p>
              <strong>支付状态</strong>：UNPAID → PENDING_CONFIRMATION → PAID；演示环境使用 DEMO_PAID，并在订单与后台保留 Demo 标识。
            </p>
            <p>
              <strong>制作状态</strong>：等待资料 → 创意确认 → 生成 → 质检 → 客户验收 → 已交付；网站已发布不等于整套交付完成。
            </p>
            <p>
              <strong>价格边界</strong>：订单金额是 OneBoss 制作服务费；海报与网站里的商品价格来自商品事实库，两者完全独立。
            </p>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
