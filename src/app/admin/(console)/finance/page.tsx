'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchRevenue, ENDPOINTS, type AdminResult } from '../../../../lib/admin/api';
import type { RevenuePoint } from '../../../../lib/admin/types';
import { money } from '../../../../lib/admin/format';
import { RevenueChart } from '../../../../components/admin/chart';
import {
  Banner,
  EmptyState,
  ErrorState,
  SkeletonRows,
  UnsupportedState,
} from '../../../../components/admin/states';
import { Card, DataTable, PageHead, type Column } from '../../../../components/admin/ui';

const iso = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(date);

const daysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return iso(date);
};

export default function FinancePage() {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(daysAgo(0));
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');
  const [result, setResult] = useState<AdminResult<RevenuePoint[]> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setResult(await fetchRevenue(from, to, groupBy));
    setLoading(false);
  }, [from, to, groupBy]);

  useEffect(() => {
    void load();
  }, [load]);

  const points = result?.ok ? result.data : [];

  // Compute summary metrics from server data
  const totals = points.reduce(
    (acc, p) => ({
      confirmed: acc.confirmed + p.confirmedMinor,
      refunded: acc.refunded + p.refundedMinor,
      net: acc.net + p.netMinor,
      orders: acc.orders + p.orderCount,
    }),
    { confirmed: 0, refunded: 0, net: 0, orders: 0 },
  );

  const quickRanges = [
    { label: '近 7 天', days: 6 },
    { label: '近 14 天', days: 13 },
    { label: '近 30 天', days: 29 },
    { label: '近 90 天', days: 89 },
  ];

  const columns: Column<RevenuePoint>[] = [
    { key: 'date', header: '日期', render: (row) => row.date },
    {
      key: 'orders',
      header: '订单数',
      align: 'right',
      render: (row) => row.orderCount.toLocaleString('zh-CN'),
    },
    { key: 'confirmed', header: '已确认到账', align: 'right', render: (row) => money(row.confirmedMinor) },
    { key: 'refunded', header: '已成功退款', align: 'right', render: (row) => money(row.refundedMinor) },
    { key: 'net', header: '净收款', align: 'right', render: (row) => money(row.netMinor) },
  ];

  return (
    <>
      <PageHead
        title="财务与收入"
        description="口径由服务端统计接口定义。订单总额不等于到账，模拟支付不计入收入，退款申请中不提前扣减。"
        actions={
          <button className="ad-btn" onClick={() => void load()} disabled={loading}>
            刷新
          </button>
        }
      />

      <Banner tone="info">
        <strong>口径说明</strong>：订单总额＝已创建订单应付金额总和；已确认到账＝渠道可信确认或授权人工核验的成功收款；
        已成功退款＝渠道确认完成的退款；净收款＝到账 − 成功退款；制作中订单金额不计入收入。
        估算经营结余仅作经营参考，不是法定会计利润。
      </Banner>

      {/* Metric summary cards */}
      <div className="ad-grid ad-grid-4" style={{ marginBottom: 24 }}>
        <div className="ad-metric">
          <span className="ad-metric-label">已确认到账</span>
          <span className="ad-metric-value" style={{ color: '#2563eb' }}>
            {money(totals.confirmed)}
          </span>
          <span className="ad-metric-note">{points.length} 天合计</span>
        </div>
        <div className="ad-metric">
          <span className="ad-metric-label">已成功退款</span>
          <span className="ad-metric-value" style={{ color: '#dc2626' }}>
            {money(totals.refunded)}
          </span>
          <span className="ad-metric-note">{points.length} 天合计</span>
        </div>
        <div className="ad-metric">
          <span className="ad-metric-label">净收款</span>
          <span className="ad-metric-value" style={{ color: '#16794a' }}>
            {money(totals.net)}
          </span>
          <span className="ad-metric-note">到账 − 成功退款</span>
        </div>
        <div className="ad-metric">
          <span className="ad-metric-label">订单总数</span>
          <span className="ad-metric-value">{totals.orders.toLocaleString('zh-CN')}</span>
          <span className="ad-metric-note">已创建订单</span>
        </div>
      </div>

      {/* Quick range buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {quickRanges.map((r) => (
          <button
            key={r.days}
            className="ad-btn"
            style={{
              padding: '6px 14px',
              fontSize: 13,
              borderRadius: 8,
              border: `1px solid ${from === daysAgo(r.days) ? '#2563eb' : '#d1d5db'}`,
              background: from === daysAgo(r.days) ? '#eff6ff' : '#fff',
              color: from === daysAgo(r.days) ? '#2563eb' : '#374151',
            }}
            onClick={() => {
              setFrom(daysAgo(r.days));
              setTo(daysAgo(0));
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Card padding={false}>
        <div className="ad-toolbar">
          <label className="ad-field">
            起始日期
            <input className="ad-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="ad-field">
            结束日期
            <input className="ad-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="ad-field">
            聚合
            <select
              className="ad-select"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as 'day' | 'week' | 'month')}
            >
              <option value="day">按日</option>
              <option value="week">按周</option>
              <option value="month">按月</option>
            </select>
          </label>
        </div>

        {loading && !result ? (
          <SkeletonRows rows={6} />
        ) : result?.ok ? (
          points.length ? (
            <>
              <div className="ad-card-body">
                <RevenueChart points={points} />
              </div>
              <DataTable columns={columns} rows={points} rowKey={(row) => row.date} caption="收入明细" />
            </>
          ) : (
            <EmptyState title="所选区间无收款记录" detail="调整日期范围后重试。" />
          )
        ) : result && result.kind === 'unsupported' ? (
          <UnsupportedState
            spec={result.spec}
            extra={
              <p style={{ fontSize: 12.5, margin: 0 }}>
                前端不做财务汇总（任务书禁止用前端覆盖后端统计口径）。图表、区间合计与月度成本
                都要等后端给出聚合结果后才能显示，此处不会用列表自行加总。
              </p>
            }
          />
        ) : result && result.kind === 'error' ? (
          <ErrorState message={result.message} requestId={result.requestId} onRetry={() => void load()} />
        ) : null}
      </Card>

      <Card title="成本与结余" subtitle="尚未接入成本数据" padding={false}>
        <div className="ad-state">
          <strong>成本口径尚未建立</strong>
          <p style={{ margin: '0 0 6px' }}>
            MiMo 调用成本、存储/托管/支付手续费需要按项目归集后才能计算；
            估算经营结余必须标注为估算，不得当作法定会计利润。
          </p>
          <p style={{ margin: 0 }}>在拿到真实成本前，本页不展示任何结余数字。</p>
        </div>
      </Card>
    </>
  );
}
