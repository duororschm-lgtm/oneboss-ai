# A 组独立验收

## 已通过（2026-11-07）

- Render 部署版本 `33b0b7b`；用户提供线上 `/api/health` 和 `/api/core/plans` 返回结果，确认应用可访问、原生 PostgreSQL 查询返回两种套餐及三个增项。添加供应商 CA 后该查询成功；不是仅检查环境变量存在。
- `npm run acceptance:a`：两个临时 Supabase 用户真实密码登录；Next.js 生产 HTTP 服务真实向 Supabase 验证 Bearer Token，无认证 mock。
- HTTP 验证组织重复创建返回同一组织、拒绝匿名及无效令牌、拒绝其他租户报价/订单/项目/任务访问、拒绝客户端改价、幂等重放和冲突识别。
- 未付款不能创建项目；本地 sandbox 支付确认重复提交只产生一个支付事件及一份权益；非演示订单不能使用 sandbox；客户不能自行确认人工付款；未付款订单可关闭。没有真实扣款或给任何账号授予平台管理员。
- HTTP 入队后，由独立 worker 进程执行真实 MiMo 资料分析；结果通过严格 Schema，所有模型事实保持未确认；成功状态、输出、usage、完成时间实际写入本地 PostgreSQL，并由授权 HTTP 接口读取。
- 修正角色说明中的历史字段列表与当前 Schema 冲突：明确当前 Schema 是唯一输出契约。无产品 ID 时要求空 facts 和追问，不编造产品 UUID。修正后的真实 worker 首次尝试成功。

最近真实运行证据：`agent_runs.id=e2829a9b-0d3d-4f16-b6fe-0466f75bdfed`，attempt=1，MiMo total_tokens=2061。这是本地一次性测试库中的真实持久化任务 ID，不是托管生产任务或客户交付记录。两个临时 Auth 用户已删除，密码与令牌未记录。

## 可复现方式

准备一个空的本地 PostgreSQL 数据库，名称必须为 `oneboss_acceptance_` 开头。设置 `TEST_DATABASE_URL` 指向 localhost/127.0.0.1/::1；脚本拒绝远程数据库及非空业务库。不要使用生产数据库或生产密码。

安全环境绑定需提供 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`MIMO_API_KEY` 和 `MIMO_MODEL`。

1. `npm ci`、`npm run build`。
2. `npm run acceptance:a`（从安全环境注入 TEST_DATABASE_URL）。
3. 脚本创建并删除两个临时 Auth 用户，不发送邮件；业务数据只写本地测试库；一个作业最多一次实际模型调用，可能产生供应商 token 费用。
4. 结果只包含检查项、测试任务 ID、token 数量和临时账号清理计数。结束后删除专用测试库。若进程被强制终止，应按该测试库组织的 owner_user_id 检查临时 Auth 账号是否残留，仅清理本次创建且 metadata.purpose=temporary-a-acceptance 的账号。

此验收不需要 B 页面，不改 Render 的 ALLOW_SANDBOX，也不使用现有客户账号。脚本本地明确启用 sandbox，不会把演示付款写入托管生产业务库。

## 尚待验证的范围

| 范围                                      | 当前证据及限制                                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render 上的真实用户业务请求和 worker 作业 | Render 真实登录令牌校验和授权数据库查询、Supabase 真实用户 RLS 已通过；线上订单写入和 worker 作业仍待验证。本地订单和真实 worker 验收已通过，不能替代托管作业证据。 |
| B 联调                                    | 仍需真实前端登录、网站/海报渲染器；creative=false 是预期状态。                                                                                                      |
| 发布、浏览器 QA、PNG/二维码/ZIP 完整交付  | 仍需 B 产物；已有模拟/本地验证不能替代真实客户验收。                                                                                                                |
| 长期在线运营                              | Render Free 空闲会暂停 Web 和 worker，当前配置适合开发演示，不保证持续接单。                                                                                        |

独立后端验收与线上环境验收分开记录；不将本地通过等同为全部生产流程通过。

## 线上只读验收补充（2026-11-07）

环境恢复后，Codex 已实际访问 `https://oneboss-ai.onrender.com`，不再仅依赖用户截图。

`RUN_HOSTED_ACCEPTANCE=true npm run acceptance:hosted` 已通过：

