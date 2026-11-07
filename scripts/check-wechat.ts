import { wechatConfig } from '../src/lib/commerce/wechat-provider';
import { AppError } from '../src/lib/core/errors';
const groups = [
  ['WECHAT_MCH_ID'],
  ['WECHAT_APP_ID'],
  ['WECHAT_CERT_SERIAL'],
  ['WECHAT_PRIVATE_KEY', 'WECHAT_PRIVATE_KEY_PATH'],
  ['WECHAT_PUBLIC_KEY_ID'],
  ['WECHAT_PUBLIC_KEY', 'WECHAT_PUBLIC_KEY_PATH'],
  ['WECHAT_API_V3_KEY'],
];
const missing = groups
  .filter((group) => !group.some((name) => process.env[name]?.trim()))
  .map((group) => group.join(' / '));
let ready = false,
  errorClass: string | undefined;
try {
  wechatConfig();
  ready = true;
} catch (error) {
  errorClass = error instanceof AppError ? error.code : 'WECHAT_CONFIG_INVALID';
}
console.log(
  JSON.stringify(
    {
      enabled: process.env.WECHAT_PAY_ENABLED === 'true',
      configurationReady: ready,
      missing,
      errorClass,
      realPaymentVerified: false,
    },
    null,
    2,
  ),
);
if (!ready) process.exitCode = 1;
