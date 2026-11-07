import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ExternalLink, Image as ImageIcon, LayoutTemplate, Sparkles } from 'lucide-react';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { Badge, DemoBanner, Field, Notice } from '../components/ui';
import { useStudio } from '../lib/store';
import type { StyleId } from '../types/contracts';
import type { GeneratedProject } from '../lib/creative/project-generator';

const examples = [
  {
    label: '咖啡豆',
    values: {
      name: '晨雾咖啡豆',
      brand: 'MIST ROASTERY',
      price: '¥68 / 200g',
      category: '咖啡',
      scenario: '日常手冲',
      description:
        '中浅烘焙的日常手冲咖啡豆，适合在家慢慢冲泡。客户确认售价为 ¥68 / 200g，产地、处理法与风味描述还在补充中。',
    },
  },
  {
    label: '台灯',
    values: {
      name: '拾光台灯',
      brand: 'LUMEN',
      price: '¥399 / 台',
      category: '家居',
      scenario: '书桌与床头',
      description:
        '一盏适合书桌和床头的台灯，提供暖色阅读光。客户确认价格为 ¥399 / 台；材质、尺寸和调光参数还没有提供。',
    },
  },
  {
    label: '跑鞋',
    values: {
      name: '疾风跑鞋',
      brand: 'PACE',
      price: '¥599 / 双',
      category: '服饰',
      scenario: '城市慢跑',
      description:
        '为城市慢跑设计的轻量跑鞋，日常通勤也能穿。已确认价格 ¥599 / 双，鞋面材质和缓震参数待客户补充。',
    },
  },
];

type StyleChoice = 'auto' | StyleId;

