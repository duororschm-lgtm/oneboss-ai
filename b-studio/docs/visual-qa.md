# B 组视觉与交互 QA

> 时间：2026-11-07 · 环境：Windows / Chromium（Playwright headless）/ Vite 6 dev server
> 命令：`npm run qa:visual`（等价于 `python scripts/qa.py`，会复用或自动启动 `http://127.0.0.1:5173`）
> 结构化结果：`docs/visual-qa-results.json`

## 1. 结论

| 项目 | 结果 |
| --- | --- |
| 自动检查项 | **42 项，0 失败** |
| 浏览器控制台错误 | **0** |
| 视口覆盖 | 375 / 768 / 1280 |
| 截图 | 19 张，位于 `docs/screenshots/` |
| 浏览器下载 PNG | 1080×1350，123,539 bytes，`valid=true` |
| 服务端导出 PNG | 24 张，60–86 KB，全部通过尺寸、体积、二维码解码 |
| 交付 ZIP | 8 个文件：2 张 PNG + 1 张二维码 + 2 份文案 + `site-url.txt` + `manifest.json` + README |

## 2. 覆盖矩阵

| 页面 | 1280 | 768 | 375 | 截图 |
| --- | --- | --- | --- | --- |
| 官网首页 | ✅ | ✅ | ✅ | [home-1280](screenshots/home-1280.jpg) / [mobile-home](screenshots/mobile-home.jpg) |
| 描述生成 / 新建项目 | ✅ | — | ✅ | [create-1280](screenshots/create-1280.jpg) / [mobile-create](screenshots/mobile-create.jpg) |
| 生成的宣传网站 | ✅ | — | — | [generated-site-1280](screenshots/generated-site-1280.jpg) |
| 套餐 | ✅ | — | ✅ | [mobile-pricing](screenshots/mobile-pricing.jpg) |
| 订单 | ✅ | ✅ | — | — |
| 产品资料 / 事实核对 | ✅ | — | — | — |
| 创意方向 | ✅ | — | ✅ | [creative-1280](screenshots/creative-1280.jpg) / [mobile-creative](screenshots/mobile-creative.jpg) |
| 网站预览（椅子） | ✅ | — | ✅ | [site-chair-1280](screenshots/site-chair-1280.jpg) / [mobile-site](screenshots/mobile-site.jpg) |
| 网站预览（汽车，双图轮播） | ✅ | — | — | [site-car-1280](screenshots/site-car-1280.jpg) |
| 海报与文案 | ✅ | — | ✅ | [posters-1280](screenshots/posters-1280.jpg) / [mobile-posters](screenshots/mobile-posters.jpg) |
| 修改与版本 | ✅ | — | — | [revise-site-only](screenshots/revise-site-only-1280.jpg) / [revise-fact-approved](screenshots/revise-fact-approved-1280.jpg) |
| 交付中心 | ✅ | ✅ | ✅ | [delivery-1280](screenshots/delivery-1280.jpg) / [mobile-delivery](screenshots/mobile-delivery.jpg) |
| 公开站点 | ✅ | — | ✅ | [public-site-1280](screenshots/public-site-1280.jpg) / [mobile-public](screenshots/mobile-public.jpg) |

## 3. 已实测交互

