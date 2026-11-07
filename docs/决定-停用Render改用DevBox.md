# 决定：停用 Render，DevBox 转为唯一生产环境

生效时间：2026-11-08
决策人：项目所有者
基线提交：`913340b`（`feat/core`）

---

## 一、决定

**从今天起，`oneboss-ai.onrender.com` 不再部署新代码，DevBox 是唯一生产环境。**

| | 旧（Render） | 新（DevBox） |
| --- | --- | --- |
| 地址 | oneboss-ai.onrender.com | https://cwforsetsryx.sealoshzh.site |
| 内存 / CPU | 512 MB / 0.1 | **4 GB / 2 Core** |
| 代码 | ≈ `807f0e8`（落后 7 个提交） | `e179bf1` + 一个手工补丁 |
| worker | 在跑（**要停**） | 在跑 |
| 状态 | 只保留做回滚，不再更新 | 生产 |

**理由**：Render 免费档只有 512MB，`未完成事项.md` 里已记录"因超过 512MB 重启"。
A-02 的 `TASK_FAILED` 高度怀疑就是它。DevBox 内存是 8 倍，这是唯一现实的解法。

---

## 二、转正前必须完成的 6 步

### 步骤 1　停掉 Render 的 worker（**先做这个**）

Render → `oneboss-core` → 右上 **Suspend**。

⚠️ **不要删除服务**。域名和 301 还没配，删了就找不回来。

### 步骤 2　给 DevBox 配 git 凭证

现在 DevBox 上 `git pull` 是失败的（私有仓库无凭据）：

```bash
ssh-keygen -t ed25519 -C "devbox-oneboss" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

把公钥加到 GitHub → repo → Settings → **Deploy keys**（只读权限即可），然后：

```bash
cd ~/oneboss-ai
git remote set-url origin git@github.com:duororschm-lgtm/oneboss-ai.git
```

### 步骤 3　让 DevBox 的代码和仓库对齐

当前 DevBox 落后 7 个提交，而且有一处**手工补丁**（`runner.ts` 的二维码提示词），
这个补丁已经正式提交为 `74cab27`，所以本地那个改动可以直接丢弃：

```bash
cd ~/oneboss-ai
git checkout -- src/lib/workflows/runner.ts   # 丢弃手工补丁
rm -f scripts/devbox-start.sh                 # 服务器上那份未跟踪副本会被 pull 覆盖
git pull --ff-only                            # 到 913340b（含 devbox-start.sh）
git log -1 --oneline                          # 期望 913340b 或更新
chmod +x scripts/devbox-start.sh
```

### 步骤 4　重新构建并重启

```bash
npx next build
bash scripts/devbox-start.sh service   # HTTP + worker，PORT 已固定 3000
```

### 步骤 5　跑完整的验收（这一步最关键）

| 检查 | 期望 |
| --- | --- |
| `curl https://cwforsetsryx.sealoshzh.site/api/health` | 200，四项 configured 全 true |
| `/admin/login` 登录 | 能进后台，看到真实订单 |
| `/admin` 经营总览 | 指标卡有数字（不再是"接口未提供"） |
| 客户流程：资料 → 创意 → 生成 → 批准 → **发布** | 发布成功，`published_verified=true` |
| 海报二维码解码 | 指向新域名 |
| 交付 ZIP 下载 | 能下，哈希对得上 |

**发布这一步同时回答了 A-02 的 OOM 问题**：如果成功，就确认是内存问题。

### 步骤 6　更新 Supabase 配置

Supabase → Authentication → **URL Configuration**：

```
Site URL       https://cwforsetsryx.sealoshzh.site
Redirect URLs  https://cwforsetsryx.sealoshzh.site/**
```

不改的话，以后做邮箱验证 / 找回密码会跳到旧域名。密码登录不受影响。

---

## 三、域名与二维码（必须做决定）

