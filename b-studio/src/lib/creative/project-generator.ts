import {
  projectSeedSchema,
  type Asset,
  type ProductFact,
  type ProjectSeed,
  type StyleId,
} from '../../types/contracts';

/**
 * 本地「描述 → 项目」生成器。
 *
 * 这是 B 组的渲染/合同演示实现：把用户填写的产品描述转换成受控的 ProjectSeed，
 * 再交给现有的 SiteSpec / PosterSpec 组合器。它不调用模型、不编造描述中不存在的事实。
 * 正式环境应由 A 组 MiMo 产出同一结构的 JSON，再由这里同样的 Zod 合同校验。
 */
export interface BriefInput {
  name: string;
  brand?: string;
  price?: string;
  category?: string;
  scenario?: string;
  description: string;
  styleHint?: StyleId | 'auto';
}

export interface GenerateOptions {
  suffix?: string;
  existingSlugs?: string[];
}

export interface GeneratedProject {
  seed: ProjectSeed;
  recommendedStyleId: StyleId;
  notes: string[];
  missing: string[];
}

const STYLE_ORDER: StyleId[] = ['editorial-minimal', 'future-tech', 'young-vibrant'];

function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const META_SENTENCE = /^(品牌|价格|售价|定价|指导价|单价|联系方式|电话|地址)[：:]/;

function pickSummary(text: string, fallback: string): string {
  const sentences = splitSentences(text);
  const candidate = sentences.find((sentence) => !META_SENTENCE.test(sentence) && sentence.length >= 6) ?? sentences[0];
  const summary = (candidate ?? text).trim() || fallback;
  return summary.length > 120 ? summary.slice(0, 120) : summary;
}

function featureTitle(sentence: string, index: number): string {
  const clause = sentence.split(/[，,、；;：:]/)[0].trim();
  if (!clause) return `产品说明 ${index + 1}`;
  return clause.length > 14 ? clause.slice(0, 14) : clause;
}

function inferCategory(text: string): string {
  const rules: [RegExp, string][] = [
    [/汽车|轿车|SUV|新能源车|车型|座驾/i, '汽车'],
    [/咖啡|茶饮|饮料|零食|面包|食品|酒|巧克力/i, '食品饮料'],
    [/鞋|服装|衣服|包|帽|配饰|穿搭/i, '服饰'],
    [/手机|电脑|耳机|相机|音箱|数码|键盘|平板/i, '数码'],
    [/沙发|椅|桌|柜|床|家具|书架|茶几|家居/i, '家居'],
    [/灯|香|护肤|美妆|洗护/i, '生活方式'],
  ];
  for (const [pattern, category] of rules) {
    if (pattern.test(text)) return category;
  }
  return '产品';
}

function inferArt(text: string): Asset['art'] {
  if (/汽车|轿车|SUV|车/.test(text)) return 'car';
  if (/椅/.test(text)) return 'chair';
  if (/沙发/.test(text)) return 'sofa';
  if (/桌|茶几|边几|餐桌|书桌/.test(text)) return 'table';
  if (/柜|架|书架/.test(text)) return 'shelf';
  if (/咖啡|豆|茶/.test(text)) return 'beans';
  return 'abstract';
}

function inferStyle(input: BriefInput, category: string, text: string): StyleId {
  if (input.styleHint && input.styleHint !== 'auto') return input.styleHint;
  if (/汽车|数码|科技|耳机|相机|电脑|手机/i.test(`${category}${text}`)) return 'future-tech';
  if (/咖啡|食品|饮料|潮|运动|年轻|穿搭|鞋|美妆/i.test(`${category}${text}`)) return 'young-vibrant';
  return 'editorial-minimal';
}

function inferPriceType(price: string): ProductFact['priceType'] {
  if (/起/.test(price)) return 'starting_at';
  if (/指导价/.test(price)) return 'guide_price';
  return 'fixed';
}

/** 从描述里提取客户写明的价格；提取不到就返回空，由调用方标记“待确认”。 */
function extractPrice(text: string): string {
  const direct = text.match(/(?:¥|￥)\s*\d+(?:\.\d+)?(?:\s*(?:\/|每)\s*[^\s，。；,;、]+)?/);
  if (direct) return direct[0].replace(/\s+/g, ' ').trim();
  const chinese = text.match(/(?:价格|售价|定价|单价|指导价)[^\d]{0,8}(\d+(?:\.\d+)?)\s*(万元|万|元|块)(?:\s*(?:\/|每)\s*[^\s，。；,;、]+)?/);
  if (chinese) {
    const unit = chinese[2] === '元' || chinese[2] === '块' ? '' : ` ${chinese[2]}`;
    return `¥${chinese[1]}${unit}`;
  }
  return '';
}

/** 只识别明确写出的品牌，例如“品牌：MIST ROASTERY”“来自 LUMEN”。 */
function extractBrand(text: string): string {
  const labeled = text.match(/(?:品牌|来自)\s*[：:为叫]?\s*([A-Za-z0-9][A-Za-z0-9 &·.\-]{1,24}|[\u4e00-\u9fa5A-Za-z0-9·]{2,16})/);
  if (!labeled) return '';
  return labeled[1].trim().replace(/[，。；,;].*$/, '');
}

function makeSuffix(existingSlugs: string[], forced?: string): string {
  const taken = new Set(existingSlugs);
  let suffix = forced?.trim() || Math.random().toString(36).slice(2, 7);
  while (!suffix || taken.has(`custom-${suffix}`)) {
    suffix = Math.random().toString(36).slice(2, 7);
  }
  return suffix;
}

