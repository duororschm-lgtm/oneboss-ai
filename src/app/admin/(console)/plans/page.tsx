'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchPlans, type AdminResult } from '../../../../lib/admin/api';
import type { PlanRow } from '../../../../lib/admin/types';
import { money } from '../../../../lib/admin/format';
import { Banner, ErrorState, SkeletonRows, UnsupportedState } from '../../../../components/admin/states';
import { Card, DataTable, PageHead, type Column } from '../../../../components/admin/ui';

export default function PlansPage() {
  const [result, setResult] = useState<AdminResult<PlanRow[]> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setResult(await fetchPlans());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<PlanRow>[] = [
    { key: 'code', header: '套餐代码', render: (row) => <span className="ad-code">{row.code}</span> },
    { key: 'name', header: '套餐名称', render: (row) => row.name },
    { key: 'price', header: '价格', align: 'right', render: (row) => money(row.priceMinor) },
    { key: 'products', header: '产品数上限', align: 'right', render: (row) => row.productLimit },
    { key: 'posters', header: '海报数', align: 'right', render: (row) => row.posterCount },
    { key: 'revisions', header: '修改轮次', align: 'right', render: (row) => row.revisionRounds },
    { key: 'hosting', header: '托管天数', align: 'right', render: (row) => row.hostingDays },
  ];

  return (
    <>
      <PageHead
        title="套餐管理"
        description="价格与权益由服务端决定。前端只读展示，编辑能力需要后端支持动态配置。"
        actions={
          <button className="ad-btn" onClick={() => void load()} disabled={loading}>
            刷新
          </button>
        }
      />

      <Banner tone="info">
        数据来自现有公开接口 <code>GET /api/core/plans</code>，属真实数据，但为<strong>只读</strong>。
        套餐编辑需要后端提供管理接口，且价格必须由服务端计算，不接受前端传值。
      </Banner>

      <Card padding={false}>
        {loading && !result ? (
          <SkeletonRows rows={4} />
        ) : result?.ok ? (
          <DataTable columns={columns} rows={result.data} rowKey={(row) => row.code} caption="套餐列表" />
        ) : result && result.kind === 'unsupported' ? (
          <UnsupportedState spec={result.spec} />
        ) : result && result.kind === 'error' ? (
          <ErrorState message={result.message} onRetry={() => void load()} />
        ) : null}
      </Card>
    </>
  );
}
