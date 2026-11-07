'use client';
import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { customerApi } from './session';
import { Notice, Loading, money, statusLabel } from './shell';
import type { Row } from '../../lib/customer/types';
export function AdminConsole() {
  const [data, setData] = useState<{ orders: Row[]; refunds: Row[]; manualAttempts: Row[] }>(),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await customerApi('core/admin'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15000);
    return () => clearInterval(timer);
  }, [load]);
  async function submit(
    event: FormEvent<HTMLFormElement>,
    orderId: string,
    action: string,
    extra: Row,
  ) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const fields = new FormData(event.currentTarget);
    try {
      await customerApi(`commerce/orders/${orderId}/${action}`, {
        ...extra,
        ...(action === 'finalize-refund'
          ? {
              reference: String(fields.get('reference')),
              confirmed: fields.get('confirmed') === 'on',
            }
          : { eventId: crypto.randomUUID(), evidenceRef: String(fields.get('reference')) }),
      });
      setMessage('审核结果已登记。');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <span className="ob-eyebrow">OPERATIONS / VERIFIED RECORDS ONLY</span>
      <h1>服务审核</h1>
      <button className="ob-button ob-ghost ob-small" onClick={() => void load()}>
        刷新审核列表
      </button>
      <p>只有已授权的平台管理员可以查看和登记结果。此页面不会代替商户平台实际收款或退款。</p>
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {!data ? (
        !error && <Loading />
      ) : (
        <div className="ob-stack">
          <section className="ob-card">
            <h2>退款申请</h2>
            {data.refunds.length ? (
              data.refunds.map((r) => (
                <article className="ob-row" key={r.id} style={{ display: 'block' }}>
                  <strong>
                    {r.plan_name} · {money(r.amount_minor)}
                  </strong>
                  <p className="ob-code">
                    {r.order_no} · {r.id}
                  </p>
                  <span className="ob-tag">{statusLabel(r.status)}</span>
                  {r.status === 'REQUESTED' && (
                    <form
                      className="ob-form"
                      onSubmit={(e) =>
                        void submit(e, r.order_id, 'finalize-refund', { refundId: r.id })
                      }
                    >
                      <label>
                        退款流水号或审核记录编号
                        <input name="reference" required minLength={8} maxLength={200} />
                      </label>
                      <label className="ob-check">
                        <input name="confirmed" type="checkbox" />
                        我已在商户平台核实实际退款成功（不勾选表示驳回申请）
                      </label>
                      <button disabled={busy} className="ob-button ob-ghost">
                        登记核验结果
                      </button>
                    </form>
                  )}
                  {r.provider_ref && <p className="ob-code">核验参考：{r.provider_ref}</p>}
                </article>
              ))
            ) : (
              <p>暂无退款申请。</p>
            )}
          </section>
          <section className="ob-card">
            <h2>人工核验的收款记录</h2>
            <p>
              先核对微信真实到账、金额及付款备注，再登记核验结果。客户提交说明不会自动开放制作。
            </p>
            {data.manualAttempts.map((a) => (
              <form
                className="ob-form ob-card"
                key={a.id}
                onSubmit={(e) =>
                  void submit(e, a.order_id, 'confirm-manual', {
                    attemptId: a.id,
                    amountMinor: a.amount_minor,
                    currency: 'CNY',
                  })
                }
              >
                <p>
                  {a.plan_name} · {money(a.amount_minor)} · 付款备注 {a.payment_memo}
                </p>
                <p className="ob-code">{a.order_no}</p>
                {a.customer_report && (
                  <Notice>
                    客户提交信息（待核验）：{a.customer_report}
                    <br />
                    提交时间：{new Date(a.reported_at).toLocaleString('zh-CN')}
                  </Notice>
                )}
                <label>
                  已核实的入账流水号
                  <input name="reference" required minLength={8} maxLength={200} />
                </label>
                <label className="ob-check">
                  <input type="checkbox" required />
                  已核对收款账户、订单金额及真实入账，确认不是截图自报或演示付款。
                </label>
                <button disabled={busy} className="ob-button">
                  登记已核实收款
                </button>
              </form>
            ))}
            {!data.manualAttempts.length && <p>暂无待核验收款。</p>}
          </section>
          <section className="ob-card">
            <h2>最近订单</h2>
            <div className="ob-table-wrap">
              <table className="ob-table">
                <thead>
                  <tr>
                    <th>客户组织</th>
                    <th>套餐</th>
                    <th>金额</th>
                    <th>付款状态</th>
                    <th>订单</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((o) => (
                    <tr key={o.id}>
                      <td>{o.organization}</td>
                      <td>
                        {o.plan_name}
                        {o.is_demo && <span className="ob-tag ob-tag-demo">演示</span>}
                      </td>
                      <td>{money(o.amount_minor)}</td>
                      <td>{statusLabel(o.pay_state)}</td>
                      <td className="ob-code">{o.order_no}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
