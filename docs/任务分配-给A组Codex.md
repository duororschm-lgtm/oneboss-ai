# 任务分配（给 A 组 / Codex）

更新时间：2026-11-08 03:30　基线提交：`eb3878e`

---

## 0. 先看这三个环境，别搞混

| 环境 | 地址 | 代码版本 | 状态 |
| --- | --- | --- | --- |
| GitHub | `feat/core` | **`eb3878e`** | 最新，唯一可信源 |
| Render（旧生产） | `oneboss-ai.onrender.com` | ≈ `807f0e8` | **落后 6 个提交**，且 worker 仍在跑 |
| DevBox（新环境） | `cwforsetsryx.sealoshzh.site` | `e179bf1` + 手工补的 runner.ts | 4GB / 2Core，HTTP + worker 都在跑 |

数据库只有一份（Supabase `mxyocfnzrfpujnkqikbp`），三个环境都连它。

---

## P0-1　先停掉 Render 的 worker（最紧急，5 分钟）

**为什么**：DevBox 上现在也起了 worker，两边轮询同一个 `agent_runs` 队列。
新代码（二维码位置修复）在 DevBox，旧代码在 Render —— **谁抢到任务就用谁的逻辑**。
现在点"重新生成"有一半概率跑到旧逻辑上。

**做法**：Render → `oneboss-core` → 右上 **Suspend**（不要删服务，暂停即可恢复）。

**验收**：Render 服务状态变成 Suspended；DevBox 上 `ps -ef | grep worker.ts` 仍能看到 worker。

---

## P0-2　决定 Render 的去留（半小时）

三选一，选定后写在这里：

| 方案 | 动作 | 影响 |
| --- | --- | --- |
| A. 继续用 Render | 部署 `eb3878e`，同时保留 DevBox 做测试 | 512MB 内存，A-02 的 OOM 大概率还在 |
| B. 切到 DevBox | 保留旧域名 301 → 新域名，再 Suspend Render | 4GB，但要处理域名和二维码 |
| C. 两个都留 | Render 只跑 web 不跑 worker | 需要改 `start-service.mjs` 或加环境开关 |

**推荐 B**，因为 A-02 的根因高度怀疑是 512MB 内存（Render 历史事件曾因超过 512MB 重启）。

---

## P0-3　A-02 最终交付验收（这是项目完成的唯一硬阻塞）

**现状**：`未完成事项.md` 记录最新一次真实生成拿到 3943 tokens 后 `TASK_FAILED`，
失败点在 `publish` 的浏览器验收（三宽度 Chromium 检查）。

**这次要在 DevBox 上跑**（4GB 内存），验证是不是 OOM：

```
1. 客户登录 https://cwforsetsryx.sealoshzh.site/login
2. 走一遍：资料 → 创意方向 → 生成 → 批准 → 发布
3. 发布阶段盯 Render / DevBox 的日志
```

**判定标准**：

| 现象 | 结论 |
| --- | --- |
| 发布成功，`published_verified=true` | ✅ 确认是 OOM，DevBox 解决 |
| 仍然 `TASK_FAILED` | 不是内存问题，需要看 `src/lib/publishing/browser.ts` 的具体超时点 |
| 日志出现 `Exit status 137` / `Killed` | 仍是 OOM，需要再加大内存 |

**建议同时做**：给 `browser.ts` 的四个可能失败点各包一层 try/catch，转成具体错误码
（`BROWSER_LAUNCH_FAILED` / `BROWSER_NAV_TIMEOUT` / `BROWSER_INTERACTION_TIMEOUT` / `BROWSER_CRASHED`），
否则永远只有一个笼统的 `TASK_FAILED`。见 `docs/排查-发布任务失败.md` 第七节。

---

## P0-4　域名切换（如果选方案 B）

清单在 `docs/迁移-DevBox部署.md` 第十节，关键三步：

```
1. Supabase → Authentication → URL Configuration：Site URL / Redirect URLs 改成新域名
2. 旧域名 oneboss-ai.onrender.com 配 301 → 新域名（保住已发出的二维码）
3. README / docs/MANUAL_PAYMENT.md / docs/当前任务分工.md 里的链接
```

⚠️ `APP_URL` 必须是 `https://` + 真实域名，`appOrigin()` 会拒绝 http、IP、localhost。

---

## P1-1　补 RBAC（管理员角色）

**现状**：`platform_admins` 只有 `user_id` 一列，任何被加进去的人都是全权限
（能确认收款、能退款、能看全部客户）。任务书要求的四角色无法落地。

**做法**：

```sql
-- 新迁移文件 supabase/migrations/202611090001_admin_roles.sql
alter table platform_admins add column role text not null default 'owner'
  check (role in ('owner','finance','operations','reviewer'));
```

