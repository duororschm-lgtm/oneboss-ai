'use client';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { customerApi } from './session';
import { useTaskPolling } from './use-task-polling';
import { Notice, Loading } from './shell';
import type { Row } from '../../lib/customer/types';

/**
 * Production Progress Center (V2.1)
 *
 * Correct progress semantics:
 * - Project-level stages = business workflow with human gates (not 1:1 with runs)
 * - Run-level status = actual agent_runs + task_events for visualization
 * - A role's multiple retries are one logical task, not cumulative progress
 * - No fake percentages: only show verifiable numbers
 */

// --- Project-level workflow stages ---
// These represent the business flow. Not all map to backend agent_run roles.
// Human gates (awaiting_design, review) are project states, not AI runs.
const WORKFLOW = [
  { key: 'intake', label: '资料收集', description: '接收并整理商品资料', role: 'intake' },
  { key: 'design', label: '创意设计', description: 'AI 生成设计方案', role: 'design' },
  { key: 'awaiting_design', label: '等待选择', description: '请选择你喜欢的设计方向', role: null },
  { key: 'generate', label: '作品制作', description: '网站、海报与文案生成', role: 'generate' },
  { key: 'review', label: '审核确认', description: '质量审核与客户确认', role: null },
  { key: 'publish', label: '发布验证', description: '部署并验证网站', role: 'publish' },
  { key: 'delivery', label: '交付整理', description: '打包交付文件', role: 'delivery' },
] as const;

type RunStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
type WorkflowStatus = 'done' | 'active' | 'waiting' | 'failed' | 'pending';

type RunEvent = {
  id: string;
  run_id: string;
  status: string;
  stage?: string;
  attempt?: number;
  error_class?: string;
  created_at: string;
};

type DisplayState = {
  project: Row | null;
  runs: Row[];
  events: RunEvent[];
  versions: Row[];
  connection: 'connected' | 'reconnecting' | 'disconnected';
  lastServerUpdate: Date | null;
  lastCheckTime: Date | null;
  stale: boolean;
};

// --- Status mapping helpers ---

/** Get the current active or most recent run for the display. */
export function resolveCurrentRun(runs: Row[]): Row | null {
  // Prefer currently active (RUNNING > QUEUED), then most recent non-terminal
  const running = runs.find((r) => r.status === 'RUNNING');
  if (running) return running;
  const queued = runs.find((r) => r.status === 'QUEUED');
  if (queued) return queued;
  return null; // No active task — don't fall back to succeeded
}

/** Check if a run role has been SUCCEEDED at least once. */
export function hasSucceededRole(runs: Row[], role: string): boolean {
  return runs.some((r) => r.role === role && r.status === 'SUCCEEDED');
}

/** Get the latest failed run that is NOT followed by a newer attempt or success for the same role. */
export function getLatestTerminalFailure(runs: Row[]): Row | null {
  // Group by role, find roles where latest attempt FAILED (not retried past)
  const byRole = new Map<string, Row[]>();
  for (const run of runs) {
    const list = byRole.get(run.role) ?? [];
    list.push(run);
    byRole.set(run.role, list);
  }
  for (const [, roleRuns] of byRole) {
    const latest = roleRuns.reduce((a, b) =>
      new Date(a.created_at) > new Date(b.created_at) ? a : b,
    );
    if (latest.status === 'FAILED') return latest;
  }
  return null;
}

/** Check if project needs customer action (design selection or fact approval). */
export function needsCustomerAction(project: Row | null, runs: Row[]): boolean {
  if (!project) return false;
  const workState = project.status || project.work_state;
  if (workState === 'BRIEF_APPROVAL' || workState === 'DESIGN_APPROVAL') return true;
  if (workState === 'WAITING_INPUT') return true;
  // Check if design succeeded but no approved design exists
  const designDone = runs.some((r) => r.role === 'design' && r.status === 'SUCCEEDED');
  const designApproved = project.status === 'READY_TO_GENERATE';
  return designDone && !designApproved;
}