export function generateProjectFromBrief(input: BriefInput, options: GenerateOptions = {}): GeneratedProject {
  const name = input.name.trim();
  if (!name) throw new Error('请填写产品名称');
  const description = input.description.trim();
  if (!description) throw new Error('请描述你的产品');

  const brand = input.brand?.trim() || extractBrand(description);
  const price = input.price?.trim() || extractPrice(description);
  const scenario = input.scenario?.trim() ?? '';
  const category = input.category?.trim() || inferCategory(`${name} ${description}`);
  const text = `${name} ${category} ${description}`;
  const recommendedStyleId = inferStyle(input, category, text);
  const suffix = makeSuffix(options.existingSlugs ?? [], options.suffix);
  const id = `custom-${suffix}`;
  const summary = pickSummary(description, name);
  const missing: string[] = [];
  if (!brand) missing.push('品牌');
  if (!price) missing.push('价格');

  const fact = (
    key: string,
    label: string,
    value: string,
    verified: boolean,
    extra: Partial<ProductFact> = {},
  ): ProductFact => ({ key, label, value, verified, source: 'customer', ...extra });

  const facts: Record<string, ProductFact> = {
    'product.name': fact('product.name', '产品名称', name, true),
    'product.description': fact('product.description', '产品介绍', summary, true),
    'product.brand': brand
      ? fact('product.brand', '品牌', brand, true)
      : fact('product.brand', '品牌', '待确认', false),
    'product.price': price
      ? fact('product.price', '价格', price, true, { priceType: inferPriceType(price) })
      : fact('product.price', '价格', '价格待确认', false),
  };
  if (scenario) {
    facts['product.scenario'] = fact('product.scenario', '适用场景', scenario, true);
  }

  const asset: Asset = {
    id: `asset-${suffix}`,
    alt: `${name}的概念图形示意（非商家实拍）`,
    art: inferArt(`${name} ${category}`),
    isConcept: true,
    licenseNote: 'B 组受控图形，非商家实拍；正式交付需替换为客户授权素材',
  };

  const unknown = [
    ...(brand ? [] : ['品牌']),
    ...(price ? [] : ['价格']),
    ...(/汽车/.test(category) ? ['续航里程', '动力参数', '安全与辅助驾驶配置'] : []),
    ...(/家居/.test(category) ? (/灯/.test(text) ? ['材质', '尺寸', '光源与调光参数', '保修'] : ['材质', '尺寸', '承重']) : []),
    ...(/食品|咖啡/.test(category) ? ['产地', '配料/处理法', '保质期'] : []),
    ...(/数码/.test(category) ? ['具体型号', '核心参数', '保修政策'] : []),
    ...(!/汽车|家居|食品|咖啡|数码/.test(category) ? ['材质', '尺寸', '售后与保修'] : []),
  ].filter((item, index, list) => list.indexOf(item) === index);

  const contentSentences = splitSentences(description).filter((sentence) => !META_SENTENCE.test(sentence));
  const highlights = (contentSentences.length > 0 ? contentSentences : splitSentences(description))
    .slice(0, 2)
    .map((sentence, index) => ({ title: featureTitle(sentence, index), body: sentence }));
  if (price) highlights.push({ title: '价格信息', body: `已确认价格为 ${price}。` });
  highlights.push({ title: '资料边界', body: '未在描述中出现的材质、尺寸、性能与优惠不会写入宣传。' });
  if (highlights.length < 2) highlights.push({ title: '产品说明', body: summary });

  const hashtags = [`#${category.replace(/\s+/g, '')}`, `#${name.replace(/\s+/g, '')}`];
  if (brand) hashtags.push(`#${brand.replace(/\s+/g, '')}`);

  const seed: ProjectSeed = {
    id,
    slug: id,
    name: `${name}宣传项目`,
    brand: brand || '待确认品牌',
    category,
    scenario: scenario || `${category}产品`,
    summary,
    story: `${description}\n\n未在描述中出现的材质、尺寸、性能与优惠，不会由系统补写。`,
    highlights,
    hashtags: hashtags.filter((tag, index, list) => list.indexOf(tag) === index),
    factVersion: 1,
    products: [
      {
        id: `product-${suffix}`,
        name,
        summary,
        price: price || '价格待确认',
        priceLabel: price ? '已确认价格' : '价格',
        facts,
        assetRefs: [asset.id],
        unknown,
      },
    ],
    assets: [asset],
    designStyles: [recommendedStyleId, ...STYLE_ORDER.filter((style) => style !== recommendedStyleId)],
    constraints: [
      '由本地描述生成器创建：只使用你提供的信息',
      '没有商家实拍，使用带标注的概念图形',
      '未确认的材质、参数与优惠不会写入宣传',
    ],
    demoNote: '由本地描述生成；正式环境由 A 组 MiMo 生成同结构 JSON，B 组负责渲染与质检。',
    publishedSlug: id,
  };

  const parsedSeed = projectSeedSchema.parse(seed);
  const styleName = recommendedStyleId === 'future-tech' ? '未来科技' : recommendedStyleId === 'young-vibrant' ? '年轻活力' : '精致极简';
  const notes = [
    `已按「${name}」生成网站、两种海报与配套文案。`,
    `推荐视觉方向：${styleName}，可在工作台切换另外两套。`,
    ...(brand ? [] : ['品牌未填写，页面会标注「待确认品牌」。']),
    ...(price ? [] : ['价格未填写，网站与海报会显示「价格待确认」，不会猜测金额。']),
    '当前使用概念图形；拿到授权实拍后可替换素材并重新导出。',
  ];

  return { seed: parsedSeed, recommendedStyleId, notes, missing };
}

