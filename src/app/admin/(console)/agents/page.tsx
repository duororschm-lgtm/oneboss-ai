'use client';
import { useTaskPolling } from '../../../../components/customer/use-task-polling';
import { useCallback, useEffect, useState } from 'react';
import { fetchAgentRuns, fetchWorkerHealth, type WorkerHealth, ENDPOINTS, type AdminResult } from '../../../../lib/admin/api';
import type { AgentRun } from '../../../../lib/admin/types';
import { AGENT_ROLES, agentRoleName, agentStatus, dateTime } from '../../../../lib/admin/format';
import {
  Banner,
  EmptyState,
  ErrorState,
  SkeletonRows,
  UnsupportedState,
} from '../../../../components/admin/states';
import { Card, DataTable, PageHead, StatusBadge, type Column } from '../../../../components/admin/ui';

export default function AgentsPage() {
  const [result, setResult] = useState<AdminResult<AgentRun[]> | null>(null);
  const [workers,setWorkers]=useState<AdminResult<WorkerHealth[]> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [next,health]=await Promise.all([fetchAgentRuns(),fetchWorkerHealth()]);setResult(next);setWorkers(health);
    setLoading(false);return next.ok;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runs = result?.ok ? result.data : [];
  useTaskPolling(runs.some(run=>['QUEUED','RUNNING'].includes(run.status)),load);
  const unsupported = result && !result.ok && result.kind === 'unsupported';

  const columns: Column<AgentRun>[] = [
    { key: 'role', header: 'AI 员工', render: (row) => agentRoleName(row.employeeKey || row.role) },
    {
      key: 'status',
      header: '状态',
      render: (row) => {
        const state = agentStatus(row.status);
        return <StatusBadge label={state.label} tone={state.tone} />;
      },
    },
    {
      key: 'project',
      header: '项目',
      render: (row) =>
        row.projectName ?? <span className="ad-code">{row.projectId.slice(0, 8)}</span>,
    },
    { key: 'model', header: '模型', render: (row) => row.model ?? '—' },
    {
      key: 'tokens',
      header: 'Token',
      align: 'right',
      render: (row) => (row.tokens ? row.tokens.toLocaleString('zh-CN') : '—'),
    },
    { key: 'start', header: '开始', render: (row) => dateTime(row.startedAt) },
    { key: 'end', header: '结束', render: (row) => dateTime(row.completedAt) },
    { key: 'error', header: '错误摘要', render: (row) => row.errorSummary ?? '—' },
  ];

  return (
    <>
      <PageHead
        title="AI 员工监控"
        description="状态必须来自持久化的任务记录。前端不会用动画伪造「正在工作」。"
        actions={
          <button className="ad-btn" onClick={() => void load()} disabled={loading}>
            刷新
          </button>
        }
      />

      {unsupported && (
        <Banner tone="warning">
          <code>agent_runs</code> 表里已有运行数据，但缺少跨租户只读列表接口（缺口 <strong>A-06</strong>）。
          下方 8 个员工卡片只展示角色定义与状态占位，不显示任何编造的运行记录。
        </Banner>
      )}

      <Card title="Worker 健康">
        {workers?.ok ? workers.data.length ? workers.data.map(worker=><p key={worker.id}><span className="ad-code">{worker.id.slice(0,8)}</span> · {worker.status==='online'?'在线':worker.status==='offline'?'心跳超时':'已停止'} · 最近心跳 {dateTime(worker.last_seen_at)}{worker.current_run_id ? ` · 任务 ${worker.current_run_id.slice(0,8)}`:''}</p>) : <p>尚无 Worker 注册记录。不能据此认为制作服务在线。</p> : <p>Worker 健康状态尚未读取。</p>}
      </Card>
      <div className="ad-grid ad-grid-4">
        {AGENT_ROLES.map((role) => {
          const latest = runs.find((run) => run.employeeKey === role.key || run.role === role.key || run.role === role.name);
          const state = latest ? agentStatus(latest.status) : null;
          return (
            <div className="ad-metric" key={role.key} data-state={!latest ? 'unsupported' : 'ready'}>
              <span className="ad-metric-label">{role.name}</span>
              {latest && state ? (
                <span className="ad-metric-value" style={{ fontSize: 15 }}>
                  <StatusBadge label={state.label} tone={state.tone} />
                </span>
              ) : (
                <span
                  className="ad-metric-value"
                  style={{ fontSize: 14, fontWeight: 500, color: 'var(--ad-faint)' }}
                >
                  {unsupported ? '接口未提供' : '暂无任务'}
                </span>
              )}
              <span className="ad-metric-note">{role.key === 'copywriter' || role.key === 'site_designer' || role.key === 'poster_designer' ? '属于复合制作任务，未单独调度' : role.key}</span>
            </div>
          );
        })}
      </div>

      <Card title="运行记录" subtitle="最近任务" padding={false}>
        {loading && !result ? (
          <SkeletonRows rows={6} />
        ) : result?.ok ? (
          runs.length ? (
            <DataTable columns={columns} rows={runs} rowKey={(row) => row.id} caption="Agent 运行记录" />
          ) : (
            <EmptyState title="还没有运行记录" detail="项目开始执行后会出现。" />
          )
        ) : result && result.kind === 'unsupported' ? (
          <UnsupportedState spec={result.spec} />
        ) : result && result.kind === 'error' ? (
          <ErrorState message={result.message} onRetry={() => void load()} />
        ) : null}
      </Card>
    </>
  );
}
