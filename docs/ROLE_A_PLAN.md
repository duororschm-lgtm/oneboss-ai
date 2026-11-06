# OneBoss AI V7.0 — A组开发策划书（GPT-6 Sol + Codex）

> **文档定位**：可直接交给 A 组开发者和 Codex 的完整开发任务书、GitHub 借鉴清单、技术架构、接口合同、质量门槛与专业提示词。不是开源源码复制，也不是只有项目名的概念性方案。  
> **版本**：V7.0 / 2026-11-06  
> **角色**：A组技术负责人 —— Core OS / Commerce / MiMo Orchestration / Publish / Delivery。  
> **协作者**：B组（Xiaomi MiMo + Codex）负责官网和创意工作室、网站组件与海报实际渲染。  
> **执行原则**：P0网站公开链接 + P0高清海报文件 + P0服务订单及可信支付状态 + P0真实MiMo调用；除此之外不得阻塞主链路。

---

## 0. 先读这页：双方已经确认的业务边界

OneBoss 是由一名人类老板管理的 AI 创意宣传制作公司。客户是**购买宣传制作服务的商家或个人**，不是商家的终端买家。客户进入 OneBoss 官网选择服务套餐、创建订单、完成可信付款确认（或明确标注模拟支付），再上传产品资料；MiMo Agent 团队完成智能追问、创意规划、交互式宣传网站和静态海报制作，最后生成二维码、小红书配套文案并交付。

**必须交付**：

1. 每个合格订单有一个能通过 HTTPS 在外部打开的宣传网站链接，至少包含真正可操作的互动（轮播、选项卡、展开、导航等）。
2. 每个合格订单有真实可下载的 PNG 宣传海报；二维码默认位于**右下角**，布局冲突时移到**左下角**；二维码指向已验证公开网站。
3. 海报与小红书标题、正文、标签、引导语构成同一“宣传内容包”，引用同一批准的商品事实。
4. 商户可以提出自然语言修改；创意总监（B组策划规则，A组模型执行）只修改指定范围，生成新版本和预览，客户确认后发布。
5. OneBoss 官网有服务套餐、订单、收款状态、制作进度、交付与售后记录。

**明确不做**：3D建模、自动销售客户商品、购物车、客户商品支付、广告代投放、保证获客、微信/小红书自动发布、复杂库存物流。没有真实商户支付资质时不声称已接入正式微信/支付宝。没有真实图片生成服务时不声称 MiMo 可直接生成写实商品图。

商业套餐可暂用测试价格：基础 ¥199 / 专业 ¥499 / 定制 ¥999 起；**此处只是试运营报价配置，不构成经过市场验证的真实定价**。所有金额在后端以分为单位存整数。定制服务若报价不确定，先进入人工审核，不能使用虚假的自动统一定价。

### A组的最终成功定义

不是做出好看的付款页面，也不是展示 Agent “已完成”的文字。A组完成的标志是：**一张真实订单经过正确的支付确认，MiMo 生产任务留下运行记录，B组产出的 SiteSpec 与 PosterSpec 经核验后可以发布、存储、下载，并形成完整交付证据。**

---

## 1. 你的产品责任、非责任和交接边界

| 模块 | A组必须完成 | B组负责 / A不得重复造轮子 | P级 |
|---|---|---|---|
| 统一工程底座 | Next.js工程、环境变量策略、Supabase、身份权限、CI、开发环境 | 视觉组件和客户页面 | P0 |
| 商业定价及订单 | 套餐目录、服务端报价、订单快照、订单项、权益 | 套餐卡片、下单/支付状态 UI | P0 |
| 支付 | 支付适配层、可信核验、人工查账、沙箱隔离、退款记录 | 前端跳转/提示/账单界面 | P0 |
| MiMo API | 密钥服务端托管、真实调用、结构化解析、重试、用量、日志 | Agent专业创意规则和可视化展示 | P0 |
| 产品事实 | 多产品、价格类型、来源、确认、项目素材元数据 | 事实确认卡和输入交互 | P0 |
| 任务编排 | 任务状态机、关联产物、依赖顺序、人工确认 | 作品生成模块、页面和海报渲染函数 | P0 |
| 公开链接 | /p/[slug]已批准版本查询、公开路由、真实HTTPS、回滚 | SiteSpec对应的React渲染器与交互组件 | P0 |
| 海报交付 | 传递实际URL、文件存储、质量检查、ZIP制作 | 实际PNG/SVG渲染、海报版式、QRCode | P0 |
| 安全、监控 | 隔离、限流、凭据、上传校验、错误追踪 | 前端的错误状态与引导 | P0/P1 |
| 视觉高级编辑 | 不负责 | B组可选择基础编辑或Puck | P2 |
| 多域名购买/VPS租用 | 不开发自动购买 | B组提供客户提示即可 | P2 |

**协作红线**：不要在 A组目录写出第二份海报渲染器；不要自行决定 B组的 `SiteSpec` 字段；不要让 B组直接更新 `paid` 状态。双方用一个Git仓库、同一套契约。

---

## 2. GitHub 开源项目策划书（A组专用）

> 以下链接是可借鉴的开源仓库/案例。要求 Codex **先查看 README、许可证、核心模块和当前依赖版本，然后只复用适合的能力**；不要求将大仓库整体复制进入 OneBoss。链接已按本次策划阶段的公开信息核对，正式安装时再验证版本。