export function Create() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { createProject, allSeeds } = useStudio();
  const [name, setName] = useState(params.get('name') ?? '');
  const [brand, setBrand] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [scenario, setScenario] = useState('');
  const [description, setDescription] = useState(params.get('d') ?? '');
  const [styleHint, setStyleHint] = useState<StyleChoice>('auto');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedProject | null>(null);

  const customProjects = allSeeds.filter((seed) => seed.id.startsWith('custom-')).slice().reverse();

  const fillExample = (example: (typeof examples)[number]) => {
    setName(example.values.name);
    setBrand(example.values.brand);
    setPrice(example.values.price);
    setCategory(example.values.category);
    setScenario(example.values.scenario);
    setDescription(example.values.description);
    setError(null);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !description.trim()) {
      setError('请至少填写产品名称和一段产品描述。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const generated = createProject({
        name,
        brand,
        price,
        category,
        scenario,
        description,
        styleHint: styleHint === 'auto' ? 'auto' : styleHint,
      });
      setResult(generated);
      navigate(`/projects/${generated.seed.id}/site?generated=1`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '生成失败，请检查输入');
    } finally {
      setBusy(false);
    }
  };

  return (
    <MarketingLayout>
      <main className="create-page">
        <header className="page-head">
          <span className="eyebrow">DESCRIBE / 生成宣传网站</span>
          <h1>
            描述你的产品，
            <br />
            生成一套宣传网站。
          </h1>
          <p>
            填产品名称、价格和一段描述，系统会生成可交互网站、两种尺寸的海报与小红书文案。
            没有提到的材质、参数与优惠不会被补写；没有实拍时使用带标注的概念图形。
          </p>
          <DemoBanner>当前为本地描述生成器（不调用 MiMo）；正式环境由 A 组 MiMo 产出同结构 JSON，再交给 B 组渲染。</DemoBanner>
        </header>

        <div className="create-layout">
          <form className="create-form" onSubmit={submit}>
            <div className="create-form-head">
              <span className="card-kicker">PRODUCT BRIEF</span>
              <h2>产品描述</h2>
            </div>

            <div className="field-row">
              <Field label="产品名称 *" hint="会出现在网站标题、海报主标题和文案里">
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：晨雾咖啡豆" />
              </Field>
              <Field label="品牌" hint="留空会标记“待确认品牌”，不会猜测">
                <input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="例如：MIST ROASTERY" />
              </Field>
            </div>

            <div className="field-row">
              <Field label="价格" hint="留空会显示“价格待确认”；不要填未经确认的金额">
                <input value={price} onChange={(event) => setPrice(event.target.value)} placeholder="例如：¥68 / 200g" />
              </Field>
              <Field label="品类" hint="不填会自动判断">
                <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="例如：咖啡 / 家居 / 汽车" />
              </Field>
            </div>

            <div className="field-row">
              <Field label="适用场景" hint="可选；会用在网站信息与文案里">
                <input value={scenario} onChange={(event) => setScenario(event.target.value)} placeholder="例如：日常手冲" />
              </Field>
              <Field label="视觉方向" hint="自动推荐会按品类选择；生成后可随时切换">
                <select value={styleHint} onChange={(event) => setStyleHint(event.target.value as StyleChoice)}>
                  <option value="auto">自动推荐</option>
                  <option value="editorial-minimal">精致极简</option>
                  <option value="future-tech">未来科技</option>
                  <option value="young-vibrant">年轻活力</option>
                </select>
              </Field>
            </div>

            <Field label="产品描述 *" hint="写清楚它是什么、适合谁、已经确认的卖点；未确认的内容可以明说“待补充”。">
              <textarea
                rows={6}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="例如：中浅烘焙的日常手冲咖啡豆，适合在家慢慢冲泡。客户确认售价为 ¥68 / 200g，产地、处理法与风味描述还在补充中。"
              />
            </Field>

            <div className="create-examples">
              <span>试试示例：</span>
              {examples.map((example) => (
                <button key={example.label} type="button" className="chip" onClick={() => fillExample(example)}>
                  {example.label}
                </button>
              ))}
            </div>

            {error && (
              <Notice tone="error" title="还不能生成">
                {error}
              </Notice>
            )}

            <div className="create-actions">
              <button type="submit" className="button primary" disabled={busy}>
                <Sparkles size={17} /> {busy ? '正在生成…' : '生成我的宣传网站'}
              </button>
              <Link className="text-link" to="/">
                先看看示例
              </Link>
            </div>

            <p className="create-note">
              当前生成器会把描述解析为一个受控项目；网站、海报、文案共用同一套已确认事实与设计基线。
              未确认项在页面中保持“待确认”，不会由模板补写。
            </p>

            {result && (
              <Notice tone="good" title="已生成">
                <ul className="plain-list">
                  {result.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
                <div className="notice-actions">
                  <Link className="button dark small" to={`/projects/${result.seed.id}/site`}>
                    打开网站
                  </Link>
                  <Link className="button ghost small" to={`/projects/${result.seed.id}/posters`}>
                    查看海报
                  </Link>
                </div>
              </Notice>
            )}
          </form>

          <aside className="create-aside">
            <section className="panel">
              <span className="card-kicker">WHAT YOU GET</span>
              <h2>生成后会得到</h2>
              <ul className="create-result-list">
                <li>
                  <LayoutTemplate size={16} />
                  <span>
                    <strong>可交互宣传网站</strong>
                    轮播、参数选项卡、CTA 与移动端布局
                  </span>
                </li>
                <li>
                  <ImageIcon size={16} />
                  <span>
                    <strong>两种尺寸的真实 PNG</strong>
                    1080×1350 与 1080×1080，带二维码与安全区
                  </span>
                </li>
                <li>
                  <Sparkles size={16} />
                  <span>
                    <strong>配套小红书文案</strong>
                    标题、正文、标签与引导语，可与海报一起下载
                  </span>
                </li>
              </ul>
              <p className="muted">生成后可以更换三套创意方向，也可以只改网站或只改海报。</p>
            </section>

            <section className="panel panel-warn">
              <span className="card-kicker">BOUNDARIES</span>
              <h2>不会做什么</h2>
              <ul className="plain-list">
                <li>不编造描述里没有的材质、尺寸、参数或优惠。</li>
                <li>没有实拍时使用概念图形，并标注“非实拍”。</li>
                <li>不调用真实 MiMo，也不生成真实商品照片。</li>
                <li>不替客户发布到小红书，也不保证平台审核通过。</li>
              </ul>
            </section>

            {customProjects.length > 0 && (
              <section className="panel">
                <span className="card-kicker">YOUR PROJECTS</span>
                <h2>已生成的项目</h2>
                <ul className="custom-project-list">
                  {customProjects.map((project) => (
                    <li key={project.id}>
                      <Link to={`/projects/${project.id}/site`}>
                        <span>
                          <strong>{project.name}</strong>
                          <small>
                            {project.category} · {project.products[0]?.price}
                          </small>
                        </span>
                        <ExternalLink size={14} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>

        <section className="create-bottom">
          <div>
            <strong>已经有明确套餐？</strong>
            <span>也可以先选择制作服务，再回到工作台补充产品资料。</span>
          </div>
          <div className="create-bottom-actions">
            <Link className="button ghost small" to="/pricing">
              查看套餐
            </Link>
            <Link className="button dark small" to="/projects/demo-chair-001/site">
              看一个成品示例
            </Link>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}
