'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { customerApi } from './session';
import { Notice, Loading, money } from './shell';
import type { Row } from '../../lib/customer/types';

/**
 * Production progress center for customers.
 * Shows real-time task progress with stages, polling, and recovery.
 * No fake percentages — progress comes from server data only.
 */

const STAGES = [
  { key: 'intake', label: '资料接收', description: '接收并整理商品资料' },
  { key: 'analyzing', label: '商品分析', description: 'AI 分析商品特征和卖点' },
  { key: 'design', label: '创意方向设计', description: '生成 2–3 套设计方案' },
  { key: 'awaiting_design', label: '等待选择方案', description: '请选择你喜欢的设计方向' },
  { key: 'generate', label: '网站生成', description: '按选定方向生成宣传网站' },
  { key: 'posters', label: '海报与文案', description: '生成海报和小红书文案' },
  { key: 'review', label: '质量审核', description: '检查内容准确性和排版质量' },
  { key: 'publish', label: '发布验证', description: '部署并验证网站可访问性' },
  { key: 'delivery', label: '交付整理', description: '打包交付文件和二维码' },
  { key: 'completed', label: '完成', description: '所有交付物已就绪' },
] as const;

type StageStatus = 'done' | 'active' | 'pending' | 'failed';

type ProgressState = {
  project: Row | null;
  runs: Row[];
  currentRun: Row | null;
  connection: 'connected' | 'reconnecting' | 'disconnected';
  lastUpdate: Date | null;
};

function getStageStatus(stageKey: string, currentRole: string | undefined, completedRoles: string[]): StageStatus {
  if (!currentRole) return 'pending';
  const roleOrder = STAGES.map((s) => s.key as string);
  const currentIdx = roleOrder.indexOf(currentRole);
  const stageIdx = roleOrder.indexOf(stageKey);
  if (completedRoles.includes(stageKey)) return 'done';
  if (stageKey === currentRole) return 'active';
  if (stageIdx < currentIdx) return 'done';
  return 'pending';
}

function StageIcon({ status }: { status: StageStatus }) {
  if (status === 'done')
    return (
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: '#22c55e',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        ✓
      </div>
    );
  if (status === 'active')
    return (
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: '#3b82f6',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          flexShrink: 0,
          animation: 'pulse 2s ease-in-out infinite',
        }}
      >
        ⚙
      </div>
    );
  if (status === 'failed')
    return (
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: '#ef4444',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          flexShrink: 0,
        }}
      >
        ✕
      </div>
    );
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: '#e5e7eb',
        color: '#9ca3af',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        flexShrink: 0,
      }}
    >
      ○
    </div>
  );
}

