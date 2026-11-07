'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ENDPOINTS,
  fetchOrderDetail,
  fetchOrders,
  type AdminResult,
  type OrderDetail,
  type OrderRow,
} from '../../../../lib/admin/api';
import { dateOnly, dateTime, money, payState, projectStatus } from '../../../../lib/admin/format';
import { Banner, EmptyState, ErrorState, SkeletonRows, UnsupportedState } from '../../../../components/admin/states';
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

const PAGE_SIZE = 20;

interface Paged {
  items: OrderRow[];
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
}

export default function OrdersPage() {
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [payFilter, setPayFilter] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AdminResult<Paged> | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [detail, setDetail] = useState<AdminResult<OrderDetail> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setResult(
      await fetchOrders({
        page,
        pageSize: PAGE_SIZE,
        keyword: appliedKeyword || undefined,
        payState: payFilter === 'ALL' ? undefined : payFilter,
        from: from || undefined,
        to: to || undefined,
      }),
    );
    setLoading(false);
  }, [page, appliedKeyword, payFilter, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    setDetail(null);
    void fetchOrderDetail(selected.id).then(setDetail);
  }, [selected]);

  const rows = result?.ok ? result.data.items : [];
  const total = result?.ok ? result.data.total : 0;

  const columns: Column<OrderRow>[] = [
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
      render: (row) => {
        if (!row.work_state) return <span className="ad-badge" data-tone="neutral">未开始</span>;
        const state = projectStatus(row.work_state);
        return <StatusBadge label={state.label} tone={state.tone} />;
      },
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
        description="服务端分页与筛选。金额与状态全部来自数据库，前端不做汇总。"
        actions={
          <button className="ad-btn" onClick={() => void load()} disabled={loading}>
            刷新
          </button>
        }
      />

      <Card padding={false}>
        <div className="ad-toolbar">
          <label className="ad-field" style={{ minWidth: 220 }}>
            订单号 / 客户 / 套餐
            <input
              className="ad-input"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setPage(1);
                  setAppliedKeyword(keyword.trim());
                }
              }}
              placeholder="输入后回车搜索"
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
          <button
            className="ad-btn"
            onClick={() => {
              setPage(1);
              setAppliedKeyword(keyword.trim());
            }}
          >
            搜索
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: 'var(--ad-muted)' }}>
            共 {total} 条
          </span>
        </div>

        {loading && !result ? (
          <SkeletonRows rows={8} />
        ) : result?.ok ? (
          rows.length ? (
            <>
              <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} onRowClick={setSelected} caption="订单列表" />
              <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
            </>
          ) : (
            <EmptyState title="没有匹配的订单" detail="试试调整关键词或日期范围。" />
          )
        ) : result && result.kind === 'unsupported' ? (
          <UnsupportedState spec={ENDPOINTS.orders} />
        ) : result && result.kind === 'error' ? (
          <ErrorState message={result.message} requestId={result.requestId} onRetry={() => void load()} />
        ) : null}
      </Card>

      {selected && (
        <Drawer title={selected.order_no} onClose={() => setSelected(null)}>
          <KeyValue
            items={[
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
              { label: '是否演示', value: selected.is_demo ? '是（不计入收入）' : '否' },
              { label: '创建时间', value: dateTime(selected.created_at) },
            ]}
          />

          {!detail ? (
            <SkeletonRows rows={4} />
          ) : !detail.ok ? (
            <ErrorState message={detail.kind === 'error' ? detail.message : '无法读取订单详情'} />
          ) : (
            <>
              {detail.data.entitlement && (
                <section>
                  <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>套餐权益快照</h4>
                  <KeyValue
                    items={[
                      { label: '剩余修改', value: `${detail.data.entitlement.remaining_revisions} 次` },
                      { label: '产品上限', value: detail.data.entitlement.max_products },
                      { label: '海报上限', value: detail.data.entitlement.max_posters },
                      { label: '托管到期', value: dateOnly(detail.data.entitlement.expires_at) },
                      { label: '权益状态', value: detail.data.entitlement.revoked ? '已撤销' : '有效' },
                    ]}
                  />
                </section>
              )}

              <section>
                <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>付款记录（{detail.data.payments.length}）</h4>
                {detail.data.payments.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                    {detail.data.payments.map((payment, index) => (
                      <li key={`${payment.kind}-${index}`}>
                        {payment.kind === 'event' ? '核验事件' : '支付尝试'} · {payment.provider} ·{' '}
                        {payment.status}
                        {payment.amount_minor ? ` · ${money(payment.amount_minor)}` : ''} ·{' '}
                        {dateTime(payment.created_at)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ad-muted)' }}>暂无付款记录</p>
                )}
              </section>

              <section>
                <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>制作任务（{detail.data.runs.length}）</h4>
                {detail.data.runs.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                    {detail.data.runs.slice(0, 8).map((run) => (
                      <li key={run.id}>
                        {run.role} · {run.status}
                        {run.error_class ? ` · ${run.error_class}` : ''} · {dateTime(run.created_at)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ad-muted)' }}>还没有制作任务</p>
                )}
              </section>

              <section>
                <h4 style={{ margin: '0 0 6px', fontSize: 13 }}>版本与退款</h4>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ad-muted)' }}>
                  版本 {detail.data.versions.length} 个 · 退款 {detail.data.refunds.length} 笔 · 修改请求{' '}
                  {detail.data.changes.length} 条
                </p>
                {detail.data.project?.publish_slug && (
                  <p style={{ margin: '6px 0 0', fontSize: 12.5 }}>
                    公开地址：
                    <a
                      className="ad-code"
                      href={`/p/${detail.data.project.publish_slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      /p/{detail.data.project.publish_slug}
                    </a>
                  </p>
                )}
              </section>
            </>
          )}

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

      {result && !result.ok && result.kind === 'forbidden' && (
        <Banner tone="danger">没有访问订单的权限。</Banner>
      )}
    </>
  );
}
