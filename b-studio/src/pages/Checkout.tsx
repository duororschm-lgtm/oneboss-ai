import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, CreditCard, ShieldCheck } from 'lucide-react';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { DemoBanner, Field, Notice } from '../components/ui';
import { formatCny } from '../data/plans';
import { useStudio } from '../lib/store';
import { createQuote, type Quote } from '../lib/api/demo-api';

type Channel = 'sandbox' | 'manual';

export function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { plans, createOrder, payDemo, requestManual, allSeeds } = useStudio();
  const planFromQuery = params.get('plan');
  const [planCode, setPlanCode] = useState(planFromQuery && plans.some((plan) => plan.code === planFromQuery) ? planFromQuery : 'growth');
  const [projectId, setProjectId] = useState(allSeeds[0].id);
  const [customerName, setCustomerName] = useState('演示客户 · 木作工作室');
  const [channel, setChannel] = useState<Channel>('sandbox');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(() => plans.find((item) => item.code === planCode) ?? plans[0], [planCode, plans]);
  const project = allSeeds.find((seed) => seed.id === projectId) ?? allSeeds[0];

  useEffect(() => {
    let cancelled = false;
    setQuote(null);
    createQuote(planCode)
      .then((result) => {
        if (!cancelled) setQuote(result);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '报价失败');
      });
    return () => {
      cancelled = true;
    };
  }, [planCode]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const order = await createOrder({
        planCode: plan.code,
        projectId: project.id,
        projectSlug: project.slug,
        customerName,
      });
      if (channel === 'sandbox') {
        await payDemo(order);
      } else {
        await requestManual(order);
      }
      navigate(`/orders?focus=${order.id}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '创建订单失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MarketingLayout>
      <main className="checkout-page">
        <header className="page-head compact">
          <span className="eyebrow">CHECKOUT / 服务订单</span>
          <h1>确认制作订单</h1>
          <p>金额由套餐目录计算并锁定快照；本页不会收集真实支付信息，也不会产生真实扣款。</p>
          <DemoBanner>演示结算 · 下单与支付状态仅用于产品流程验证</DemoBanner>
        </header>

        <div className="checkout-layout">
          <section className="checkout-form">
            <h2>1. 套餐</h2>
            <div className="plan-select">
              {plans.map((item) => (
                <label key={item.code} className={item.code === plan.code ? 'selected' : ''}>
                  <input
                    type="radio"
                    name="plan"
                    value={item.code}
                    checked={item.code === plan.code}
                    onChange={() => setPlanCode(item.code)}
                  />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </span>
                  <em>{formatCny(item.priceMinor)}</em>
                </label>
              ))}
            </div>

            <h2>2. 演示项目与客户</h2>
            <div className="field-row">
              <Field label="关联演示项目" hint="正式环境由 A 组根据订单创建项目；这里直接选择现有 fixture。">
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  {allSeeds.map((seed) => (
                    <option key={seed.id} value={seed.id}>
                      {seed.name}
                      {seed.id.startsWith('custom-') ? '（描述生成）' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="客户名称" hint="仅用于演示展示，不下单真实服务。">
                <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
              </Field>
            </div>

            <h2>3. 支付方式</h2>
            <div className="channel-list">
              <label className={channel === 'sandbox' ? 'selected' : ''}>
                <input type="radio" name="channel" checked={channel === 'sandbox'} onChange={() => setChannel('sandbox')} />
                <CreditCard size={19} />
                <span>
                  <strong>演示沙箱支付</strong>
                  <small>立即标记为 DEMO_PAID，并在后台保留 Demo 标识。不会真实扣款。</small>
                </span>
              </label>
              <label className={channel === 'manual' ? 'selected' : ''}>
                <input type="radio" name="channel" checked={channel === 'manual'} onChange={() => setChannel('manual')} />
                <ShieldCheck size={19} />
                <span>
                  <strong>人工核验（模拟）</strong>
                  <small>订单进入 PENDING_CONFIRMATION，等待 A 组管理员核对入账，不由页面直接置为已付。</small>
                </span>
              </label>
            </div>

            <div className="checkout-actions">
              <button className="button primary" type="button" onClick={submit} disabled={busy || !quote}>
                {busy ? '正在创建订单…' : channel === 'sandbox' ? '创建订单并演示支付' : '创建订单并提交核验'}
                <ArrowRight size={16} />
              </button>
              <Link className="text-link" to="/pricing">
                返回套餐对比
              </Link>
            </div>
            {error && (
              <Notice tone="error" title="下单失败">
                {error}
              </Notice>
            )}
          </section>

          <aside className="checkout-summary">
            <span className="card-kicker">ORDER SUMMARY</span>
            <h2>{plan.name}</h2>
            <div className="summary-price">{quote ? formatCny(quote.amountMinor) : '计算中…'}</div>
            <small className="summary-note">服务端套餐目录锁价 · 非商品价格</small>
            <ul>
              <li>
                <Check size={15} /> 产品数量 {plan.productLimit} 个
              </li>
              <li>
                <Check size={15} /> 海报 {plan.posterCount} 张
              </li>
              <li>
                <Check size={15} /> 定向修改 {plan.revisionRounds} 轮
              </li>
              <li>
                <Check size={15} /> 托管 {plan.hostingDays} 天
              </li>
            </ul>
            <div className="summary-project">
              <span>项目</span>
              <strong>{project.name}</strong>
              <small>{project.category} · 事实版本 V{project.factVersion}</small>
            </div>
            <Notice tone="warn" title="演示声明">
              订单会标记 <code>isDemo=true</code>；支付状态不会写入真实账目，也不代表 A 组已开通正式权益。
            </Notice>
          </aside>
        </div>
      </main>
    </MarketingLayout>
  );
}