- 健康接口、原生数据库套餐查询成功。
- 匿名请求、无效 Bearer 被拒绝；未配置渠道的伪造支付 webhook 返回明确失败。
- 创建一个临时 Supabase Auth 用户，真实密码登录，Render 接受其令牌，并在真实数据库查询不存在任务后正确返回 NOT_FOUND（不是未登录）。
- 该真实用户通过 Supabase Data API 读取订单、项目和权益均为空；直接更改付款状态被 PostgreSQL 42501 权限错误拒绝。
- 临时 Auth 用户已删除，没有创建组织、报价、订单、项目或支付记录。正常认证请求可能留下该临时 UUID 的限流计数，不将其描述为全部审计痕迹已删除。

原拟进行有写入的演示验证，但清理权限预检发现 service-role 通过 Data API 访问业务表返回42501，在创建用户和关联业务数据前停止；未扩大生产授权。最终脚本只进行上述只读业务验证。后续托管 worker 验收应使用可保证清理的测试环境或数据库连接，不能为了测试放宽生产表权限，也不能把演示夹具当成真实付款。

最新应用修正位于47aff0e及之后的feat/core提交；当前无Render控制工具或API凭据，无法直接触发手动部署。GitHub PR #1的两项CI检查均通过。部署和托管worker仍分别记录，不能由本脚本的通过结果推断完成。

## Windows 本地回归与交付边界补强（2026-11-07）

本次已在 Windows Node 24.18.0 重新安装锁定依赖，并使用独立、仅绑定 127.0.0.1 的 PostgreSQL 17.6 空库完成回归：

- 类型检查、46 项单元测试、25 项数据库集成测试及生产构建全部通过。
- SQL Editor 初始化脚本与版本迁移生成结果一致；没有修改已应用迁移。
- 空事实 intake 也会推进事实版本，旧队列任务不能继续使用旧资料；重复产品/事实 ID 被拒绝。
- 修改任务记录解析和修改两次模型调用用量；终态失败记录完成时间，重试成功清除旧错误。
- 海报二维码独立解码，并检查位于指定下方角落；右下优先或左下回退由 B 选择。
- 客户验收要求有效权益、当前版本 HTTP 验证和浏览器验证；交付入库前再次检查浏览器版本，旧事实的已有 ZIP 不能直接重用。
- 新增真实 PNG/二维码/文案/manifest ZIP 字节打包与散列回归，验证可按当前版本验收。
- 新增 `npm run check:config` 和 `docs/LOCAL_SETUP_WINDOWS.md`；配置检查只输出变量名称与问题，不输出值、不发出外部请求。
- health 的 auth 标记同时要求 Supabase URL 和可发布 Key 存在；仍不代表真实认证成功。

该数据库回归中的模型、B 适配器、公开 URL 检查和 Storage 使用受控替身。PNG/QR/ZIP 字节真实生成并校验，但不是 B 的真实客户作品或公网交付证明。

当前本地数据库连接、Supabase 可发布/服务端 Key、MiMo Key 仍待所有者私下填写。B 适配器也未配置。以上回归不能替代最新 Render 部署、托管订单/worker、真实 B 页面、中文海报和手机扫码验收。

## 2026-11-07 本机真实凭据与 B 接入进展

用户已在本地安全填写数据库、Supabase 可发布/服务端 Key 与 MiMo Key。配置格式检查通过；原生 PostgreSQL 可读取 2 个活跃套餐；Supabase Auth settings 返回 200，私有桶元数据确认 public=false。

Windows Node HTTPS 直连曾出现 ECONNRESET。使用机器现有的本地 HTTP 代理 127.0.0.1:10808，并对本地地址设置 NO_PROXY 后通过；没有关闭 TLS 或修改系统网络设置。代理只在本机进程使用，不应抄到 Render。

本机真实验收 `acceptance:a` 通过：run=af29026f-89d8-4671-938c-9fda381375f8，attempt=1，MiMo total_tokens=2024；2 个临时 Auth 用户已删除，专用本地测试库已移除。真实业务写入只发生在专用本地测试库。`acceptance:hosted` 也重新通过：真实 Render Bearer、授权 DB 查询、RLS 与禁止客户端改付款，临时 Auth 用户 1 个已删除，无托管业务记录创建。

用户提供 B 源码 onsboss-b（cdc04e2）。已保留原目录并复用真实网站/海报引擎，通过 A 侧适配层映射合同。B 原 34 项测试通过；A 本地新增真实 B PNG/QR/授权图片/引用/排版回归。B 的 localStorage 演示订单、支付和 Agent 日志未接到生产后端，不能作为完整客户工作台验收。

