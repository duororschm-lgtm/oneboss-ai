'use client';
import { useState, type FormEvent } from 'react';
import { customerApi } from './session';
import { Notice, money } from './shell';
import type { Row } from '../../lib/customer/types';
import type { PaymentMethods } from './payment-methods';
export function ManualPayment({
  order,
  method,
  onChanged,
}: {
  order: Row;
  method: NonNullable<PaymentMethods['manual']>;
  onChanged: () => Promise<void>;
}) {
  const channel = order.payment_channel === 'alipay' ? 'alipay' : 'wechat';
  const channelName = channel === 'alipay' ? '支付宝' : '微信';
  const [attempt, setAttempt] = useState<string>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  async function start() {
    setBusy(true);
    setError('');
    try {
      const data = await customerApi(`commerce/orders/${order.id}/checkout`, {
        channel: 'manual_verified',
        paymentChannel: channel,
      });
      setAttempt(data.attempt.id);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const fields = new FormData(event.currentTarget);
    try {
      await customerApi(`commerce/orders/${order.id}/report-manual-payment`, {
        attemptId: attempt,
        details: [String(fields.get('details') || ''), fields.get('paidAt') ? `付款时间：${fields.get('paidAt')}` : '', fields.get('transactionRef') ? `交易单号：${fields.get('transactionRef')}` : ''].filter(Boolean).join('\n'),
      });
      setMessage('付款说明已提交，等待人工核验真实到账；订单尚未确认付款。');
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section style={{ marginBottom: 24 }}>
      <h3>{channelName}收款码 · 人工核验</h3>
      <p>
        应付 <strong>{money(order.amount_minor)}</strong> · 付款备注{' '}
        <strong>{order.id.slice(0, 8)}</strong>
      </p>
      <p className="ob-muted">
        请核对收款人“{method.payeeDisplayName}”，按订单金额付款。管理员确认到账后才能开始制作。
      </p>
      {error && <Notice error>{error}</Notice>}
      {(message || order.manualPaymentReport) && (
        <Notice>
          付款说明已提交，等待人工核验真实到账；订单尚未确认付款。
          {order.manualPaymentReport && (
            <>
              <p>你提交的信息：{order.manualPaymentReport.details}</p>
              <p className="ob-muted">
                {new Date(order.manualPaymentReport.created_at).toLocaleString('zh-CN')}
              </p>
            </>
          )}
        </Notice>
      )}
      {!attempt ? (
        <button
          className="ob-button"
          disabled={busy || order.checkout_blocked}
          onClick={() => void start()}
        >
          查看{channelName}收款码，按金额付款
        </button>
      ) : (
        <div className="ob-card">
          <img
            src={method.qrUrl}
            alt={`${channelName}收款码，收款人 ${method.payeeDisplayName}`}
            style={{
              width: 320,
              maxWidth: '100%',
              height: 'auto',
              display: 'block',
              margin: '0 auto',
            }}
          />
          <p>用另一台设备扫码，或保存图片后在{channelName}“扫一扫”中从相册识别。</p>
          <a
            href={method.qrUrl}
            download={`BlackCode-${channelName}收款码.png`}
            className="ob-button ob-ghost ob-small"
          >
            保存收款码
          </a>
          <form className="ob-form" onSubmit={report}>
            <label>付款时间（北京时间）<input type="datetime-local" name="paidAt" /></label>
            <label>交易单号<input name="transactionRef" maxLength={150} /></label>
            <label>
              付款说明
              <textarea
                name="details"
                required
                minLength={1}
                maxLength={750}
                placeholder="填写便于核对到账的补充信息。无需提供密码或银行卡信息。"
              />
            </label>
            <label className="ob-check">
              <input type="checkbox" required />
              我已按订单金额付款，知道提交说明不代表已通过到账核验。
            </label>
            <button disabled={busy} className="ob-button">
              我已付款，提交人工核验
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