服务端在 `src/lib/core/service.ts: platformAdmin()` 里增加角色查询并返回；
`/api/admin/*` 各端点按角色校验（财务相关限 owner/finance，内容相关限 owner/reviewer）。

前端 `src/lib/admin/permissions.ts` 已有能力矩阵骨架，把 `resolveRole(isAdmin)` 换成从 API 拿真实角色。

**验收**：建一个 `reviewer` 账号，访问 `/admin/finance` 应被拒（服务端 403 + 前端不渲染）。

---

## P1-2　补审批写操作

**现状**：审批中心里只有「人工收款核验」和「退款核验」是能真干的，
制作放行 / 暂缓 / 要求补充资料 / 作品审核的通过驳回都只有只读列表。

**为什么没做**：这些动作需要先定义状态机 —— 现在 `projects.status` 没有「已放行」这个态，
放行到底改什么字段、要不要新建审批表，是产品决策，不是纯技术活儿。

**建议先定这个**：

| 动作 | 改哪个字段 | 谁来触发 |
| --- | --- | --- |
| 制作放行 | `projects.status` 是否加 `RELEASED`？ | 运营 |
| 暂缓 | 订单还是项目上挂标记？ | 运营 |
| 作品审核通过 | `artifact_versions.status` 从 RENDERED → APPROVED？ | 审核员 |

定完之后接口形如：

```http
POST /api/admin/orders/:orderId/production-release
POST /api/admin/orders/:orderId/hold
POST /api/admin/works/:projectId/review
```

所有写操作都要落 `admin_audit_logs`（表已建好，`src/lib/core/audit.ts` 有现成的 `recordAudit`）。

---

## P1-3　给 DevBox 配 git 凭证

**现状**：DevBox 上 `git pull` 失败 —— `could not read Username for 'https://github.com'`。
我克隆时用的临时 token 已经清除（安全考虑），现在拉不了新代码。

**做法**（二选一）：

```bash
# A. deploy key（推荐）
ssh-keygen -t ed25519 -C "devbox-oneboss" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
# 复制到 GitHub → repo → Settings → Deploy keys（只给读权限）
git remote set-url origin git@github.com:duororschm-lgtm/oneboss-ai.git

# B. gh CLI
# 在 DevBox 上安装 gh 并 gh auth login
```

配好之后 `git pull` 就能用了。

---

## P2　可以排后面的

| 事项 | 说明 |
| --- | --- |
| 备份异地副本 | 本机加密备份+隔离恢复已验证（27 表/156 记录），但没有异地和定时 |
| 成本归集 | 财务页「成本与结余」还是空的，需要按项目归集 MiMo token 成本 |
| DevBox 常驻 | 确认 Sealos 是否会在无活动后休眠；如果会，需要改用「发布版本」而不是调试地址 |

---

## 已经做完了的，别重做

| 事项 | 提交 |
| --- | --- |
| 管理员平台 10 个页面 | `87a228c` |
| 9 个 `/api/admin/*` 只读接口 + 服务端分页 | `e179bf1` |
| 审计表 `admin_audit_logs` + 收款/退款落审计 | `e179bf1` |
| 删除客户工作台里的旧审核页 | `65dadf7` |
| 生成时强制二维码 auto 定位 | `74cab27` |
| 迁移哈希按 LF 计算（修 Windows 上 `db:migrate` 失败） | `eb3878e` |
| 运维脚本改为读 `APP_URL` | `00b0dfe` |
| DevBox 部署 + 开机自启 | 环境操作，见 `docs/迁移-DevBox部署.md` |

---

## 千万不要做

1. **不要在 DevBox 和 Render 上同时跑 worker** —— 会抢任务队列，任务可能被旧代码处理。
2. **不要用 `docs/setup-supabase.sql` 升级已有数据库** —— 它只用于空库初始化，已有数据会拒绝执行。
3. **不要直接改 `platform_admins` 以外的表** —— 业务状态一律走服务端接口。
4. **不要把 `.env.local` 或密钥提交进 Git**，也不要在聊天里传。

---

## 常用命令

```bash
# 迁移（Windows 上也能跑了）
npm run db:migrate

# 配置检查（不打印密钥）
npm run check:config

# 测试
npm test

# DevBox 上重启服务（HTTP + worker）
bash ~/oneboss-ai/scripts/devbox-start.sh service

# DevBox 上看日志
tail -f ~/server.log
```

---

## 一句话总结

**P0 只有三件：停掉 Render 的 worker、决定 Render 去留、在 DevBox 上把 A-02 的最终交付跑通。**
这三件做完，项目就只差 U-01（所有者亲自核对真实收款）这一件人工活。
