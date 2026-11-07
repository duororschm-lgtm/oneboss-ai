'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCustomers, ENDPOINTS, type AdminResult } from '../../../../lib/admin/api';
import type { CustomerRow } from '../../../../lib/admin/types';
import { dateOnly, maskName, money } from '../../../../lib/admin/format';
import { useAdmin } from '../../../../components/admin/shell';
import {
  Banner,
  ErrorState,
  SkeletonRows,
  UnsupportedState,
} from '../../../../components/admin/states';
import { Card, DataTable, PageHead, type Column } from '../../../../components/admin/ui';

export default function CustomersPage() {
  const { workspace } = useAdmin();
  const [result, setResult] = useState<AdminResult<CustomerRow[]> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setResult(await fetchCustomers());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** 订单原始记录里可见的组织，仅作占位参考，不是客户档案。 */
  const derived = useMemo(() => {
    if (!workspace?.ok) return [];
    const map = new Map<string, { org: string; orders: number; amount: number; last: string }>();
    for (const order of workspace.data.orders) {
      const key = order.org_id;
      const current = map.get(key);
      map.set(key, {
        org: order.organization ?? key.slice(0, 8),
        orders: (current?.orders ?? 0) + 1,
        amount: (current?.amount ?? 0) + order.amount_minor,
        last: current && current.last > order.created_at ? current.last : order.created_at,
      });
    }
    return [...map.entries()].map(([id, value]) => ({ id, ...value }));
  }, [workspace]);

  const columns: Column<CustomerRow>[] = [
    { key: 'name', header: '客户', render: (row) => maskName(row.name) },
    { key: 'orders', header: '订单数', align: 'right', render: (row) => row.orderCount },
    { key: 'project', header: '当前项目', render: (row) => row.currentProject ?? '—' },
    { key: 'created', header: '注册时间', render: (row) => dateOnly(row.createdAt) },
  ];

  return (
    <>
      <PageHead
        title="客户管理"
        description="客户档案与售后记录属于 P1。敏感信息默认脱敏，只向有权限角色展示必要字段。"
        actions={
          <button className="ad-btn" onClick={() => void load()} disabled={loading}>
            刷新
          </button>
        }
      />

      <Banner tone="info">
        当前可用的只有订单原始记录里的组织字段。真正的客户档案接口是
        <code> GET /api/admin/customers</code>（缺口 <strong>A-09</strong>），
        在它上线前，下面第二张表只是<strong>订单里出现过的组织</strong>，不是客户档案。
      </Banner>

      <Card padding={false}>
        {loading && !result ? (
          <SkeletonRows rows={5} />
        ) : result?.ok ? (
          <DataTable columns={columns} rows={result.data} rowKey={(row) => row.id} caption="客户列表" />
        ) : result && result.kind === 'unsupported' ? (
          <UnsupportedState spec={result.spec} />
        ) : result && result.kind === 'error' ? (
          <ErrorState message={result.message} onRetry={() => void load()} />
        ) : null}
      </Card>

      <Card title="订单中出现过的组织" subtitle="派生视图 · 非客户档案" padding={false}>
        {derived.length ? (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th scope="col">组织</th>
                  <th scope="col" className="ad-num">订单数</th>
                  <th scope="col" className="ad-num">累计金额</th>
                  <th scope="col">最近下单</th>
                </tr>
              </thead>
              <tbody>
                {derived.map((row) => (
                  <tr key={row.id}>
                    <td>{row.org}</td>
                    <td className="ad-num">{row.orders}</td>
                    <td className="ad-num">{money(row.amount)}</td>
                    <td>{dateOnly(row.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ad-state">暂无可见组织</div>
        )}
      </Card>
    </>
  );
}
