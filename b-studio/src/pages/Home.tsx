import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, Image as ImageIcon, LayoutTemplate, ShieldCheck, Sparkles } from 'lucide-react';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { ProductArt } from '../components/site-renderer/ProductArt';
import { designPresets } from '../data/design-presets';
import { plans, formatCny } from '../data/plans';
import { projectSeedById } from '../data/projects';
import { buildPoster } from '../lib/creative/composer';
import { buildPosterSvg } from '../lib/creative/poster-renderer/svg';
import { useStudio } from '../lib/store';

const chairSeed = projectSeedById('demo-chair-001');
const homeOrigin = typeof window === 'undefined' ? 'http://localhost:5173' : window.location.origin;
const chairDesign = designPresets['editorial-minimal'];
const demoPoster = buildPoster(
  {
    seed: chairSeed,
    design: chairDesign,
    siteRevision: 1,
    posterRevision: 1,
    copyRevision: 1,
    qrUrl: `${homeOrigin}/p/one-living-chair`,
    qrSource: 'published-site',
  },
  1350,
);
const demoPosterUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildPosterSvg(demoPoster.spec, chairDesign, chairSeed))}`;

export function Home() {
  const navigate = useNavigate();
  const { createProject } = useStudio();
  const [quickName, setQuickName] = useState('');
  const [quickBrief, setQuickBrief] = useState('');
  const [quickError, setQuickError] = useState<string | null>(null);

  const generateQuick = (event: React.FormEvent) => {
    event.preventDefault();
    if (!quickName.trim() || !quickBrief.trim()) {
      setQuickError('请填写产品名称和一句描述。');
      return;
    }
    try {
      const generated = createProject({ name: quickName, description: quickBrief });
      navigate(`/projects/${generated.seed.id}/site?generated=1`);
    } catch (reason) {
      setQuickError(reason instanceof Error ? reason.message : '生成失败');
    }
  };

  return (
    <MarketingLayout>
      <main className="marketing">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">ONEBOSS / AI CREATIVE PRODUCTION</span>
            <h1>
              让产品被看见，
              <br />
              <em>让品牌被记住。</em>
            </h1>
            <p className="hero-lead">
              为商家、厂家与品牌方制作可交互宣传网站、高清 PNG 海报、二维码与小红书配套文案。
              你只需要确认产品事实，剩下的排版、导出和版本管理交给我们。
            </p>
            <div className="hero-actions">
              <Link className="button primary" to="/create">
                描述产品，生成网站 <Sparkles size={17} />
              </Link>
              <Link className="button ghost" to="/projects/demo-chair-001/site">
                查看成品示例 <ArrowRight size={17} />
              </Link>
            </div>
            <ul className="hero-trust">
              <li>
                <Check size={15} /> 真实 React 交互网站
              </li>
              <li>
                <Check size={15} /> 1080×1350 / 1080×1080 真 PNG
              </li>
              <li>
                <Check size={15} /> 一套事实版本贯穿全部作品
              </li>
            </ul>
          </div>

          <div className="hero-art" aria-label="作品组合预览">
            <div className="browser-frame">
              <div className="browser-bar">
                <i />
                <i />
                <i />
                <span>oneboss.ai/p/one-living-chair</span>
              </div>
              <div className="mini-site">
                <div className="mini-nav">
                  <strong>ONE LIVING</strong>
                  <span>视觉 · 特点 · 信息</span>
                </div>
                <div className="mini-hero">
                  <div>
                    <small>HOME OBJECT 01</small>
                    <h3>原木家用椅</h3>
                    <p>为日常餐叙与安静阅读留出一把简洁的坐椅。</p>
                    <strong>¥129 / 把</strong>
                  </div>
                  <ProductArt asset={chairSeed.assets[0]} palette={chairDesign.palette} styleId={chairDesign.styleId} />
                </div>
                <div className="mini-strip">
                  <span>轮播</span>
                  <span>参数切换</span>
                  <span>移动端可用</span>
                </div>
              </div>
            </div>
            <figure className="poster-float">
              <img src={demoPosterUrl} alt="由海报渲染器实时生成的 1080×1350 示例海报" />
              <figcaption>
                <strong>1080 × 1350</strong>
                <span>真实渲染 · 含二维码</span>
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="generator-band" id="generate">
          <div className="generator-copy">
            <span className="eyebrow">DESCRIBE → GENERATE</span>
            <h2>
              把产品描述丢进来，
              <br />
              生成一套能打开的宣传网站。
            </h2>
            <p>
              不用先选套餐，也不用从模板里挑。写清楚产品是什么、已经确认的价格和卖点，
              网站、海报与文案会一起生成；没提到的信息保持“待确认”。
            </p>
            <ul className="generator-points">
              <li>没有实拍也能生成，使用带标注的概念图形</li>
              <li>三套创意方向可切换，不满意可以改</li>
              <li>价格、品牌留空不会被猜测</li>
            </ul>
          </div>
          <form className="generator-form" onSubmit={generateQuick}>
            <label htmlFor="quick-name">产品名称</label>
            <input
              id="quick-name"
              value={quickName}
              onChange={(event) => setQuickName(event.target.value)}
              placeholder="例如：晨雾咖啡豆"
            />
            <label htmlFor="quick-brief">一句话描述</label>
            <textarea
              id="quick-brief"
              rows={4}
              value={quickBrief}
              onChange={(event) => setQuickBrief(event.target.value)}
              placeholder="例如：中浅烘焙的日常手冲咖啡豆，适合在家慢慢冲泡；已确认价格 ¥68 / 200g，产地与处理法待补充。"
            />
            <div className="generator-actions">
              <button className="button primary" type="submit">
                生成我的宣传网站 <ArrowRight size={16} />
              </button>
              <Link className="button ghost" to="/create">
                补充品牌 / 价格
              </Link>
            </div>
            {quickError && <p className="generator-error">{quickError}</p>}
            <small>本地生成器演示，不调用 MiMo；正式环境由 A 组模型生成同结构数据。</small>
          </form>
        </section>

        <section className="deliverables" id="deliverables">
          <div className="band-head">
            <span className="eyebrow">ACTUAL DELIVERABLES</span>
            <h2>
              不是设计稿。
              <br />
              是能直接使用的宣传作品。
            </h2>
            <p>网站、海报与文案共用同一套设计基线和产品事实版本，修改时只动指定作品。</p>
          </div>
          <div className="deliverable-grid">
            <article className="deliverable-card site">
              <div className="deliverable-visual">
                <div className="mini-browser">
                  <div className="mini-browser-bar">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="mini-browser-body">
                    <span>ONE LIVING</span>
                    <h4>原木家用椅</h4>
                    <div className="mini-line" />
                    <div className="mini-line short" />
                  </div>
                </div>
              </div>
              <div className="deliverable-copy">
                <span className="card-kicker">
                  <LayoutTemplate size={15} /> 交付物 01
                </span>
                <h3>可交互宣传网站</h3>
                <p>轮播、参数选项卡、产品目录、锚点导航与移动端布局，全部是真实 React 组件，不是一张长图。</p>
                <Link to="/projects/demo-chair-001/site" className="text-link">
                  打开交互演示 <ArrowUpRight size={15} />
                </Link>
              </div>
            </article>

            <article className="deliverable-card poster">
              <div className="deliverable-visual poster-visual">
                <img src={demoPosterUrl} alt="示例海报缩略图" />
              </div>
              <div className="deliverable-copy">
                <span className="card-kicker">
                  <ImageIcon size={15} /> 交付物 02
                </span>
                <h3>高清 PNG 海报</h3>
                <p>竖版与方版分别重新排版，不靠裁切。二维码默认右下，与价格/主图冲突时自动移到左下。</p>
                <Link to="/projects/demo-chair-001/posters" className="text-link">
                  查看并下载 PNG <ArrowUpRight size={15} />
                </Link>
              </div>
            </article>

            <article className="deliverable-card copy">
              <div className="deliverable-visual copy-visual">
                <span>小红书配文 · 事实版本 V1</span>
                <h4>原木家用椅｜家居里的安静提案</h4>
                <p>为日常餐叙与安静阅读留出一把简洁的坐椅。已确认价格：¥129 / 把。材质、尺寸尚未确认，我们不会在宣传里补写。</p>
                <div className="tag-row">
                  <span>#家居灵感</span>
                  <span>#原木家具</span>
                  <span>#日常好物</span>
                </div>
              </div>
              <div className="deliverable-copy">
                <span className="card-kicker">
                  <ShieldCheck size={15} /> 交付物 03
                </span>
                <h3>同源小红书文案</h3>
                <p>每张海报绑定标题、正文、标签与引导语，金额与网站、海报完全一致，可一键复制或下载 Markdown。</p>
                <Link to="/projects/demo-chair-001/delivery" className="text-link">
                  打开交付中心 <ArrowUpRight size={15} />
                </Link>
              </div>
            </article>
          </div>
        </section>

        <section className="proof-strip" aria-label="能力数据">
          <div>
            <strong>3</strong>
            <span>套真正不同的创意方向</span>
          </div>
          <div>
            <strong>2</strong>
            <span>种独立排版的海报尺寸</span>
          </div>
          <div>
            <strong>4</strong>
            <span>组 fixture：椅子 / 汽车 / 无图 / 多产品</span>
          </div>
          <div>
            <strong>0</strong>
            <span>张伪造的商家实拍或性能参数</span>
          </div>
        </section>

        <section className="process" id="process">
          <div className="band-head">
            <span className="eyebrow">HOW IT WORKS</span>
            <h2>从产品资料到完整交付</h2>
          </div>
          <ol className="process-list">
            {[
              ['01', '提供资料', '上传图片，确认名称、价格与场景；未确认的信息保持“待确认”。'],
              ['02', '选择方向', '创意总监给出 2–3 套在构图、层级与动效上真正不同的方案。'],
              ['03', '预览与修改', '网站、海报分别预览；自然语言修改只作用到指定作品。'],
              ['04', '获得交付', '公开网站链接、PNG 海报、二维码、文案与 ZIP 交付包。'],
            ].map(([index, title, body]) => (
              <li key={index}>
                <span>{index}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="demo-projects">
          <div className="band-head">
            <span className="eyebrow">FIXTURES</span>
            <h2>四种真实产品形态，同一套渲染引擎</h2>
            <p>每套 fixture 都带明确标注：概念图形不是商家实拍，未知参数不会被补写。</p>
          </div>
          <div className="project-chip-grid">
            {[
              ['demo-chair-001', '椅子 · 单品', '1 张概念图，轮播与参数切换', 'editorial'],
              ['demo-car-002', '汽车 · 指导价', '18.98 万，续航等参数保持待确认', 'tech'],
              ['demo-noimg-003', '无图产品', '只有名称、价格与一句介绍', 'plain'],
              ['demo-multi-004', '多产品系列', '3 款家具，品牌页 + 产品目录', 'multi'],
            ].map(([id, title, body]) => (
              <Link className="project-chip" key={id} to={`/projects/${id}/creative`}>
                <span>{title}</span>
                <strong>{body}</strong>
                <em>
                  进入工作台 <ArrowRight size={14} />
                </em>
              </Link>
            ))}
          </div>
        </section>

        <section className="plans-teaser">
          <div className="band-head">
            <span className="eyebrow">PRICING</span>
            <h2>按本次发布选择制作套餐</h2>
            <p>价格由 A 组服务端套餐目录返回，前端不锁价。演示环境不会产生真实扣款。</p>
          </div>
          <div className="teaser-grid">
            {plans.map((plan) => (
              <article key={plan.code} className={plan.featured ? 'featured' : ''}>
                <span className="plan-code">{plan.code.toUpperCase()}</span>
                <h3>{plan.name}</h3>
                <div className="teaser-price">
                  <strong>{formatCny(plan.priceMinor)}</strong>
                  <span>/ 次</span>
                </div>
                <p>{plan.description}</p>
                <Link to={`/checkout?plan=${plan.code}`} className={plan.featured ? 'button light' : 'button ghost'}>
                  选择套餐 <ArrowRight size={15} />
                </Link>
              </article>
            ))}
          </div>
          <Link className="text-link" to="/pricing">
            查看完整权益对比 <ArrowRight size={15} />
          </Link>
        </section>

        <section className="faq">
          <div className="band-head">
            <span className="eyebrow">FAQ</span>
            <h2>关于服务边界</h2>
          </div>
          <div className="faq-list">
            <details open>
              <summary>OneBoss 会替商家卖货吗？</summary>
              <p>不会。我们交付宣传网站、海报、二维码与文案，不承接商品交易、库存物流、广告投放或 3D 建模。</p>
            </details>
            <details>
              <summary>没有产品照片怎么办？</summary>
              <p>使用图文与几何版式，并明确标注“概念图形 · 非实拍”。我们不会生成或声称任何真实商品照片。</p>
            </details>
            <details>
              <summary>修改会同时改网站和海报吗？</summary>
              <p>不会。系统先解析修改意图：“网站改黑金，海报不动”只会生成网站新版本；价格等商品事实变更必须经过事实审核，并提示全部受影响作品。</p>
            </details>
            <details>
              <summary>二维码指向哪里？</summary>
              <p>演示环境指向本地的发布预览路由；正式交付前必须替换为 A 组已验证的公开 HTTPS 网址，扫码验证通过后才算完成。</p>
            </details>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}