/** Determine workflow stage status from real data. */
export function getWorkflowStatus(
  stage: (typeof WORKFLOW)[number],
  runs: Row[],
  currentRun: Row | null,
  project: Row | null,
  needsAction: boolean,
): WorkflowStatus {
  const workState = project?.status || project?.work_state;

  // Human gate stages
  if (stage.key === 'awaiting_design') {
    const designDone = hasSucceededRole(runs, 'design');
    const generateStarted = runs.some((r) => r.role === 'generate');
    if (generateStarted) return 'done';
    if (designDone && needsAction) return 'waiting';
    if (designDone) return 'done';
    return 'pending';
  }

  if (stage.key === 'review') {
    const generateDone = hasSucceededRole(runs, 'generate');
    const publishStarted = runs.some((r) => r.role === 'publish');
    if (publishStarted || workState === 'CLIENT_REVIEW') return 'done';
    if (generateDone && needsAction) return 'waiting';
    if (generateDone) return 'done';
    return 'pending';
  }

  // AI run-backed stages
  if (stage.role) {
    const roleRuns = runs.filter((r) => r.role === stage.role);
    const succeeded = roleRuns.some((r) => r.status === 'SUCCEEDED');
    const isCurrent = currentRun?.role === stage.role;

    if (succeeded && !isCurrent) return 'done';
    if (isCurrent) return currentRun?.status === 'FAILED' ? 'failed' : 'active';
    // Check if there's a failed run for this role with no newer attempt
    const failed = roleRuns.some((r) => r.status === 'FAILED');
    if (failed && !succeeded) return 'failed';
    return 'pending';
  }

  return 'pending';
}

/** Compute progress count from verified completions only. */
export function computeProgress(
  runs: Row[],
  project: Row | null,
  needsAction: boolean,
): { doneCount: number; total: number; pct: number | null } {
  const total = WORKFLOW.length;
  let doneCount = 0;
  for (const stage of WORKFLOW) {
    const status = getWorkflowStatus(stage, runs, null, project, needsAction);
    if (status === 'done') doneCount++;
  }
  // Only show percentage if it's based on verifiable data and not 0
  const pct = doneCount > 0 ? Math.round((doneCount / total) * 100) : null;
  return { doneCount, total, pct };
}

