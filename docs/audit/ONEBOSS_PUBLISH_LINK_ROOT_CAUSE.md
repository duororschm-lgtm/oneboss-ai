# 公网发布故障：证据与根因

2026-11-08，Asia/Shanghai。分支 `fix/codex-publish-public-link`，从实时fetch的 `origin/feat/core` `1ab1d6fd853e332a3c4ae86572e24443923f1cf7` 派生。原V4目录和旧整改目录的未提交内容均保留；本轮没有修改B的checkout、production-progress、use-task-polling或进度CSS。

## 实地核实与边界

- `https://cwforsetsryx.sealoshzh.site/api/health` 本轮HTTPS请求200，四项configured=true。它不返回部署SHA，不能推断当前Web版本或真实模型调用成功。
- 对既有数据库执行只读事务：10个迁移已存在，包括202611080002—005；未修改/重跑迁移。worker_instances有一个未标停止的记录，version=local-unknown；另一个已停止。只有数据库心跳不能证明容器内唯一进程，也不能确认运行SHA。
- 两次旧publish（95128b13、ed814fc3）均3次失败、error_class=TASK_FAILED、stage=NULL。另有后来的publish与delivery成功记录，不能据此断言DevBox最新版本已经验收，也不能断言系统从未发布成功。
- 旧记录缺浏览器stderr、导航阶段和运行SHA；本轮没有DevBox终端连接。因此这两次历史失败的**精确根因仍未确定**，没有把4GB资源或旧Render OOM当结论。
- 只读审计未重新调用MiMo，未新增生产项目、付款、发布或交付任务。旧成功链接和客户二维码未改。

## 已复现或源码确认的问题

1. **networkidle假超时，已复现。** 使用真实Edge、持续100ms请求的隔离测试页，networkidle导航超时；同页面改为DOMContentLoaded加版本/关键图片/字体/布局/交互检查后三宽度通过。这证明该等待策略可造成假失败，不证明旧两次一定由它触发。
2. **待验收版本暴露，源码确认并用Postgres验证。** 旧publish在QA前改published_revision并置false，publicProject不检查verified，普通访客可看到候选版本；失败只恢复两个字段，未形成完整发布状态隔离。修复为候选请求头+现有租约令牌，普通公开指针全程不动，完成后原子切换。
3. **状态污染，源码确认。** Worker把publish/delivery终态失败也写成GENERATION_FAILED，掩盖已成功发布/交付的状态。现在只记录相应run失败，保留项目原状态与公开版本；新尝试领取清除当前error_class，旧错误保留在事件历史。
4. **交互误判，真实浏览器验证。** 全main.innerHTML变化可能由无关动效触发，且缺少精确错误分类。现在观察实际控制元素、ARIA关联面板、表单值及可见状态；静态伪标记拒绝，ARIA-only交互通过。
5. **素材时间性问题，源码确认。** 公开页把300秒Storage签名放进延迟加载图片。新固定资产路由逐次检查当前公开作品引用，私有桶仍不公开；渲染映射仅接受当前Origin及准确slug/assetId，不接受其他客户、外域或查询参数。
6. **交付URL/版本证据不足，源码确认。** delivery重复HTTP检查未断言准确revision；旧成功交付复用未检查Origin变化。现在增加校验，域名变化报DELIVERY_ORIGIN_CHANGED，不覆盖已交付二维码或ZIP。
7. **CI被跨系统哈希阻断，远端日志确认。** 旧27e0659的CI失败在bootstrap生成器，原因是生成器对CRLF原字节哈希，而迁移器已按LF归一。现在仅归一生成器并重生成派生文档，不改已应用SQL；生产账本内容不动。

## 调用链与剩余环境证据

approveArtifact（事实/设计/渲染QA）→ enqueue publish（幂等/权益）→ claim lease → publishRevision候选→ verifyPublicUrl（HTTPS/同源/路径/DNS公网/拒重定向）→ verifyPublishedBrowser（375/768/1280）→ 原子公开切换 → delivery（准确revision/PNG/QR/ZIP/hash）→私有签名下载。

模型schema失败和创意QA失败属于上游，不在本轮绕过。生产最终验证仍须取得实际运行SHA、Web/Worker同版、Chromium路径/依赖、进程数量及失败时日志，之后仅对授权隔离项目执行publish/delivery。未取得这些证据，不宣称“已修复并上线”。
