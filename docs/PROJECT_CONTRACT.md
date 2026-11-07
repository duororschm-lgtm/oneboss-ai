# A/B 工程合同 v1 — 待 B 审核

本文件是 A 的初始实现合同，不代表 B 已确认。后续破坏性修改须双方确认。
唯一类型源是 `src/contracts/index.ts`，从该文件导入 Zod Schema 和推导类型。
原始策划书保留在 ROLE_A_PLAN.md、ROLE_B_PLAN.md。

## 所有权和差异裁定

A：API、core/commerce/mimo/workflows/publishing/delivery/security、数据库迁移、共享合同。
B：marketing/dashboard 页面、创意策略、网站和海报渲染器、客户工作台。A 没有实现第二套 B 渲染器。

- A/B 原文中的 hero/gallery/features/featureCards/specs/specTabs 命名不完全相同；共享枚举采用 A 的 `hero/gallery/features/specs/product-grid/brand/story/contact`，由 B 在适配器内映射实际组件。
- PosterSpec 不允许携带草稿或自报正式 QR URL。A 在公开网站验证后通过 `publicSiteUrl` 参数注入；B 决定右下/左下安全布局。
- Props 仅允许受控展示参数。事实和素材使用 ID 引用，不接受任意 HTML、脚本、iframe 或文件路径。
- 数据库 bundle revision 为发布、审批和回滚的版本号；嵌套 site/poster revision 为各作品版本。只改网站时海报对象保持逐字段一致。
- 样例在 tests/fixtures.ts，仅用于测试，不是正式订单完成证据。

## B 服务端适配器

`CREATIVE_ADAPTER_MODULE` 是部署受信任配置，不能由用户请求设置。设为 `builtin:b` 可启用从 B 提交 cdc04e2 接入的实际渲染器；也继续支持 B 编译好的服务端 JS 模块绝对路径。模块导出：

```ts
renderSite({ site, design, facts, assets, pageSlug }); // ReactNode 或 Promise<ReactNode>
renderPoster({ poster, design, facts, assets, publicSiteUrl });
// Promise<{ pngBytes: Uint8Array, qrBytes: Uint8Array }>
validateProduction({ production, design, facts, assets }); // design 为可选的批准设计上下文
// Promise<{ pass: boolean, issues: string[] }>
```

完整接口见 `src/lib/core/creative.ts`。B 必须使用同一 React 实例、受控组件和真实 PNG 导出。
公开渲染的 facts 只含引用到的已批准 id/productId/key/value/version/verified；assets 是已授权素材的短期签名 URL、尺寸和 ID，不含原始附件路径或付款资料。
生产任务上下文中的 assets 是内部素材元数据；B 的服务端海报适配器应通过受信任的 Storage SDK 读取这些授权路径，不允许自行抓取客户提供的任意 URL。
网页至少一个交互控件添加 `data-oneboss-interaction`，点击后必须产生可观察的 DOM 改变，供 375/768/1280px 浏览器检查使用。

A 组不会调用 B 的密钥，也不会在未接入时提供假完成适配器。

内置适配器复用 `src/vendor/creative-b` 中的实际 B 引擎，转换位于 `src/lib/creative`；不使用 B 的演示订单或 localStorage Agent 记录。A 的根页面 slug `''` 在 B 引擎内部映射为 `home`，存储合同保持不变。网站 hero 的受控 `props.variant='black-gold'` 只影响网站，海报保持批准设计。授权实图通过 A 的签名 URL/Storage SDK 使用，不抓取客户任意 URL。

## HTTP 接口

除套餐与 health 外，所有接口需 `Authorization: Bearer <Supabase access token>`。
响应错误为 `{error:{code,requestId}}`；Zod 错误还含 fields 路径，不回显输入或密钥。
POST 使用 JSON，素材上传使用原始二进制。请求体拒绝额外字段。业务金额以整数分计，默认 CNY。

