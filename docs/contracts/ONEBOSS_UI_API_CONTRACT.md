# OneBoss UI/API 契约草案 v0.1

2026-11-08（Asia/Shanghai），A0源码审计版。适用本地 `fix/oneboss-fullflow`（V4 5699449 + 当前未提交改动），**不是生产已上线接口声明**。既有合同 `docs/PROJECT_CONTRACT.md` 中的创意结构仍有效，本草案补充业务接口与已知缺口。未经评估不重命名现有字段；B只能对接标记“已实现”的部分。

## 通用规则

- JSON；敏感响应 `Cache-Control: no-store`。除公开目录和支付配置外，Bearer access token由Supabase getUser验证，不能传自报userId替代。
- 金额为CNY整数分：199=¥1.99；不能客户端传单价/总价。大额累计需保持JS安全整数，后续完善金额上界。
- PostgreSQL timestamptz序列化为ISO 8601（可能UTC）；显示与日期统计统一Asia/Shanghai。date字段为YYYY-MM-DD日期标签，不是UTC时间戳。
- 缺字段/NULL不表示0、成功或离线。成本未建立返回null；未配置渠道当前JSON省略该键。历史stage可为null，不能补造事件。
- 写接口携带 `Idempotency-Key`（8—100个字母、数字、_或-）；同actor/key/route/body重试，正文变更必须换key。组织初始化和二进制上传沿用现有例外。
- 通用错误：`{error:{code:string,requestId:string,...}}`；输入schema错误400 `VALIDATION_FAILED`，`fields:string[]`为字段路径。HTTP 401未登录，403无权，404不存在，409业务冲突，429限流，503配置不可用。不能仅以HTTP成功推定付款/交付完成。
- 分页管理接口：page/pageSize（默认1/20，pageSize最多100），返回`{items,total,page,pageSize,hasNextPage}`。现有parser尚未严格拒绝小数页码，A1后续修复前B仅传正整数。
- 每次返回服务器真实状态；不缓存敏感API。活动任务建议3秒读一次，隐藏页面30秒，失败指数退避至30秒；任务终态停止高频轮询。刷新/轮询不能POST新增任务。
- 所有下文数字和JSON示例均为测试示例，不是生产订单或实收款。

## 状态、角色与映射

订单现有枚举：UNPAID、PENDING_CONFIRMATION、PAID、CLOSED、REFUND_PENDING、PARTIALLY_REFUNDED、REFUNDED。

PENDING_CONFIRMATION在当前代码中从checkout即开始，**不代表客户已提交说明**；是否提交须检查manualPaymentReport。新任务书的PAYMENT_REPORTED/PENDING_VERIFICATION暂映射为“PENDING_CONFIRMATION+有报告”，不要创造第二个枚举。付款报告REJECTED/重提尚未实现。

退款：REQUESTED、CONFIRMED、REJECTED；created_at为申请时间，confirmed_at为实际确认退款时间（旧记录可能null），rejected_at尚未实现。

run实际使用QUEUED、RUNNING、SUCCEEDED、FAILED；部分旧显示层保留NEEDS_REVIEW等兼容名，不能据此声称存在等待/取消接口。失败重试沿用同run、attempt递增、退回QUEUED/stage=retry-wait，事件保留历史。WAITING_INPUT/WAITING_APPROVAL/RETRYING/CANCELLED专门状态/API尚未交付。

| 任务role | employee_key | 业务意义 |
|---|---|---|
| intake | product_analyst | 产品资料分析 |
| design | creative_director | 创意方向 |
| generate/change | production_team | 文案、网站、海报复合制作/修改；不能显示成3个并行run |
| publish/delivery | delivery_specialist | 发布/交付 |
| 未知历史类型 | unmapped | 未知，不按中文名猜归属 |

stage当前可见preparing、model-analysis、model-production、publishing、rendering-delivery、completed、failed、retry-wait、lease-exhausted；历史null。没有可测模型百分比，progress字段当前不存在，B展示未知/阶段，不自增百分比。

平台角色owner、finance、operations、reviewer由服务端platform_admins.role决定；既有管理员迁移默认owner。组织owner/admin不等于平台管理员。下文能力由`src/lib/admin/permissions.ts`矩阵控制，接口自己校验。

