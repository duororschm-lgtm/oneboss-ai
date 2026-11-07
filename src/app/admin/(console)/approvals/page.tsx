'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ENDPOINTS,
  confirmManualPayment,
  fetchApprovals,
  finalizeRefund,
  type AdminResult,
} from '../../../../lib/admin/api';
import type { AdminRefund, ApprovalItem, ManualAttempt } from '../../../../lib/admin/types';
import { dateTime, money, refundStatus } from '../../../../lib/admin/format';
import { useAdmin } from '../../../../components/admin/shell';
import { Banner, EmptyState, SkeletonRows, UnsupportedState } from '../../../../components/admin/states';
import { Card, ConfirmDialog, PageHead, StatusBadge } from '../../../../components/admin/ui';

type PendingAction =
  | { kind: 'payment'; attempt: ManualAttempt; reference: string }
  | { kind: 'refund'; refund: AdminRefund; reference: string; confirmed: boolean };

const KIND_LABEL: Record<string, string> = {
  payment_review: '支付核验',
  refund_review: '退款审批',
  production_release: '待制作放行',
  work_review: '作品审核',
  publish_review: '发布审核',
  agent_failure: '任务失败',
  order_exception: '订单异常',
};

export default function ApprovalsPage() {
  const { workspace, reload } = useAdmin();
  const [reference, setReference] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<AdminResult<ApprovalItem[]> | null>(null);

  const loadQueue = useCallback(async () => {
    setQueue(await fetchApprovals());
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const attempts = workspace?.ok ? workspace.data.manualAttempts : [];
  const refunds = workspace?.ok ? workspace.data.refunds.filter((r) => r.status === 'REQUESTED') : [];
  const others = (queue?.ok ? queue.data : []).filter(
    (item) => item.kind !== 'payment_review' && item.kind !== 'refund_review',
  );

  async function run(action: PendingAction) {
    setBusy(true);
    setError('');
    try {
      if (action.kind === 'payment') {
        await confirmManualPayment(action.attempt.order_id, {
          attemptId: action.attempt.id,
          amountMinor: action.attempt.amount_minor,
          reference: action.reference,
        });
        setMessage(`已登记订单 ${action.attempt.order_no} 的收款核验结果。`);
      } else {
        await finalizeRefund(action.refund.order_id, {
          refundId: action.refund.id,
          reference: action.reference,
          confirmed: action.confirmed,
        });
        setMessage(
          action.confirmed
            ? `已登记订单 ${action.refund.order_no} 的退款核验结果。`
            : `已驳回订单 ${action.refund.order_no} 的退款申请。`,
        );
      }
      setPending(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败，请重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title="放行与审批中心"
        description="所有动作都调用服务端接口并以服务端返回为准。前端不会把订单状态改成 paid / approved / released。"
        actions={
          <button className="ad-btn" onClick={() => void reload()}>
            刷新队列
          </button>
        }
      />

      {message && <Banner tone="info">{message}</Banner>}
      {error && <Banner tone="danger">{error}</Banner>}

      <Card title="待支付异常核验" subtitle={`人工核验收款 · ${attempts.length} 条`} padding={false}>
        {!workspace ? (
          <SkeletonRows rows={3} />
        ) : !workspace.ok ? (
          <UnsupportedState spec={ENDPOINTS.workspace} />
        ) : attempts.length === 0 ? (
          <EmptyState title="没有待核验的收款" detail="客户提交付款说明后会出现在这里。" />
        ) : (
          <div style={{ display: 'grid', gap: 14, padding: 18 }}>
            <Banner tone="warning">
              只有在微信账单中核对了<strong>真实入账、金额与付款备注</strong>之后才能登记。
              客户自报、截图与演示付款都不得作为到账依据。
            </Banner>
            {attempts.map((attempt) => (
              <div
                key={attempt.id}
                className="ad-card"
                style={{ boxShadow: 'none', background: 'var(--ad-surface-2)' }}
              >
                <div className="ad-card-body" style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong>{attempt.plan_name ?? '套餐'}</strong>
                    <span className="ad-num">{money(attempt.amount_minor)}</span>
                    <span className="ad-code">{attempt.order_no}</span>
                    <span className="ad-badge" data-tone="warning">
                      待核验
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ad-muted)' }}>
                    付款备注 <span className="ad-code">{attempt.payment_memo ?? '—'}</span> · 提交于{' '}
                    {dateTime(attempt.reported_at ?? attempt.created_at)}
                  </div>
                  {attempt.customer_report && (
                    <div
                      style={{
                        background: '#fff',
                        border: '1px solid var(--ad-border)',
                        borderRadius: 6,
                        padding: '10px 12px',
                        fontSize: 12.5,
                      }}
                    >
                      客户提交的说明（未经核验）：{attempt.customer_report}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <label className="ad-field" style={{ flex: 1, minWidth: 220 }}>
                      已核实的入账流水号
                      <input
                        className="ad-input"
                        value={reference[attempt.id] ?? ''}
                        onChange={(event) =>
                          setReference((prev) => ({ ...prev, [attempt.id]: event.target.value }))
                        }
                        placeholder="至少 8 位，来自微信账单"
                      />
                    </label>
                    <button
                      className="ad-btn"
                      data-variant="primary"
                      disabled={busy || (reference[attempt.id] ?? '').trim().length < 8}
                      onClick={() =>
                        setPending({
                          kind: 'payment',
                          attempt,
                          reference: (reference[attempt.id] ?? '').trim(),
                        })
                      }
                    >
                      登记已核实收款
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="待退款审批" subtitle={`退款申请 · ${refunds.length} 条`} padding={false}>
        {!workspace ? (
          <SkeletonRows rows={2} />
        ) : refunds.length === 0 ? (
          <EmptyState title="没有待处理的退款申请" />
        ) : (
          <div style={{ display: 'grid', gap: 14, padding: 18 }}>
            {refunds.map((refund) => {
              const state = refundStatus(refund.status);
              return (
                <div
                  key={refund.id}
                  className="ad-card"
                  style={{ boxShadow: 'none', background: 'var(--ad-surface-2)' }}
                >
                  <div className="ad-card-body" style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong>{refund.plan_name ?? '套餐'}</strong>
                      <span className="ad-num">{money(refund.amount_minor)}</span>
                      <span className="ad-code">{refund.order_no}</span>
                      <StatusBadge label={state.label} tone={state.tone} />
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ad-muted)' }}>
                      申请时间 {dateTime(refund.created_at)}
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <label className="ad-field" style={{ flex: 1, minWidth: 220 }}>
                        退款流水号或审核记录编号
                        <input
                          className="ad-input"
                          value={reference[refund.id] ?? ''}
                          onChange={(event) =>
                            setReference((prev) => ({ ...prev, [refund.id]: event.target.value }))
                          }
                          placeholder="至少 8 位"
                        />
                      </label>
                      <button
                        className="ad-btn"
                        data-variant="primary"
                        disabled={busy || (reference[refund.id] ?? '').trim().length < 8}
                        onClick={() =>
                          setPending({
                            kind: 'refund',
                            refund,
                            reference: (reference[refund.id] ?? '').trim(),
                            confirmed: true,
                          })
                        }
                      >
                        确认已退款
                      </button>
                      <button
                        className="ad-btn"
                        data-variant="danger"
                        disabled={busy || (reference[refund.id] ?? '').trim().length < 8}
                        onClick={() =>
                          setPending({
                            kind: 'refund',
                            refund,
                            reference: (reference[refund.id] ?? '').trim(),
                            confirmed: false,
                          })
                        }
                      >
                        驳回申请
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="其他待办" subtitle="来自真实业务表 · 只读" padding={false}>
        {!queue ? (
          <SkeletonRows rows={3} />
        ) : !queue.ok ? (
          queue.kind === 'unsupported' ? (
            <UnsupportedState spec={queue.spec} />
          ) : (
            <EmptyState title="无法读取审批队列" detail="请刷新重试" />
          )
        ) : others.length === 0 ? (
          <EmptyState title="没有其他待办" detail="制作放行、作品审核与任务失败会出现在这里。" />
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th scope="col">类型</th>
                  <th scope="col">订单 / 项目</th>
                  <th scope="col">客户</th>
                  <th scope="col" className="ad-num">金额</th>
                  <th scope="col">原因</th>
                  <th scope="col">提交时间</th>
                </tr>
              </thead>
              <tbody>
                {others.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="ad-badge" data-tone="info">
                        {KIND_LABEL[item.kind] ?? item.kind}
                      </span>
                    </td>
                    <td className="ad-code">
                      {item.orderNo ?? (item.projectId ? item.projectId.slice(0, 8) : '—')}
                    </td>
                    <td>{item.organization ?? '—'}</td>
                    <td className="ad-num">
                      {item.amountMinor === null ? '—' : money(item.amountMinor)}
                    </td>
                    <td style={{ maxWidth: 320 }}>{item.reason ?? '—'}</td>
                    <td>{dateTime(item.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="ad-card-body" style={{ borderTop: '1px solid var(--ad-border)' }}>
          <p style={{ fontSize: 12.5, margin: 0, color: 'var(--ad-muted)' }}>
            制作放行、暂缓（hold）、要求补充资料、作品审核的<strong>写动作</strong>仍需服务端状态机支持；
            当前可真实执行的只有<strong>人工收款核验</strong>与<strong>退款核验</strong>。此表仅用于发现待办。
          </p>
        </div>
      </Card>

      {pending && (
        <ConfirmDialog
          title={
            pending.kind === 'payment'
              ? '确认登记收款核验结果？'
              : pending.confirmed
                ? '确认已完成退款？'
                : '确认驳回退款申请？'
          }
          busy={busy}
          danger={pending.kind === 'refund' && !pending.confirmed}
          confirmLabel={
            pending.kind === 'payment' ? '确认登记' : pending.confirmed ? '确认已退款' : '确认驳回'
          }
          onCancel={() => setPending(null)}
          onConfirm={() => void run(pending)}
        >
          {pending.kind === 'payment' ? (
            <p style={{ margin: 0 }}>
              订单 <strong>{pending.attempt.order_no}</strong> · 金额{' '}
              <strong>{money(pending.attempt.amount_minor)}</strong> · 流水号{' '}
              <span className="ad-code">{pending.reference}</span>
              <br />
              该操作会由服务端确认付款并写入支付事件，客户端无法伪造。请确认已核对真实入账。
            </p>
          ) : (
            <p style={{ margin: 0 }}>
              订单 <strong>{pending.refund.order_no}</strong> · 金额{' '}
              <strong>{money(pending.refund.amount_minor)}</strong> · 参考号{' '}
              <span className="ad-code">{pending.reference}</span>
              <br />
              {pending.confirmed
                ? '将登记为已退款并从净收款中扣减。'
                : '驳回后不会产生退款，订单金额保持原状。'}
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}
