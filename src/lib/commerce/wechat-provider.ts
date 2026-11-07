import {
  createPrivateKey,
  createPublicKey,
  createDecipheriv,
  randomBytes,
  sign,
  verify,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { AppError, assert } from '../core/errors';
import { outboundFetch } from '../security/http';

export type WechatConfig = {
  mchId: string;
  appId: string;
  serial: string;
  privateKey: string;
  publicKeyId: string;
  publicKey: string;
  apiV3Key: string;
};
const pem = (env: Record<string, string | undefined>, name: string) =>
  env[name] || (env[`${name}_PATH`] ? readFileSync(env[`${name}_PATH`]!, 'utf8') : '');
export function wechatConfig(env: Record<string, string | undefined> = process.env): WechatConfig {
  assert(env.WECHAT_PAY_ENABLED === 'true', 'WECHAT_PAY_NOT_CONFIGURED', 503);
  try {
    const value = {
      mchId: env.WECHAT_MCH_ID || '',
      appId: env.WECHAT_APP_ID || '',
      serial: env.WECHAT_CERT_SERIAL || '',
      privateKey: pem(env, 'WECHAT_PRIVATE_KEY'),
      publicKeyId: env.WECHAT_PUBLIC_KEY_ID || '',
      publicKey: pem(env, 'WECHAT_PUBLIC_KEY'),
      apiV3Key: env.WECHAT_API_V3_KEY || '',
    };
    assert(
      /^\d{6,20}$/.test(value.mchId) &&
        /^wx[a-zA-Z0-9]{10,30}$/.test(value.appId) &&
        /^[A-Fa-f0-9]{8,64}$/.test(value.serial) &&
        /^PUB_KEY_ID_\d+$/.test(value.publicKeyId) &&
        Buffer.byteLength(value.apiV3Key) === 32,
      'WECHAT_CONFIG_INVALID',
      503,
    );
    const privateKey = createPrivateKey(value.privateKey),
      publicKey = createPublicKey(value.publicKey);
    assert(
      privateKey.asymmetricKeyType === 'rsa' &&
        publicKey.asymmetricKeyType === 'rsa' &&
        (privateKey.asymmetricKeyDetails?.modulusLength || 0) >= 2048 &&
        (publicKey.asymmetricKeyDetails?.modulusLength || 0) >= 2048,
      'WECHAT_CONFIG_INVALID',
      503,
    );
    return value;
  } catch {
    throw new AppError('WECHAT_CONFIG_INVALID', 503);
  }
}
export function wechatAvailable() {
  try {
    wechatConfig();
    return true;
  } catch {
    return false;
  }
}
export function requestAuthorization(
  config: WechatConfig,
  method: string,
  path: string,
  body: string,
  timestamp = String(Math.floor(Date.now() / 1000)),
  nonce = randomBytes(16).toString('hex'),
) {
  const signature = sign(
    'RSA-SHA256',
    Buffer.from(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`),
    config.privateKey,
  ).toString('base64');
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${config.serial}",signature="${signature}"`;
}
/** Verify the untouched bytes before JSON decoding/decryption. Unknown key IDs fail closed. */
export function verifyWechatSignature(
  headers: Headers,
  raw: string,
  config: WechatConfig,
  now = Date.now(),
) {
  const timestamp = headers.get('wechatpay-timestamp') || '',
    nonce = headers.get('wechatpay-nonce') || '',
    signature = headers.get('wechatpay-signature') || '';
  assert(headers.get('wechatpay-serial') === config.publicKeyId, 'WECHAT_UNKNOWN_KEY', 401);
  assert(
    /^\d{10,12}$/.test(timestamp) &&
      Math.abs(now / 1000 - Number(timestamp)) <= 300 &&
      nonce.length > 0 &&
      nonce.length <= 128 &&
      /^[A-Za-z0-9+/=]+$/.test(signature) &&
      signature.length <= 2048,
    'WECHAT_SIGNATURE_INVALID',
    401,
  );
  assert(
    verify(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\n${nonce}\n${raw}\n`),
      config.publicKey,
      Buffer.from(signature, 'base64'),
    ),
    'WECHAT_SIGNATURE_INVALID',
    401,
  );
}
const notification = z.object({
  id: z.string().min(1).max(150),
  event_type: z.string().max(100),
  resource_type: z.literal('encrypt-resource'),
  resource: z.object({
    algorithm: z.literal('AEAD_AES_256_GCM'),
    ciphertext: z.string().max(1_048_576),
    nonce: z.string().min(1).max(16),
    associated_data: z.string().max(100).optional(),
    original_type: z.string().max(32),
  }),
});
export function decodeWechatNotification(headers: Headers, raw: string, config = wechatConfig()) {
  verifyWechatSignature(headers, raw, config);
  try {
    const value = notification.parse(JSON.parse(raw)),
      resource = value.resource,
      data = Buffer.from(resource.ciphertext, 'base64');
    assert(data.length > 16, 'WECHAT_NOTIFICATION_INVALID', 400);
    const cipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(config.apiV3Key),
      Buffer.from(resource.nonce),
    );
    cipher.setAuthTag(data.subarray(-16));
    cipher.setAAD(Buffer.from(resource.associated_data || ''));
    const plain = Buffer.concat([cipher.update(data.subarray(0, -16)), cipher.final()]).toString(
      'utf8',
    );
    return {
      id: value.id,
      eventType: value.event_type,
      resourceType: resource.original_type,
      value: JSON.parse(plain) as unknown,
    };
  } catch {
    throw new AppError('WECHAT_NOTIFICATION_INVALID', 400);
  }
}
export async function wechatRequest<T = unknown>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> {
  const config = wechatConfig();
  assert(
    /^\/v3\/(pay\/transactions\/|refund\/domestic\/refunds)/.test(path) &&
      !path.includes('..') &&
      !path.includes('#'),
    'WECHAT_PATH_INVALID',
  );
  const raw = body === undefined ? '' : JSON.stringify(body);
  const response = await outboundFetch(`https://api.mch.weixin.qq.com${path}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(12000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: requestAuthorization(config, method, path, raw),
      'Wechatpay-Serial': config.publicKeyId,
      'User-Agent': 'OneBoss/1.0',
    },
    ...(raw ? { body: raw } : {}),
  });
  const text = await response.text();
  verifyWechatSignature(response.headers, text, config);
  assert(response.ok, 'WECHAT_REQUEST_FAILED', 502);
  return (text ? JSON.parse(text) : {}) as T;
}