## 1. 公开价格与支付配置（已实现）

`GET /api/core/plans`，无需登录：

`{plans: Plan[], addons: Addon[]}`。Plan含code/name/string、price_minor/number、currency/string、product_limit/poster_count/revision_rounds/hosting_days/number；Addon含code/name、price_minor及权益定义。目录来自数据库，不是浏览器常量。

已确认新报价价格：基础199、专业599；extra-product99、extra-poster99、extra-revision49分。生产尚未迁移，不应把本地目录作为已上线报价。

`GET /api/commerce/payment-methods`，无需登录：

```json
{
  "wechatNative": false,
  "manualVerified": true,
  "sandbox": false,
  "manual": {"provider":"wechat_manual","paymentChannel":"wechat","qrUrl":"/payments/wechat-receive.png","payeeDisplayName":"测试收款人","instructions":"测试人工核验说明"},
  "manualChannels": {
    "wechat": {"provider":"wechat_manual","paymentChannel":"wechat","qrUrl":"/payments/wechat-receive.png","payeeDisplayName":"测试收款人","instructions":"测试人工核验说明"}
  }
}
```

manual为旧微信兼容字段，可省略；manualChannels.wechat/alipay各可省略。alipay配置需要全局开关、支付宝开关、收款人及所有者真实图片；缺少任何项不返回该渠道。B显示“待配置”，不能用微信码冒充支付宝。现实现只检查文件存在，有效图像校验和受控访问策略待完善。旧wechatNative读取历史配置；本轮不启自动支付，后续需纯人工硬门禁。

## 2. 报价和订单（已实现）

`POST /api/commerce/quotes`，组织成员：

```json
{"orgId":"00000000-0000-4000-8000-000000000001","planCode":"professional","addons":[{"code":"extra-poster","qty":1}]}
```

addons可省略默认[]，最多10个且code不重复；当前qty必须number整数1—10。**0—10的新要求尚未落服务端：B暂将0/空白项过滤，只提交非零项；字符串/小数/负数等拒绝。** code、qty以外字段严格拒绝；服务器重算总金额。

返回报价行，含id/org_id/plan_code/string、amount_minor/number、currency/string、plan_snapshot/object、expires_at/ISO、created_at/ISO。快照含套餐范围及addons数组，明细有code/name/qty/unit_minor/total_minor。

`POST /api/commerce/orders`，组织成员：`{orgId,quoteId,isDemo:boolean,paymentChannel?:"wechat"|"alipay"}`。真实单默认wechat，演示单渠道null。返回订单行，冻结amount_minor/currency/plan_snapshot/terms_snapshot；报价过期或归属不符拒绝。不接受amountMinor/单价等客户端报价。

`GET /api/commerce/orders/:id`，订单组织成员：订单行+可选manualPaymentReport。主要字段id/order_no/org_id/string、amount_minor/number、currency/string、plan_snapshot/terms_snapshot/object、is_demo/boolean、pay_state/枚举、payment_channel/枚举或null、created_at/ISO。manualPaymentReport有id/details/created_at；无报告时该键可省略。

关键错误：PLAN_UNAVAILABLE、ADDON_UNAVAILABLE、INVALID_ADDONS、INVALID_ADDON_QUANTITY、PLAN_LIMIT、QUOTE_EXPIRED_OR_MISSING、FORBIDDEN、VALIDATION_FAILED。

## 3. 人工付款（已实现，驳回接口未实现）

`POST /api/commerce/orders/:id/checkout`，订单组织成员：

`{channel:"manual_verified",paymentChannel?:"wechat"|"alipay"}`；返回`{attempt:PaymentAttempt,isDemo:boolean,instructions:string}`。attempt含id/order_id/provider/payment_channel/amount_minor/status/created_at；provider继续为manual_verified，payment_channel区分wechat/alipay。

未配置返回503 MANUAL_CHANNEL_NOT_CONFIGURED；非可支付单409 ORDER_NOT_PAYABLE；提交过说明后跨渠道切换409 PAYMENT_CHANNEL_LOCKED。不会自动划款。

