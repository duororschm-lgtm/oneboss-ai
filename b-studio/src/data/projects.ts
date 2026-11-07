import type { Asset, ProductFact, ProjectSeed, StyleId } from '../types/contracts';

const fact = (key: string, label: string, value: string, extra: Partial<ProductFact> = {}): ProductFact => ({
  key,
  label,
  value,
  verified: true,
  source: 'customer',
  ...extra,
});

const chairAsset: Asset = {
  id: 'chair-concept',
  alt: '原木家用椅的图形示意，浅米色背景下的木质扶手椅',
  art: 'chair',
  isConcept: true,
  licenseNote: 'B 组受控图形，非商家实拍；正式交付需替换为已授权实拍',
};

const carAsset: Asset = {
  id: 'car-front-concept',
  alt: '示例轿车正面轮廓的图形示意，非真实车型照片',
  art: 'car',
  isConcept: true,
  licenseNote: 'B 组受控图形，非真实车型照片',
};

const carAssetSide: Asset = {
  id: 'car-side-concept',
  alt: '示例轿车侧面轮廓的图形示意，非真实车型照片',
  art: 'car',
  isConcept: true,
  licenseNote: 'B 组受控图形，非真实车型照片',
};

const tableAsset: Asset = {
  id: 'table-concept',
  alt: '原木边几的图形示意',
  art: 'table',
  isConcept: true,
  licenseNote: 'B 组受控图形，非商家实拍',
};

const shelfAsset: Asset = {
  id: 'shelf-concept',
  alt: '原木开放书架的图形示意',
  art: 'shelf',
  isConcept: true,
  licenseNote: 'B 组受控图形，非商家实拍',
};

const coffeeAsset: Asset = {
  id: 'beans-concept',
  alt: '咖啡豆包装的抽象图形示意',
  art: 'beans',
  isConcept: true,
  licenseNote: 'B 组受控图形，非商家实拍',
};

const chair: ProjectSeed = {
  id: 'demo-chair-001',
  slug: 'demo-chair-001',
  name: '原木家用椅宣传项目',
  brand: 'ONE LIVING',
  category: '家居',
  scenario: '餐区与书房',
  summary: '为日常餐叙与安静阅读留出一把简洁的原木坐椅。',
  story: 'ONE LIVING 是一个演示用家居品牌。本次项目只使用客户已确认的名称、价格与场景信息，材质、尺寸和承重等待补充，设计系统不会替客户补写这些内容。',
  highlights: [
    { title: '简洁坐椅', body: '适合餐区与书房等日常场景。' },
    { title: '价格透明', body: '当前已确认价格为 {{price}}。' },
    { title: '资料边界', body: '材质与尺寸待客户确认后补充，不写入宣传。' },
  ],
  hashtags: ['#家居灵感', '#原木家具', '#日常好物'],
  factVersion: 1,
  products: [
    {
      id: 'chair-01',
      name: '原木家用椅',
      summary: '为日常餐叙与安静阅读留出一把简洁的坐椅。',
      price: '¥129 / 把',
      priceLabel: '已确认价格',
      facts: {
        'product.name': fact('product.name', '产品名称', '原木家用椅'),
        'product.brand': fact('product.brand', '品牌', 'ONE LIVING'),
        'product.price': fact('product.price', '已确认价格', '¥129 / 把', { priceType: 'fixed' }),
        'product.scenario': fact('product.scenario', '适用场景', '餐区与书房'),
        'product.description': fact('product.description', '产品介绍', '为日常餐叙与安静阅读留出一把简洁的坐椅。'),
      },
      assetRefs: [chairAsset.id],
      unknown: ['材质', '尺寸', '承重'],
    },
  ],
  assets: [chairAsset],
  designStyles: ['editorial-minimal', 'future-tech', 'young-vibrant'],
  constraints: ['没有商家实拍图，必须使用带标注的概念图形', '材质、尺寸、承重未确认，不得写入宣传'],
  demoNote: '椅子 fixture：用于验证轮播、参数、海报和修改范围；价格来自演示事实库。',
  publishedSlug: 'one-living-chair',
};

