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

| 范围 | 当前证据及限制 |
|---|---|
| Render 上的真实用户业务请求和 worker 作业 | Render 真实登录令牌校验和授权数据库查询、Supabase 真实用户 RLS 已通过；线上订单写入和 worker 作业仍待验证。本地订单和真实 worker 验收已通过，不能替代托管作业证据。 |
| B 联调 | 仍需真实前端登录、网站/海报渲染器；creative=false 是预期状态。 |
| 发布、浏览器 QA、PNG/二维码/ZIP 完整交付 | 仍需 B 产物；已有模拟/本地验证不能替代真实客户验收。 |
| 长期在线运营 | Render Free 空闲会暂停 Web 和 worker，当前配置适合开发演示，不保证持续接单。 |

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
