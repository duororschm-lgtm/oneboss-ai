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
| Render 上的真实用户业务请求和 worker 作业 | 本地生产 HTTP + 真实 Auth/MiMo 已通过；尚未在 Render 上执行完整授权流程或作业。当前 Codex 网络策略拒绝 Render 域名，已保存仅新增 oneboss-ai.onrender.com 的草稿，需用户应用后继续。 |
| B 联调 | 仍需真实前端登录、网站/海报渲染器；creative=false 是预期状态。 |
| 发布、浏览器 QA、PNG/二维码/ZIP 完整交付 | 仍需 B 产物；已有模拟/本地验证不能替代真实客户验收。 |
| 长期在线运营 | Render Free 空闲会暂停 Web 和 worker，当前配置适合开发演示，不保证持续接单。 |

独立后端验收与线上环境验收分开记录；不将本地通过等同为全部生产流程通过。
