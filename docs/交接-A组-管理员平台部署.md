# 管理员平台上线交接（给 A 组）

> 交接时间：2026-11-08 00:57　提交：`65dadf7`　分支：`feat/core`
> 一句话：**代码已经推上去了，只差你点一次部署；部署后线上会多出一个 `/admin` 后台，同时客户工作台里的旧审核页会下线。**

---

## 一、要你做的三件事

1. 拉取 `feat/core` 最新代码
2. 在 Render 上手动部署（`autoDeployTrigger: off`，push 不会自动上线）
3. 按第五节跑一遍验收

---

## 二、拉取

```bash
git fetch origin
git checkout feat/core
git pull --ff-only
git log -1 --oneline
# 期望：65dadf7 refactor(customer): retire in-portal admin page, /admin is the only admin entry
```

⚠️ **不要切到 `main`** —— `main` 还停在 `Initial commit`，Render 监听的是 `feat/core`。

本次涉及 6 个提交：

| 提交 | 内容 |
| --- | --- |
| `65dadf7` | 删除客户工作台内嵌的审核页，`/dashboard/admin` 重定向到 `/admin` |
| `807f0e8` | 管理员登录改为运行时读取 Supabase 配置 |
| `302fe18` | 新增运维脚本 `scripts/create-admin.ts` |
| `6d2fd3c` | 权限探测增加超时与重试，避免卡死在「无权限」 |
| `09b4ae0` | 修复登录页 CSS 变量缺失（输入框/按钮不可见） |
| `87a228c` | 管理员平台主体（27 文件 / 4419 行）合入 `feat/core` |

---

## 三、部署

Render → 服务 `oneboss-core` → 右上角 **Manual Deploy ▾** → **Deploy latest commit**。

- 不要选 **Clear build cache & deploy**（本次不需要，会多花几分钟）
- 预计 5–8 分钟，日志出现 `Your service is live` 即可
- 免费实例要装 chromium + 中文字体，慢是正常的

### 环境变量：不需要新增

现有配置已经够用，部署前确认这几项还在即可：

```
DATABASE_URL                    DATABASE_PASSWORD          DATABASE_CA_CERT
NEXT_PUBLIC_SUPABASE_URL        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY       MIMO_API_KEY               MIMO_MODEL
APP_URL                         STORAGE_BUCKET             ALLOW_SANDBOX=false
```

### 为什么这次不依赖 Docker build args

`807f0e8` 之前，管理员的浏览器端认证依赖 `NEXT_PUBLIC_*` 在构建期内联；而 `render.yaml` 里只有 `envVars`、没有 `buildArgs`，构建阶段很可能拿不到值，登录页会直接报「登录服务尚未配置」。

现在改成服务端布局在运行时读 `process.env` 再注入客户端（`src/components/admin/auth-config.tsx`），已验证：**不带 `NEXT_PUBLIC_*` 构建、运行时提供** 的情况下登录依然可用。

---

## 四、部署后线上会变成什么样

### 新增（10 条路由，独立于客户站）

```
/admin              经营总览
/admin/login        管理员登录（独立入口，深色 SaaS 风格）
/admin/orders       订单管理（真实数据）
/admin/finance      财务与收入
/admin/approvals    放行与审批（收款核验、退款确认/驳回 —— 真实写操作）
/admin/agents       AI 员工监控
/admin/reviews      作品审核
/admin/customers    客户（P1）
/admin/plans        套餐（只读，真实数据）
/admin/audit-logs   审计日志
```

### 下线

- `/dashboard/admin` 页面**删除**（`src/components/customer/admin.tsx` 已移除），旧链接自动跳到 `/admin`
- 客户工作台侧边栏不再出现「服务审核」入口

### 文档同步

`README.md`、`docs/MANUAL_PAYMENT.md`、`docs/当前任务分工.md` 里的管理员入口地址已全部改为 `/admin`。

---

## 五、部署后验收（5 条）

```bash
# 1. 服务与配置
curl -s https://oneboss-ai.onrender.com/api/health
# 期望：200，configured 四项 database/auth/mimo/creative 全 true

# 2. 管理员登录页
curl -s -o /dev/null -w "%{http_code}\n" https://oneboss-ai.onrender.com/admin/login
# 期望：200
```