| 方法与路径                                    | 请求 / 语义                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| GET /api/health                               | 进程状态及配置存在性，不代表远程依赖已验证                             |
| GET /api/core/plans                           | 活跃服务套餐、服务器价格和权益                                         |
| POST /api/core/organizations                  | `{name}`，幂等返回用户已有组织                                         |
| POST /api/commerce/quotes                     | `{orgId,planCode,addons?:[{code,qty}]}`，30 分钟报价；不接受客户端金额 |
| POST /api/commerce/orders                     | `{orgId,quoteId,isDemo}`，锁价、权益及服务条款快照                     |
| GET /api/commerce/orders/:id                  | 组织授权订单数据                                                       |
| POST /api/commerce/orders/:id/checkout        | `{channel: sandbox 或 manual_verified}`，支付尝试及明确说明            |
| POST /api/commerce/orders/:id/confirm-sandbox | `{attemptId,eventId,amountMinor,currency,evidenceRef}`，只允许 demo    |
| POST /api/commerce/orders/:id/confirm-manual  | 同上，仅平台管理员核验实际入账后调用                                   |
| POST /api/commerce/orders/:id/close           | `{}`，只关闭未付或待确认订单                                           |
| POST /api/commerce/orders/:id/refunds         | `{amountMinor}`，申请，暂停制作权益                                    |
| POST /api/commerce/orders/:id/finalize-refund | `{refundId,reference,confirmed}`，平台管理员确认真实退款或驳回         |
| POST /api/commerce/payments/webhook/:provider | 尚无正式适配器，始终拒绝，绝不接受伪造验签                             |
| POST /api/core/projects                       | `{orderId}`，只接受已授权订单                                          |
| GET /api/core/projects/:id                    | 当前项目及发布状态                                                     |
| GET /api/core/projects/:id/data               | 项目事实和素材元数据                                                   |
| GET /api/core/projects/:id/preview?revision=N | 授权私有预览数据；仅当前事实版本，不改发布指针                         |
| POST /api/core/projects/:id/assets            | 原始 PNG/JPEG/WebP，`X-Asset-License: customer_authorized`，最大10MiB  |
| POST /api/core/projects/:id/intake            | `{products,facts,brief}`，结构见 Zod；保存完整新事实快照，返回新 ID    |
| POST /api/core/projects/:id/analyze-intake    | `{customerInput}`，排队真实模型追问，不自动确认事实                    |
| POST /api/core/projects/:id/approve-brief     | `{revision}`，批准最新摘要                                             |
| POST /api/core/projects/:id/design-options    | `{}`，返回 runId 所在字段 `id`，异步生成候选                           |
| POST /api/core/projects/:id/approve-design    | `{runId,styleId}`，从该项目真实成功运行结果中选择                      |
| POST /api/core/projects/:id/generate          | `{}`，基于已批准摘要、设计和事实生成                                   |
| GET /api/core/runs/:runId                     | 真实状态、输出、用量、脱敏错误码                                       |
| POST /api/core/projects/:id/revisions         | `{targetArtifacts,instruction,baseRevision}`，预留修改额度，异步预览   |
| POST /api/core/projects/:id/approve-revision  | `{revision}`，B QA 通过后客户批准                                      |
| POST /api/core/projects/:id/publish           | `{revision}`，返回发布任务，异步 HTTP 验证及失败回退                   |
| POST /api/core/projects/:id/rollback          | `{revision}`，与发布同审批和权限门禁，拒绝过时事实                     |
| POST /api/core/projects/:id/delivery          | `{}`，需 HTTP、浏览器检查与真实文件验收                                |
| GET /api/core/projects/:id/delivery           | manifest、5分钟签名 ZIP/单张海报链接（posterDownloads）与验收状态      |
| POST /api/core/projects/:id/accept            | `{manifestVersion}`，只验收当前发布且事实未过时的交付                  |

素材权限及下载权限在服务器校验，不能靠隐藏按钮。重复 JSON POST 使用相同 Idempotency-Key 和同一 body；相同 key 不同内容返回 409。

`/preview/:projectId/:revision` 提供带真实渲染的私有页面，导航请求必须携带同一 Supabase Bearer；不在 URL 中放 token，匿名/越权不能查看。该页面带 noindex，不提供公网已发布证明。B 的正式登录 UI 仍须接入真实 Auth 和 API，不可把本地演示状态当作服务器记录。
素材上传每次生成新资产 ID；组织初始化按用户串行化并返回已有组织，不支持多组织创建 UI。

## 状态和恢复

支付状态、项目阶段、产物批准、任务状态分别保存。任务状态是 QUEUED/RUNNING/SUCCEEDED/FAILED。
数据库租约、心跳、fencing token 和 SKIP LOCKED 支持多 worker 与崩溃恢复；最多三次尝试。
每项目累计最多 100 个任务，请求每用户每分钟最多 60 次，模型单次输出最多 12000 tokens。
这些是 v1 的保守防刷上限，不是完整成本计费系统。

模型只能提出修改，不能修改支付、批准事实、执行 SQL/shell。事实修改先返回 FACT_APPROVAL_REQUIRED，再由客户重新确认 intake，重新生成依赖作品。
网站修改保留同一公开 slug。事实版本变化不静默重写旧发布作品，重新发布须匹配最新事实。
沙箱不记真实营收；人工退款需要交易依据，确认前保持 REQUESTED。

成功 generate 任务的 output.artifactRevision 是数据库 bundle 版本；修改任务的 output.previewRevision 用于预览/批准。素材中的 price 值可使用 ProductPrice 结构表达指导价、起价、计价单位和不披露价格。

## 2026-11-07 兼容补充：海报格式与独立文件

`Brief.deliverables.posterFormats?: ('portrait'|'square')[]` 与 `posterCount` 一一对应，顺序对应 `Production.posters`。portrait=1080×1350，square=1080×1080。服务端拒绝数量或尺寸不一致的生成结果。每种尺寸各占一张海报权益；新建资料默认选择一张竖版和一张方形（权益仅一张时选竖版）。旧 brief 未保存此字段仍可读取，不改变历史作品和订单快照。

`DeliveryManifest.files[].storagePath?` 只用于已单独保存的私有文件。交付 GET 新增 `qrDownloads`，只为当前交付目录中与清单路径完全一致的二维码文件签名；旧交付可继续通过 ZIP 取得独立二维码，不返回不存在的签名文件。所有新文件使用原有私有 Storage、成员权限和五分钟有效期。

渲染适配器的可选 `publicBasePath` 来自服务端已发布项目 slug，不属于模型可写 DTO。公开多页站显示页面导航；私有预览在授权数据中选择页面，不把草稿链接暴露到公网。页面标题和描述使用已批准作品中的 SEO/页面信息。
