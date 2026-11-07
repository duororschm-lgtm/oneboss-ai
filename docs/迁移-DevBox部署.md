# DevBox 部署迁移记录

更新时间：2026-11-08 02:40
环境：Sealos DevBox `oneboss`（`hzh.sealos.run_ns-klfvhekd_oneboss`）

---

## 一、结论先行

**应用已经在 DevBox 里跑起来了，但还没有公网地址。**

| 项 | 状态 |
| --- | --- |
| 代码 | ✅ `/home/devbox/oneboss-ai`，分支 `feat/core`，提交 `e179bf1` |
| Node | ✅ v22.23.4（原镜像只有 18，已用 nvm 升级） |
| 依赖 | ✅ `npm ci` 完成，154 个包 |
| 环境变量 | ✅ `.env.local` 已就位（从本机 scp，未经过聊天工具） |
| 类型检查 | ✅ 0 错误 |
| 单元测试 | ✅ 12 文件 / 94 用例全过 |
| 构建 | ✅ `next build` 12.6 秒 |
| 服务 | ✅ 监听 `0.0.0.0:3000`，`/api/health` 200，`/admin/login` 200 |
| 开机自启 | ✅ 已写入 `/usr/start/startup.sh` |
| **公网访问** | ❌ **未开启**（见第三节） |

---

## 二、资源对比（这是迁移的主要收益）

| | Render 免费档 | DevBox |
| --- | --- | --- |
| 内存 | 512 MB | **4 GB** |
| CPU | 0.1 | **2 Core** |
| 磁盘 | — | 9.8 G（已用 2.3 G） |
| 系统 | Docker | Debian 12 |

内存 8 倍、CPU 20 倍。如果 A-02 的 `TASK_FAILED` 是 OOM 导致（Render 历史事件曾因超过 512MB 重启），
在这台机器上跑一次发布就能验证。

---

## 三、还差一步：开启公网地址（需要控制台操作）

Sealos 控制台 → DevBox 列表 → `oneboss` → **详情** → **网络配置** → 右上角 **管理**。

当前状态：

```
端口    内网调试地址                          公网调试地址
3000    http://oneboss.ns-klfvhekd:3000      -            ← 空的
```

在「管理」里给 3000 端口开启公网访问，会得到一个 `https://xxxx.hzh.sealos.run` 形式的地址。

拿到后先验证：

```bash
curl https://<新地址>/api/health
curl -o /dev/null -w "%{http_code}" https://<新地址>/admin/login
```

⚠️ **DevBox 的调试地址是临时性质**，不适合长期对外。正式对外建议走下一节的「发布版本」。

---

## 四、正式对外（可选，但更稳）

DevBox 详情页有 **「发布版本」** 按钮，可以把当前环境打包成一个可长期运行的版本。

这条路比「公网调试地址」正规：有独立入口、不受开发环境开关影响。

配置项需要补充：

- 启动命令：`npm start`（或用 `scripts/devbox-start.sh`）
- 端口：3000
- 环境变量：与 `.env.local` 相同的 11 个键

---

## 五、切换生产的顺序（千万别反）

```
1. DevBox 上服务健康（已完成）
2. 开启公网地址，拿到临时 URL（待做）
3. 用临时 URL 跑一遍真实流程：
   客户登录 → 下单 → 后台核验收款 → 提交资料 → 生成 → 发布 → 交付
4. 决定域名策略：
   - 保留 oneboss-ai.onrender.com 的二维码 → 需要把自定义域名解析到新环境
   - 接受换域名 → 所有已发出的二维码要重印
5. 切换 DNS
6. 停止 Render 上的 worker（先停 worker，避免两个 worker 抢任务队列）
7. 观察 24 小时，再停 Render 的 web 服务
```

**绝对不要先停 Render。** 中间有空窗期的话客户下单会直接失败。

---

## 六、开机自启是怎么做的

`/usr/start/startup.sh` 是容器的启动脚本（PID 1 是 `dumb-init → startup.sh`）。
已在 `sleep infinity` 之前注入：

```bash
# OneBoss: start Next app on boot
su - devbox -c "bash /home/devbox/oneboss-ai/scripts/devbox-start.sh" >/dev/null 2>&1 &
```

备份在 `/usr/start/startup.sh.bak`。

`scripts/devbox-start.sh` 做的事：

1. 加载 nvm，切到 Node 22
2. 杀掉残留的 `next start` / `next-server`
3. 启动 `npm start`（只跑 HTTP）

需要同时跑 worker 时：

```bash
bash ~/oneboss-ai/scripts/devbox-start.sh service
```

它会把启动命令换成 `npm run start:service`（HTTP + worker 同进程管理）。

⚠️ **跑 worker 前必须确认 Render 上的 worker 已停**，否则两个 worker 会抢同一个任务队列。

---