const car: ProjectSeed = {
  id: 'demo-car-002',
  slug: 'demo-car-002',
  name: '示例轿车宣传项目',
  brand: 'NOVA MOTORS',
  category: '汽车',
  scenario: '演示车型',
  summary: '一台用于展示宣传版式的示例轿车，指导价 18.98 万元。',
  story: '本项目是汽车品类的演示 fixture：只知道品牌、车型名和指导价。续航、动力、安全配置等参数尚未确认，网站和海报都会把未知信息留空，而不是编造数字。',
  highlights: [
    { title: '演示车型', body: '仅用于验证汽车品类的宣传版式。' },
    { title: '指导价', body: '已确认指导价为 {{price}}。' },
    { title: '参数边界', body: '续航、动力与安全配置待客户确认，不写入宣传。' },
  ],
  hashtags: ['#汽车设计', '#新车发布', '#生活美学'],
  factVersion: 1,
  products: [
    {
      id: 'nova-c7',
      name: '曜石 C7',
      summary: '示例轿车车型，用于验证深色、参数优先的汽车视觉。',
      price: '指导价 ¥18.98 万',
      priceLabel: '已确认指导价',
      facts: {
        'product.name': fact('product.name', '车型名称', '曜石 C7'),
        'product.brand': fact('product.brand', '品牌', 'NOVA MOTORS'),
        'product.price': fact('product.price', '指导价', '指导价 ¥18.98 万', { priceType: 'guide_price' }),
        'product.description': fact('product.description', '车型定位', '示例轿车车型，仅用于宣传版式演示。'),
      },
      assetRefs: [carAsset.id, carAssetSide.id],
      unknown: ['续航里程', '动力参数', '安全与辅助驾驶配置'],
    },
  ],
  assets: [carAsset, carAssetSide],
  designStyles: ['future-tech', 'editorial-minimal', 'young-vibrant'],
  constraints: ['不得编造续航、动力、碰撞成绩或辅助驾驶能力', '真实车型图片需客户提供授权素材'],
  demoNote: '汽车 fixture：验证“未知参数保持待确认”和深色科技风格。',
  publishedSlug: 'nova-c7',
};

const coffee: ProjectSeed = {
  id: 'demo-noimg-003',
  slug: 'demo-noimg-003',
  name: '无图咖啡豆宣传项目',
  brand: 'MIST ROASTERY',
  category: '咖啡',
  scenario: '日常手冲',
  summary: '中浅烘焙的日常咖啡豆，只有名称、价格和一句介绍。',
  story: '客户只提供了名称、价格和一句介绍，没有图片。网站使用纯文字与几何版式，海报使用图文模板，并明确标注“概念图形 · 非实拍”，不生成假的商品照片。',
  highlights: [
    { title: '日常手冲', body: '中浅烘焙，适合手冲的日常咖啡豆。' },
    { title: '价格透明', body: '已确认价格为 {{price}}。' },
    { title: '资料边界', body: '产地、处理法与风味描述待客户确认。' },
  ],
  hashtags: ['#咖啡日常', '#手冲咖啡', '#周末生活'],
  factVersion: 1,
  products: [
    {
      id: 'mist-beans',
      name: '晨雾咖啡豆',
      summary: '中浅烘焙，适合手冲的日常咖啡豆。',
      price: '¥68 / 200g',
      priceLabel: '已确认价格',
      facts: {
        'product.name': fact('product.name', '产品名称', '晨雾咖啡豆'),
        'product.brand': fact('product.brand', '品牌', 'MIST ROASTERY'),
        'product.price': fact('product.price', '已确认价格', '¥68 / 200g', { priceType: 'fixed' }),
        'product.description': fact('product.description', '产品介绍', '中浅烘焙，适合手冲的日常咖啡豆。'),
      },
      assetRefs: [],
      unknown: ['产地', '处理法', '风味描述'],
    },
  ],
  assets: [],
  designStyles: ['editorial-minimal', 'young-vibrant', 'future-tech'],
  constraints: ['没有图片素材，使用图文海报与文字主导的网站', '不得生成或声称真实商品照片'],
  demoNote: '无图 fixture：验证图文兜底与“不伪造实拍”的约束。',
  publishedSlug: 'mist-roast',
};

