import Link from 'next/link';
export default function Home() {
  return (
    <main>
      <section className="ob-hero ob-container">
        <div>
          <span className="ob-eyebrow">ONEBOSS / CREATIVE PRODUCTION</span>
          <h1>
            你的产品，
            <br />
            值得被<span>认真看见。</span>
          </h1>
          <p className="ob-lead">
            把产品资料交给创意团队。一起确认方向，制作能打开、能互动的宣传网站，以及可直接分享的海报与文案。
          </p>
          <div className="ob-actions">
            <Link href="/pricing" className="ob-button">
              开始我的宣传项目 ↗
            </Link>
            <Link href="/examples" className="ob-button ob-ghost">
              了解作品与流程
            </Link>
          </div>
          <p className="ob-muted">你确认事实与设计 · AI 负责制作 · 成品归你管理</p>
        </div>
        <div className="ob-hero-art" aria-label="网站与海报的概念排版示意">
          <div className="ob-art-top">
            YOUR NEXT CAMPAIGN <span>01 / 03</span>
          </div>
          <div className="ob-art-word">
            Make
            <br />
            <em>an impression.</em>
          </div>
          <div className="ob-art-shape" />
          <div className="ob-art-bottom">
            <span>网站 × 海报 × 文案</span>
            <span>由你的产品出发 ↗</span>
          </div>
          <small>概念排版示意，非客户案例</small>
        </div>
      </section>
      <section className="ob-band">
        <span>一个事实版本</span>
        <span>三种传播载体</span>
        <span>每一步由你确认</span>
      </section>
      <section className="ob-container ob-section">
        <span className="ob-eyebrow">FROM IDEA TO DELIVERY</span>
        <h2>从产品资料，到一套完整作品。</h2>
        <div className="ob-grid ob-three">
          {[
            [
              '01',
              '讲清产品',
              '填写已知信息，上传有权使用的图片。AI 会提示缺少的资料，不替你编造卖点。',
            ],
            ['02', '一起选方向', '比较创意方案，预览网站，提出明确的局部修改，确认满意的版本。'],
            ['03', '发布与带走', '获取网站链接、带二维码的高清海报、小红书文案，以及完整交付包。'],
          ].map(([n, t, d]) => (
            <article className="ob-card" key={n}>
              <span className="ob-number">{n}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="ob-container ob-section ob-split">
        <div>
          <span className="ob-eyebrow">BUILT FOR YOUR PRODUCT</span>
          <h2>
            做宣传素材，
            <br />
            也把交付做清楚。
          </h2>
        </div>
        <div>
          <p className="ob-lead">
            适合品牌、厂家、商家及个人的产品或服务展示。不包含广告投放、商品交易、物流或销量承诺。
          </p>
          <Link href="/pricing" className="ob-text-link">
            查看套餐权益与交付范围 →
          </Link>
        </div>
      </section>
    </main>
  );
}