第一次扩展真实创意验收中，MiMo 设计方向生成成功（d06cd3cb-8a8a-491d-be26-1d1969bf0ae2，3196 tokens），生产结果被 INVALID_SITE_PAGES 拒绝；2 个临时用户清理成功。已明确根页面空 slug 的模型业务合同，并补充业务校验失败时的用量记录，正在重新验收。该失败未产生公开作品，不算生产成功。

## 本机真实 B 创意与浏览器验收通过（2026-11-07）

修正模型业务合同后，扩展验收 `npm run acceptance:b` 已通过。它复用原有空本地数据库保护，真实创建/登录两个临时 Supabase 用户，经生产 HTTP API、独立 worker 和真实 MiMo 完成资料分析、创意方向、Production 生成，再调用实际 B 渲染器 QA 与客户版本批准。

- 分析 run：0dc1d4b8-1144-4183-84d0-944b542cccd6，首轮，2466 tokens。
- 设计 run：17e378e5-67a1-487a-b52f-11f56aec2436，首轮，3321 tokens。
- 生产 run：fece9634-3c4f-48b9-aef8-cea87185c370，首轮，7963 tokens。
- Edge/Playwright 实际加载 B 的 Next 客户端组件，375/768/1280 宽度无横向溢出，信息标签切换真实改变 DOM，无浏览器异常。
- 私有预览、租户隔离、匿名预览拒绝、未发布公开 slug 返回 404 均通过；预览不会修改发布指针。
- 临时 Auth 用户 2 个全部删除。业务数据只落专用本地测试库，不创建托管订单或收款记录。
- 同一真实 Production 经实际 B SVG/Sharp 输出 1080×1350 PNG，95500 bytes，SHA256=67e8e368c6a7a725c9870a14e3649ac6bfabd74fc01baad428e49300ef5ef13e；中文排版已查看，独立二维码解码通过。该文件是隔离渲染样张，二维码使用测试目标，不是公网交付文件。

最新本地回归为 54 项单元、27 项 PostgreSQL 集成；B 原仓库 34 项测试另行通过。数据库/模型/API/worker 和 B 浏览器预览在扩展验收中均为真实实现；正式 HTTPS 发布、手机扫码、私有成品 ZIP 与托管 worker 仍需部署后验收。B 原客户工作台仍使用演示状态，不能把它描述为已接真实订单。

## Render 公网全链路与手机验收（2026-11-07）

这是上述历史待办的最终结果：14101fe 已部署为 Live，部署 dep-dbne9j9srm7s7396ndt0；builtin:b 已启用，health 配置检查通过，托管只读验收重新通过。保留 Free 配置，生产公开 sandbox 仍关闭，本机代理没有复制到 Render。

临时真实 Auth 用户通过 Render HTTP 创建 isDemo=true 订单。公开 sandbox checkout 返回 403；受保护的原生服务端测试进程仅为此 demo 订单调用现有 demo 付款 helper 授权。没有真实付款，也没有扩大 Data API/RLS 权限。因此不代表正式商户支付或生产 HTTP sandbox 已验收。

本机 worker 停止，以下任务全部由 Render worker 完成：

| 任务 | run                                  | 结果 / tokens    |
| ---- | ------------------------------------ | ---------------- |
| 设计 | 077f0c57-3ade-4583-94dd-9220e38113f3 | SUCCEEDED / 3393 |
| 生成 | ab2f34b0-aa7b-494b-a44a-1b05a2c8b4e6 | SUCCEEDED / 7368 |
| 发布 | 0dd96436-ae15-4909-8116-28997f32c97b | SUCCEEDED        |
| 交付 | f4bb731a-006d-4b26-8586-501913bc793c | SUCCEEDED        |

真实 HTTPS 页面在 375/768/1280 下交互通过，无横向溢出。私有签名 ZIP 下载 76566 bytes，逐项核对 manifest 大小及 SHA256；PNG 1080×1350、95925 bytes，SHA256=44ba8a24f158f625ab1c9d6ee897e3402029a6e0f179dc405b7cfc1b74f9d23f。独立二维码解码与公开地址匹配，客户验收已提交。用户亲自手机扫描真实二维码并回复“能打开并切换标签”。

原脚本因本机原生 DB TCP 重置中断；恢复过程只使用同一临时账号和项目，通过 HTTPS 取回已完成交付并验收。账号恢复使用服务端生成 magiclink，不发送邮件、不修改其他账号。最终严格按临时 org/owner 清理业务表、私有文件及 Auth 用户；result.json 确认清理全部成功。公开测试页已删除，留存二维码目标不再可访问。