const linwood: ProjectSeed = {
  id: 'demo-multi-004',
  slug: 'demo-multi-004',
  name: 'LINWOOD 三款家具项目',
  brand: 'LINWOOD',
  category: '家居',
  scenario: '客厅与书房',
  summary: '同一品牌的三款原木家具，共用一套品牌风格，各自有独立价格。',
  story: 'LINWOOD 演示项目包含三款产品：扶手椅、边几和开放书架。多产品站点以品牌首页加商品卡进入详情，而不是为每款产品生成互不相关的单页。',
  highlights: [
    { title: '同一品牌风格', body: '三款原木家具共用一套品牌视觉。' },
    { title: '价格透明', body: '三款产品价格均为客户已确认信息。' },
    { title: '资料边界', body: '材质与尺寸待补充后统一更新。' },
  ],
  hashtags: ['#原木家居', '#家具搭配', '#品牌故事'],
  factVersion: 1,
  products: [
    {
      id: 'linwood-chair',
      name: '原木扶手椅',
      summary: '适合阅读角的原木扶手椅。',
      price: '¥129 / 把',
      priceLabel: '已确认价格',
      facts: {
        'product.name': fact('product.name', '产品名称', '原木扶手椅'),
        'product.brand': fact('product.brand', '品牌', 'LINWOOD'),
        'product.price': fact('product.price', '已确认价格', '¥129 / 把', { priceType: 'fixed' }),
        'product.description': fact('product.description', '产品介绍', '适合阅读角的原木扶手椅。'),
      },
      assetRefs: [chairAsset.id],
      unknown: ['材质', '尺寸'],
    },
    {
      id: 'linwood-table',
      name: '原木边几',
      summary: '沙发旁的小边几，用于放置书本与茶杯。',
      price: '¥299 / 件',
      priceLabel: '已确认价格',
      facts: {
        'product.name': fact('product.name', '产品名称', '原木边几'),
        'product.brand': fact('product.brand', '品牌', 'LINWOOD'),
        'product.price': fact('product.price', '已确认价格', '¥299 / 件', { priceType: 'fixed' }),
        'product.description': fact('product.description', '产品介绍', '沙发旁的小边几，用于放置书本与茶杯。'),
      },
      assetRefs: [tableAsset.id],
      unknown: ['材质', '尺寸'],
    },
    {
      id: 'linwood-shelf',
      name: '原木开放书架',
      summary: '靠墙摆放的开放书架，留出展示与收纳空间。',
      price: '¥899 / 件',
      priceLabel: '已确认价格',
      facts: {
        'product.name': fact('product.name', '产品名称', '原木开放书架'),
        'product.brand': fact('product.brand', '品牌', 'LINWOOD'),
        'product.price': fact('product.price', '已确认价格', '¥899 / 件', { priceType: 'fixed' }),
        'product.description': fact('product.description', '产品介绍', '靠墙摆放的开放书架，留出展示与收纳空间。'),
      },
      assetRefs: [shelfAsset.id],
      unknown: ['材质', '尺寸'],
    },
  ],
  assets: [chairAsset, tableAsset, shelfAsset],
  designStyles: ['editorial-minimal', 'young-vibrant', 'future-tech'],
  constraints: ['多产品需生成产品目录与详情，不得每款生成无关网页'],
  demoNote: '多产品 fixture：验证 product-grid 与品牌风格复用。',
  publishedSlug: 'linwood-collection',
};

export const projectSeeds: ProjectSeed[] = [chair, car, coffee, linwood];

export const defaultProjectId = chair.id;

export const projectSeedById = (id: string): ProjectSeed => {
  const seed = projectSeeds.find((project) => project.id === id);
  if (!seed) throw new Error(`未知项目 fixture: ${id}`);
  return seed;
};

export const projectSeedBySlug = (slug: string): ProjectSeed | undefined =>
  projectSeeds.find((project) => project.publishedSlug === slug || project.slug === slug);

export const stylesForProject = (seed: ProjectSeed): StyleId[] => seed.designStyles;
