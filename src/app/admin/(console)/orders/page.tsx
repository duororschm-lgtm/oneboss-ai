'use client';
import { useMemo, useState } from 'react';
import { ENDPOINTS } from '../../../../lib/admin/api';
import type { AdminOrder } from '../../../../lib/admin/types';
import { dateOnly, dateTime, money, payState } from '../../../../lib/admin/format';
import { useAdmin } from '../../../../components/admin/shell';
import { Banner, EmptyState, SkeletonRows, UnsupportedState } from '../../../../components/admin/states';
import {
  Card,
  DataTable,
  Drawer,
  KeyValue,
  PageHead,
  Pagination,
  StatusBadge,
  type Column,
} from '../../../../components/admin/ui';

const PAGE_SIZE = 15;

export default function OrdersPage() {
  const { workspace, reload } = useAdmin();
  const [keyword, setKeyword] = useState('');
  const [payFilter, setPayFilter] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminOrder | null>(null);

  const rows = workspace?.ok ? workspace.data.orders : [];

  const filtered = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return rows.filter((order) => {
      if (payFilter !== 'ALL' && order.pay_state !== payFilter) return false;
      if (text) {
        const haystack = `${order.order_no} ${order.organization ?? ''} ${order.plan_name ?? ''}`.toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      const created = order.created_at.slice(0, 10);
      if (from && created < from) return false;
      if (to && created > to) return false;
      return true;
    });
  }, [rows, keyword, payFilter, from, to]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: Column<AdminOrder>[] = [
    { key: 'no', header: '订单编号', render: (row) => <span className="ad-code">{row.order_no}</span> },
    {
      key: 'org',
      header: '客户组织',
      render: (row) => (
        <>
          {row.organization ?? '—'}
          {row.is_demo && (
            <span className="ad-badge" data-tone="neutral" style={{ marginLeft: 6 }}>
              演示
            </span>
          )}
        </>
      ),
    },
    { key: 'plan', header: '套餐', render: (row) => row.plan_name ?? '—' },
    { key: 'amount', header: '金额', align: 'right', render: (row) => money(row.amount_minor) },
    {
      key: 'pay',
      header: '支付状态',
      render: (row) => {
        const state = payState(row.pay_state);
        return <StatusBadge label={state.label} tone={state.tone} />;
      },
    },
    {
      key: 'work',
      header: '制作状态',
      render: () => (
        <span className="ad-badge" data-tone="neutral" title="需要 A-03 返回 work_state">
          接口未提供
        </span>
      ),
    },
    { key: 'created', header: '创建时间', render: (row) => dateOnly(row.created_at) },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <button
          className="ad-btn"
          data-size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setSelected(row);
          }}
        >
          详情
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="订单管理"
        description="数据来自现有 /api/core/admin，最多返回最近 100 条原始记录。服务端分页、关键词与制作状态筛选需 A-03。"
        actions={
          <button className="ad-btn" onClick={() => void reload()}>
            刷新
          </button>
        }
      />

      <Banner tone="info">
        当前列表由前端在最近 100 条记录内做筛选与分页，<strong>不是服务端分页</strong>，
        统计与导出请以 A-03 接口为准。
      </Banner>

      <Card padding={false}>
        <div className="ad-toolbar">
          <label className="ad-field" style={{ minWidth: 220 }}>
            订单号 / 客户
            <input
              className="ad-input"
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                setPage(1);
              }}
              placeholder="输入订单号、组织或套餐"
            />
          </label>
          <label className="ad-field">
            支付状态
            <select
              className="ad-select"
              value={payFilter}
              onChange={(event) => {
                setPayFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">全部</option>
              <option value="UNPAID">待付款</option>
              <option value="PENDING_CONFIRMATION">待确认付款</option>
              <option value="PAID">已确认付款</option>
              <option value="CLOSED">已关闭</option>
              <option value="REFUND_PENDING">退款审核中</option>
              <option value="PARTIALLY_REFUNDED">部分退款</option>
              <option value="REFUNDED">已退款</option>
            </select>
          </label>
          <label className="ad-field">
            起始日期
            <input
              className="ad-input"
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="ad-field">
            结束日期
            <input
              className="ad-input"
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ad-muted)' }}>
            命中 {filtered.length} 条
          </span>
        </div>

        {!workspace ? (
          <SkeletonRows rows={8} />
        ) : workspace.ok ? (
          paged.length ? (
            <>
              <DataTable
                columns={columns}
                rows={paged}
                rowKey={(row) => row.id}
                onRowClick={setSelected}
                caption="订单列表"
              />
              <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />
            </>
          ) : (
            <EmptyState title="没有匹配的订单" detail="试试调整关键词或日期范围。" />
          )
        ) : workspace.kind === 'unsupported' ? (
          <UnsupportedState spec={ENDPOINTS.orders} />
        ) : (
          <EmptyState
            title="无法读取订单"
            detail={workspace.kind === 'forbidden' ? '无权限' : '请刷新重试'}
          />
        )}
      </Card>

      {selected && (
        <Drawer title={selected.order_no} onClose={() => setSelected(null)}>
          <KeyValue
            items={[
              { label: '订单 ID', value: <span className="ad-code">{selected.id}</span> },
              { label: '客户组织', value: selected.organization ?? '—' },
              { label: '套餐', value: selected.plan_name ?? '—' },
              { label: '订单金额', value: money(selected.amount_minor) },
              {
                label: '支付状态',
                value: (
                  <StatusBadge
                    label={payState(selected.pay_state).label}
                    tone={payState(selected.pay_state).tone}
                  />
                ),
              },
              { label: '是否演示', value: selected.is_demo ? '是（不计入真实收入）' : '否' },
              { label: '创建时间', value: dateTime(selected.created_at) },
              { label: '组织 ID', value: <span className="ad-code">{selected.org_id}</span> },
            ]}
          />
          <Banner tone="warning">
            套餐权益快照、付款记录、制作任务、网站/海报版本、修改请求与审批历史需要订单详情接口
            <code> GET /api/admin/orders/:id</code>（缺口 <strong>A-04</strong>）。此处不展示推测内容。
          </Banner>
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="ad-btn" href="/admin/approvals">
              去审批中心
            </a>
            <button
              className="ad-btn"
              onClick={() => {
                void navigator.clipboard?.writeText(selected.order_no);
              }}
            >
              复制订单号
            </button>
          </div>
        </Drawer>
      )}
    </>
  );
}