function StatusIcon({ status, size = 32 }: { status: WorkflowStatus; size?: number }) {
  const s = size;
  const base: React.CSSProperties = {
    width: s,
    height: s,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: s * 0.45,
    flexShrink: 0,
    transition: 'all 0.3s ease',
    fontWeight: 700,
  };
  if (status === 'done')
    return (
      <div style={{ ...base, background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', boxShadow: '0 2px 8px rgba(34,197,94,0.3)' }} aria-label="已完成">
        ✓
      </div>
    );
  if (status === 'active')
    return (
      <div
        style={{ ...base, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: '#fff', boxShadow: '0 2px 12px rgba(99,102,241,0.4)' }}
        aria-label="进行中"
      >
        <span style={{ display: 'block', animation: 'spin 2s linear infinite' }}>⚡</span>
      </div>
    );
  if (status === 'waiting')
    return (
      <div style={{ ...base, background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', boxShadow: '0 2px 8px rgba(245,158,11,0.3)' }} aria-label="等待操作">
        !
      </div>
    );
  if (status === 'failed')
    return (
      <div style={{ ...base, background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: '#fff', boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }} aria-label="失败">
        ✕
      </div>
    );
  return (
    <div style={{ ...base, background: '#f3f4f6', color: '#9ca3af', border: '2px solid #e5e7eb' }} aria-label="未开始">
      ○
    </div>
  );
}

function StatusBadge({ status, label }: { status: RunStatus | string; label: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    RUNNING: { bg: '#eff6ff', fg: '#3b82f6' },
    QUEUED: { bg: '#f5f3ff', fg: '#8b5cf6' },
    SUCCEEDED: { bg: '#f0fdf4', fg: '#22c55e' },
    FAILED: { bg: '#fef2f2', fg: '#ef4444' },
    WAITING: { bg: '#fffbeb', fg: '#d97706' },
  };
  const c = colors[status] ?? { bg: '#f3f4f6', fg: '#6b7280' };
  return (
    <span
      style={{
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/**
 * 侧边栏步骤条：7 个业务阶段竖排、可点击跳转。
 * 取代原来占据页面顶部的横向大卡片——进度是导航，不该抢内容的位置。
 */
const STAGE_ROUTE: Record<string, string> = {
  intake: 'intake',
  design: 'creative',
  awaiting_design: 'creative',
  generate: 'studio',
  review: 'studio',
  publish: 'studio',
  delivery: 'delivery',
};

const STAGE_MARK: Record<WorkflowStatus, string> = {
  done: '✓',
  active: '●',
  waiting: '!',
  failed: '×',
  pending: '○',
};

export function ProgressSidebar({
  projectId,
  section,
}: {
  projectId: string;
  section: string;
}) {
  const [project, setProject] = useState<Row | null>(null);
  const [runs, setRuns] = useState<Row[]>([]);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const ws = await customerApi<Row>(`core/projects/${projectId}/workspace`);
      if (!alive.current) return true;
      setProject(ws.project ?? null);
      setRuns((ws.runs || []) as Row[]);
      setFailed(false);
      return true;
    } catch {
      if (alive.current) setFailed(true);
      return false;
    }
  }, [projectId]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);
  useTaskPolling(true, load);

  const needsAction = useMemo(() => needsCustomerAction(project, runs), [project, runs]);
  const { doneCount, total } = useMemo(
    () => computeProgress(runs, project, needsAction),
    [runs, project, needsAction],
  );
  // 多个阶段可能指向同一页面（创意设计/等待选择都去 creative），只高亮第一个。
  const currentKey = WORKFLOW.find((s) => (STAGE_ROUTE[s.key] ?? 'intake') === section)?.key;

  return (
    <div className="ob-steps">
      <p className="ob-eyebrow">进度 · {doneCount}/{total}</p>
      <ol>
        {WORKFLOW.map((stage) => {
          const status = getWorkflowStatus(stage, runs, null, project, needsAction);
          const href = `/dashboard/projects/${projectId}/${STAGE_ROUTE[stage.key] ?? 'intake'}`;
          const current = currentKey === stage.key;
          return (
            <li key={stage.key}>
              <Link
                href={href}
                data-status={status}
                aria-current={current ? 'true' : undefined}
                className={current ? 'is-current' : undefined}
                title={stage.description}
              >
                <span className="ob-step-dot" aria-hidden="true">
                  {STAGE_MARK[status]}
                </span>
                <span className="ob-step-label">{stage.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      {failed && <p className="ob-muted">状态同步中断，稍后自动重试。</p>}
    </div>
  );
}

export function ProductionProgress({ projectId }: { projectId: string }) {
  const [data, setData] = useState<DisplayState>({
    project: null,
    runs: [],
    events: [],
    versions: [],
    connection: 'connected',
    lastServerUpdate: null,
    lastCheckTime: null,
    stale: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const abortRef = useRef(0);

  const fetchStatus = useCallback(async (): Promise<boolean> => {
    const requestId = ++abortRef.current;
    try {
      const workspace = await customerApi<Row>(`core/projects/${projectId}/workspace`);
      if (requestId !== abortRef.current) return true; // Superseded

      const runs = (workspace.runs || []) as Row[];
      const events = (workspace.events || []) as RunEvent[];
      const versions = (workspace.versions || []) as Row[];

      setData((prev) => ({
        ...prev,
        project: workspace.project ?? prev.project,
        runs,
        events,
        versions,
        connection: 'connected',
        lastServerUpdate: runs.length
          ? new Date(runs[0].created_at)
          : prev.lastServerUpdate,
        lastCheckTime: new Date(),
        stale: false,
      }));
      setError('');
      return true;
    } catch (e) {
      if (requestId !== abortRef.current) return true;
      setData((prev) => ({ ...prev, connection: 'reconnecting', stale: true }));
      setError((e as Error).message);
      return false;
    } finally {
      if (requestId === abortRef.current) setLoading(false);
    }
  }, [projectId]);

  // Derive active state for polling
  const currentRun = useMemo(() => resolveCurrentRun(data.runs), [data.runs]);
  const needsAction = useMemo(
    () => needsCustomerAction(data.project, data.runs),
    [data.project, data.runs],
  );
  const isActive = Boolean(currentRun && (currentRun.status === 'RUNNING' || currentRun.status === 'QUEUED'));

  // Unified polling — use-task-polling is the single polling chain
  useTaskPolling(true, fetchStatus);
  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Derived state
  const progress = useMemo(
    () => computeProgress(data.runs, data.project, needsAction),
    [data.runs, data.project, needsAction],
  );
  const terminalFailure = useMemo(() => getLatestTerminalFailure(data.runs), [data.runs]);
  const hasActiveTask = Boolean(currentRun);

  // Check for real deliverables
  const hasDesignChoices = data.runs.some((r) => r.role === 'design' && r.status === 'SUCCEEDED');
  const hasArtifacts = data.versions.length > 0;
  const isPublished = data.project?.published_verified === true;
  const hasDelivery = data.versions.some((v) => v.status === 'DELIVERED');

  if (loading && !data.project) return <Loading />;

  return (
    <main className="pp-container">
      <style>{`
        .pp-container { max-width: 960px; margin: 0 auto; padding: 32px 20px 80px; }
        .pp-header { margin-bottom: 28px; }
        .pp-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; font-size: 13px; color: #6b7280; }
        .pp-title { font-size: 28px; font-weight: 800; color: #111827; margin: 0; line-height: 1.2; letter-spacing: -0.02em; }
        .pp-subtitle { color: #6b7280; margin-top: 8px; font-size: 15px; line-height: 1.6; }
        .pp-note { font-size: 12px; color: #9ca3af; margin-top: 6px; }
        .pp-glow-card { background: linear-gradient(135deg, #fafafa, #f3f4f6); border: 1px solid #e5e7eb; border-radius: 20px; padding: 24px; margin-bottom: 28px; }
        .pp-pipeline { display: flex; gap: 0; position: relative; overflow-x: auto; padding: 20px 0; scrollbar-width: thin; }
        .pp-pipeline::before { content: ''; position: absolute; top: 36px; left: 28px; right: 28px; height: 3px; background: #e5e7eb; border-radius: 2px; }
        .pp-pipeline-fill { position: absolute; top: 36px; left: 28px; height: 3px; border-radius: 2px; background: linear-gradient(90deg, #22c55e, #6366f1); transition: width 0.6s ease; }
        .pp-step { flex: 1; min-width: 100px; display: flex; flex-direction: column; align-items: center; gap: 10px; position: relative; z-index: 1; text-align: center; }
        .pp-step-label { font-size: 12px; font-weight: 600; color: #6b7280; line-height: 1.3; }
        .pp-step.active .pp-step-label { color: #4f46e5; font-weight: 700; }
        .pp-step.done .pp-step-label { color: #16a34a; }
        .pp-step.waiting .pp-step-label { color: #d97706; }
        .pp-step.failed .pp-step-label { color: #ef4444; }
        .pp-progress-bar { height: 10px; background: #e5e7eb; border-radius: 6px; overflow: hidden; margin: 20px 0 8px; position: relative; }
        .pp-progress-fill { height: 100%; border-radius: 6px; transition: width 0.6s ease; }
        .pp-progress-indeterminate { height: 100%; width: 40%; border-radius: 6px; background: linear-gradient(90deg, #6366f1, #818cf8, #6366f1); animation: shimmer 1.5s infinite; }
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .pp-reveal { animation: fadeInUp 0.5s ease-out both; }
        .pp-activity-list { display: flex; flex-direction: column; gap: 8px; }
        .pp-activity-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #fff; border: 1px solid #f3f4f6; border-radius: 12px; font-size: 13px; transition: all 0.2s; }
        .pp-activity-item:hover { border-color: #e5e7eb; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .pp-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; padding-top: 20px; border-top: 1px solid #f3f4f6; }
        .pp-btn { padding: 12px 24px; border-radius: 12px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; border: none; font-family: inherit; }
        .pp-btn-primary { background: linear-gradient(135deg, #6366f1, #4f46e5); color: #fff; box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
        .pp-btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(99,102,241,0.4); }
        .pp-btn-ghost { background: #fff; color: #374151; border: 1px solid #e5e7eb; }
        .pp-btn-ghost:hover { border-color: #d1d5db; background: #f9fafb; }
        .pp-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .pp-mobile-bar { display: none; }
        @media (max-width: 768px) {
          .pp-container { padding: 20px 16px 100px; }
          .pp-title { font-size: 22px; }
          .pp-pipeline { gap: 4px; }
          .pp-step { min-width: 72px; }
          .pp-step-label { font-size: 10px; }
          .pp-actions { display: none; }
          .pp-mobile-bar { display: flex; position: fixed; bottom: 0; left: 0; right: 0; background: #fff; border-top: 1px solid #e5e7eb; padding: 12px 16px; gap: 10px; z-index: 50; box-shadow: 0 -4px 16px rgba(0,0,0,0.06); }
          .pp-mobile-bar .pp-btn { flex: 1; justify-content: center; padding: 12px 16px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pp-reveal { animation: none; }
          .pp-progress-indeterminate { animation: none; width: 100%; }
          .pp-step * { transition: none; }
        }
        @media (min-width: 1280px) {
          .pp-grid { display: grid; grid-template-columns: 1fr 320px; gap: 28px; align-items: start; }
          .pp-sidebar { position: sticky; top: 24px; }
        }
      `}</style>

      {/* Header */}
      <header className="pp-header pp-reveal">
        <div className="pp-meta">
          <span style={{ fontWeight: 600, color: '#4f46e5' }}>
            项目 · {data.project?.id?.slice(0, 8) ?? '—'}
          </span>
          {data.connection === 'reconnecting' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#d97706' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#d97706', animation: 'shimmer 1.5s infinite' }} />
              连接中断，正在重新连接
            </span>
          )}
          {data.stale && data.connection === 'connected' && (
            <span style={{ color: '#9ca3af' }}>数据可能不是最新</span>
          )}
          {data.lastServerUpdate && (
            <span style={{ color: '#9ca3af' }}>
              任务更新 {data.lastServerUpdate.toLocaleTimeString('zh-CN')}
            </span>
          )}
          {data.lastCheckTime && (
            <span style={{ color: '#d1d5db', fontSize: 11 }}>
              · 检查于 {data.lastCheckTime.toLocaleTimeString('zh-CN')}
            </span>
          )}
        </div>

        <h1 className="pp-title">
          {hasActiveTask
            ? `正在${WORKFLOW.find((w) => w.role === currentRun?.role)?.label ?? '制作'}`
            : needsAction
              ? '需要你的操作'
              : terminalFailure
                ? '制作遇到问题'
                : hasArtifacts && !isPublished
                  ? '作品已生成，待发布'
                  : isPublished
                    ? '制作完成'
                    : '准备开始'}
        </h1>

        <p className="pp-subtitle">
          {hasActiveTask
            ? WORKFLOW.find((w) => w.role === currentRun?.role)?.description ?? 'AI 团队正在处理'
            : needsAction
              ? '请在工作台中完成选择或确认，AI 才能继续'
              : terminalFailure
                ? '最后一次尝试失败，你可以查看详情或联系管理员'
                : isPublished
                  ? '网站已发布，交付物已就绪'
                  : 'AI 团队待命，等待资料就绪后开始制作'}
        </p>
        <p className="pp-note">关闭页面不会中断已提交的服务端任务。</p>
      </header>

      {error && <Notice error>{error}</Notice>}

      {/* Main pipeline */}
      <div className="pp-glow-card pp-reveal">
        <div className="pp-pipeline" role="list" aria-label="制作流水线">
          <div
            className="pp-pipeline-fill"
            style={{ width: `${(progress.doneCount / progress.total) * 100}%` }}
          />
          {WORKFLOW.map((stage, idx) => {
            const status = getWorkflowStatus(stage, data.runs, currentRun, data.project, needsAction);
            return (
              <div key={stage.key} className={`pp-step ${status}`} role="listitem">
                <StatusIcon status={status} size={32} />
                <span className="pp-step-label">{stage.label}</span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 8 }}>
          {progress.pct !== null ? (
            <>
              <div
                className="pp-progress-bar"
                role="progressbar"
                aria-valuenow={progress.pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="制作进度"
              >
                <div
                  className="pp-progress-fill"
                  style={{
                    width: `${progress.pct}%`,
                    background: terminalFailure
                      ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                      : needsAction
                        ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                        : 'linear-gradient(90deg, #22c55e, #6366f1)',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7280' }}>
                <span>已完成 {progress.doneCount} / {progress.total} 个阶段</span>
                <span style={{ fontWeight: 600 }}>{progress.pct}%</span>
              </div>
            </>
          ) : (
            <>
              <div className="pp-progress-bar" aria-label="制作进行中">
                <div className="pp-progress-indeterminate" />
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                正在执行：{currentRun ? WORKFLOW.find((w) => w.role === currentRun.role)?.label ?? currentRun.role : '准备工作'}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="pp-grid">
        <div>
          {/* Customer action prompt */}
          {needsAction && (
            <div
              className="pp-reveal"
              style={{
                background: 'linear-gradient(135deg, #fffbeb, #fef3c7)',
                border: '1px solid #fde68a',
                borderRadius: 16,
                padding: '20px 24px',
                marginBottom: 24,
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start',
              }}
            >
              <span style={{ fontSize: 28, flexShrink: 0 }}>👆</span>
              <div>
                <strong style={{ fontSize: 16, color: '#92400e' }}>需要你的操作</strong>
                <p style={{ margin: '6px 0 12px', color: '#a16207', fontSize: 14, lineHeight: 1.6 }}>
                  {data.project?.status === 'BRIEF_APPROVAL'
                    ? '产品需求摘要已生成，请到工作台确认后继续。'
                    : data.project?.status === 'DESIGN_APPROVAL'
                      ? '设计方案已生成，请选择你喜欢的方向。'
                      : '有信息需要你确认后 AI 才能继续。'}
                </p>
                <Link
                  href={`/dashboard/projects/${projectId}/studio`}
                  className="pp-btn"
                  style={{ background: '#d97706', color: '#fff', padding: '10px 20px', fontSize: 13 }}
                >
                  前往处理 →
                </Link>
              </div>
            </div>
          )}

          {/* Failure notice */}
          {terminalFailure && !hasActiveTask && (
            <div
              className="pp-reveal"
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 16,
                padding: '20px 24px',
                marginBottom: 24,
              }}
            >
              <strong style={{ fontSize: 16, color: '#991b1b' }}>制作遇到问题</strong>
              <p style={{ margin: '8px 0', color: '#b91c1c', fontSize: 14, lineHeight: 1.6 }}>
                {terminalFailure.error_class === 'MIMO_NOT_CONFIGURED'
                  ? 'AI 服务暂时不可用，请稍后重试或联系管理员。'
                  : terminalFailure.error_class === 'FACT_APPROVAL_REQUIRED'
                    ? '部分商品信息需要你确认后才能继续。'
                    : terminalFailure.error_class === 'DESIGN_DIRECTIONS_NOT_DISTINCT'
                      ? '设计方向差异不足，系统正在重新生成。'
                      : '制作过程中遇到技术问题。之前的成果已保存，不会丢失。'}
              </p>
              <p style={{ fontSize: 12, color: '#dc2626', opacity: 0.7 }}>
                任务 ID: {terminalFailure.id?.slice(0, 8)} · 尝试 {terminalFailure.attempt ?? 1} 次
              </p>
              <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => void fetchStatus()} className="pp-btn pp-btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>
                  刷新状态
                </button>
                <Link href={`/dashboard/projects/${projectId}/studio`} className="pp-btn pp-btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>
                  返回工作台
                </Link>
              </div>
            </div>
          )}

          {/* Deliverables */}
          {(hasDesignChoices || hasArtifacts || isPublished) && (
            <div className="pp-reveal" style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: '#111827' }}>已生成产物</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {hasDesignChoices && (
                  <Link
                    href={`/dashboard/projects/${projectId}/studio`}
                    style={{ padding: '16px 20px', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', textDecoration: 'none', display: 'block', transition: 'all 0.2s' }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 6 }}>🎨</div>
                    <strong style={{ fontSize: 14, color: '#111827' }}>查看创意方案</strong>
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>浏览设计方案</p>
                  </Link>
                )}
                {hasArtifacts && (
                  <Link
                    href={`/dashboard/projects/${projectId}/studio`}
                    style={{ padding: '16px 20px', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', textDecoration: 'none', display: 'block' }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 6 }}>🖥</div>
                    <strong style={{ fontSize: 14, color: '#111827' }}>预览网站</strong>
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>查看生成的作品</p>
                  </Link>
                )}
                {isPublished && (
                  <div style={{ padding: '16px 20px', background: '#f0fdf4', borderRadius: 14, border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>🌐</div>
                    <strong style={{ fontSize: 14, color: '#166534' }}>已公开发布</strong>
                    <p style={{ fontSize: 12, color: '#4ade80', margin: '4px 0 0' }}>网站可公开访问</p>
                  </div>
                )}
                {hasDelivery && (
                  <div style={{ padding: '16px 20px', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>📦</div>
                    <strong style={{ fontSize: 14, color: '#111827' }}>交付包</strong>
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>下载交付文件</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Activity timeline */}
          <div className="pp-reveal">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: '#111827' }}>
              最近活动
              <span style={{ fontSize: 12, fontWeight: 400, color: '#9ca3af', marginLeft: 8 }}>
                来自服务端任务记录
              </span>
            </h3>
            <div className="pp-activity-list" aria-live="polite">
              {(data.runs.length > 0 ? data.runs.slice(0, 8) : []).map((run, idx) => {
                const statusMap: Record<string, { label: string; color: string }> = {
                  SUCCEEDED: { label: '完成', color: '#22c55e' },
                  FAILED: { label: '失败', color: '#ef4444' },
                  RUNNING: { label: '执行中', color: '#3b82f6' },
                  QUEUED: { label: '排队中', color: '#8b5cf6' },
                };
                const s = statusMap[run.status] ?? { label: run.status, color: '#9ca3af' };
                return (
                  <div key={run.id || idx} className="pp-activity-item">
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: s.color,
                        flexShrink: 0,
                        ...(run.status === 'RUNNING' ? { animation: 'shimmer 1.5s infinite' } : {}),
                      }}
                    />
                    <span style={{ flex: 1, fontWeight: 500, color: '#374151' }}>
                      {WORKFLOW.find((w) => w.role === run.role)?.label ?? run.role}
                      {run.stage && (
                        <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 6, fontSize: 12 }}>
                          · {run.stage}
                        </span>
                      )}
                    </span>
                    {run.attempt > 1 && (
                      <span style={{ fontSize: 11, color: '#d97706', background: '#fef3c7', padding: '2px 8px', borderRadius: 8 }}>
                        第 {run.attempt} 次尝试
                      </span>
                    )}
                    <StatusBadge status={run.status} label={s.label} />
                    <span style={{ color: '#d1d5db', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {run.created_at ? new Date(run.created_at).toLocaleTimeString('zh-CN') : ''}
                    </span>
                  </div>
                );
              })}
              {data.runs.length === 0 && (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                  暂无任务记录
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop sidebar */}
        <aside className="pp-sidebar" style={{ display: 'none' }}>
          <div className="pp-glow-card" style={{ marginBottom: 16 }}>
            <h4 style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>项目信息</h4>
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#9ca3af' }}>项目 ID</span>
                <span style={{ fontFamily: 'monospace' }}>{data.project?.id?.slice(0, 8)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#9ca3af' }}>资料版本</span>
                <span>V{data.project?.fact_version ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#9ca3af' }}>状态</span>
                <span>{data.project?.status ?? '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#9ca3af' }}>作品版本</span>
                <span>{data.versions.length > 0 ? `#${data.versions[0].revision}` : '—'}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Desktop actions */}
      <div className="pp-actions">
        <Link href={`/dashboard/projects/${projectId}/studio`} className="pp-btn pp-btn-primary">
          进入工作台 →
        </Link>
        <button onClick={() => void fetchStatus()} className="pp-btn pp-btn-ghost">
          刷新状态
        </button>
      </div>

      {/* Mobile fixed bottom bar */}
      <div className="pp-mobile-bar">
        <Link href={`/dashboard/projects/${projectId}/studio`} className="pp-btn pp-btn-primary" style={{ flex: 2 }}>
          工作台
        </Link>
        <button onClick={() => void fetchStatus()} className="pp-btn pp-btn-ghost" style={{ flex: 1 }}>
          刷新
        </button>
      </div>
    </main>
  );
}
