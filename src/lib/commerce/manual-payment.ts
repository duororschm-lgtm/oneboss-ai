import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
export type ManualChannel = 'wechat' | 'alipay';
export function manualPaymentDetails(channel: ManualChannel = 'wechat') {
  if (process.env.MANUAL_PAYMENT_ENABLED !== 'true') return undefined;
  if (channel === 'alipay') {
    if (process.env.ALIPAY_MANUAL_PAYMENT_ENABLED !== 'true' ||
        !process.env.ALIPAY_PAYEE_DISPLAY_NAME?.trim() ||
        !existsSync(resolve('public/payments/alipay-receive.png'))) return undefined;
    return { provider: 'alipay_manual', paymentChannel: channel, qrUrl: '/payments/alipay-receive.png',
      payeeDisplayName: process.env.ALIPAY_PAYEE_DISPLAY_NAME.trim(),
      instructions: '使用支付宝按订单金额付款，提交付款说明，等待管理员核对真实到账。' };
  }
  const qrUrl = '/payments/wechat-receive.png';
  if (!existsSync(resolve('public/payments/wechat-receive.png'))) return undefined;
  return {
    provider: 'wechat_manual',
    paymentChannel: channel,
    qrUrl,
    payeeDisplayName: '39(**宇)',
    instructions:
      '使用微信扫码，按订单金额付款并备注订单标识；到账由管理员人工核验，提交付款说明不会自动变成已付款。',
  };
}