3. **浏览器打开 `/admin/login`**：要能看到深色登录页，**输入框有边框、有蓝色主按钮**（如果只剩几行文字，说明 CSS 没生效）
4. **浏览器打开 `/dashboard/admin`**：应跳转到 `/admin/login`（未登录时）
5. **客户站回归**：`/`、`/pricing`、`/login`、`/dashboard` 正常，客户登录后工作台没有「服务审核」标签

---

## 六、部署前后需要你确认的两件事

### ① 管理员账号

`platform_admins` 表目前只有 `3068792128@qq.com` 一个成员。要给新同事开权限，任选其一：

```bash
# 方式 A：运维脚本（已推送）
ADMIN_EMAIL=xxx@example.com RUN_CREATE_ADMIN=true npm run admin:create

# 方式 B：Supabase 控制台建用户 → SQL Editor
insert into platform_admins(user_id) values ('<uid>');
```

### ② A-02 卡点的根因判断

`未完成事项.md` 里记了一句：「Render 历史事件确认曾因**超过 512MB** 重启」。如果确认这就是间歇性网关非 JSON 的根因，那么：

- Free（512MB）和 Starter（$7，仍是 512MB）都解决不了
- 需要 Standard（$25，2GB）才够 Next.js + worker + Chromium 同时跑

这是花钱决策，需要你拍板后再重跑 A-02。

---

## 七、A 组后续待补接口（管理员平台现在是「有界面没数据」）

后台页面已全部实现，缺后端时**显示缺口编号，不显示任何数字**。已列入 `docs/admin/02-阶段0-接口缺口清单.md`：

| 编号 | 接口 | 影响页面 |
| --- | --- | --- |
| A-01 | `GET /api/admin/dashboard` | 经营总览 8 张指标卡 |
| A-02 | `GET /api/admin/revenue` | 财务与收入、收款趋势 |
| A-03 | `GET /api/admin/orders` | 订单服务端分页/筛选 |
| A-04 | `GET /api/admin/orders/:id` | 订单详情（权益快照/支付记录/版本） |
| A-05 | 制作放行 / 暂缓 | 审批中心 |
| A-06 | `GET /api/admin/agents/runs` | AI 员工监控（`agent_runs` 表已有数据，只缺出口） |
| A-08 | 作品审核队列与动作 | 作品审核中心 |
| A-09 | `GET /api/admin/customers` | 客户管理 |
| A-11 | `GET /api/admin/audit-logs` | 审计日志（**表尚未建立**） |

**优先建议 A-11**：后台现在能真实执行的只有「收款核验」和「退款核验」两个写操作，而它们**没有任何审计留痕**。

---

## 八、已知风险

1. **`/admin` 上线即公网可访问**。已有 Supabase 登录 + `platform_admins` 白名单 + `noindex`，但建议上线后用一个非管理员账号验证确实被挡。
2. **首次进入后台约 8 秒**才出数据（首次 `/api/core/admin` 要建立 DB TLS 连接 + 校验 JWT）。已加 12 秒超时 + 3 次重试，不会卡死，但体验偏慢。
3. **`platform_admins` 没有角色列**，四角色 RBAC 无法落地，当前只能做到「是 / 不是管理员」。已在缺口 A-07。
4. **旧链接 `/dashboard/admin` 会跳转而不是 404**，如果有外部系统引用，请改到 `/admin`。

---

## 九、附：本地验证过的内容

| 检查 | 结果 |
| --- | --- |
| `tsc --noEmit` | 0 错误 |
| `vitest run tests/unit` | 12 文件 / 94 用例全过 |
| `next build` | 通过，10 条 admin 路由产出 |
| 真实登录 E2E | 通过（Supabase 真实账号 + `platformAdmin()` 校验） |
| 真实数据读取 | `/api/core/admin` 200，读到 8 条订单、1 条待核验收款 |
| 缺口降级 | `/api/admin/dashboard` 404 → 页面显示「接口未提供 · A-01」，不显示数字 |
| 旧链接跳转 | `/dashboard/admin` → `/admin/login` |

**尚未验证**：线上真实浏览器截图、非管理员账号被拒（本机没有第二个管理员/普通账号组合）。
