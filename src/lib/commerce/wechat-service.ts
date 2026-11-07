import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { z } from 'zod';
import { database, transaction, type Actor, type Tx } from '../core/db';
import { order, hash } from '../core/service';
import { assert } from '../core/errors';
import { appOrigin } from '../security/network';
import { wechatConfig, wechatRequest, decodeWechatNotification } from './wechat-provider';

const PaidTransaction = z.object({
  appid: z.string(),
  mchid: z.string(),
  out_trade_no: z.string().regex(/^[a-f0-9]{32}$/),
  transaction_id: z.string().min(8).max(64),
  trade_state: z.literal('SUCCESS'),
  amount: z.object({ total: z.number().int().positive(), currency: z.literal('CNY') }),
});
/** Called only after provider response/callback signature verification; never from client JSON. */
export async function applyWechatTransaction(tx: Tx, input: unknown) {
  const value = PaidTransaction.parse(input),
    config = wechatConfig();
  assert(
    value.mchid === config.mchId && value.appid === config.appId,
    'WECHAT_MERCHANT_MISMATCH',
    400,
  );
  const [located] =
    await tx`select order_id,org_id from wechat_payments where out_trade_no=${value.out_trade_no}`;
  assert(located, 'WECHAT_ORDER_MISSING', 404);
  const [o] =
    await tx`select * from service_orders where id=${located.order_id} and org_id=${located.org_id} for update`;
  const [payment] =
    await tx`select * from wechat_payments where out_trade_no=${value.out_trade_no} for update`;
  assert(
    o &&
      !o.is_demo &&
      o.amount_minor === value.amount.total &&
      o.currency === value.amount.currency,
    'PAYMENT_AMOUNT_MISMATCH',
  );
  const digest = hash(
    JSON.stringify({
      mchid: value.mchid,
      appid: value.appid,
      order: value.out_trade_no,
      transaction: value.transaction_id,
      total: value.amount.total,
      currency: value.amount.currency,
    }),
  );
  const eventId = `wx:${value.transaction_id}`;
  const [old] =
    await tx`select order_id,payload_hash from payment_events where provider='wechat_native' and event_id=${eventId}`;
  if (old) {
    assert(old.order_id === o.id && old.payload_hash === digest, 'EVENT_CONFLICT', 409);
    return { orderId: o.id, payState: o.pay_state };
  }
  // A different second successful charge must not silently grant/refund twice.
  assert(
    !payment.transaction_id || payment.transaction_id === value.transaction_id,
    'EVENT_CONFLICT',
    409,
  );
  assert(
    ['UNPAID', 'PENDING_CONFIRMATION', 'CLOSED'].includes(o.pay_state),
    'ORDER_ALREADY_SETTLED',
    409,
  );
  await tx`insert into payment_events(org_id,order_id,provider,event_id,payload_hash,verified_by,verification_method) values(${o.org_id},${o.id},'wechat_native',${eventId},${digest},null,'provider_signature')`;
  await tx`update payment_attempts set status='CONFIRMED',external_ref=${value.transaction_id} where id=${payment.attempt_id} and order_id=${o.id} and provider='wechat_native'`;
  await tx`update wechat_payments set state='SUCCESS',transaction_id=${value.transaction_id} where id=${payment.id}`;
  await tx`update service_orders set pay_state='PAID' where id=${o.id}`;
  const plan = o.plan_snapshot;
  await tx`insert into project_entitlements(order_id,org_id,remaining_revisions,max_products,max_posters,is_demo,expires_at) values(${o.id},${o.org_id},${plan.revision_rounds},${plan.product_limit},${plan.poster_count},false,now()+${plan.hosting_days}*interval '1 day') on conflict(order_id) do nothing`;
  return { orderId: o.id, payState: 'PAID' };
}
export async function receiveWechatNotification(headers: Headers, raw: string) {
  const notification = decodeWechatNotification(headers, raw);
  assert(
    notification.eventType === 'TRANSACTION.SUCCESS' && notification.resourceType === 'transaction',
    'WECHAT_EVENT_UNSUPPORTED',
    400,
  );
  await database().begin((tx) => applyWechatTransaction(tx, notification.value));
}
async function reconcilePayment(payment: Record<string, any>) {
  const config = wechatConfig();
  const result = await wechatRequest<Record<string, any>>(
    'GET',
    `/v3/pay/transactions/out-trade-no/${payment.out_trade_no}?mchid=${config.mchId}`,
  );
  assert(
    result.mchid === config.mchId &&
      result.appid === config.appId &&
      result.out_trade_no === payment.out_trade_no,
    'WECHAT_MERCHANT_MISMATCH',
  );
  if (result.trade_state === 'SUCCESS')
    return database().begin((tx) => applyWechatTransaction(tx, result));
  return { payState: result.trade_state };
}
export async function reconcileWechatOrder(actor: Actor, id: string) {
  const payment = await transaction(actor, async (tx) => {
    await order(tx, actor, id);
    const [p] =
      await tx`select * from wechat_payments where order_id=${id} order by created_at desc limit 1`;
    return p;
  });
  assert(payment, 'WECHAT_ORDER_MISSING', 404);
  return reconcilePayment(payment);
}
async function expirePayment(payment: Record<string, any>) {
  const result = await reconcilePayment(payment);
  if (result.payState === 'PAID') return false;
  if (!['CLOSED', 'REVOKED'].includes(result.payState))
    await wechatRequest('POST', `/v3/pay/transactions/out-trade-no/${payment.out_trade_no}/close`, {
      mchid: wechatConfig().mchId,
    });
  await database()`update wechat_payments set state='CLOSED' where id=${payment.id} and state='PENDING'`;
  return true;
}
export async function createWechatCheckout(
  actor: Actor,
  id: string,
  depth = 0,
): Promise<Record<string, any>> {
  wechatConfig();
  const origin = appOrigin();
  assert(depth < 3, 'WECHAT_CHECKOUT_BUSY', 409);
  const prepared: Record<string, any> = await transaction(actor, async (tx) => {
    const o = await order(tx, actor, id);
    assert(!o.is_demo, 'DEMO_REQUIRES_SANDBOX');
    assert(!o.checkout_blocked, 'ORDER_CLOSING', 409);
    assert(['UNPAID', 'PENDING_CONFIRMATION'].includes(o.pay_state), 'ORDER_NOT_PAYABLE', 409);
    assert(o.amount_minor > 0 && o.currency === 'CNY', 'PAYMENT_AMOUNT_MISMATCH');
    const [existing] =
      await tx`select * from wechat_payments where order_id=${o.id} and state='PENDING' for update`;
    if (existing) return { ...existing, amount_minor: o.amount_minor };
    const [attempt] =
      await tx`insert into payment_attempts(org_id,order_id,provider,amount_minor) values(${o.org_id},${o.id},'wechat_native',${o.amount_minor}) returning id`;
    const trade = randomUUID().replaceAll('-', '');
    const [payment] =
      await tx`insert into wechat_payments(org_id,order_id,attempt_id,out_trade_no,expires_at) values(${o.org_id},${o.id},${attempt.id},${trade},now()+interval '2 hours') returning *`;
    await tx`update service_orders set pay_state='PENDING_CONFIRMATION' where id=${o.id}`;
    return { ...payment, amount_minor: o.amount_minor };
  });
  if (new Date(prepared.expires_at).getTime() <= Date.now()) {
    assert(await expirePayment(prepared), 'ORDER_NOT_PAYABLE', 409);
    return createWechatCheckout(actor, id, depth + 1);
  }
  if (!prepared.code_url) {
    const config = wechatConfig();
    const result = await wechatRequest<{ code_url: string }>(
      'POST',
      '/v3/pay/transactions/native',
      {
        appid: config.appId,
        mchid: config.mchId,
        description: `OneBoss 宣传制作 ${id.slice(0, 8)}`,
        out_trade_no: prepared.out_trade_no,
        time_expire: new Date(prepared.expires_at).toISOString(),
        notify_url: `${origin}/api/commerce/payments/webhook/wechat`,
        amount: { total: prepared.amount_minor, currency: 'CNY' },
      },
    );
    assert(
      typeof result.code_url === 'string' &&
        result.code_url.startsWith('weixin://wxpay/bizpayurl?') &&
        result.code_url.length < 2048,
      'WECHAT_CODE_URL_INVALID',
      502,
    );
    prepared.code_url = result.code_url;
    await database()`update wechat_payments set code_url=${result.code_url} where id=${prepared.id} and state='PENDING'`;
  }
  return {
    provider: 'wechat_native',
    isDemo: false,
    amountMinor: prepared.amount_minor,
    expiresAt: prepared.expires_at,
    qrDataUrl: await QRCode.toDataURL(prepared.code_url, {
      width: 320,
      margin: 4,
      errorCorrectionLevel: 'M',
    }),
    instructions: '请用微信扫一扫付款。付款状态以商户回调或查询结果为准。',
  };
}
export async function closeWechatOrder(actor: Actor, id: string) {
  const payment = await transaction(actor, async (tx) => {
    const o = await order(tx, actor, id);
    if (o.pay_state === 'CLOSED') return undefined;
    assert(['UNPAID', 'PENDING_CONFIRMATION'].includes(o.pay_state), 'ORDER_CANNOT_CLOSE', 409);
    await tx`update service_orders set checkout_blocked=true where id=${id}`;
    const [p] = await tx`select * from wechat_payments where order_id=${id} and state='PENDING'`;
    return p;
  });
  if (payment) assert(await expirePayment(payment), 'ORDER_NOT_PAYABLE', 409);
  return transaction(actor, async (tx) => {
    const o = await order(tx, actor, id);
    if (o.pay_state === 'CLOSED') return { payState: 'CLOSED' };
    assert(['UNPAID', 'PENDING_CONFIRMATION'].includes(o.pay_state), 'ORDER_CANNOT_CLOSE', 409);
    await tx`update service_orders set pay_state='CLOSED' where id=${id}`;
    return { payState: 'CLOSED' };
  });
}