export function ProductionProgress({ projectId }: { projectId: string }) {
  const [state, setState] = useState<ProgressState>({
    project: null,
    runs: [],
    currentRun: null,
    connection: 'connected',
    lastUpdate: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visibilityRef = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await customerApi<Row>(`core/projects/${projectId}/workspace`);
      const runs = (data.runs || []) as Row[];
      const activeRun = runs.find(
        (r) => r.status === 'RUNNING' || r.status === 'QUEUED',
      );
      setState((prev) => ({
        ...prev,
        project: data.project,
        runs,
        currentRun: activeRun ?? runs.find((r) => r.status === 'SUCCEEDED') ?? null,
        connection: 'connected',
        lastUpdate: new Date(),
      }));
      setError('');
    } catch (e) {
      setState((prev) => ({ ...prev, connection: 'reconnecting' }));
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Poll: active tasks every 3s, idle every 15s, hidden every 30s
  useEffect(() => {
    void fetchStatus();
    const schedule = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      const isActive = state.currentRun && (state.currentRun.status === 'RUNNING' || state.currentRun.status === 'QUEUED');
      const interval = visibilityRef.current ? (isActive ? 3000 : 15000) : 30000;
      pollRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') void fetchStatus();
      }, interval);
    };
    schedule();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus, state.currentRun?.status]);

  // Visibility change
  useEffect(() => {
    const handler = () => {
      visibilityRef.current = document.visibilityState === 'visible';
      if (document.visibilityState === 'visible') void fetchStatus();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [fetchStatus]);

  const project = state.project;
  const runs = state.runs;
  const completedRoles = runs.filter((r) => r.status === 'SUCCEEDED').map((r) => r.role);
  const failedRun = runs.find((r) => r.status === 'FAILED');
  const activeRun = state.currentRun;

  if (loading && !project) return <Loading />;

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '32px 20px' }}>
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .progress-stage { animation: slideIn 0.3s ease-out; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: '#666' }}>
            项目 · {project?.id?.slice(0, 8)}
          </span>
          {state.connection === 'reconnecting' && (
            <span style={{ fontSize: 12, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#f59e0b',
                  animation: 'pulse 1s infinite',
                }}
              />
              连接中断，正在重新连接
            </span>
          )}
          {state.connection === 'connected' && state.lastUpdate && (
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              最近更新 {state.lastUpdate.toLocaleTimeString('zh-CN')}
            </span>
          )}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>
          {activeRun
            ? `正在${STAGES.find((s) => s.key === activeRun.role)?.label ?? '制作'}`
            : failedRun
              ? '制作遇到问题'
              : completedRoles.length > 0
                ? '制作完成'
                : '准备开始'}
        </h1>
        {activeRun && (
          <p style={{ color: '#666', marginTop: 8 }}>
            {STAGES.find((s) => s.key === activeRun.role)?.description ?? 'AI 团队正在处理你的项目'}
          </p>
        )}
      </div>

      {error && <Notice error>{error}</Notice>}

      {/* Progress bar */}
      {(() => {
        const total = STAGES.length;
        const done = completedRoles.filter((r) => STAGES.some((s) => s.key === r)).length;
        const pct = Math.round((done / total) * 100);
        return (
          <div style={{ marginBottom: 32 }}>
            <div
              style={{
                height: 8,
                background: '#e5e7eb',
                borderRadius: 4,
                overflow: 'hidden',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: failedRun ? '#ef4444' : 'linear-gradient(90deg, #3b82f6, #22c55e)',
                  borderRadius: 4,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#666' }}>
              <span>
                已完成 {done} / {total} 阶段
              </span>
              <span>{pct}%</span>
            </div>
          </div>
        );
      })()}

      {/* Stage timeline */}
      <div style={{ position: 'relative', paddingLeft: 24 }}>
        <div
          style={{
            position: 'absolute',
            left: 17,
            top: 18,
            bottom: 18,
            width: 2,
            background: '#e5e7eb',
          }}
        />
        {STAGES.map((stage, idx) => {
          const status = getStageStatus(stage.key, activeRun?.role, completedRoles);
          const isLast = idx === STAGES.length - 1;
          return (
            <div
              key={stage.key}
              className="progress-stage"
              style={{
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
                marginBottom: isLast ? 0 : 20,
                position: 'relative',
              }}
            >
              <StageIcon status={status} />
              <div style={{ flex: 1, paddingTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong
                    style={{
                      fontSize: 15,
                      color: status === 'pending' ? '#9ca3af' : '#111',
                      fontWeight: status === 'active' ? 700 : 600,
                    }}
                  >
                    {stage.label}
                  </strong>
                  {status === 'active' && (
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: '#eff6ff',
                        color: '#3b82f6',
                      }}
                    >
                      进行中
                    </span>
                  )}
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: status === 'pending' ? '#c5c5c5' : '#666',
                    marginTop: 2,
                  }}
                >
                  {stage.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Failed run notice */}
      {failedRun && (
        <Notice error>
          <strong>制作遇到问题</strong>
          <p style={{ marginTop: 8, fontSize: 14 }}>
            {failedRun.error_class === 'MIMO_NOT_CONFIGURED'
              ? 'AI 服务暂时不可用，请稍后重试或联系管理员。'
              : failedRun.error_class === 'FACT_APPROVAL_REQUIRED'
                ? '部分商品信息需要你确认后才能继续。'
                : '制作过程中遇到技术问题，系统会自动重试。如果多次失败，请联系管理员。'}
          </p>
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => void fetchStatus()}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: '1px solid #ef4444',
                background: '#fff',
                color: '#ef4444',
                cursor: 'pointer',
              }}
            >
              重新检查状态
            </button>
          </div>
        </Notice>
      )}

      {/* Recent activity */}
      {runs.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>最近活动</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {runs.slice(0, 5).map((run) => (
              <div
                key={run.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 16px',
                  background: '#f9fafb',
                  borderRadius: 10,
                  fontSize: 13,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background:
                      run.status === 'SUCCEEDED'
                        ? '#22c55e'
                        : run.status === 'FAILED'
                          ? '#ef4444'
                          : run.status === 'RUNNING'
                            ? '#3b82f6'
                            : '#d1d5db',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, fontWeight: 500 }}>
                  {STAGES.find((s) => s.key === run.role)?.label ?? run.role}
                </span>
                <span style={{ color: '#9ca3af', fontSize: 12 }}>
                  {run.status === 'SUCCEEDED'
                    ? '完成'
                    : run.status === 'FAILED'
                      ? '失败'
                      : run.status === 'RUNNING'
                        ? '执行中'
                        : run.status === 'QUEUED'
                          ? '排队中'
                          : run.status}
                </span>
                <span style={{ color: '#c5c5c5', fontSize: 12 }}>
                  {run.created_at ? new Date(run.created_at).toLocaleTimeString('zh-CN') : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action footer */}
      <div
        style={{
          marginTop: 32,
          padding: '20px 0',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Link
          href={`/dashboard/projects/${projectId}/studio`}
          style={{
            padding: '12px 24px',
            borderRadius: 10,
            background: '#3b82f6',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          进入工作台
        </Link>
        <button
          onClick={() => void fetchStatus()}
          style={{
            padding: '12px 24px',
            borderRadius: 10,
            border: '1px solid #d1d5db',
            background: '#fff',
            color: '#374151',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          刷新状态
        </button>
      </div>
    </main>
  );
}