## 七、已知风险

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| DevBox 可能休眠 | 无活动后停机，站点 502 | 确认 Sealos 是否可设常驻；或走「发布版本」 |
| 无自动重启 | 进程崩了不会自愈 | 目前只有开机自启；需要时加 keep-alive 脚本 |
| 磁盘只剩 7.1 G | 日志、构建产物会累积 | 定期清理 `server.log`、`.next/cache` |
| 域名变更 | 旧二维码失效 | 提前规划自定义域名 |
| 迁移账本损坏 | `npm run db:migrate` 报 `Migration changed: 202611060001_core.sql` | 与本次迁移无关，需 A 组单独处理 |

---

## 八、常用命令

```bash
# 进入项目
cd ~/oneboss-ai

# 重启服务
bash scripts/devbox-start.sh

# 看日志
tail -f ~/server.log

# 停服务
pkill -f "next start"

# 重新构建（改了代码之后）
npx next build && bash scripts/devbox-start.sh

# 同步代码
git pull --ff-only
```

---

## 九、迁移前后对比一览

| 能力 | Render（现状） | DevBox（目标） |
| --- | --- | --- |
| 内存 | 512 MB | 4 GB |
| 冷启动 | 免费实例休眠，首次 50s+ | 常驻，秒级 |
| 自动部署 | 手动（`autoDeployTrigger: off`） | 需手动 `git pull` + 重启 或 发布版本 |
| 域名 | `oneboss-ai.onrender.com` | 待定 |
| 成本 | 免费 | 按 Sealos 计费 |

---

## 十、域名切换清单

目标：把对外域名从 `oneboss-ai.onrender.com` 换成新的 HTTPS 域名（Sealos 或自定义域名）。

### 10.1 代码侧：已经改成一处配置

原来 7 个脚本里硬编码了这个域名，现在全部改成读 `APP_URL`，只保留旧域名作为兜底默认值：

```ts
const origin = (process.env.APP_URL || 'https://oneboss-ai.onrender.com');
```

涉及：`public-demo.ts`、`acceptance-hosted.ts`、`acceptance-hosted-write.ts`、
`acceptance-registration.ts`、`acceptance-hosted-customer-flow.ts`、
`acceptance-poster-local.ts`、`render-mimo-b02.ts`。

**服务端本来就用 `APP_URL`**（`src/lib/security/network.ts: appOrigin()`），所以应用代码不需要改。

### 10.2 新域名必须满足的条件（不然发布直接失败）

`appOrigin()` 会断言：

| 要求 | 不满足时的错误码 |
| --- | --- |
| 必须是 `https://` | `HTTPS_ORIGIN_REQUIRED` |
| 不能带路径 / 查询串 | `HTTPS_ORIGIN_REQUIRED` |
| 不能是 IP、`localhost`、`*.local` | `PUBLIC_HOST_REQUIRED` |
| 必须配置 | `APP_URL_NOT_CONFIGURED` |

所以 `.env.local` 里 **`APP_URL=http://127.0.0.1:3000` 是不行的**，
必须是 `https://xxx.sealos.run` 这种。本地调试跑发布流程时也一样。

### 10.3 切换时要改的地方（按顺序）

| # | 位置 | 改什么 |
| --- | --- | --- |
| 1 | 新环境 `.env.local` | `APP_URL=https://新域名` |
| 2 | Supabase → Authentication → URL Configuration | Site URL 和 Redirect URLs 改成新域名 |
| 3 | 微信商户（若启用） | 回调地址 `https://新域名/api/commerce/payments/webhook/wechat` |
| 4 | `README.md`、`docs/MANUAL_PAYMENT.md`、`docs/当前任务分工.md` | 链接文案 |
| 5 | 已交付的 ZIP/PNG | 见 10.4，需要重生成或用跳转兜底 |

### 10.4 已发出去的二维码怎么办

关键在于：**二维码是烤进 PNG 图片里的**，不是动态生成的。改 `APP_URL` 只会影响**以后**生成的海报，
已经交付给客户的 PNG/ZIP 里仍然是旧域名。

三个选项：

| 方案 | 说明 | 代价 |
| --- | --- | --- |
| **A. 旧域名做 301 跳转**（推荐） | 保留 Render 或任意跳转服务，把 `oneboss-ai.onrender.com/p/*` 301 到新域名同路径 | 旧域名要一直续着 |
| B. 重新生成交付物 | 用新域名重新跑发布 + 交付，重新发给客户 | 已交付的要重发 |
| C. 接受失效 | 什么都不做 | 老二维码扫码打不开 |

**A 是唯一不伤害已有客户的方案**：客户扫旧二维码 → 旧域名 301 → 新站，体验无感。

只要旧域名还解析、还能返回 301，二维码就不算失效 —— 所以第 5 节的切换顺序里，
「停 Render」必须放在「旧域名保留跳转」之后。

### 10.5 切换检查清单

```
[ ] 新域名 https 可访问，/api/health 返回 200
[ ] APP_URL 已改为新域名，重启服务
[ ] /admin/login 打开正常，能登录
[ ] 发布一个测试项目，检查海报二维码解码后是新域名
[ ] Supabase Auth 的 Site URL / Redirect 已更新
[ ] 旧域名 301 规则生效（curl -I 看 Location）
[ ] README / MANUAL_PAYMENT / 当前任务分工 的链接已更新
[ ] 观察 24 小时，再决定是否停 Render
```