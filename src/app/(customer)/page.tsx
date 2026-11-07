import Link from 'next/link';
import { Magnetic, Tilt } from '../../components/customer/motion';
import './showcase.css';

/**
 * OneBoss 公开营销站首页。
 *
 * 设计：Luxury Editorial × Kinetic —— 保留暖纸墨绿的品牌识别，靠排版尺度、
 * 不对称构图、纸面颗粒与滚动编排出彩，不靠换品牌色。
 *
 * 文案纪律：所有文案沿用既有事实表述，不新增卖点、不编造数据、不伪造案例。
 * 「概念排版示意，非客户案例」这类免责说明必须保留。
 */

const STEPS = [
  [
    '01',
    '讲清产品',
    '填写已知信息，上传有权使用的图片。AI 会提示缺少的资料，不替你编造卖点。',
  ],
  [
    '02',
    '一起选方向',
    '比较创意方案，预览网站，提出明确的局部修改，确认满意的版本。',
  ],
  [
    '03',
    '发布与带走',
    '获取网站链接、带二维码的高清海报、小红书文案，以及完整交付包。',
  ],
] as const;

// 标题按语义切行：中文没有空格，交给浏览器自动断会把「海报」劈成「海/报」。
// 手工定行比 text-wrap 可控，也比 word-break: keep-all 更像设计而非补丁。
const CARRIERS = [
  ['网站', ['能打开、能互动的', '宣传网站'], '每一页从已确认的产品事实出发，不是模板换字。'],
  ['海报', ['可直接分享的', '高清海报'], '带二维码直达作品页，拿去发圈、发群都够用。'],
  ['文案', ['适配社交平台的', '文案'], '事实一致，不替你编造卖点，不写没确认的能力。'],
] as const;

const MARQUEE = ['一个事实版本', '三种传播载体', '每一步由你确认'] as const;

export default function Home() {
  return (
    <main>
      <div className="ob-x-grain" aria-hidden="true" />
      <div className="ob-x-rail" aria-hidden="true" />

      {/* ── HERO ── */}
      <section className="ob-container ob-x-hero">
        <div className="ob-x-reveal">
          <span className="ob-x-eyebrow">ONEBOSS / CREATIVE PRODUCTION</span>
          <h1 className="ob-x-display">
            你的产品，
            <br />
            值得被
            <span className="ob-x-fill" data-text="认真看见">
              认真看见
            </span>
            。
          </h1>
          <p className="ob-x-lead">
            把产品资料交给创意团队。一起确认方向，制作能打开、能互动的宣传网站，以及可直接分享的海报与文案。
          </p>
          <div className="ob-x-actions">
            <Magnetic>
              <Link href="/pricing" className="ob-x-btn ob-x-btn--lg">
                开始我的宣传项目
                <span aria-hidden="true">↗</span>
              </Link>
            </Magnetic>
            <Magnetic strength={0.22}>
              <Link href="/examples" className="ob-x-btn ob-x-btn--ghost ob-x-btn--lg">
                了解作品与流程
              </Link>
            </Magnetic>
          </div>
          <p
            className="ob-lead"
            style={{ marginTop: 26, fontSize: 13, letterSpacing: '0.04em' }}
          >
            你确认事实与设计 · AI 负责制作 · 成品归你管理
          </p>
        </div>

        {/* 概念排版面板：错位下沉，层叠景深 */}
        <div className="ob-x-art ob-x-reveal" aria-label="网站与海报的概念排版示意">
          <div className="ob-x-art-top">
            <span>YOUR NEXT CAMPAIGN</span>
            <span>01 / 03</span>
          </div>
          <div className="ob-x-art-word">
            Make
            <br />
            <em>an impression.</em>
          </div>
          <div className="ob-x-art-bottom">
            <span>网站 × 海报 × 文案</span>
            <span>由你的产品出发 ↗</span>
          </div>
          <small className="ob-x-art-note">概念排版示意，非客户案例</small>
        </div>
      </section>

      {/* ── 动态跑马灯 ── */}
      <div className="ob-x-marquee" aria-label="产品要点">
        <div className="ob-x-marquee-track">
          {[0, 1].map((copy) => (
            <div key={copy} aria-hidden={copy === 1} style={{ display: 'flex' }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <span className="ob-x-marquee-item" key={i}>
                  {MARQUEE[i % MARQUEE.length]}
                  <i>◆</i>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── 流程 ── */}
      <section className="ob-container ob-x-section">
        <div className="ob-x-section-head ob-x-reveal">
          <div>
            <span className="ob-x-eyebrow">FROM IDEA TO DELIVERY</span>
            <h2 className="ob-x-h2">
              从产品资料，
              <br />
              到一套完整作品。
            </h2>
          </div>
          <p className="ob-x-aside">
            三步，每一步都由你确认。没有你点头的事实，不会出现在成品里。
          </p>
        </div>
        <div className="ob-x-steps">
          {STEPS.map(([n, title, body]) => (
            <Tilt key={n} className="ob-x-step">
              <span className="ob-x-step-num">{n}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </Tilt>
          ))}
        </div>
      </section>

      {/* ── 深色展厅：三种传播载体 ── */}
      <section className="ob-x-dark">
        <div className="ob-x-grain-local" aria-hidden="true" />
        <div className="ob-container ob-x-section">
          <div className="ob-x-section-head ob-x-reveal">
            <div>
              <span className="ob-x-eyebrow">ONE FACT BASE / THREE CARRIERS</span>
              <h2 className="ob-x-h2">
                一个事实版本，
                <br />
                三种传播载体。
              </h2>
            </div>
            <p className="ob-x-aside">
              网站、海报、文案共用同一份已确认事实。改一处，三处一致，不会互相打架。
            </p>
          </div>
          <div className="ob-x-panels">
            {CARRIERS.map(([name, headline, body], i) => (
              <article className="ob-x-panel ob-x-reveal" key={name}>
                <span className="ob-x-panel-idx">
                  0{i + 1} / {name}
                </span>
                <h3>
                  {headline.map((line, j) => (
                    <span key={line}>
                      {line}
                      {j < headline.length - 1 ? <br /> : null}
                    </span>
                  ))}
                </h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── 边界说明（保留既有合规表述）── */}
      <section className="ob-container ob-x-section">
        <div className="ob-x-section-head ob-x-reveal">
          <div>
            <span className="ob-x-eyebrow">BUILT FOR YOUR PRODUCT</span>
            <h2 className="ob-x-h2">
              做宣传素材，
              <br />
              也把交付做清楚。
            </h2>
          </div>
          <div>
            <p className="ob-x-aside" style={{ borderLeft: 'none', paddingLeft: 0 }}>
              适合品牌、厂家、商家及个人的产品或服务展示。不包含广告投放、商品交易、物流或销量承诺。
            </p>
            <Link href="/pricing" className="ob-text-link" style={{ marginTop: 18 }}>
              查看套餐权益与交付范围 →
            </Link>
          </div>
        </div>
      </section>

      {/* ── 结语 CTA ── */}
      <section className="ob-container ob-x-section" style={{ paddingTop: 0 }}>
        <div className="ob-x-close ob-x-reveal">
          <h2 className="ob-x-close-title">
            让它被
            <em>认真看见。</em>
          </h2>
          <Magnetic strength={0.28}>
            <Link href="/pricing" className="ob-x-btn ob-x-btn--lg">
              开始我的宣传项目
              <span aria-hidden="true">↗</span>
            </Link>
          </Magnetic>
        </div>
      </section>
    </main>
  );
}
