# OneBoss AI — 创意宣传制作服务

统一 Next.js 工程已接入 A 后端与实际 B 渲染引擎，并实现官网、套餐、真实登录、订单、产品资料、设计批准、预览、局部修改、发布与交付工作台。提供方 BlackCode。当前整站集成仍在验收，最新状态见 [项目完成矩阵](docs/PROJECT_COMPLETION.md)，历史 A/B 公网验收见 [验收证据](docs/A_ACCEPTANCE.md)。

正式微信支付默认关闭，所有者已明确稍后配置商户。外部邮箱注册/重置需要自定义 SMTP，目前入口提示未开放；已有已确认账户可登录。没有把演示订单当作真实收款。

客户页面：`/`、`/pricing`、`/checkout`、`/login`、`/dashboard`、`/dashboard/projects/:id/intake|creative|studio|revise|delivery|agents`。平台审核：`/dashboard/admin`，要求已有 `platform_admins` 授权，不自动授予新账户权限。

## 本地开发

需要 Node.js 24、npm；数据库为 Supabase Postgres。使用当前 checkout，通常无需新建 worktree。

```sh
npm ci
cp .env.example .env.local
# 在 .env.local 配置服务；切勿提交真实值
npm run db:migrate # 空托管数据库；本地 supabase start 已迁移时跳过
npm run dev
# 在另一个终端运行持久化任务执行器
npm run worker
```

可通过 Supabase CLI `supabase start` 启动完整本地 Auth/Postgres/Storage，配置文件已提供。
也可使用已有托管 Supabase。`DATABASE_URL` 是服务端可信数据库连接，不能传浏览器；连接角色必须能执行迁移和服务端写入。
测试使用真实 PostgreSQL，但不等同于完整 Supabase Auth/Storage 联调。

- [A/B 接口合同与接入说明](docs/PROJECT_CONTRACT.md)
- [配置、启动、故障恢复与验收](docs/RUNBOOK.md)
- [Windows 本地凭据填写](docs/LOCAL_SETUP_WINDOWS.md)
- [人工核验微信收款](docs/MANUAL_PAYMENT.md)
- [微信商户私下配置](docs/WECHAT_SETUP.md)
- [外部注册发信配置](docs/EMAIL_SETUP.md)
- [A 后端 Docker / Render 开发部署](docs/DEPLOY_RENDER.md)
- [当前验证证据与未完成项](docs/demo-proof.md)
- [开源选型记录](docs/opensource-audit-a.md)

## 检查

```sh
npm run typecheck
npm run check:config # 只检查必需配置与格式，不输出值、不连接远端
npm test
# 指向空的、可丢弃的 PostgreSQL 数据库；测试拒绝已有业务表
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/oneboss_test npm run test:integration
npm run build
# 配置真实 MiMo 后执行，失败返回非零退出码
npm run smoke:mimo
# 使用同样的空本地验收库与真实凭据，增加实际 B 渲染器和私有浏览器验收（实际模型费用）
npm run acceptance:b
# B 渲染器与正式 HTTPS 部署接入后
npx playwright install chromium
npm run smoke:public -- <published-slug>
```

所有状态变更请求除组织初始化、二进制素材上传外，均携带 `Idempotency-Key`（8–100 个字母、数字、下划线或短横线）。
身份通过 Supabase Bearer access token 验证，不接受客户端自报用户 ID。

## 支付边界

`ALLOW_SANDBOX=true` 仅用于明确标记 `isDemo=true` 的演示订单。未配置正式支付通道，Webhook 一律拒绝。
真实人工核验必须由数据库中显式登记的 `platform_admins` 成员执行；普通客户的 owner/admin 角色不具备收款确认权限。
没有实际入账依据不得调用人工确认。退款申请不等于退款到账。
