'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchAuditLogs, type AdminResult } from '../../../../lib/admin/api';
import type { AuditEntry } from '../../../../lib/admin/types';
import { dateTime } from '../../../../lib/admin/format';
import {
  Banner,
  ErrorState,
  SkeletonRows,
  UnsupportedState,
} from '../../../../components/admin/states';
import { Card, DataTable, PageHead, StatusBadge, type Column } from '../../../../components/admin/ui';

export default function AuditLogsPage() {
  const [result, setResult] = useState<AdminResult<AuditEntry[]> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setResult(await fetchAuditLogs());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<AuditEntry>[] = [
    { key: 'at', header: '时间', render: (row) => dateTime(row.at) },
    { key: 'actor', header: '操作者', render: (row) => row.actor },
    { key: 'action', header: '动作', render: (row) => <span className="ad-code">{row.action}</span> },
    { key: 'target', header: '目标对象', render: (row) => row.target },
    {
      key: 'result',
      header: '结果',
      render: (row) => (
        <StatusBadge
          label={row.result === 'success' ? '成功' : '失败'}
          tone={row.result === 'success' ? 'success' : 'danger'}
        />
      ),
    },
    { key: 'reason', header: '原因', render: (row) => row.reason ?? '—' },
  ];

  return (
    <>
      <PageHead
        title="审计日志"
        description="只读。日志由服务端写入，前端不可编辑、不可删除。"
        actions={
          <button className="ad-btn" onClick={() => void load()} disabled={loading}>
            刷新
          </button>
        }
      />

      <Banner tone="warning">
        审计表 <code>admin_audit_logs</code> 尚未建立，读取接口缺失（缺口 <strong>A-11</strong>）。
        在补齐之前，管理员的收款核验与退款操作<strong>没有可查询的审计留痕</strong>，这是一个真实风险。
      </Banner>

      <Card padding={false}>
        {loading && !result ? (
          <SkeletonRows rows={6} />
        ) : result?.ok ? (
          result.data.length ? (
            <DataTable columns={columns} rows={result.data} rowKey={(row) => row.id} caption="审计日志" />
          ) : (
            <div className="ad-state">暂无审计记录</div>
          )
        ) : result && result.kind === 'unsupported' ? (
          <UnsupportedState
            spec={result.spec}
            extra={
              <p style={{ fontSize: 12.5, margin: 0 }}>
                每条日志至少包含：操作者、时间、目标对象、动作、结果、原因。
              </p>
            }
          />
        ) : result && result.kind === 'error' ? (
          <ErrorState message={result.message} onRetry={() => void load()} />
        ) : null}
      </Card>
    </>
  );
}