`POST /api/commerce/orders/:id/report-manual-payment`：`{attemptId:UUID,details:string}`，details trim后1—1000字符；付款时间/交易号目前存入details文本，非独立结构字段，也没有凭证文件上传接口。

返回`{reportId,createdAt,payState:"PENDING_CONFIRMATION",instructions}`；不生成payment_events或权益。PAYMENT_NOT_PENDING、ATTEMPT_MISSING表示当前状态不允许。

`POST /api/commerce/orders/:id/confirm-manual`：仅act.payment（owner/finance）。

`{attemptId,eventId:string(8..150),amountMinor:整数分,currency:"CNY",evidenceRef:string(8..200)}`。管理员必须先核对真实账单；客户端说明不是到账依据。返回`{orderId,payState,isDemo}`。同事件相同正文重放安全；不同eventId再次确认拒绝；唯一到账事实、权益和审计同事务。

错误：PLATFORM_ADMIN_REQUIRED、ADMIN_CAPABILITY_REQUIRED、PAYMENT_AMOUNT_MISMATCH、EVENT_CONFLICT、ORDER_NOT_PAYABLE、PAYMENT_ATTEMPT_NOT_PENDING、PAYMENT_CHANNEL_MISMATCH、ORDER_ALREADY_CONFIRMED。

演示sandbox只允许显式isDemo订单及服务端沙盒开关，真实客户不能借此开通权益。旧自动商户代码不属于本阶段开通范围。

## 4. 退款（已实现基础流程）

`POST /api/commerce/orders/:id/refunds`，订单成员：`{amountMinor:正整数分}`。返回`{id,status:"REQUESTED",amountMinor,manualReviewRequired:boolean}`。申请会暂时撤销制作权益，不等于退款完成。

`POST /api/commerce/orders/:id/finalize-refund`，act.refund（owner/finance）：`{refundId,reference:string(8..200),confirmed:boolean}`；返回`{payState,refundStatus:"CONFIRMED"|"REJECTED"}`。确认时写confirmed_at，不使用申请日期。确认/拒绝写审计；已处理再次用新请求会报REFUND_NOT_PENDING，原幂等key重放沿用缓存响应。

requested_at语义目前对应created_at；rejected_at尚缺，不能展示猜测的驳回时间。NOT_REFUNDABLE、REFUND_AMOUNT_INVALID、REFUND_NOT_PENDING、EVIDENCE_REQUIRED为业务错误。

## 5. 财务（已实现聚合，资金流水缺口）

`GET /api/admin/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=day|week|month`，view.finance（owner/finance）。

当前直接返回`RevenuePoint[]`，不包series：

```json
[{"date":"2026-11-01","confirmedMinor":0,"refundedMinor":199,"orderCount":0,"netMinor":-199}]
```

仅测试示例。date/string，其余number整数分或订单数。from/to两端均包含，按北京时间自然日；周从周一开始，月从1号开始，首桶date可能早于from，但金额仅取请求区间。合法日期且end>=start，跨度最多366天（含首尾最多367个日桶）；非法DATE_RANGE_INVALID。无交易补完整0桶，不以空数组冒充故障。退款取实际confirmed_at，演示排除，历史确认时间null不分配日期。

同订单唯一收款聚合，不按事件重复累加。成本缺失为null/未接入，不推算利润。timezone/currency/range/totals封装尚未实现，不得自行改响应形态；新增v2/可选字段须评估兼容。

`GET /api/admin/dashboard`，view.dashboard：todayConfirmedMinor、monthNetMinor、undatedRefundCount、totalOrders、pendingPaymentReviews、pendingReleases、projectsInProduction、pendingWorkReviews、pendingRefunds、recentOrders、pendingApprovals、agentIncidents、definitions。非owner/finance的两个金额为null。undatedRefundCount为无法确认日期的旧成功退款数。部分计数口径仍需整改，不能把所有金额null解释为0。

分页到账/退款流水尚未提供；不要以最近100条workspace记录做整站财务统计。

## 6. 项目任务与事件（已实现workspace，专用接口未实现）