| 检查 | 结果 |
| --- | --- |
| 单图项目不显示轮播按钮 | ✅ 0 个控制按钮 |
| 双图项目轮播可切换 | ✅ `01 / 02 → 02 / 02` |
| 参数选项卡切换“待确认” | ✅ 显示“续航里程 / 待客户确认 / 待确认” |
| 多产品目录与详情 | ✅ 3 张产品卡；点击后显示“原木边几 / ¥299 / 件” |
| 移动端站点菜单 | ✅ 折叠菜单可以打开 |
| 结算 → 演示订单 | ✅ 创建订单并进入 `DEMO_PAID / 待确认创意` |
| 确认简报 → 创意方向 | ✅ 跳转到 `/creative` |
| 描述生成网站 | ✅ `/create` 生成 `custom-*` 项目，页面含名称、品牌 SELF CHECK、价格 ¥88 |
| 生成项目持久化 | ✅ 刷新后项目仍在工作台切换器与网站中 |
| 无价格生成 | ✅ 显示“价格待确认”，文案不含猜测金额 |
| 创意方向 3 套可选 | ✅ 3 张卡片，选中后网站与海报使用同一基线 |
| 安全区可视化 | ✅ 4 个安全区（主图、价格、标题、二维码） |
| 浏览器下载 PNG | ✅ 1080×1350，PNG 头有效，123,539 bytes |
| 交付 ZIP 真实解压 | ✅ 2 张 PNG、`manifest.json`、`site-url.txt` 均存在，PNG 头有效 |
| “网站改黑金，海报不要动” | ✅ 网站 V2、海报仍 V1；截图见 [revise-site-only](screenshots/revise-site-only-1280.jpg) |
| “价格从129改139” | ✅ 进入“等待事实审核”；模拟审核后网站、海报、文案同时为 ¥139 |
| 公开站点 | ✅ 标题 `ONE LIVING 原木家用椅｜产品宣传`，正文含已确认价格 |
| 横向溢出 | ✅ 375 / 768 / 1280 全部无页面级横向滚动 |
| 控制台错误 | ✅ 0 条（React Router future flags、重复 key 均已处理） |

## 4. 真实文件校验

**服务端（Sharp + jsQR）**

```
npm run render:posters
24 张海报 · 0 失败
每张：1080×1350 或 1080×1080 / 60–86 KB / 二维码从最终像素解码与输入 URL 完全一致
```

另输出 24 份 `copy/*.md`、4 个 800×800 独立二维码、`manifest.json`。

**浏览器（Canvas）**

- 下载文件：1080×1350，123,539 bytes，`distinctColors=108`。
- `valid` 判定：>20 KB 且至少 4 种取色；空图/纯色图会被判为失败。

**ZIP**

```
site-url.txt
manifest.json
README-交付说明.md
posters/one-living-chair-editorial-minimal-1080x1350.png
posters/one-living-chair-editorial-minimal-1080x1080.png
qrcode/site-qr-800.png
copy/demo-chair-001-editorial-minimal-1350.md
copy/demo-chair-001-editorial-minimal-1080.md
```

## 5. 本轮发现并修复的问题

| # | 现象 | 根因 | 修复 | 回归 |
| --- | --- | --- | --- | --- |
| 1 | Sharp 报 `XML parse error: Opening and ending tag mismatch` | 字体字符串里的双引号直接插进 `font-family="..."`，提前闭合属性 | 字体栈内部改用单引号 | 海报 PNG 测试可正常输出 |
| 2 | 海报二维码引导语被裁切 | 卡片宽 244px，引导语 20px 超出 | 按卡片宽度自动降字号 | 两张尺寸均可读 |
| 3 | 自动二维码与主图重叠 2–14px | 版式几何区间未留静区 | 重排三种版式的安全区，增加“自动卡位零重叠”测试 | 全版式通过 |
| 4 | 创意方向第二张预览出现莫名红色标题块 | 营销页 `.mini-hero strong` 选择器命中工作台预览 | 选择器收敛到 `.mini-site .mini-hero` | 三套预览颜色正确 |
| 5 | 首页“同源小红书文案”卡片文字横向溢出 | flex 容器把标题/正文/标签排成一行 | `flex-direction: column` + `min-width:0` | 1280 / 375 均正常 |
| 6 | 改价后网站卖点仍显示 ¥129 | fixture 文案硬编码价格 | 卖点使用 `{{price}}` 占位符，由事实填充 | 测试断言页面不含 ¥129 |
| 7 | 公开站点 Hero 显示“事实版本 V1”，页脚 V2 | Hero 使用设计基线版本而非 spec | 传入 `spec.factVersion` | 改价后 Hero/页脚一致 |
| 8 | 文案包里的海报文件名与 ZIP 内文件名不一致 | 一处用 posterId，一处用 slug | 抽出 `posterFilename()` 统一 | 文案与 ZIP 对齐 |
| 9 | React 控制台重复 key 警告 | 调色板中存在重复色值 | key 加索引 | 控制台 0 错误 |
| 10 | 下载 ZIP 后交付状态仍停留在 `verified` | 状态未跟踪 ZIP 生成 | 增加 `zipSaved → delivered` | 状态机可选到 `DELIVERED` |
| 11 | 交付中心两份文案尺寸标签与标题挤在一行 | 行内元素未换行 | `.copy-size`/标题改为块级 | 375 下正常 |
| 12 | 竖向海报标签顺序在副标题上方 | 几何区间顺序错误 | 重排 tags/subhead 坐标 | 视觉检查通过 |

