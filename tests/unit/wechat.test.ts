import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign, verify, createCipheriv, randomBytes } from 'node:crypto';
import {
  requestAuthorization,
  verifyWechatSignature,
  decodeWechatNotification,
  wechatConfig,
  type WechatConfig,
} from '../../src/lib/commerce/wechat-provider';
const pair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const config: WechatConfig = {
  mchId: '1234567890',
  appId: 'wx1234567890abcdef',
  serial: 'ABCDEF0123456789',
  privateKey: pair.privateKey,
  publicKeyId: 'PUB_KEY_ID_12345678',
  publicKey: pair.publicKey,
  apiV3Key: '12345678901234567890123456789012',
};
function headers(raw: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  return new Headers({
    'Wechatpay-Timestamp': timestamp,
    'Wechatpay-Nonce': 'known-test-nonce',
    'Wechatpay-Serial': config.publicKeyId,
    'Wechatpay-Signature': sign(
      'RSA-SHA256',
      Buffer.from(`${timestamp}\nknown-test-nonce\n${raw}\n`),
      pair.privateKey,
    ).toString('base64'),
  });
}
describe('WeChat APIv3 trust boundary', () => {
  it('signs exact method, path including query, timestamp, nonce and original body', () => {
    const raw = '{"amount":{"total":19900}}',
      path = '/v3/pay/transactions/native';
    const auth = requestAuthorization(config, 'POST', path, raw, '1794040000', 'nonce');
    const signature = /signature="([^"]+)"/.exec(auth)![1];
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(`POST\n${path}\n1794040000\nnonce\n${raw}\n`),
        pair.publicKey,
        Buffer.from(signature, 'base64'),
      ),
    ).toBe(true);
  });
  it('rejects tampering, unknown key IDs, stale signed callbacks and signature probes', () => {
    const raw = '{"id":"event"}',
      valid = headers(raw);
    expect(() => verifyWechatSignature(valid, raw, config)).not.toThrow();
    expect(() => verifyWechatSignature(valid, raw + ' ', config)).toThrow(
      'WECHAT_SIGNATURE_INVALID',
    );
    const unknown = headers(raw);
    unknown.set('Wechatpay-Serial', 'PUB_KEY_ID_99999');
    expect(() => verifyWechatSignature(unknown, raw, config)).toThrow('WECHAT_UNKNOWN_KEY');
    expect(() => verifyWechatSignature(headers(raw, '1600000000'), raw, config)).toThrow(
      'WECHAT_SIGNATURE_INVALID',
    );
    const probe = headers(raw);
    probe.set('Wechatpay-Signature', 'WECHATPAY/SIGNTEST/not-valid');
    expect(() => verifyWechatSignature(probe, raw, config)).toThrow('WECHAT_SIGNATURE_INVALID');
  });
  it('decrypts only a signed authenticated AES-GCM payload and rejects a wrong API key', () => {
    const nonce = randomBytes(6).toString('hex'),
      cipher = createCipheriv('aes-256-gcm', Buffer.from(config.apiV3Key), Buffer.from(nonce));
    cipher.setAAD(Buffer.from('transaction'));
    const value = { out_trade_no: 'test-order', trade_state: 'SUCCESS' },
      data = Buffer.concat([
        cipher.update(JSON.stringify(value)),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
    const raw = JSON.stringify({
      id: 'test-event',
      event_type: 'TRANSACTION.SUCCESS',
      resource_type: 'encrypt-resource',
      resource: {
        algorithm: 'AEAD_AES_256_GCM',
        ciphertext: data.toString('base64'),
        nonce,
        associated_data: 'transaction',
        original_type: 'transaction',
      },
    });
    expect(decodeWechatNotification(headers(raw), raw, config).value).toEqual(value);
    expect(() =>
      decodeWechatNotification(headers(raw), raw, {
        ...config,
        apiV3Key: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      }),
    ).toThrow('WECHAT_NOTIFICATION_INVALID');
  });
  it('requires explicit merchant enablement and never accepts incomplete configuration', () => {
    expect(() => wechatConfig({})).toThrow('WECHAT_PAY_NOT_CONFIGURED');
    expect(() => wechatConfig({ WECHAT_PAY_ENABLED: 'true' })).toThrow('WECHAT_CONFIG_INVALID');
  });
});