`GET /api/core/projects/:id/workspace`，项目组织成员。含project、order、entitlement、products、facts、assets、briefs、designs、versions、runs、events，仍沿用既有创意结构。

runs最多最近100条，created_at降序；字段：id/role/employee_key/string，stage/string|null，status/string，attempt/number，error_class/string|null，usage/object|null，output/object|null，created_at/ISO，completed_at/ISO|null，factVersion/number|null。不得把output里的设计结果当审批通过。

events最多最近200条，id降序：id/bigint序列化字符串（稳定顺序），run_id/UUID，status/string，stage/string|null，attempt/number，error_class/string|null，created_at/ISO。来自数据库触发器和Worker，历史任务不补造事件。表内含org_id，通过项目/组织校验后读取；客户端无直接写权限。该截断列表不是完整历史分页接口。

当前任务可从runs中找QUEUED/RUNNING（唯一活动索引）；专用active-run、run详情、afterSequence事件游标、完整历史接口尚未实现。不得按拟议路径调用。

任务创建使用既有 `/api/core/projects/:id/analyze-intake`、`design-options`、`generate`、`publish`、`delivery` 等POST路由；`intake`是直接保存结构化资料，不是模型分析入队。具体创意输入沿用PROJECT_CONTRACT和src/contracts。查询/刷新绝不调用这些POST。审批门禁、事实版本和权益由服务端检查。

## 7. 管理员任务与Worker（已实现）

`GET /api/admin/agents/runs?page=1&pageSize=20&status=RUNNING&role=generate`，view.agents（owner/operations）：分页对象。

items字段：id、role、employeeKey（持久化映射）、stage可null、status、projectId、projectName可null、startedAt、completedAt可null、model（当前null）、tokens可null、costMinor（当前null）、errorSummary可null。startedAt当前沿用run.created_at（排队创建），不等于准确执行开始时间；usage嵌套时tokens可能null，不能编造Token数。

`GET /api/admin/agents/workers`，同权限：最多最近50个实例数组。

字段id/UUID、version/string、started_at/ISO、last_seen_at/ISO、stopped_at/ISO|null、current_run_id/UUID|null、status/online|offline|stopped。45秒未心跳为offline，明确停止为stopped；current_run_id=null不代表无队列。没有实例返回[]，不能解释为Worker在线。现有健康接口尚不返回queue_depth/oldest_queued_at/last_success_at/last_error_at。

员工聚合专用接口尚未实现。B可按employeeKey关联现有列表，但分页中的“未找到”不能当作全局没有任务。

## 8. 其他后台接口（已实现）

| 路由 | 权限/响应 |
|---|---|
| GET /api/core/admin | 平台管理员，role、capabilities、orders、refunds、manualAttempts；兼容旧工作台，列表最多100；非owner/finance的后两项为空，不可当业务无记录 |
| GET /api/admin/orders | view.orders；分页；keyword/payState/from/to筛选 |
| GET /api/admin/orders/:id | view.orders；order、entitlement|null、payments、project|null、versions、runs、refunds、changes |
| GET /api/admin/approvals | view.approvals；审批聚合数组，动作仍走对应受保护接口；部分审批类型尚无管理员写动作 |
| GET /api/admin/works/reviews | view.reviews；分页作品审核只读 |
| GET /api/admin/customers | view.customers；分页组织列表 |
| GET /api/admin/audit-logs | view.audit；分页；旧表缺失返回tableExists=false，不代表审计可忽略 |

## 后续契约变更队列（未实现，不给B伪接口）

1. 支付配置明确NOT_CONFIGURED、有效码校验/受控访问；纯人工模式；付款报告驳回/重提。
2. qty=0归一与字段级错误；快照版本/时间。
3. 退款rejected_at，分页资金事实与趋势元数据/合计的兼容扩展。
4. 单run/活动run/afterSequence事件分页；progress:null、serverUpdatedAt，状态转换约束。
5. 员工聚合与完整Worker健康队列信息；真实usage/model关联，成本保持未知。

待A1确认后逐项实现和测试，再更新本草案为已确认基线。此次仅本地交付，未上传和部署，也未向B发送外部消息。
