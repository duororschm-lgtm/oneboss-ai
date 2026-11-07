import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Loader2 } from 'lucide-react';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { DemoBanner, Notice } from '../components/ui';
import { formatCny, plans as localPlans } from '../data/plans';
import { fetchPlans } from '../lib/api/demo-api';
import type { Plan } from '../types/contracts';

export function Pricing() {
  const [plans, setPlans] = useState<Plan[]>(localPlans);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPlans()
      .then((result) => {
        if (!cancelled) setPlans(result);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : '套餐加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MarketingLayout>
      <main className="pricing-page">
        <header className="page-head">
          <span className="eyebrow">PRICING / 制作服务</span>
          <h1>
            选择适合本次发布的
            <br />
            制作套餐
          </h1>
          <p>
            以下套餐由 A 组服务端目录返回（当前为本地演示适配层）。价格在后端锁定，前端只展示；
            下单后进入演示支付或人工核验，不会产生真实扣款。
          </p>
          <DemoBanner>价格与权益来自 Demo 套餐目录，正式环境由 A 组 /api/core/plans 提供。</DemoBanner>
        </header>

        {error && (
          <div className="pricing-inner">
            <Notice tone="error" title="套餐加载失败">
              {error}。已回退到本地演示快照。
            </Notice>
          </div>
        )}

        <section className="plans-grid" aria-busy={loading}>
          {plans.map((plan) => (
            <article key={plan.code} className={plan.featured ? 'featured' : ''}>
              {plan.featured && <span className="popular">推荐</span>}
              <span className="plan-code">{plan.code.toUpperCase()}</span>
              <h2>{plan.name}</h2>
              <p className="plan-desc">{plan.description}</p>
              <div className="plan-price">
                <strong>{formatCny(plan.priceMinor)}</strong>
                <span>/ 次</span>
              </div>
              <ul>
                {plan.entitlements.map((item) => (
                  <li key={item}>
                    <Check size={15} /> {item}
                  </li>
                ))}
              </ul>
              <Link to={`/checkout?plan=${plan.code}`} className={plan.featured ? 'button light' : 'button dark'}>
                选择此套餐 <ArrowRight size={16} />
              </Link>
              <small className="plan-note">演示订单 · 不产生真实付款</small>
            </article>
          ))}
        </section>

        <section className="plan-compare">
          <h2>权益对比</h2>
          <div className="compare-table" role="table" aria-label="套餐权益对比">
            <div className="compare-row head" role="row">
              <span role="columnheader">项目</span>
              {plans.map((plan) => (
                <span key={plan.code} role="columnheader">
                  {plan.name}
                </span>
              ))}
            </div>
            {[
              ['产品数量', (plan: Plan) => `${plan.productLimit} 个`],
              ['海报数量', (plan: Plan) => `${plan.posterCount} 张`],
              ['定向修改', (plan: Plan) => `${plan.revisionRounds} 轮`],
              ['托管期限', (plan: Plan) => `${plan.hostingDays} 天`],
              ['交付内容', () => '网站 + PNG + 二维码 + 文案'],
            ].map(([label, value]) => (
              <div className="compare-row" role="row" key={label as string}>
                <span role="cell">{label as string}</span>
                {plans.map((plan) => (
                  <span key={plan.code} role="cell">
                    {(value as (plan: Plan) => string)(plan)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="scope-grid">
          <article>
            <span className="eyebrow">INCLUDED</span>
            <h2>服务包含</h2>
            <ul>
              <li>可交互 React 宣传网站与正式发布链接（由 A 组发布）</li>
              <li>1080×1350 与 1080×1080 独立排版 PNG 海报</li>
              <li>可扫码二维码与独立二维码文件</li>
              <li>与海报同源的小红书标题、正文、标签</li>
              <li>一次或多次定向修改的预览与审批记录</li>
            </ul>
          </article>
          <article>
            <span className="eyebrow">NOT INCLUDED</span>
            <h2>不包含</h2>
            <ul>
              <li>商品交易、购物车、支付或库存物流</li>
              <li>广告投放、获客保证与自动发帖</li>
              <li>3D 建模或写实商品图生成</li>
              <li>未确认参数、销量、评价的补写</li>
              <li>平台审核通过与二维码外链合规保证</li>
            </ul>
          </article>
        </section>

        {loading && (
          <p className="pricing-loading">
            <Loader2 size={16} className="spin" /> 正在加载服务端套餐…
          </p>
        )}
      </main>
    </MarketingLayout>
  );
}