本地证据位于忽略的 .cache/hosted-acceptance/：result.json、manifest.json、delivery.zip、poster.png、qr.png、三个浏览器截图及 phone-review.json；部署截图 .cache/render-live-14101fe.png。证据不含凭据。新 acceptance:hosted:write 脚本要求 RUN_HOSTED_WRITE_ACCEPTANCE=true，并增加 HTTPS 轮询、严格 TLS 的有限原生连接重试、幂等 demo 授权和清理；重构后的整脚本未再重复消耗真实模型调用，上述成功来自原运行及同项目恢复。

A 后端与引擎交付验收完成；B localStorage 客户工作台仍需接真实登录/API，正式商户收款未验收。

## 新客户工作台托管验收（2026-11-07）

8b3ee9b 部署后，使用一个明确 demo 的临时订单，通过实际浏览器登录、上传私有素材、保存/批准事实、批准创意方向、真实 MiMo 生成、私有网站标签互动、草稿海报、发布、下载和客户验收。随后真实模型仅修改网站，发布版本2，再经客户界面回滚版本1。Render worker 的每次发布均完成375/768/1280浏览器检查。

初次运行遇到网关 HTML 响应中断；使用同一临时账号和项目恢复后完成交付与回滚，不声称整脚本无中断通过。新增客户端有界重试保留同一幂等键，业务 JSON 拒绝不重试。本机数据库清理使用已有回环代理，数据库端到端 TLS 验证保留。

最终证据 `.cache/hosted-customer-ui/result.json`：passed=true、flowRecovered=true、temporaryBusinessRecordsRemoved=true、temporaryAuthUserRemoved=true、realPayment=false、isDemo=true。测试公网页已清理。

版本1和2的海报都为1080×1350、103626 bytes，SHA256 `dd9a8e0abd4321452c2fd61b0be9b040a1c43994bb196834ae313be21225539c`，证明网站局部修改保留海报。ZIP逐项哈希、二维码地址及回滚版本匹配均通过。该轮使用自动浏览器；用户未做新的手机实测。

最新价格与人工核验：基础版199分、专业版599分，仅修改目录而保留历史快照。收款码原图、付款说明、待核验与管理员到账确认已接入，63项单元/33项PG/生产构建/隔离真实浏览器通过。用户指定的已存在确认邮箱获平台审核权限；密码未改变。未发生真实资金收款或退款。外部新用户注册发信仍需自定义SMTP配置，微信Native商户模式关闭。

## 原始 B 策划补测：双尺寸、多产品与导航

原始 B 策划第16项要求竖版与方形两种真实PNG。当前实现补充逐张格式选择、exact数量/尺寸门禁及多产品目录完整性检查。旧brief与交付清单兼容，不修改历史订单价格或既有作品。

本机结果：67项单元、33项PostgreSQL、类型检查和生产构建通过。隔离真实Auth/API/浏览器输入并保存10款产品，关联目录切换至第10款详情；两种草稿PNG实际像素分别1080×1350、1080×1080；子页预览、首屏/返回顶部锚点、键盘标签焦点、Markdown下载、公开子页导航与批准元数据在375/768/1280检查通过。临时Auth账户全部删除。证据 `.cache/customer-ui/result.json` 及同目录截图。该轮作品是明确fixture，不冒充模型输出或正式发布。

修复包括B旧hero区块ID不匹配、iframe内查找父document、没有目标的联系按钮、标签键盘焦点和多产品表单可访问名称。独立二维码存入私有Storage；服务端只为当前交付目录下的清单文件签名，陌生租户及外部文件路径不能获得下载链接。旧交付仍可从ZIP取得二维码。

最新代码的托管双尺寸/两产品真实模型验收待部署后记录。邮件配置由用户明确暂缓，外部注册保持诚实提示；不得把暂缓写成发信已通过。

## 暂停与交接状态

29a9227 已部署 Live，CI42373299734成功。最新手机视口两产品补测的设计 ea3c6020-c542-418e-927a-617ed4e97704 和生成 6a0efe01-af8e-4264-87d3-c1a7b796fb1d 均 SUCCEEDED，分别3878、12069 tokens；发布阶段遇验收脚本非JSON网关响应中断，因此不能宣称新的双尺寸正式交付全链路通过。完整目标由用户暂停，未启动补测重跑；停止相关后续工作并进行精确临时数据清理。完整未完成清单见仓库根目录 未完成事项.md。

已将较早实际通过的托管演示海报与ZIP整理到 docs/showcase/，明确标注测试链接已清理。它们不包含真实客户资料或资金收款，也不代表本轮尚未完成的双尺寸交付。
