import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
export function manualPaymentDetails() {
  if (process.env.MANUAL_PAYMENT_ENABLED !== 'true') return undefined;
  const qrUrl = '/payments/wechat-receive.png';
  if (!existsSync(resolve('public/payments/wechat-receive.png'))) return undefined;
  return {
    provider: 'wechat_manual',
    qrUrl,
    payeeDisplayName: '39(**宇)',
    instructions:
      '使用微信扫码，按订单金额付款并备注订单标识；到账由管理员人工核验，提交付款说明不会自动变成已付款。',
  };
}
