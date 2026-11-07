# OneBoss AI V7 · B 组创意制作工作台

OneBoss 是一家 AI 创意宣传制作公司，客户购买的是「宣传网站 + 高清海报 + 二维码 + 小红书文案」的制作服务。本仓库是 **B 组** 的创意渲染与客户工作台实现，重点是两个 P0 能力：

1. **真实交互宣传网站**：`SiteSpec` + `DesignSystem` 驱动的 React 渲染器，不是长图、不是 HTML 字符串。
2. **真实高清 PNG 海报**：同一份海报 SVG 在浏览器经 Canvas、在 Node 经 Sharp 输出 1080×1350 / 1080×1080 PNG，二维码由最终像素反解验证。

> 当前为**演示实现**：订单/套餐使用 A 组接口的本地适配层，MiMo 调用、支付、正式发布与文件存储由 A 组负责。演示发布地址是本机路由，不代表真实客户交付。

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5173
```

其他命令：

| 命令 | 作用 |
| --- | --- |
| `npm run build` | TypeScript 检查 + Vite 生产构建 |
| `npm test` | 34 个合同 / 生成器 / 组合器 / 二维码几何 / PNG + jsQR 回归测试 |
| `npm run render:posters` | Node + Sharp 导出 24 张真实 PNG、独立二维码、文案与 manifest 到 `public/output/` |
| `npm run qa:visual` | Playwright（Python）跨 375/768/1280 截图与冒烟检查，输出 `docs/screenshots/` |

## 演示路径

| 路由 | 内容 |
| --- | --- |
| `/` | 公司首页：服务定位、一句话生成入口、真实交付物、流程、套餐 |
| `/create` | 描述产品 → 生成网站：名称、品牌、价格、描述与视觉方向 |
| `/pricing` | 三档套餐与权益对比（演示数据来自 A 组接口适配层） |
| `/checkout?plan=growth` | 报价 → 演示订单 → 沙箱支付 / 人工核验 |
| `/orders` | 支付状态与制作状态分离的订单列表 |
| `/projects/demo-chair-001/intake` | 事实核对：已确认 / 待确认 / 客户会补充 / 跳过 |
| `/projects/demo-chair-001/creative` | 三套真正不同的创意方向（构图、章节、动效） |
| `/projects/demo-chair-001/site` | 真实交互网站预览与演示发布（桌面 / 平板 / 手机） |
| `/projects/demo-chair-001/posters` | 两种尺寸海报、安全区、二维码位置、PNG / SVG / QR 下载、文案 |
| `/projects/demo-chair-001/revise` | 自然语言修改 → 影响范围 → 预览版本 → 批准 / 驳回 |
| `/projects/demo-chair-001/delivery` | 交付中心：网站、海报、文案、二维码、真实 ZIP 与验收 |
| `/projects/demo-chair-001/agents` | 8 个 AI 角色的运行记录界面（演示事件，非真实 MiMo） |
| `/p/one-living-chair` | 已发布的演示宣传网站（可直接打开，也是二维码目标） |

三个额外 fixture 可验证不同品类与兜底：

- `/projects/demo-car-002/creative`：汽车指导价，未知参数保持“待确认”
- `/projects/demo-noimg-003/creative`：无图产品，文字与几何版式兜底
- `/projects/demo-multi-004/creative`：三款家具，产品目录 + 详情切换

工作台右上角的「重置演示」会清空 `localStorage` 中的演示状态（键：`oneboss.demo.state.v3`）。

## 已实现的核心能力

### 描述 → 项目生成器

- 首页可直接填「产品名称 + 一句话描述」生成网站；`/create` 还支持品牌、价格、品类、场景与视觉方向。
- 从描述中提取明确写出的品牌（“品牌：…”）与价格（“¥68 / 200g”“售价 68 元”），提取不到则标记“待确认”，不猜金额。
- 按品类/描述推断概念图形（椅子 / 汽车 / 咖啡豆 / 家具 / 抽象）与推荐视觉方向；没有实拍时使用带标注的概念图形。
- 生成结果是一个受控 `ProjectSeed`，新增项目会出现在工作台切换器、订单项目选择、公开站点路由中，并持久化在 localStorage。
- 这是本地确定性生成器，不调用 MiMo；正式环境由 A 组 MiMo 输出同结构 JSON 后走同一套 Zod 合同与渲染器。

### 网站渲染器

- 受控章节：`hero / gallery / features / specs / products / story / cta`，全部来自 `SiteSpec`，不接受任意 HTML/JS。
- 真实交互：轮播（点击、键盘、触摸滑动）、参数选项卡（ARIA + 方向键）、产品目录切换、锚点导航、滚动入场。
- 单图项目不显示不可操作的轮播按钮；无图项目自动省略图库并使用文字主视觉。
- 三套视觉方向在 Hero 构图、章节顺序、卡片语言与动效上有实质差异，不只是换色。
- 375 / 768 / 1280 均无横向溢出；遵循 `prefers-reduced-motion`。

### 海报渲染器

- 同一份 SVG 构建函数服务浏览器与 Node，避免“两套海报真相”。
- 三种版式：`editorial-premium`、`future-grid`、`bold-editorial`；竖版与方版分别重排。
- 二维码默认右下，和主图/价格/标题冲突时自动移到左下；两侧都冲突时给出 warning 并选择重叠更小的一侧。
- 二维码带 4 模块静区、白色卡片与引导语；`jsQR` 从最终 PNG 像素反解出同一个 URL。
- 中文字体使用系统 CJK 字体栈；导入后会自动限宽/断行，避免标题、价格、二维码说明溢出。
- 提供安全区可视化、PNG / SVG / 独立二维码下载与每个海报对应的 `PosterCopyBundle`。

### 修改与版本

- 自然语言解析为 `ChangeRequest`：目标作品、操作 diff、是否事实修改、风险与受影响作品。
- 「网站改黑金，海报不要动」→ 只更新网站配色，网站版本 +1，海报与文案版本不变。
- 「只把海报二维码换到左下角」→ 只改海报。
- 「价格从129改139」→ 标记为商品事实修改，需要 A 组事实审核；演示中可通过“模拟事实审核通过”观察网站、海报、文案同步换价。
- 预览版本与已批准版本分离；修改记录可回看，旧版不被静默覆盖。

### 交付

- 网站链接、真实 PNG 缩略图、二维码、同源文案与 ZIP 一次性交付。
- ZIP 由浏览器真实生成（store 模式，无第三方库）：`posters/`、`qrcode/`、`copy/`、`site-url.txt`、`manifest.json`、`README-交付说明.md`。
- 交付状态 `DRAFT → RENDERED → VERIFIED → DELIVERED → ACCEPTED` 由实际生成结果派生；未核验 PNG 时不能下载 ZIP，也不会显示“已交付”。

## 目录结构

```text
src/
├─ App.tsx                       路由
├─ types/contracts.ts            Zod 合同（SiteSpec / PosterSpec / CopyBundle / ChangeRequest / DeliveryManifest / Order…）
├─ data/
│  ├─ design-presets.ts          三套 DesignSystem 基线
│  ├─ projects.ts                4 个产品 fixture（椅子 / 汽车 / 无图 / 多产品）
│  └─ plans.ts                   A 组套餐目录的演示快照
├─ lib/
│  ├─ api/demo-api.ts            A 组接口的本地适配层（报价 / 订单 / 沙箱支付）
│  ├─ creative/
│  │  ├─ composer.ts             SiteSpec / PosterSpec / CopyBundle 组合器
│  │  ├─ project-generator.ts    描述 → ProjectSeed（品牌/价格提取、品类/图形/风格推断）
│  │  ├─ change-request.ts       修改意图解析与范围判定
│  │  ├─ prompts/               8 个 MiMo 角色系统提示词（业务规范）
│  │  ├─ qr.ts                   二维码模块矩阵 → SVG path
│  │  └─ poster-renderer/        版式几何、概念图形、SVG、PNG、文件名
│  ├─ store.tsx                  演示状态、版本、发布、修改、订单
│  └─ zip.ts                     最小 ZIP 生成器
├─ components/
│  ├─ site-renderer/             React 宣传网站渲染器 + 概念图形
│  ├─ marketing/                 官网导航与页脚
│  └─ ui.tsx                     通用 UI 原语
└─ pages/                        官网、描述生成、定价、结算、订单、工作台、公开站点

