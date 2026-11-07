'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { money, Notice } from './shell';
import type { Plan } from '../../lib/customer/types';
export function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/core/plans', { signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const value = await r.json();
        setPlans(value.plans);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError('暂时无法读取套餐，请稍后刷新。');
      });
    return () => abort.abort();
  }, []);
  return (
    <main className="ob-container ob-section">
      <span className="ob-eyebrow">A CLEAR SCOPE. A COMPLETE DELIVERY.</span>
      <h1>选择适合你的制作服务。</h1>
      <p className="ob-lead">
        套餐价格与权益由服务端实时提供。每份订单都会保存当时的价格和交付范围。
      </p>
      {error && <Notice error>{error}</Notice>}
      <div className="ob-grid ob-plans">
        {plans.map((p, i) => (
          <article className={`ob-card ${i === 1 ? 'ob-featured' : ''}`} key={p.code}>
            <span className="ob-eyebrow">{i === 0 ? 'ESSENTIAL' : 'EXPANDED'}</span>
            <h2>{p.name}</h2>
            <p className="ob-price">
              {money(p.price_minor)}
              <small> / 次制作</small>
            </p>
            <ul>
              <li>最多 {p.product_limit} 个产品</li>
              <li>{p.poster_count} 张高清海报与配套文案</li>
              <li>交互式宣传网站与二维码</li>
              <li>{p.revision_rounds} 轮修改</li>
              <li>网站托管 {p.hosting_days} 天</li>
              <li>完整 ZIP 交付包</li>
            </ul>
            <Link className="ob-button" href={`/checkout?plan=${encodeURIComponent(p.code)}`}>
              选择此套餐 →
            </Link>
          </article>
        ))}
      </div>
      <Notice>
        制作服务不包含广告投放、销量保证、商品收款或物流。可用付款方式以订单页为准；微信收款码付款需管理员核验到账后开放制作，订单金额以结算页为准。
      </Notice>
      <Link href="/terms" className="ob-text-link">
        阅读服务范围与退款说明 →
      </Link>
    </main>
  );
}