当前所有已发出的二维码都指向 `oneboss-ai.onrender.com`。
二维码是**烤进 PNG 图片**里的，改配置不会变。

### 推荐：旧域名保 301

只要 `oneboss-ai.onrender.com` 还能返回 301 跳到新域名，客户扫老码照样能用：

```
oneboss-ai.onrender.com/p/xxxx  →  301  →  cwforsetsryx.sealoshzh.site/p/xxxx
```

**代价**：Render 服务（或任意跳转页）要一直留着。
**收益**：不用重新印制、重新发送任何交付物。

### 备选：换域名重发

接受老二维码失效，用新域名重新生成所有交付物并重发给客户。

### 不建议：什么都不做

客户扫老码 404 —— 这是唯一会真实伤到客户的选项。

---

## 四、风险坦白（DevBox 不是生产环境）

Sealos DevBox 本质是**开发沙盒**，拿它当生产有实打实的风险，我不建议装作没有：

| 风险 | 后果 | 缓解 |
| --- | --- | --- |
| **可能自动休眠** | 站点 502，客户打不开 | 必须确认 Sealos 的休眠策略；若有，改用「发布版本」而不是调试地址 |
| **没有自动重启** | 进程崩了不会自愈 | 已配开机自启（`/usr/start/startup.sh`）；运行中崩溃仍需人工或加守护脚本 |
| **没有健康检查 / 多副本** | 单点故障 | 暂时接受；如需高可用要用 Sealos「应用管理」 |
| **磁盘只剩 7.1 G** | 日志和构建产物会累积 | 定期清 `~/server.log`、`.next/cache` |
| **调试域名可能变** | 地址失效 | 长期应绑自定义域名，而不是用 `*.sealoshzh.site` |
| **计费** | 按 Sealos 用量计费 | 需确认额度 |

**如果上面任何一条不能接受，正确的做法是用 Sealos「应用管理 / App Launchpad」跑生产，DevBox 只做开发。** 那个才有副本、健康检查和自动重启。

---

## 五、回滚预案

出问题时的恢复顺序：

```
1. Render 仍处于 Suspend 状态（未删除）→ 直接 Resume，5 分钟恢复旧版
2. 若 Render 已删：GitHub 上的代码 + Supabase 数据都还在，任何机器都能重建
3. 数据库不需要迁移——数据一直在 Supabase，不在 Render 也不在 DevBox
```

**在 DevBox 稳定运行满 7 天之前，不要删除 Render 服务。**

---

## 六、从今天起的工作约定

| 约定 | 说明 |
| --- | --- |
| 唯一生产 = DevBox | 不再往 Render 部署任何东西 |
| 唯一代码源 = GitHub `feat/core` | DevBox 必须 `git pull` 后再构建，不允许长期保留手工补丁 |
| **只能有一个 worker** | Render 必须保持 Suspend；DevBox 上 `ps -ef \| grep worker.ts` 有且只有一个 |
| 改代码 → 构建 → 重启 | `git pull && npx next build && bash scripts/devbox-start.sh service` |
| 密钥只在 `.env.local` | 不进 Git、不进聊天 |

---

## 七、给 Codex 的任务顺序

```
P0-1  停掉 Render（Suspend）
P0-2  配 DevBox 的 deploy key，git pull 到 913340b
P0-3  重新构建 + 重启，跑通验收清单（步骤 5）
P0-4  确认 Sealos 的休眠策略；如果需要，改用「发布版本」
P1-1  旧域名 301 跳转（保住二维码）
P1-2  Supabase Auth 的 Site URL / Redirect URLs
P1-3  把 scripts/devbox-start.sh 提交进仓库，别只留在服务器上
P2-1  Render 保留 7 天观察期，之后由所有者决定是否删除
```

---

## 八、一句话

**Render 退役，DevBox 接管。但 DevBox 是沙盒，先按第二节的 6 步走完、验收清单全过、并确认不会休眠，再对外宣布切换。**