scripts/render-posters.ts        Node + Sharp 海报导出与 jsQR 校验
tests/                           合同 / 组合器 / 修改 / 海报像素测试
docs/                            A/B 策划书、交接、开源审计、视觉 QA
```

## 与 A 组集成

共享合同在 `src/types/contracts.ts`（Zod）。A 组可直接在服务端调用渲染模块，不依赖页面点击：

```ts
import { buildPoster, buildSiteSpec } from './src/lib/creative/composer';
import { buildPosterSvg } from './src/lib/creative/poster-renderer/svg';
import sharp from 'sharp';

const input = {
  seed, design, siteRevision, posterRevision, copyRevision,
  factOverrides, factVersion,
  qrUrl: publishedHttpsUrl,          // A 组已验证的公开地址
  qrSource: 'published-site',
};

const spec = buildSiteSpec(input);            // 交给 A 组发布 /p/[slug]
const { spec: poster } = buildPoster(input, 1350);
const png = await sharp(Buffer.from(buildPosterSvg(poster, design, seed))).png().toBuffer();
```

详细签名、已验证产物与限制见 [docs/creative-handoff.md](docs/creative-handoff.md)。

## 验证证据

- `npm test`：34 项通过，包含 **用 Sharp 输出 PNG 后由 jsQR 扫出同一 URL**、二维码零重叠、无图/多品/汽车事实边界、描述生成/品牌价格提取、修改范围、价格一致性。
- `npm run render:posters`：24 张 PNG（4 项目 × 3 方向 × 2 尺寸）全部通过尺寸、体积与二维码解码校验，0 失败。
- `docs/visual-qa.md`：375 / 768 / 1280 截图、交互实测、描述生成流程、发现并修复的问题清单。

## 已知限制

- 没有真实 MiMo 调用、支付、正式发布、数据库与文件存储；这些属于 A 组，演示界面明确标注 Demo。
- 描述生成器是本地启发式实现：只提取描述中明确写出的信息；生成的项目存于 localStorage，跨浏览器/设备不能共享公开路由（正式发布由 A 组服务端承担）。
- 产品图为受控概念图形，不是商家实拍；正式交付必须替换为客户授权素材。
- 二维码默认指向本机演示路由。要让手机扫码，请用局域网 IP 打开 Vite（如 `http://192.168.x.x:5173`），二维码会使用当前访问地址；正式交付仍需 A 组公网 HTTPS 验证。
- 系统字体提供 CJK 渲染；生产服务端需确认字体授权并按 Satori/Sharp 方案配置。
- 多产品详情在当前页面内切换，未拆成独立路由。

