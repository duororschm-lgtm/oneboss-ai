# A 后端开发部署（Render / Docker）

这是 A 组 Core API 和持久化队列 worker 的开发/演示部署，不包含 B 组官网、工作台或渲染器。不自动部署、不自动合并 PR、不创建付费资源。

## 文件与运行方式

Dockerfile 构建 Next.js，并以非 root 用户运行 `scripts/start-service.mjs`。同一个容器启动 HTTP 服务和独立队列 worker；任意子进程意外退出，会停止另一个进程并返回非零状态，由平台重启。正常停止先给双方 SIGTERM，20秒后仍未退出才终止；未完成作业由数据库租约机制恢复。

平台 PORT 默认10000；若未设 APP_URL，启动器从 Render 的 RENDER_EXTERNAL_URL 传给两个子进程。`/api/health` 是进程存活检查，不代表数据库或客户交付已验收；用 `/api/core/plans` 和真实授权流程验证功能。

部署前已完成 hosted Supabase SQL Editor 初始化。这里不自动运行迁移，也不改写已有数据。

## Render 操作

1. 在 Render 控制台用 GitHub 登录，只授权需要部署的 oneboss-ai 仓库。
2. 可使用仓库的 render.yaml 创建 Blueprint；或新建 Web Service，选择该仓库、feat/core 分支、Docker 运行方式、Singapore 地区、Free 实例。
3. Dockerfile 使用仓库根目录的 `Dockerfile`，健康检查路径 `/api/health`。保留手动部署模式。
4. 在 Render 的安全环境变量输入框填写下表，然后创建/部署。不要把值放入代码、截图、聊天或 PR。
5. 部署成功后先验证 `/api/health` 和 `/api/core/plans`；再验证登录与授权订单。B 模块尚未接入时，公开作品/海报流程应明确失败。

Free Web Service 可能因空闲而休眠，后台执行器也会一起暂停，适合开发演示。正式持续接单需要不会休眠的运行实例和后续运营评估；本配置不会自动升级付费实例。服务重启后不会依赖容器本地磁盘保存客户数据，订单和作业在 Supabase，成品在私有 Storage。

## 必填配置

| 名称 | 填写内容 |
|---|---|
| DATABASE_URL | Supabase Session pooler 的完整 URI，可原样保留 `[YOUR-PASSWORD]` 占位符；端口5432、数据库名postgres，不要用 Dashboard URL |
| DATABASE_PASSWORD | 创建项目时保存的原始数据库密码；不是 Supabase API Key。单独填写后程序会覆盖 URI 中的密码，不必手动百分号编码 |
| NEXT_PUBLIC_SUPABASE_URL | 项目 HTTPS API 地址 |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Supabase 可发布密钥 |
| SUPABASE_SERVICE_ROLE_KEY | 服务端私密密钥，支持当前使用的新式 secret key；不能放到 NEXT_PUBLIC_* |
| MIMO_API_KEY | 已验证的 MiMo API Key |
| MIMO_MODEL | 已验证的模型 ID，当前蓝图默认 mimo-v2.6-pro |

如果 DATABASE_URL 已含正确编码的真实密码，可以不单独提供 DATABASE_PASSWORD。使用独立密码时不要改 URI 的用户名、主机、端口和数据库名。

远程数据库连接强制验证 TLS 证书；URL 中的 sslmode=disable/require 不会关闭程序的证书验证。如果服务提供方要求自定义 CA，在 Render 中另加 DATABASE_CA_CERT（提供方的可信 PEM 证书），不能通过关闭验证解决证书错误。

ALLOW_SANDBOX 默认false；需要演示时明确启用true，且只能确认 isDemo=true 的订单，不产生真实收款。B 模块接入、公开站点浏览器检查和完整交付验收仍是后续独立步骤。

两个 NEXT_PUBLIC_* 是浏览器公开配置，可参与 Next.js 构建；MiMo、服务端 Supabase key、数据库密码都仅运行时注入，绝不作为 Docker build args。镜像排除 .env、私钥文件、Git 元数据与本地构建缓存。不要在 Dockerfile 中写入真实配置值。

## 已验证与待验证

本地已构建同一 Dockerfile，使用本地测试数据库验证真实容器的套餐查询、未登录请求拒绝、worker 存活、非 root 运行、没有 .env/构建CA泄漏；意外终止 worker 会让整个服务失败退出，正常停止返回0。

数据库配置测试验证了独立密码的特殊字符处理和远程 TLS 强制校验。托管 Supabase 的原生 TCP/TLS 握手及 Render 实际部署尚待用户配置并执行，不能据本地容器通过宣称已上线。
