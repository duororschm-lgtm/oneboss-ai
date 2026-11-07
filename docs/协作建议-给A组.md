# 分支合并说明与协作建议（给 A 组）

时间：2026-11-08 05:30　生产提交：`becd6f8`

---

## 一、先说结果：`feat/core` 现在是所有分支的超集

我把你两个分支合进 `feat/core` 并部署到了 DevBox 生产环境。

| 分支 | 状态 |
| --- | --- |
| `feat/ai-interactive-web-v4` | ✅ 已并入 |
| `fix/oneboss-fullflow` | ✅ 已并入 |
| `feat/product-3d-pipeline` | ✅ 已在合并链里 |
| `feat/admin-console` | ✅ 之前已并入 |
| `feat/creative` | ⚠️ 没并入（早期独立分支，内容已在 `feat/core` 里） |
| `handoff/local-migration-20261107` | ⚠️ 没并入（只是交接用的迁移下载） |
| `main` | ⚠️ 仅 Initial commit，不要用 |

```
origin/feat/core = becd6f8
DevBox 生产      = becd6f8
```

---

## 二、建议 1：新分支请从 `feat/core` 拉

**这是这次最重要的建议。**

你两个分支都是从 `52ccf4a` 之前的 `feat/core` 分出来的，结果：

1. 都缺了我在 `d8bce5d` 修好的结账页问题
2. 两次合并**都撞在同一个文件上**：`src/components/customer/checkout.tsx`
3. 合并时我只能整份采用你的版本（`--theirs`），我那边的改动被覆盖

正确做法：

```bash
git checkout feat/core
git pull --ff-only
git checkout -b feat/你的新功能      # 从这里开，不要从旧分支开
```

否则以后每合一次都要解一遍同样的冲突。

---

## 三、建议 2：`checkout.tsx` 是冲突热点，改之前先说一声

两次合并，冲突文件都是它：

| 合并 | 冲突文件 |
| --- | --- |
| `fix/oneboss-fullflow` | `checkout.tsx` |
| `feat/ai-interactive-web-v4` | `checkout.tsx`、`chart.tsx`、`format.ts`、`agents/page.tsx` |

这些文件同时在两边改的代价很高。如果只是小修，提到 PR 里说一声，或者直接改成最小 diff（比如只动样式不动逻辑），冲突概率会低很多。

---

## 四、建议 3：数据库迁移已经跑过了，别重复跑

这次合进来 4 个迁移，**已经应用到生产库**（`mxyocfnzrfpujnkqikbp`）：

```
202611080002_manual_channels_and_addons.sql
202611080003_refund_confirmation_time.sql
202611080004_task_observability.sql
202611080005_admin_roles_and_audit.sql
```

`npm run db:migrate` 是幂等的（按文件名 + LF 哈希校验），重复跑只会打印跳过，不会重复执行。

⚠️ 顺带修了一个坑：原来哈希是对**原始文件内容**算的，Windows 上 `core.autocrlf=true` 会把 SQL 检出成 CRLF，导致哈希和数据库里记录的 LF 哈希不一致，迁移直接报 `Migration changed`。现在改成按 LF 归一后再算哈希，Windows / Linux 都能跑。见 `eb3878e` 和 `.gitattributes`。

---

## 五、建议 4：DevBox 配一个 deploy key

现在 DevBox 上 `git pull` 是**拿不到私有仓库的**——每次部署我都要临时生成 token、用完立刻清掉。

长期这样很别扭，建议配一次：

```bash
ssh-keygen -t ed25519 -C "devbox-oneboss" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

把公钥加到 GitHub → 仓库 → Settings → **Deploy keys**（只读），然后：

```bash
cd ~/oneboss-ai
git remote set-url origin git@github.com:duororschm-lgtm/oneboss-ai.git
```

---

## 六、建议 5：Render 已决定退役，worker 只能有一个

- 生产环境 = DevBox（`https://cwforsetsryx.sealoshzh.site`，4 GB / 2 Core）
- Render 保持 **Suspend**，只作为回滚手段，**不要再往上部署**
- **同一时间只能有一个 worker 在跑**，否则两边抢同一个 `agent_runs` 队列，谁抢到就用谁的代码处理

检查方法：

```bash
# DevBox 上应该有且只有一个
ps -ef | grep -c "[w]orker.ts"
```

---

## 七、建议 6：合并后建议清理分支

已完全并入 `feat/core` 的分支可以删掉（GitHub 上删或 `git push origin --delete <branch>`）：

```
feat/ai-interactive-web-v4
feat/product-3d-pipeline
fix/oneboss-fullflow
feat/admin-console
```

留着也行，但下次容易有人从旧分支开新分支 —— 就是第二节那个问题。

---

## 八、当前还没解决的事

| 优先级 | 事项 | 现状 |
| --- | --- | --- |
| **P0** | A-02 双尺寸/双产品最终交付 | 最后一次 `publish` 仍 `TASK_FAILED`，需要在 4GB 的 DevBox 上重跑验证是否 OOM |
| **P0** | U-01 实际收款核对 | 只有所有者本人能做，一次都没做过 |
| P1 | 加购数量输入框 | 现在默认显示 `0`，需要确认能不能删干净（上一版是空白，合并后回到 0） |
| P1 | DevBox 休眠策略 | Sealos 若会在无活动后停机，站点会 502，需要确认或改用「发布版本」 |
| P2 | 备份异地副本 | 本机加密备份已验证，但没有异地和定时 |

---

## 九、部署流程（现在固定这样）

```bash
# DevBox 上
cd ~/oneboss-ai
git pull --ff-only
npm ci                    # 只有 package.json 变了才需要
npx next build
bash scripts/devbox-start.sh service   # HTTP + worker，PORT 固定 3000
```

⚠️ **手工跑 `npx next build` 必须先加载 nvm**，否则用的是系统 Node 18，会报
`Node.js version ">=20.9.0" is required`：

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
```

`scripts/devbox-start.sh` 里已经处理了这一步，但直接调 `npx` 不会。

---

## 十、一句话

**以后新分支从 `feat/core` 拉、改 `checkout.tsx` 前先说一声、迁移已经跑过了不用再跑。**
剩下的 P0 只有两件：在 DevBox 上把 A-02 的发布跑通，以及所有者本人做一次真实收款核对。