| 优先 | 仓库与链接 | 为何适合A组 | 应研究/借鉴的具体能力 | 不应照搬的部分 | 接入决策 |
|---|---|---|---|---|---|
| P0 | [nextjs/saas-starter](https://github.com/nextjs/saas-starter) | SaaS官网/服务套餐/登录支付/团队后台有成熟范例 | `app/`页面和pricing/checkout的流程组织、角色权限、活动日志、支付跳转与回调思路 | 其 Drizzle、Postgres、Stripe身份体系不能与Supabase全部叠加；它偏订阅，OneBoss先做一次性服务订单 | **只作业务结构参考**，不直接以此作为主仓库 |
| P0 | [vercel/platforms](https://github.com/vercel/platforms) | Next.js一套程序多客户子域名/独立站范例 | `app/`、`proxy.ts`（新版本路由实现）、租户定位、公开/后台分离 | 其 Upstash Redis 和品牌示例不是OneBoss数据库；初版未必需要子域名 | **先复制设计思想，首版 `/p/[slug]` 最稳** |
| P0 | [supabase/supabase-js](https://github.com/supabase/supabase-js) | JS客户端和服务端数据库访问 | Auth、Postgres查询、Storage上传/签名URL、RLS配套文档 | 不得暴露 service role key 于客户端 | **正式依赖** |
| P0 | [vercel/ai](https://github.com/vercel/ai) | AI统一调用与结构化生成 | `@ai-sdk/openai-compatible` 接入兼容模型；工具调用、流式输出、错误处理 | 不假定 MiMo 与全部OpenAI/AI SDK特性完全兼容 | **先做真实MiMo smoke test，必要时用fetch直连** |
| P0 | [Stuk/jszip](https://github.com/Stuk/jszip) | ZIP交付文件打包 | 文件夹目录、二进制海报、Markdown文案、manifest打包 | 大文件不要一口气无界加载到Serverless内存 | **正式依赖或小型替代** |
| P0 | [stripe-samples/checkout-one-time-payments](https://github.com/stripe-samples/checkout-one-time-payments) | 一次性服务付款真实案例 | `server/node/` 及 `client/`：Checkout Session、支付成功回调、测试环境 | Stripe是否有实际可用商户账户必须独立核验；不复制多个语言后端 | **仅在符合资质且有真实账号时接入；否则参考流程** |
| P1 | [triggerdotdev/trigger.dev](https://github.com/triggerdotdev/trigger.dev) | 长任务、后台执行、重试 | 任务队列、等待、状态通知、幂等、失败重试 | 不要同时重度引入Mastra与Trigger.dev两套编排平台 | **有条件启用**，否则数据库队列+受控执行器 |
| P1 | [microsoft/playwright](https://github.com/microsoft/playwright) | 真正检查外部网站和交付 | 打开公开页面、手机视口、交互、二维码目标、截图 | 测试须有真实部署地址，不要把静态截图当运行证明 | **E2E测试** |
| P1 | [vitest-dev/vitest](https://github.com/vitest-dev/vitest) | 核心规则回归测试 | 订单、状态机、权限、金额计算、重复通知等单元测试 | 不为覆盖率耽误关键链路 | **P0规则优先测试** |

**关于许可证**：SaaS Starter、Vercel Platforms、其他仓库请逐一阅读其实际 LICENSE 和依赖许可证；JSZip 可在MIT/GPLv3双许可证中按条件选择MIT。禁止删除第三方版权声明；正式提交应维护 `THIRD_PARTY_NOTICES.md`。不要把开源实现整体当成团队原创。

### 推荐最小组合

- 主工程：**空 Next.js + TypeScript + Tailwind + Supabase**。统一数据库，只采用一个身份/权限方案。
- AI：官方 MiMo API，若 AI SDK 兼容层验证失败，改为服务端 HTTP 封装；两个方案只保留一个正式入口。
- 页面公共发布：先使用 `/p/[slug]`，避免早期陷入复杂通配DNS；发布和海报生成依赖真实URL。
- 支付：统一 `PaymentProvider` 接口；实现 `manual_verified`、`sandbox`，有资质时再实现 `stripe` 或微信/支付宝正式适配器。
- 任务：单个编排状态机；需要长任务时引入Trigger.dev，不需要部署整套自托管平台。

### GitHub仓库研究的具体输出

要求Codex阅读每个候选项目后，留下 `docs/opensource-audit.md`：仓库、用途、许可证、是否拷贝源码、所需依赖、与Next.js及Supabase的冲突、选择结论、计划修改位置、回滚办法。研究时间总计不超过开工前2小时，优先完整交付。

---

## 3. 工程架构：统一项目、双人文件所有权

建议目录（以实际路由分组做必要调整）：

```text
oneboss/
├─ src/app/
│  ├─ (marketing)/                   # B: OneBoss官网、套餐、案例
│  ├─ (dashboard)/                   # B: 订单UI、客户工作台、创意/交付中心
│  ├─ p/[slug]/                      # A: 发布路由+授权数据载入；内部用B渲染器
│  └─ api/
│     ├─ core/                       # A: projects/intake/generate/approvals/publish/delivery
│     ├─ commerce/                   # A: pricing/orders/checkout/payments/refunds
│     └─ creative/                   # B: 面向生成器的受限业务API（双方确认）
├─ src/lib/
│  ├─ core/                          # A: 项目、权益、事实、存储
│  ├─ commerce/                      # A: 订单、支付及账本
│  ├─ mimo/                          # A: MiMo调用/解析/成本
│  ├─ workflows/                     # A: 调度与重试
│  ├─ publishing/                    # A: 网站发布/版本
│  ├─ delivery/                      # A: ZIP、manifest
│  ├─ security/                      # A: 权限、限流、上传校验
│  └─ creative/                      # B: 设计规范、页面/海报渲染
├─ src/components/
│  ├─ site-renderer/                 # B: 网站公共渲染组件
│  ├─ poster-renderer/               # B: 海报渲染器
│  └─ studio/                        # B: 创意客户界面
├─ src/contracts/                   # A维护、B共同审批：单一Schema真相来源
├─ supabase/migrations/              # A: 数据库迁移
├─ tests/unit/                       # A/B各自功能
├─ tests/e2e/                        # A主导
└─ docs/                             # 交接/开源审计/验收/运行说明
```

**协作策略**：

1. A建立仓库，B从同一仓库开 `feat/creative` 分支；A用 `feat/core`，主分支只接通过检查的PR。
2. 两个Codex启动时先阅读 `docs/PROJECT_CONTRACT.md`；没有对方确认，不擅自修改公共 DTO。
3. 首次3小时内冻结 MVP 合同；每2–3小时集成，避免最后一刻强行合并。
4. B可以用样例 fixture 独立开发，但正式交付不可使用虚构项目完成状态。
5. A和B约定：网站/海报生产函数返回**文件与配置**，A负责存储、发布和对外验收。

---

## 4. 核心商业数据模型：只为 OneBoss 的宣传服务付费

### 4.1 核心实体

| 表/实体 | 必须字段 | 约束与意义 |
|---|---|---|
| `organizations` | id、name、owner_user_id | 客户组织/数据隔离 |
| `memberships` | org_id、user_id、role | 一个人可管理多个项目，权限角色明确 |
| `service_plans` | id、code、name、price_minor、currency、is_active | 服务端套餐目录，不能信任客户端金额 |
| `plan_entitlements` | plan_code、product_limit、poster_count、revision_rounds、hosting_days、site_type | 固定套餐权益 |
| `service_orders` | id、org_id、order_no、amount_minor、currency、pay_state、work_state、plan_snapshot、terms_snapshot | 下单瞬间锁价和交付承诺 |
| `service_order_items` | order_id、sku、qty、unit_minor、total_minor | 套餐和增项 |
| `payment_attempts` | id、order_id、provider、external_ref、status、amount_minor | 每次尝试可追踪 |
| `payment_events` | provider、event_id、signature_validated、payload_hash、processed_at | 防重复回调，原始敏感内容谨慎保存 |
| `refunds` | id、order_id、amount_minor、status、provider_ref | 退款异步确认 |
| `project_entitlements` | project_id、origin_order_id、remaining_revisions、max_products、max_posters | 权益由可信付款或授权创建 |
| `projects` | id、org_id、service_order_id、status、publish_slug | 真实制作项目 |
| `products` | id、project_id、name、description | 多产品宣传，不含库存物流交易 |
| `product_facts` | id、product_id、key、value、source、verified、version | 价格/型号/参数声明的来源与审核 |
| `media_assets` | id、org_id、project_id、storage_path、kind、license_status、is_concept | 上传素材与授权 |
| `creative_briefs` | project_id、brief_json、approved_at | AI需求摘要与客户确认 |
| `design_systems` | project_id、revision、design_json、approved_at | 创意总监设计基线 |
| `site_specs` | project_id、revision、spec_json、validation_status | B组网站配置 |
| `poster_specs` | project_id、revision、spec_json、validation_status | B组海报配置 |
| `artifact_versions` | id、project_id、artifact_type、revision、storage_path/url、fact_version、approved | 可恢复、可追溯 |
| `agent_runs`/`agent_tasks` | role、status、attempt、usage、output_ref、error_class | 真实 MiMo执行证据 |
| `deliveries` | project_id、manifest_path、zip_path、status、accepted_at | 成品包与验收 |

### 4.2 状态机必须分离

**支付状态**：`UNPAID -> PENDING_CONFIRMATION -> PAID`；旁支 `CLOSED / REFUND_PENDING / PARTIALLY_REFUNDED / REFUNDED`。不允许模型直接写支付状态。

**制作状态**：`WAITING_INPUT -> BRIEF_APPROVAL -> DESIGN_APPROVAL -> GENERATING -> QA_REVIEW -> CLIENT_REVIEW -> DELIVERED -> ACCEPTED`；异常 `MANUAL_REVIEW / GENERATION_FAILED / CANCELLED`。

**交付物状态**：`DRAFT -> RENDERED -> VERIFIED -> APPROVED -> PUBLISHED`。网站已发布≠海报已完成，只有二者都存在且核验通过，服务订单才能宣布交付完成。

**安全约束**：所有数据表含 `org_id`（或可通过项目外键确定归属）；RLS默认拒绝；公开页面只返回已批准的公开字段，不能泄露手机号、原始私有附件或支付数据。

### 4.3 客户价格模型与宣传价格模型绝不能混淆

`service_orders.amount_minor` 是客户向OneBoss购买创意服务的价格；`product_facts.price` 是商家要宣传的商品价格。**两者在数据库、报表、支付 API 里完全独立**。

对于宣传商品价格，使用 `amount_minor / currency / unit / price_type (fixed/starting_at/guide_price/not_disclosed) / condition / confirmed_by`；例如汽车“指导价18.98万元”和家具“129元/把”不能混为通用整数。价格可不展示，不能因为字段缺失而造价。

---

## 5. 双方必须共享的正式接口合同

> `src/contracts/` 由A创建，并要求B审核一次。以下为协议建议，Codex须转成Zod Schema和TypeScript类型。**不要在 A/B 两处定义两套类型**。

### 5.1 `CreativeBrief`

- `projectId: string`、`organizationId: string`、`productIds: string[]`
- `objective: string`、`targetAudience?: string`、`brandDescription?: string`
- `confirmedFacts: FactRef[]`（只保存引用，不复制一份价格真相）
- `assetRefs: string[]`、`preferredStyles: string[]`、`restrictions: string[]`
- `deliverables: { site: true, posterCount: number, xhsCopy: true }`
- `approval: pending|approved|changes_requested`

### 5.2 `DesignSystem`（B组提供，A验证和保存）

- `version`、`styleId`、`rationale`、`palette`、`typography`
- `spacingScale`、`radiusScale`、`layoutMode`、`motionPreset`
- `siteOverrides?`、`posterOverrides?`（支持只修改网站不动海报）
- `approvedByClient`、`factVersion`

### 5.3 `SiteSpec`（B组生成；A负责发布）

- `schemaVersion`、`projectId`、`revision`、`designSystemVersion`
- `pages: [{ slug, title, sections: [{ type, props, factRefs, assetRefs }] }]`
- `allowedSectionTypes` 固定枚举，如 `hero/gallery/features/specs/product-grid/brand/story/contact`
- `interactions` 只能使用已实现的 `carousel/tabs/accordion/scrollReveal` 等枚举
- `seo`（标题/描述由批准事实生成）、`factVersion`
- 不允许任意JavaScript、`eval`、任意iframe URL或文件路径。

### 5.4 `PosterSpec`（B组生成；A保存并组织正式URL）

- `schemaVersion`、`projectId`、`revision`、`designSystemVersion`
- `canvas: { width, height }`、`layers[]`（受控图层）
- `productFactRefs`、`assetRefs`、`textRefs`
- `qr: { placement: auto_bottom_right_or_left, url: placeholder_until_published, caption }`
- `copyPackRef`、`factVersion`；正式导出必须使用已验证公开链接。

### 5.5 `ChangeRequest`

- `projectId`、`targetArtifacts: site|poster|copy|all`、`instruction`
- `parsedOperations[]: {kind, path, proposedValue}`、`isFactChange`、`baseRevision`
- `previewRevision`、`approvalState`、`needsRegenerate[]`
- 不允许未经确认修改商品事实；网站风格变更可仅作用网站。

### 5.6 `DeliveryManifest`

- `orderId`、`projectId`、`publicSiteUrl`、`siteRevision`
- `posters[]: {format, width, height, storagePath, qrTargetUrl, factVersion}`
- `xiaohongshuCopy[]: {posterId, title, body, hashtags}`
- `qrAssets[]`、`brandKitPath`、`zipPath`、`qaReportId`、`createdAt`
- `deliveryStatus` 必须从服务端实际文件和真实QA结果派生。

### 5.7 跨组函数签名（团队契约，不是具体实现代码）

- B提供：`renderSite(spec, designSystem, productFacts, assets) -> ReactUI`；`renderPoster(spec, resolvedQr) -> {pngBytes, svgBytes?}`；`prepareCreativeChoices(brief) -> DesignSystem[]` 的业务策略。
- A提供：`getApprovedProjectData(projectId)`；`publishSite(projectId, siteRevision)`；`storeArtifact(projectId, bytes, metadata)`；`getLiveSiteUrl(projectId)`；`grantEntitlement(orderId)`；`createDeliveryZip(projectId)`。
- 两边在UI层通过HTTP API访问，服务端函数不允许被客户端直接拥有密钥调用。

---

## 6. A组模块实施细则

### A1 订单、套餐、权限

- 套餐列表来自后端数据库，不把价格硬编码在前端提交体。
- `createQuote()`：以选中的套餐+增项数量重新计算总价，生成不可随意修改的报价快照。
- `createOrder()`：检查套餐可用、商品数量、最大海报数、用户身份；生成唯一服务订单号，关联快照。
- `project_entitlements` 在支付可信确认/人工查账完成后创建；模拟支付仅授予 `mode=demo` 的**演示权益**，生产系统不得计入真实营收。
- 增项另立订单项/订单，已支付前不能扣减原套餐剩余额度。
- 客户访问其他组织订单、下载其他组织海报、读取他人的私人图片全部应返回无授权。

### A2 统一支付适配层

选择模式：`SANDBOX`、`MANUAL_VERIFIED`、`PROVIDER_LIVE`。

- **SANDBOX**：仅开发/演示环境或专门标识的Demo项目；页面显示醒目的“模拟支付”，订单字段保留 `is_demo=true`；绝不生成真实收款记录。
- **MANUAL_VERIFIED**：客户使用符合规定的收款方式支付后，管理员在核对银行/支付平台入账记录后人工确认；保存核验人、时间、支付交易依据；绝不只靠客户截图更新 `PAID`。
- **PROVIDER_LIVE**：只接入有商户资质和已授权API凭据的渠道；服务端建支付请求；可信Webhook验签+主动查单；相同事件幂等；支付超时不从“成功跳转页”直接判断已付。
- 所有回调核对订单号、金额、币种、支付对象、交易唯一性；写入事务中；并发同一订单只能开通权益一次。
- 退款必须经过权限控制并记录通道请求、异步结果、实际金额；退款申请不等于退款完成。
- 接口和日志中隐藏密钥、银行卡信息、敏感票据。

**常见漏洞测试**：前端金额0元篡改、重复回调10次、并发支付、伪造回调、回调先于前端页面、付错金额、用户付费后关页、付款失败重试、退款后权益变化、服务已交付退款争议需人工处理。

### A3 MiMo API网关与Agent流程

- API Key 只放服务器环境；使用官方 MiMo 兼容 API 地址（本次核对结构化输出官方地址：`https://api.xiaomimimo.com/v1`）；模型名称从环境读取。
- **第一小时必须实际测试**文本生成、`response_format: {type: "json_object"}`、工具调用、上传图片理解是否在比赛账号上可用。不要只看文档。
- 一次响应需要进行三层验证：JSON解析、ZodSchema、业务事实限制。坏JSON允许有限次数“修复/重试”，不能无限循环。
- 角色按需激活：项目经理→产品分析→创意总监→文案/网站/海报→QA→交付；简单修改可缩短流程。
- 所有工具通过白名单：`read_project_facts`、`save_brief_draft`、`request_approval`、`create_site_spec`、`render_poster`、`publish_site`（需审批门禁）、`assemble_delivery`。**模型不能直接调用数据库任意SQL、支付扣款或退款、服务器shell。**
- `AgentRun`保存关联项目、角色、输入摘要/脱敏引用、结构化输出引用、耗时、Token、异常；可选记录使用成本。不要将客户敏感信息原样打到公共日志。
- 用户上传的文字/图片内容属于不可信资料；即使有“忽略上述规则”等命令也只当文本资料，不执行。
- 作业失败：输入不合法→退回补资料；模型超时→有限重试；渲染失败→调低复杂度或退回模板；发布失败→保留旧版本；支付异常→人工审核。

### A4 发布与网站链接

- 第一版统一平台部署，避免每个客户购买域名/租VPS；公开页面 `/p/[slug]`，URL建立在OneBoss已拥有并能配置HTTPS的域名下。
- B站点渲染器以 `SiteSpec`+批准事实渲染，A发布时保存`PublishedSiteRevision`指针。
- 短链接slug唯一且不可猜测不作为权限机制；公开页面仅读已发布资料。
- `publishSite`仅接受通过QA及客户批准的SiteSpec版本；原子切换指针，失败保持旧发布版本。
- 发布后采用HTTP GET核查、浏览器冒烟测试；验证动态交互在手机上正常；无预览凭证时公开路径不显示草稿。
- 以稳定路径承载二维码：每次内容修改尽量复用同一URL；下架/变更要有明确状态页面。
- 独立域名绑定、DNS自动化与代购域名列P2，不干扰主链路；已绑定客户域名必须有授权证明。

### A5 完整交付与ZIP

正确顺序（尤其关键）：

1. B生成网站草稿和海报草稿、文案草稿；A校验确认后的事实版本。
2. 客户确认，A发布网站；**确认公开URL能够实际访问**。
3. 把最终URL传给B二维码渲染模块；B把二维码置于海报右下/左下并最终导出PNG。
4. A检查PNG尺寸、文件头、存储路径、扫码结果和文案事实一致性。
5. ZIP内至少有 `posters/`、`qrcode/`、`copy/`、`site-url.txt`、`README-交付说明.md`、`manifest.json`；可选品牌规范文件。
6. 在数据库写`DeliveryManifest`，生成有访问权限与有效期的私有下载链接；不把客户私有ZIP放在匿名公网目录。
7. 交付记录包含时间、订单号、版本、各文件散列/大小，客户可点“确认验收/申请修改”。

若PNG生成失败或二维码无法扫描，即使网站已上线也不能宣称整套交付完成；必须暴露失败子任务并允许恢复。

### A6 安全与运营

- Supabase RLS默认最小权限；服务端授权检查要独立于前端隐藏按钮。
- 图片上传限制类型、大小、宽高、文件签名，拒绝SVG脚本/危险HTML未经消毒进入网站；避免文件名目录穿越。
- 对用户控制的外部URL，防止服务器端SSRF；只允许必要外链或经检查的素材代理。
- 公网网页使用内容安全策略，禁止从SiteSpec执行任意脚本。
- API限流、用户防刷、生成成本预算、日志脱敏、密钥轮换。
- 对服务条款、托管期限、创意素材授权、退款及修改次数提供可查记录。

---

## 7. 端到端API合同（A编写B直接调用）

| 接口 | 方法 | 最重要请求/响应 | 权限 |
|---|---|---|---|
| `/api/core/plans` | GET | 套餐ID/权益/服务端价格 | 公共 |
| `/api/commerce/quotes` | POST | plan+增项 → 锁价报价 | 登录/游客受限 |
| `/api/commerce/orders` | POST | quoteId → orderId、paymentStatus | 登录 |
| `/api/commerce/orders/:id/checkout` | POST | channel → redirectUrl或线下指引 | 订单拥有者 |
| `/api/commerce/payments/webhook/:provider` | POST | provider event → ack | 可信平台验证 |
| `/api/commerce/orders/:id` | GET | 支付、制作、费用、权益 | 订单拥有者 |
| `/api/core/projects` | POST | 已授权orderId → projectId | 订单拥有者 |
| `/api/core/projects/:id/assets` | POST | 图片附件元数据/安全存储位置 | 项目成员 |
| `/api/core/projects/:id/intake` | POST | 当前事实、答案 → 下一个问题/草稿 | 项目成员 |
| `/api/core/projects/:id/approve-brief` | POST | briefVersion → approved | 项目成员 |
| `/api/core/projects/:id/design-options` | POST | briefId → 设计方案候选 | 项目成员 |
| `/api/core/projects/:id/generate` | POST | approved designVersion → runId | 已付费/演示权益 |
| `/api/core/runs/:runId` | GET | 当前角色、进度、失败原因 | 项目成员 |
| `/api/core/projects/:id/revisions` | POST | targetArtifacts + instruction → previewRevision | 项目成员/剩余权益 |
| `/api/core/projects/:id/publish` | POST | approvedRevision → publicUrl | 有权发布的项目成员 |
| `/api/core/projects/:id/delivery` | GET | manifest、zipDownloadUrl、验收状态 | 项目成员 |
| `/api/core/projects/:id/accept` | POST | manifestVersion → accepted | 授权客户 |

所有改状态接口都使用服务端鉴权与幂等键，返回明确状态和错误码；B组不得通过页面本地状态“模拟付款已完成”去调用正式生成接口。

---

## 8. 40小时详细工作分段 / 双人依赖点

| 时段 | 你必须做完 | 对B组的交付 | 检查点 |
|---|---|---|---|
| **T0–T2** | 建仓库、Node/pnpm环境、项目合同初稿、MiMo真实调用最小测试 | README、共享Zod字段草案、fixture路径 | 无伪造MiMo调用 |
| **T2–T4** | Supabase schema、RLS策略、套餐及订单骨架 | `/plans` `/orders`接口示例 | 首次PR合并 |
| **T4–T7** | 订单报价/支付适配接口、sandbox/人工核验模式 | 下单UI可接入，支付状态稳定 | 改前端价格无法改账单 |
| **T7–T10** | MiMo gateway、JSON输出校验、agent-run记录 | `/intake` `/design-options`合同 | 真模型调用写日志 |
| **T10–T14** | 发布路由、项目权限、SiteSpec版本存储 | `renderSite()`接入点，发布URL格式 | `/p/[slug]`公网可访问 |
| **T14–T18** | 文件存储接口、长任务/有限重试 | B的海报PNG可提交存储 | **18h前网站和海报单独可用** |
| **T18–T22** | 付款后的制作权益联动、生产调度 | B页面展示真实制作状态 | 完成订单→生成链路 |
| **T22–T26** | 正式站点发布后生成最终QR的协调、ZIP打包 | B传入渲染结果；A回传已发URL | 海报二维码扫通 |
| **T26–T30** | 事实修改、版本回滚、交付验收 | revision/approval状态接口 | 精准修改不覆盖旧版 |
| **T30–T34** | 安全、幂等、权限、QA回归 | 真实失败原因反馈UI | 恶意/重复请求被拒绝 |
| **T34–T36** | 全流程联调和生产环境配置 | B进行移动端最终验收 | 主链路跑通 |
| **T36–T40** | 真正部署、日志、备份、材料与成本清单 | 稳定演示URL、订单证据 | 停止新功能开发 |

**硬门槛**：到T18还无法提供外网可访问网站或真实PNG时，暂停高级支付方式、Agent炫酷视图和自定义域名，全力修复双核心交付。到T26还没有扫码/ZIP时暂停新增功能。到T36只修Bug，不能追加新框架。

### 持续汇报格式（每2–3小时）

- 已合并PR/Commit：
- 本次可验证能力（实际网址或测试命令）：
- 未完成/阻塞及负责人：
- 已知风险（P0/P1/P2）：
- 下一段交付：
- 是否影响 B组合同：是/否（若是，先通知）

---

## 9. A组测试矩阵：必须经真实工具验证

### 商业功能

- [ ] 客户能选择套餐和增项；服务端校验金额；取消增项价格正确变动。
- [ ] 未支付订单不能启动正式生成；`SANDBOX`产生的演示订单在后台和营收报表明确标识。
- [ ] `MANUAL_VERIFIED`只有有权管理员在查账后才能操作；客户端截图不可自行确认。
- [ ] 相同Webhook重复10次权益只开通1次；伪造事件不通过；金额不一致不通过。
- [ ] 付款成功后关闭浏览器，任务仍可正常恢复；订单页重新打开还能看见进度。
- [ ] 修改套餐价格不改变历史订单快照。
- [ ] 退款申请与退款到账状态区分，退款不会重复。

### 生产功能

- [ ] 真实 MiMo调用产生可记录的响应；JSON坏格式被拒绝或受控重试。
- [ ] 客户只提供名称、价格、1张图，可以进入草稿与追问流程。
- [ ] 未核实技术参数不会被擅自写入宣传网站。
- [ ] 网站真实公网HTTPS可访问，手机能操作轮播/详情。
- [ ] 海报文件为有效PNG，非空白图片，中文不裁切，尺寸正确。
- [ ] QR码指向验证的当前公开URL，能在手机扫码。
- [ ] 网站、海报、小红书文案的价格与事实版本一致。
- [ ] 客户只修改网站风格，海报保持原版；客户修改产品事实，系统提出受影响作品更新清单。
- [ ] 发布失败时旧版仍可访问；ZIP内容齐全；交付记录可重放。

### 安全和故障

- [ ] 客户A无法读客户B数据/文件，即使猜到ID。
- [ ] 不可信图片、恶意URL、越权发布均被阻止。
- [ ] 数据库/模型/文件存储超时后不留下虚假成功状态。
- [ ] 无付费权益时生成端点拒绝正式任务；模型也不能直接打开扣费工具。

---

## 10. 交给 GPT-6 Sol / Codex 的专业提示词（可直接复制）

> **使用方法**：先将本文件放在仓库 `docs/ROLE_A_PLAN.md`，将B组策划书放在 `docs/ROLE_B_PLAN.md`；复制下面的“总控提示词”给Codex，然后分阶段依次使用模块提示词。提示词要求Codex**输出实际代码变更和测试**，但本策划书本身不会大量粘贴第三方源码。

### 提示词 A-0：技术负责人总控（开工第一条）

```text
你现在担任 OneBoss AI V7.0 A组首席系统架构师及高级全栈工程师。我使用 GPT-6 Sol + Codex，B组使用 MiMo + Codex。请完整阅读 docs/ROLE_A_PLAN.md 和 docs/ROLE_B_PLAN.md；严格遵守既定业务边界。我们销售的是“宣传网站+带二维码静态海报+小红书配文”的制作服务，不替商家卖货，不做3D，不代投广告。
你的唯一最终目标是让客户从官网选择套餐→创建订单→可信付款确认或明确模拟模式→真实MiMo项目生产→外网可访问的网站→高清PNG海报→最终QR→ZIP→客户验收跑通。
第一步检查仓库现状、依赖、Node版本、现有文件和B组文件边界。第二步给出最小架构、共享契约和风险清单。第三步立即实现第一个可运行垂直切片；不要只输出长篇分析。
必须做到：真实MiMo API调用；服务端密钥；同一个Zod合同；持久化任务；最小权限；服务端金额；不得伪造支付成功、网站已上线、文件已导出。优先完成P0，P1/P2不得阻塞网站链接与海报PNG。
所有工作以小步提交，每步列出具体修改文件、验证命令与测试结果。未经B组确认不要改变 src/contracts 的共有字段，不要修改B拥有的渲染组件。每次结束给出：已完成、未完成、风险、下一步、能执行的验证命令。
```

### 提示词 A-1：GitHub开源借鉴与选型审计

```text
以 docs/ROLE_A_PLAN.md 第2章的GitHub列表为依据，对 nextjs/saas-starter、vercel/platforms、supabase/supabase-js、vercel/ai、Stuk/jszip、stripe-samples/checkout-one-time-payments 进行定向研究（能访问源码就阅读相关README/目录/许可证，不能访问就明确说明，不准臆造）。
输出 docs/opensource-audit-a.md：项目用途、最适合借鉴的模块、与本项目技术栈冲突、依赖风险、许可证、是否直接引入依赖/仅参考架构、具体集成顺序。
禁止直接整仓复制多套认证、数据库或支付框架。研究完立即选择一个主工程与最小依赖集合。给出每个选择的撤回条件。
```

### 提示词 A-2：数据库、认证及共享合同

```text
请按角色A策划书第4、5章实现Supabase迁移、RLS、服务端权限辅助函数以及 src/contracts 的Zod Schema。服务订单、客户商品事实、创意规范、站点配置、海报配置、支付尝试、Agent运行、交付版本必须分离。金额全部用整数分，套餐价格在服务端锁快照。
提供最小测试数据：家具椅子129元、汽车指导价18.98万元；保证公开网站只拿到经批准的可公开事实。为每个表定义owner/organization访问策略，并写至少三条越权访问测试。不要把Supabase service-role密钥传浏览器。完成后产出API契约文档给B组，标明不可破坏的字段和fixture。
```

### 提示词 A-3：下单、支付、退款完整闭环

```text
实现服务套餐→报价→一次性服务订单→支付尝试→可信确认→项目权益的完整服务端状态机。PaymentProvider允许 sandbox、manual_verified、future_live_provider三种模式，但在没有正式商户API和密钥时不得制造假线上支付。sandbox订单必须显著标记demo且不计入真实营收；manual_verified仅管理员核对真实入账后确认；正式Provider保留验签、查单与幂等接口。
实现订单快照、交易记录、退款申请和最终退款状态、支付超时/失败/关闭/重复通知。写测试覆盖篡改金额、回调重放、金额不符、并发两个回调、付款后关闭页面、未付款调用generate、退款后状态。提供给B的稳定JSON响应和清晰错误码。
```

### 提示词 A-4：真实 MiMo API 网关与角色调度

```text
实现只在服务端调用官方Xiaomi MiMo API的统一gateway。先用当前真实凭据验证modelId、base_url、json_object格式、tool calling及图片理解，记录兼容结果，任何失败都要报告，不得写假模拟响应冒充通过。
为8个业务角色建立统一任务结构：项目经理、产品分析师、创意总监、文案、网站、海报、质检、交付；按依赖触发，不要求固定8次模型调用。以真实ProductFacts和CreativeBrief为上下文。模型产出一律解析JSON→Zod校验→业务约束检查；失败有限重试并保留原始错误摘要。
采用白名单工具和人工审批门禁，AI不能任意改价格、任意发布或访问支付API。保存run/task状态、次数、成本和实际产物引用，支持浏览器关闭后恢复。
```

### 提示词 A-5：网站发布和真实链接

```text
请用B组提供的SiteSpec及React渲染器构建一个稳定的公开宣传网站发布系统。先实现 /p/[slug]，保证预览数据和已发布数据隔离，公开只读已确认事实。提供createPreview、validatePublish、publishRevision、rollbackRevision、getPublicUrl。
必须支持官网部署在HTTPS域名上、页面可在手机打开、交互组件真实工作。发布时原子切换published_revision指针，不能部署失败后仍显示成功；不得修改B组组件内部设计。写 Playwright 冒烟脚本，验证响应、图片显示和交互。明确二维码使用稳定正式链接。
```

### 提示词 A-6：海报存储、二维码闭环及ZIP交付

```text
与B的PosterSpec渲染接口集成：正式发布网站且URL经过实际HTTP/浏览器验证后，给B传入真实publicSiteUrl；调用其二维码和海报导出，得到实际PNG/SVG字节文件；保存到Supabase Storage；检查文件大小、分辨率、二维码目标、中文文本和价格事实一致性。
然后生成DeliveryManifest和ZIP，至少包括海报、二维码、小红书正文、网址说明与版本清单。下载ZIP须经项目授权，有适当有效期。仅当Site和Poster两个P0任务都verified时标记DELIVERED。写真实文件验收，不允许空白/占位素材当成完成。
```

### 提示词 A-7：客户修改、版本、回滚和安全

```text
实现ChangeRequest服务：客户可提出只改网站样式、只改海报、改文案或改商品事实。模型只负责解析意图并提出受影响资产，不得不经客户确认直接修改事实。基于baseRevision制作previewRevision，校验后批准并发布。网站变更不强制重做海报；商品价格变更必须重新检查有关作品。
强化RLS/越权/上传限制/外链SSRF/服务端凭据/限流/日志脱敏；已发布旧版本在失败时可回滚。给出异常事件日志与能复现的测试报告。
```

### 提示词 A-8：全链路集成与演示复盘

```text
请以A组策划书测试矩阵作为最终验收，接上B组真实站点渲染器和PNG海报生成器：创建测试服务订单→沙箱标识支付或真实查账确认→新建项目→输入椅子129元及照片→真实MiMo创意方案→客户选风格→生成交互式SiteSpec和PosterSpec→网站正式发布→真实二维码入海报→ZIP交付→客户提出“网站改黑金，海报不变”→生成预览并审批发布。
调用实际API并验证结果，不只读取本地mock。使用Playwright测试手机站点、二维码、订单状态和下载文件。输出 docs/demo-proof.md：真实测试网址、实际生成的文件名及hash、MiMo运行ID、支付模式、真实/模拟声明、失败处理、未完成限制。禁止宣称未真实通过的功能。
```

### 提示词 A-9：每轮代码审查（反复使用）

```text
请对当前A组改动做一次正式代码审查。按P0/P1/P2列出：支付状态是否可信，是否有跨租户泄漏，是否有服务端金额篡改，Webhook是否幂等，MiMo是否真实调用，SiteSpec是否约束任意代码，是否在网站可用前生成了最终QR，是否可能假交付，失败后旧版本能否保存。必须引用具体文件/行号和复现步骤。先修P0漏洞，修复后运行相关测试；不要只输出抽象建议。
```

### 提示词 A-10：接收B组PR后的集成指令

```text
B组已提交PR。先确认双方 src/contracts 版本、函数签名、依赖和存储格式，然后执行接口兼容性检查。不要重写B组的视觉代码；优先编写适配器把B的renderSite/renderPoster接到A的发布、存储和交付服务。遇到契约冲突时生成最小Diff和修改提案，等待双方确认后合并。合并后跑真实端到端：公开网址可打开、交互可用、PNG真实存在、二维码可扫、ZIP可下载、订单权限不越界。输出合并报告和回退方案。
```

---

## 11. 绝对不可妥协的最终验收

A组在交付时至少提交：

1. 一个真实运行的 OneBoss 官网部署地址（由B制作界面，A配合正式上线）。
2. 可查看套餐、创建服务订单的数据库及API；实际/人工/模拟支付模式明确区分。
3. 一笔已通过可信授权的服务订单及关联的运行日志（若为模拟必须显著说明）。
4. 一次真实 MiMo 模型调用日志，不是手工编造完成记录。
5. 一条不需要客户登录即可打开的**正式宣传网站 HTTPS 链接**，内容出自批准资料。
6. 一张二维码指向该网址、可打开、可下载的正式高清PNG海报（由B生成，A存储验收）。
7. 一个包含站点地址、海报、二维码和小红书文案的ZIP。
8. 一次定向修改、客户审批、发布与旧版本回滚的运行证据。
9. 权限和支付的关键异常测试结果，以及开源项目许可清单。

**判断原则**：若只能做到8个AI名字、炫酷流程图、可点的假支付、漂亮但未发布的网站、空白PNG或错误QR，则A组没有完成。这些不能通过“接近完成”来折算。

---

## 12. 参考官方技术资料（非开源项目）

- Xiaomi MiMo结构化输出：<https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/text-generation/structured-output> —— MiMo V2.6 Pro JSON模式与官方 `base_url` 示例；模型返回JSON仍需要应用层校验。
- MiMo-V2.6-Pro模型说明：<https://mimo.mi.com/models/en-US/mimo-v2.6-pro> —— 图像理解、工具调用与文本输出边界，不能声称模型直接生成高清商品照片。
- Puck文档：<https://puckeditor.com/docs> —— B组可选的编辑器接口约束。
- Stripe官方样例：<https://github.com/stripe-samples/checkout-one-time-payments> —— 支付接入案例，不代表所有地区均可开户。
- 请在正式开发前核对你们实际商户资质、模型额度、部署地区、存储费用和个人信息处理义务。

---

**A组一句话任务结论：你负责把 OneBoss 变成真的能够“接单—授权—调度—发布链接—存储海报—交付—售后”的公司底座；每个关键节点都必须有实际文件、真实状态和可核验结果。**
