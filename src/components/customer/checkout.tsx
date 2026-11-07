'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCustomer, customerApi } from './session';
import { money, Notice, Loading } from './shell';
import type { Plan, Row } from '../../lib/customer/types';
import { usePaymentMethods } from './payment-methods';
export function Checkout() {
  const methods = usePaymentMethods();
  const { session, ready } = useCustomer(),
    params = useSearchParams(),
    router = useRouter();
  const [plan, setPlan] = useState<Plan>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [agree, setAgree] = useState(false);
  const [addons, setAddons] = useState<Row[]>([]),
    // 用字符串保存数量：数字类型无法表达"用户清空了输入框"，会导致 0 删不掉。
    [quantities, setQuantities] = useState<Record<string, string>>({});
  const code = params.get('plan') || 'basic';
  useEffect(() => {
    void fetch('/api/core/plans')
      .then((r) => r.json())
      .then((v) => {
        const p = v.plans?.find((x: Plan) => x.code === code);
        if (!p) throw Error();
        setPlan(p);
        setAddons(v.addons || []);
      })
      .catch(() => setError('套餐暂不可用，请返回套餐页重新选择。'));
  }, [code]);
  async function create() {
    setBusy(true);
    setError('');
    try {
      const org = await customerApi<Row>('core/organizations', { name: '我的创意工作室' });
      const quote = await customerApi<Row>('commerce/quotes', {
        orgId: org.id,
        planCode: code,
        addons: Object.entries(quantities)
          .map(([code, qty]) => ({ code, qty: Number(qty) || 0 }))
          .filter((item) => item.qty > 0),
      });
      const order = await customerApi<Row>('commerce/orders', {
        orgId: org.id,
        quoteId: quote.id,
        isDemo: false,
      });
      router.push(`/dashboard/orders/${order.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="ob-container ob-section ob-prose">
      <span className="ob-eyebrow">START A PROJECT</span>
      <h1>先确认交付范围。</h1>
      {error && <Notice error>{error}</Notice>}
      {plan ? (
        <article className="ob-card">
          <h2>{plan.name}</h2>
          <p className="ob-price">
            {money(
              plan.price_minor +
                addons.reduce(
                  (sum, a) => sum + (Number(quantities[a.code]) || 0) * a.price_minor,
                  0,
                ),
            )}
          </p>
          <div className="ob-metrics">
            <span>
              <strong>{plan.product_limit}</strong>个产品
            </span>
            <span>
              <strong>{plan.poster_count}</strong>张海报
            </span>
            <span>
              <strong>{plan.revision_rounds}</strong>轮修改
            </span>
            <span>
              <strong>{plan.hosting_days}</strong>天托管
            </span>
          </div>
          <p>包含交互宣传网站、二维码、小红书配套文案与 ZIP 交付包。</p>
          <fieldset
            style={{
              marginTop: 20,
              border: '1px solid var(--ob-line)',
              borderRadius: 4,
              padding: '18px 22px 16px',
              display: 'block',
              minWidth: 0,
            }}
          >
            <legend
              style={{
                padding: '0 8px',
                fontSize: 12,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--ob-muted)',
              }}
            >
              支付方式
            </legend>
            <div style={{ display: 'grid', gap: 10 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 13,
                  color: 'var(--ob-muted)',
                }}
              >
                <input type="radio" name="paymentMethod" disabled />
                <span style={{ flex: 1 }}>微信支付</span>
                <span className="ob-tag">未开通</span>
              </label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: 13,
                  color: 'var(--ob-muted)',
                }}
              >
                <input type="radio" name="paymentMethod" disabled />
                <span style={{ flex: 1 }}>支付宝支付</span>
                <span className="ob-tag">未开通</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <input type="radio" name="paymentMethod" checked readOnly />
                <span style={{ flex: 1 }}>微信收款码 · 人工核验</span>
                <span className="ob-tag">{methods.manualVerified ? '当前可用' : '配置中'}</span>
              </label>
            </div>
            <p className="ob-muted" style={{ marginTop: 12, marginBottom: 0 }}>
              在线商户支付未接入。付款后提交付款说明，管理员核对真实到账后才开放制作。
            </p>
          </fieldset>
          {addons.length > 0 && (
            <div className="ob-form">
              <h3>按需加购</h3>
              {addons.map((a) => (
                <label key={a.code}>
                  {a.name} · 每份 {money(a.price_minor)}
                  <input
                    aria-label={`${a.name} 数量`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={2}
                    value={quantities[a.code] ?? '0'}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 2);
                      setQuantities({ ...quantities, [a.code]: digits });
                      setAgree(false);
                    }}
                    onBlur={() => {
                      const clamped = Math.max(0, Math.min(10, Number(quantities[a.code] || 0)));
                      setQuantities({ ...quantities, [a.code]: String(clamped) });
                    }}
                  />
                </label>
              ))}
              <small>默认不加购。加购后的权益与最终金额将在订单中保存。</small>
            </div>
          )}
          <Notice>
            这是制作服务订单。创建订单不会扣费。
            {methods.manualVerified
              ? '下一步可查看微信收款码，按订单金额付款。'
              : methods.wechatNative
                ? '下一步可用微信扫一扫支付。'
                : '收款方式正在配置。'}
            最后金额以保存的订单为准。
          </Notice>
          <label className="ob-check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            我已阅读
            <Link href="/terms" target="_blank">
              服务范围与退款说明
            </Link>
            ，确认购买的是宣传制作服务。
          </label>
          <div className="ob-actions">
            {!ready ? (
              <Loading />
            ) : session ? (
              <button disabled={busy || !agree} onClick={() => void create()} className="ob-button">
                {busy ? '正在创建…' : '创建服务订单 →'}
              </button>
            ) : (
              <Link
                className="ob-button"
                href={`/login?next=${encodeURIComponent(`/checkout?plan=${code}`)}`}
              >
                登录后创建订单 →
              </Link>
            )}
          </div>
        </article>
      ) : (
        !error && <Loading />
      )}
    </main>
  );
}