## 6. 已知限制

- 演示“发布”使用本机 `/p/:slug`，外网不可访问；二维码默认指向 `127.0.0.1`，手机扫码需用局域网 IP 打开站点。正式交付必须由 A 组验证公网 HTTPS。
- 产品图片是概念图形，不是商家实拍；正式交付需替换为客户授权素材。
- 未接真实 MiMo、支付、数据库与文件存储；相关界面均有 Demo 标识。
- 服务端导出依赖部署机 CJK 字体；需要确认字体授权。
- 多产品详情在页内切换，未拆分为独立产品路由。
- `npm run qa:visual` 依赖 Python Playwright；如果环境没有浏览器，需要先 `playwright install chromium`。
- 全页截图中的 sticky 顶栏由 QA 脚本在截图前临时改为 static，避免截图拼接伪影，不代表页面行为。

## 7. 第二轮自检（2026-11-07 10:00）

在 42 项自动检查之外，补充执行了 30 项边界/持久化/可访问性断言与 1 次最终像素扫码复核，全部通过：

| 类别 | 检查 | 结果 |
| --- | --- | --- |
| 持久化 | 重新发布后刷新页面，发布状态保持 | ✅ |
| 范围 | 只移动海报二维码，不会取消网站发布 | ✅ |
| 版本 | 网站改版后旧公开地址明确显示“尚未发布” | ✅ |
| 兜底 | 未知项目、未知公开 slug 均有提示页 | ✅ |
| 容错 | `localStorage` 内容损坏时自动回退到种子状态 | ✅ |
| 文件 | 浏览器导出的 PNG 用 jsQR 反解，等于当前公开 URL | ✅ |
| 一致性 | ZIP 内文案为改价后的 ¥139，manifest 状态正确 | ✅ |
| 可访问性 | 减少动效时内容直接可见；轮播/选项卡支持方向键 | ✅ |
| SEO | 公开站点标题/描述来自已确认事实 | ✅ |
| 链接 | 站内链接全部 200 | ✅ |
| 网络 | 运行时无外部网络请求 | ✅ |
| 支付 | 空客户名被拒绝；人工核验 → 待核对 → 模拟管理员确认 | ✅ |
| 控制台 | 全流程 warning/error 为 0 | ✅ |

本轮还改进了多产品 fixture：图库现在展示系列 3 张视觉并启用轮播（此前只展示第一个产品），并增加回归断言。

## 8. 描述生成流程自检（2026-11-07 12:55）

新增的「描述 → 网站」流程单独验证：

| 检查 | 结果 |
| --- | --- |
| 首页快速生成（名称 + 一句话描述） | ✅ 生成 `/projects/custom-*` 并直接打开网站 |
| `/create` 完整表单（品牌 / 价格 / 品类 / 场景 / 风格） | ✅ 生成后可打开网站、海报、文案 |
| 描述中的价格/品牌提取 | ✅ `¥68 / 200g`、`品牌：MIST ROASTERY` 被识别为已确认事实 |
| 未填写价格 | ✅ 网站/海报显示“价格待确认”，文案不含 `¥数字` |
| 生成项目刷新 | ✅ localStorage 恢复项目，路由仍可打开 |
| 发布生成项目 | ✅ `/p/custom-*` 可打开，标题来自事实 |
| 订单选择生成项目 | ✅ 结算页下拉包含“（描述生成）”，下单后可进入工作台 |
| 视觉方向推荐 | ✅ 咖啡 → 年轻活力、汽车 → 未来科技、家居 → 精致极简 |
| 控制台 | ✅ 0 warning / 0 error |

限制：生成器是本地启发式解析，不调用 MiMo；生成的项目存在浏览器 localStorage 中，换设备或分享给他人时公开链接无法复现（正式发布由 A 组服务端承担）。

