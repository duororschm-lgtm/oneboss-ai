# 发布修复实施与部署 Runbook

2026-11-08。基线 `1ab1d6f`，仅独立修复分支；本轮不自动部署、不迁移生产、不恢复Render。

交付方式更新：所有者后续明确要求“不要做pr直接推”。已关闭PR #4，改为从修复分支将已验证提交直接快进推送feat/core；不强制推送，不覆盖其他成员成果。生产部署仍按本任务书另行批准。

## 代码变化

- publishing/service.ts：复用现有publication_token与agent_runs.input.revision保存候选；候选GET必须带匹配的X-OneBoss-Publication、RUNNING有效租约、项目/事实/审批匹配。普通访客只读已验证指针。提交时再锁run/project、复核审批及权益，一次更新revision、verified、browser revision；失败只撤销自身候选令牌，不恢复旧快照覆盖其他发布。
- 两个公开page.tsx：用Next异步headers读取内部候选标识；React cache仅当前请求使用。普通访问不需要登录，候选令牌不放URL或交付文件。
- publishing/browser.ts：保留公网预检、三宽度、精确revision、图片、布局、JS和实际交互；用DOMContentLoaded+显式条件替换networkidle。分阶段持久化，分类launch/timeout/image/layout/interaction错误；关闭浏览器不覆盖原错误。候选头仅给相同Origin下该slug页面/素材，不发给CDN、Storage或其他项目。
- security/network.ts：HTTPS、同源路径、公网DNS与拒绝重定向全部保留；增加候选头和安全DNS/请求错误码，不降低TLS校验。
- 公开assets/[assetId]/route.ts + 服务端b-mapping：校验当前公开作品引用后从私有Storage读取图片；稳定HTTPS地址，无签名/私有路径泄露，no-store。仅精确受控公开路由获映射许可；没有改B的UI组件。
- runner.ts：清除新尝试旧错误，publish/delivery失败不改成GENERATION_FAILED；阶段、revision、attempt、耗时、部署版本安全日志，事件保留历史。
- delivery/service.ts：复核公网HTML准确revision、租约未过期；已有交付域名不同则拒绝，不静默覆盖旧QR/ZIP。
- core/workspace.ts：新增publication只读模型，只返回成功任务证据中的URL且匹配当前Origin/路径；verifiedAt未知为null；错误标记历史性；隐藏publication_token。deliveryReady要求交付manifest URL匹配。
- 管理员POST retry-publication：Owner/Operations的act.release授权、幂等、失败状态/审批/事实/权益/活动任务/预算检查、同事务审计。仅publish/delivery，不能重跑模型，也不扣修改权益。生成新run并记录retryOf。
- CI增加专用浏览器回归；bootstrap生成器按LF归一，修复旧分支CI失败，不改变任何迁移文件。

## 数据库与兼容

**无新增迁移；未修改任何supabase/migrations SQL，未改生产账本。** 依赖生产已有002—005观测字段，新旧客户端原有响应保留，仅增加publication字段和受保护重试接口。候选请求头是内部短期能力，不是公共预览链接。新Web与Worker应同版本切换，否则旧Worker仍可写旧指针逻辑。

## 部署前必须核对（需所有者另行批准）

1. DevBox目录~/oneboss-ai只读检查git HEAD/status、实际Web/Worker cwd与版本、Node22、端口3000；保护服务器手工改动。
2. 核对APP_URL当前HTTPS Origin、DNS/证书；只读核对10条迁移及LF哈希。四个旧迁移不重建，不因账本不符重置数据。
3. 确认当前Worker数量及无活动任务；本任务不得启动第二个生产Worker。Render保持现状。
4. 核对BROWSER_EXECUTABLE_PATH可执行及Chromium依赖；以同用户运行浏览器QA，不通过关闭HTTPS/SSRF/图片检查解决错误。
5. 从经CI批准的提交建立候选release并构建；注入DEPLOY_COMMIT_SHA，保留原release与原配置。不在聊天粘贴凭据；不修改APP_URL/Auth回调/DNS/支付配置。
6. 在批准的维护窗口切换同版Web+Worker；不能仅为本地测试执行devbox-start.sh（它会重启生产）。
7. 仅授权隔离项目、两个不同商品：审批已存在时只publish，三宽度真实访问；随后delivery，核对QR/PNG/ZIP/hash与manifest；无真实付款，不为修发布重跑模型。

## 回滚

构建失败不切换；新版本故障先停止接新发布、等待/检查任务租约后回到保留release，不删除旧交付或改账本。本轮没有schema迁移。旧版本存在候选公开风险，回退后保持新发布暂停，已成功公开指针应保持不动。若发现候选token残留，先核对对应活动租约，不能随意清理别的任务。

## 仍待生产证据

实际运行SHA/唯一Worker/Chromium stderr不可由health代替；两旧TASK_FAILED原因仍未知。未验收两个真实AI商品的公网链接及成套交付，不发布虚构案例URL。代码和PR可交付，生产操作需单独批准。
