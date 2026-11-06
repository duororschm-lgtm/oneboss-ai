# A 组运行手册

## 配置

只把占位 `.env.example` 提交到 Git。将实际值放环境设置或被忽略的 `.env.local`；不要发送到聊天或写进日志。

| 配置 | 用途 |
|---|---|
| DATABASE_URL | 服务器 Postgres 连接；迁移/可信业务事务，禁止暴露浏览器 |
| NEXT_PUBLIC_SUPABASE_URL | Supabase 项目 URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Supabase 公开客户端键；身份 token 的远程验证 |
| SUPABASE_SERVICE_ROLE_KEY | 仅服务器私有 Storage 访问，禁止客户端使用 |
| MIMO_API_KEY | 已有 MiMo 账号的服务端 API 凭据 |
| MIMO_MODEL | 账号实际可用的 model ID；不能凭策划书猜测可用性 |
| MIMO_BASE_URL | 固定官方 https://api.xiaomimimo.com/v1 |
| APP_URL | OneBoss 正式 HTTPS origin，无路径；不是预览占位域名 |
| ALLOW_SANDBOX | 默认 false；显式 true 才允许演示订单模拟确认 |
| STORAGE_BUCKET | 默认 oneboss-private，必须是私有 bucket |
| CREATIVE_ADAPTER_MODULE | B 编译后的可信 JS 模块绝对路径，详见工程合同 |

网络：MiMo 需要 api.xiaomimimo.com；GitHub PR 需要 api.github.com；Supabase 需要实际项目域名；公网核验需要 APP_URL 主机。
原始 TCP PostgreSQL 连接需要环境允许相应主机/端口；HTTPS 代理的允许列表不能代替数据库 TCP 权限。
托管 Postgres 使用服务提供方要求的 TLS 验证配置和可信 CA，不要通过关闭证书检查解决问题。
历史草稿编辑限制已由用户发布新配置解决，MiMo 密钥与模型变量已安全注入并通过基础真实调用。后续凭据仍需在环境设置配置，不在聊天发送或存进代码。

## 初始化与启动

在现有 `/workspace/oneboss-ai` checkout 工作，不创建额外 worktree。

1. `npm ci`，从环境设置注入配置；本地可复制 `.env.example` 到 `.env.local` 后填写。
2. 本地可运行 `supabase start`，CLI 自动应用迁移后不要再混用自定义迁移器，后续使用 `supabase migration up`；空的托管数据库先备份再 `npm run db:migrate`。脚本逐文件校验 hash，重复执行不重复迁移；已应用文件不可修改。
3. 迁移会在完整 Supabase 上建立私有 bucket。若使用自定义 STORAGE_BUCKET，需管理员单独创建同等私有 bucket，且不能开启匿名读取。
4. 开发运行 `npm run dev`，另一个终端运行 `npm run worker`。生产 `npm run build` 后运行 `npm start`，以及独立常驻 worker。仅部署 Serverless HTTP 路由不会执行后台任务。
5. `GET /api/health` 只验证进程及配置存在性；再执行真实 DB、Auth、Storage 和 MiMo 操作确认服务。
6. B 交付后按 PROJECT_CONTRACT.md 接入模块；公开页面缺少 B 时明确失败，不伪造作品。

服务不自动创建真实收款渠道，也不自动采购域名/部署账号。
Node/SDK 的 HTTPS 访问保留代理与 TLS 验证；代理凭据占位符必须通过指定 HTTPS 目的地主机使用。

## 首个可验证订单

使用 Supabase 登录得到 access token；客户端不使用 service-role。下列操作均由真实 API/数据库执行，不能把测试 fixture 当成真实客户订单。

1. 创建组织、取套餐与增项、服务器报价、创建 `isDemo=true` 订单。
2. 在明确启用 ALLOW_SANDBOX 的开发环境创建 sandbox 支付尝试，使用订单真实金额和币种确认，检查只开通一次 demo 权益。
3. 创建项目，上传授权素材，保存产品与事实快照，客户确认摘要。
4. `analyze-intake` 可先获取模型追问；模型提出的事实一律未确认。实际资料完整时不强制跑所有 AI 角色。
5. 获取 design-options 运行 ID，轮询真实任务；选择候选设计后 generate。
6. B QA 与客户批准后调用 publish，等待发布任务 HTTP 验证成功。
7. 部署环境安装 Playwright Chromium，执行 `npm run smoke:public -- <slug>`。三种宽度均通过后，脚本记录该精确发布版本的浏览器验收。
8. 调用 delivery，worker 向 B 注入实际 HTTPS URL，验 PNG/尺寸/二维码、上传成品、生成 ZIP 与 manifest。
9. 获取五分钟有效的私有下载 URL；核对 ZIP 文件和 manifest；客户按 manifestVersion 验收。

正式 `manual_verified`：平台运营先在可信支付系统核对真实到账，再由明确授权的操作员调用 confirm-manual。订单拥有者不是运营管理员。
平台管理员由数据库管理员登记 `platform_admins(user_id)`，并显式加入需要操作的客户组织。绝不提供客户自助提升权限接口。
退款 REQUESTED 暂停制作；人工核验退款到账后才 CONFIRMED。部分退款保留记录并暂停制作，争议人工处理。

## 审批、版本与恢复

- 更新 intake 会保存新的完整事实快照，旧版本保留。旧站不会被静默重写，新的发布须匹配当前事实。
- 同一 JSON POST 的网络重试复用 Idempotency-Key；新业务操作使用新 key。
- 每项目一次只执行一个任务。worker 退出后，新 worker 可在五分钟租约过期后接管；最多三次尝试，30秒心跳续租。
- 失败不会写 SUCCEEDED。缺少 MiMo/B 模块、权益或事实版本变化会暴露错误；修复配置后重新提交业务操作。
- 修改请求预留一次修改额度；明确失败或仅要求事实确认会返还额度。成功预览消耗一次。
- 发布失败恢复旧指针，发布操作带租约 token 防止过期 worker 覆盖新发布。最终二维码只使用已验证的正式链接。
- 浏览器验收绑定精确发布版本；发布新版本需重跑。交付必须同时具备 HTTP 和浏览器验收。
- 海报任务使用独立存储路径，过期 worker 无法覆盖新任务文件。失败可能留私有孤立文件；运营按未引用路径定期清理，不删除已交付文件。
- 项目托管期限由付款时 hosting_days 锁定，过期或权益撤销时公开查询不返回作品；延长托管需后续运营流程。
- 日志只保留请求 ID/错误类别，实际作品与任务输出在受组织权限保护的数据库中。
- 定期备份数据库及私有文件。定期按保留策略清理 rate_limits、api_idempotency 和未引用临时产物；不要直接删除审计和历史订单。

## 未接入时的判定

没有 MIMO_API_KEY/MIMO_MODEL，真实模型 smoke 必须失败；没有 Supabase 配置，Auth/Storage 必须失败；没有 B 适配器，作品审批/渲染必须失败；没有公网 HTTPS，不得生成最终二维码成品。
这些是待接入事项，不得因单元测试通过而宣布完整商业链路完成。
