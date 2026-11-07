'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCustomer, customerApi } from './session';
import { money, Notice, Loading } from './shell';
import type { Plan, Row } from '../../lib/customer/types';
import { usePaymentMethods } from './payment-methods';
import { addonQuantity } from '../../lib/customer/addon-input';
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
    [quantities, setQuantities] = useState<Record<string, string>>({});
  const [paymentChannel, setPaymentChannel] = useState<'wechat' | 'alipay'>('wechat');
  const invalidQuantity = Object.values(quantities).some((value) => addonQuantity(value) === undefined);
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
      if (invalidQuantity) throw Error('加购数量须为0至10的整数，空白表示不加购。');
      const org = await customerApi<Row>('core/organizations', { name: '我的创意工作室' });
      const quote = await customerApi<Row>('commerce/quotes', {
        orgId: org.id,
        planCode: code,
        addons: Object.entries(quantities)
          .map(([code, value]) => ({ code, qty: addonQuantity(value)! }))
          .filter(({ qty }) => qty > 0),
      });
      const order = await customerApi<Row>('commerce/orders', {
        orgId: org.id,
        quoteId: quote.id,
        isDemo: false,
        paymentChannel,
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
            {invalidQuantity ? '—' : money(
              plan.price_minor +
                addons.reduce((sum, a) => sum + (addonQuantity(quantities[a.code] || '') || 0) * a.price_minor, 0),
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
          <fieldset className="ob-card" style={{ marginTop: 20 }}>
            <legend>支付方式</legend>
            {(['wechat','alipay'] as const).map((channel) => {
              const available = methods.manualChannels?.[channel] || (channel === 'wechat' && methods.manual);
              return <label className="ob-check" key={channel}>
                <input type="radio" name="paymentMethod" value={channel}
                  checked={paymentChannel === channel} disabled={!available}
                  onChange={() => { setPaymentChannel(channel); setAgree(false); }} />
                <span>{channel === 'wechat' ? '微信支付' : '支付宝支付'}（人工核验）{available ? '' : ' · 待配置'}</span>
              </label>;
            })}
            <p className="ob-muted">付款后提交付款说明，管理员核对真实到账后开放制作。</p>
          </fieldset>
          {addons.length > 0 && (
            <div className="ob-form">
              <h3>按需加购</h3>
              {addons.map((a) => (
                <label key={a.code}>
                  {a.name} · 每{a.code === 'extra-product' ? '个' : a.code === 'extra-poster' ? '张' : '轮'} {money(a.price_minor)}
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <button type="button" className="ob-button ob-ghost ob-small" aria-label={`减少${a.name}`}
                    onClick={() => { setQuantities({...quantities,[a.code]:String(Math.max(0,(addonQuantity(quantities[a.code] || '') || 0)-1))}); setAgree(false); }}>−</button>
                  <input
                    aria-label={`${a.name} 数量`}
                    type="text"
                    inputMode="numeric"
                    aria-invalid={addonQuantity(quantities[a.code] || '') === undefined}
                    value={quantities[a.code] ?? ''}
                    onChange={(e) => {
                      setQuantities({
                        ...quantities,
                        [a.code]: e.target.value,
                      });
                      setAgree(false);
                    }}
                  />
                  <button type="button" className="ob-button ob-ghost ob-small" aria-label={`增加${a.name}`}
                    onClick={() => { setQuantities({...quantities,[a.code]:String(Math.min(10,(addonQuantity(quantities[a.code] || '') || 0)+1))}); setAgree(false); }}>+</button>
                  </div>
                  {addonQuantity(quantities[a.code] || '') === undefined && <small role="alert">请输入0至10的整数。</small>}
                </label>
              ))}
              <small>空白表示不加购。加购后的权益与最终金额将在订单中保存。</small>
              {invalidQuantity && <Notice error>请修正加购数量后再确认报价。</Notice>}
            </div>
          )}
          <Notice>
            这是制作服务订单。创建订单不会扣费。
            {methods.manualVerified
              ? '下一步可查看所选渠道收款码，按订单金额付款，等待人工核验。'
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
              <button disabled={busy || !agree || invalidQuantity || !(methods.manualChannels?.[paymentChannel] || (paymentChannel === 'wechat' && methods.manual))} onClick={() => void create()} className="ob-button">
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
