'use client';
import { useState } from 'react';
import { ENDPOINTS, confirmManualPayment, finalizeRefund } from '../../../../lib/admin/api';
import type { AdminRefund, ManualAttempt } from '../../../../lib/admin/types';
import { dateTime, money, refundStatus } from '../../../../lib/admin/format';
import { useAdmin } from '../../../../components/admin/shell';
import { Banner, EmptyState, SkeletonRows, UnsupportedState } from '../../../../components/admin/states';
import { Card, ConfirmDialog, PageHead, StatusBadge } from '../../../../components/admin/ui';

type PendingAction =
  | { kind: 'payment'; attempt: ManualAttempt; reference: string }
  | { kind: 'refund'; refund: AdminRefund; reference: string; confirmed: boolean };

export default function ApprovalsPage() {
  const { workspace, reload } = useAdmin();
  const [reference, setReference] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const attempts = workspace?.ok ? workspace.data.manualAttempts : [];
  const refunds = workspace?.ok ? workspace.data.refunds.filter((r) => r.status === 'REQUESTED') : [];

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

      <Card title="其余审批类型" subtitle="等待 A 组接口" padding={false}>
        <UnsupportedState
          spec={ENDPOINTS.approvals}
          extra={
            <p style={{ fontSize: 12.5, margin: 0 }}>
              制作放行（production-release）、暂缓（hold）、要求补充资料、转交处理、作品审核与正式发布审核均缺少服务端接口。
              当前可真实执行的只有<strong>人工收款核验</strong>与<strong>退款核验</strong>。
            </p>
          }
        />
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
