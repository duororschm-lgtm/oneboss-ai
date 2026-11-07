'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchDashboard, fetchRevenue, ENDPOINTS, type AdminResult } from '../../../lib/admin/api';
import type { DashboardMetrics, RevenuePoint } from '../../../lib/admin/types';
import { dateOnly, money, payState } from '../../../lib/admin/format';
import { RevenueChart } from '../../../components/admin/chart';
import { useAdmin } from '../../../components/admin/shell';
import { Banner, EmptyState, ErrorState, SkeletonRows, UnsupportedState } from '../../../components/admin/states';
import { Card, MetricCard, PageHead, StatusBadge } from '../../../components/admin/ui';

const dayString = (offsetDays: number) => {
  const date = new Date();
  date.setDate(date.getDate() - offsetDays);
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(date);
};

export default function AdminDashboardPage() {
  const { workspace, reload } = useAdmin();
  const [dashboard, setDashboard] = useState<AdminResult<DashboardMetrics> | null>(null);
  const [revenue, setRevenue] = useState<AdminResult<RevenuePoint[]> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [dash, rev] = await Promise.all([
      fetchDashboard(),
      fetchRevenue(dayString(13), dayString(0), 'day'),
    ]);
    setDashboard(dash);
    setRevenue(rev);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const raw = workspace?.ok ? workspace.data : null;
  const metrics = dashboard?.ok ? dashboard.data : null;
  const unsupportedDashboard = dashboard && !dashboard.ok && dashboard.kind === 'unsupported';

  const cards = useMemo(
    () => [
      { label: '今日确认到账', value: metrics && metrics.todayConfirmedMinor !== null ? money(metrics.todayConfirmedMinor) : '无财务权限', note: '口径：渠道确认或授权人工核验' },
      { label: '本月净收款', value: metrics && metrics.monthNetMinor !== null ? money(metrics.monthNetMinor) : '无财务权限', note: '到账 − 已成功退款' },
      { label: '累计订单数', value: metrics && metrics.totalOrders.toLocaleString('zh-CN'), note: '不含演示订单口径由后端定义' },
      { label: '待支付核验', value: metrics && String(metrics.pendingPaymentReviews), note: '需要人工核对真实入账' },
      { label: '待制作放行', value: metrics && String(metrics.pendingReleases), note: '付款已确认、等待放行' },
      { label: '制作中项目', value: metrics && String(metrics.projectsInProduction), note: '履约中，不计入收入' },
      { label: '待作品审核', value: metrics && String(metrics.pendingWorkReviews), note: '等待内容审核' },
      { label: '待退款处理', value: metrics && String(metrics.pendingRefunds), note: '退款申请，不等于已退款' },
    ],
    [metrics],
  );

  return (
    <>
      <PageHead
        title="经营总览"
        description="全部指标以服务端口径为准。待支付订单不计入到账，模拟支付不计入真实收入，退款申请中不提前扣减。"
        actions={
          <button className="ad-btn" onClick={() => void load()} disabled={loading}>
            刷新
          </button>
        }
      />

      {unsupportedDashboard && (
        <Banner tone="warning">
          聚合指标接口 <code>GET /api/admin/dashboard</code> 尚未由 A 组提供（缺口 <strong>A-01</strong>）。
          下表指标卡不会显示任何数字，避免把「没有数据」误读为「数据为零」。
        </Banner>
      )}
      {dashboard && !dashboard.ok && dashboard.kind === 'error' && (
        <ErrorState message={dashboard.message} requestId={dashboard.requestId} onRetry={() => void load()} />
      )}

      <div className="ad-grid ad-grid-4">
        {cards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value || '—'}
            note={card.note}
            unsupported={!metrics ? '接口未提供' : undefined}
          />
        ))}
      </div>

      <div className="ad-split">
        <Card
          title="收款趋势"
          subtitle="最近 14 天 · 口径由后端统计接口提供"
          actions={<Link className="ad-btn" data-size="sm" href="/admin/finance">查看财务</Link>}
        >
          {loading && !revenue ? (
            <SkeletonRows rows={4} />
          ) : revenue?.ok ? (
            revenue.data.length ? (
              <RevenueChart points={revenue.data} />
            ) : (
              <EmptyState title="所选区间没有收款记录" />
            )
          ) : revenue && revenue.kind === 'unsupported' ? (
            <UnsupportedState spec={revenue.spec} />
          ) : revenue && revenue.kind === 'error' ? (
            <ErrorState message={revenue.message} onRetry={() => void load()} />
          ) : null}
        </Card>

        <Card title="待办摘要" subtitle="来自现有 /api/core/admin 的真实队列">
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>待核验的人工收款</span>
              <strong>{raw ? raw.manualAttempts.length : '—'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>待处理退款申请</span>
              <strong>{raw ? raw.refunds.filter((r) => r.status === 'REQUESTED').length : '—'}</strong>
            </div>
            <Link className="ad-btn" href="/admin/approvals">
              进入审批中心
            </Link>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ad-faint)' }}>
              其余审批类型（制作放行、作品审核、任务失败）也集中在审批中心，来自真实业务表。
            </p>
          </div>
        </Card>
      </div>

      <Card
        title="最近订单"
        subtitle="原始记录，非统计口径"
        padding={false}
        actions={<Link className="ad-btn" data-size="sm" href="/admin/orders">全部订单</Link>}
      >
        {!workspace ? (
          <SkeletonRows rows={4} />
        ) : workspace.ok ? (
          workspace.data.orders.length ? (
            <div className="ad-table-wrap">
              <table className="ad-table">
                <thead>
                  <tr>
                    <th scope="col">订单编号</th>
                    <th scope="col">客户组织</th>
                    <th scope="col">套餐</th>
                    <th scope="col" className="ad-num">金额</th>
                    <th scope="col">支付状态</th>
                    <th scope="col">创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.data.orders.slice(0, 8).map((order) => {
                    const state = payState(order.pay_state);
                    return (
                      <tr key={order.id}>
                        <td className="ad-code">{order.order_no}</td>
                        <td>{order.organization ?? '—'}</td>
                        <td>
                          {order.plan_name ?? '—'}
                          {order.is_demo && (
                            <span className="ad-badge" data-tone="neutral" style={{ marginLeft: 6 }}>
                              演示
                            </span>
                          )}
                        </td>
                        <td className="ad-num">{money(order.amount_minor)}</td>
                        <td>
                          <StatusBadge label={state.label} tone={state.tone} />
                        </td>
                        <td>{dateOnly(order.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="还没有订单" detail="客户下单后会出现在这里。" />
          )
        ) : (
          <UnsupportedState spec={ENDPOINTS.workspace} extra={
            <button className="ad-btn" onClick={() => void reload()}>重新读取</button>
          } />
        )}
      </Card>
    </>
  );
}
