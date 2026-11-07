# 公网发布修复验收

2026-11-08。**本地完成/生产未验收**。独立分支来自最新origin/feat/core，不把测试fixture当真实客户案例。

## 已实测

| 检查 | 证据 |
|---|---|
| 单元 | 182项全部通过（22文件）。包含Origin/DNS/拒重定向安全、受控资产路由、外域/其他项目素材拒绝 |
| 真实PostgreSQL集成 | 43项通过，隔离空库oneboss_publish_fix_20261108e；支付/租户/审批/交付旧回归保留，新增候选隔离、失败旧版保留、两个Worker竞争、租约失效、重试幂等与审计/无模型/无权益扣减 |
| 真实浏览器 | 8项通过（Edge），两个命名测试商品Product A/revision1、Product B/revision2在375/768/1280均通过；持续请求复现networkidle超时，ARIA-only交互通过，静态按钮/坏图/错误revision/JS异常/缺浏览器拒绝 |
| 截图 | .cache/publish-browser/Product-A-*、Product-B-*，三宽度；仅本地测试HTML，非生成质量或公网证据 |
| QR/PNG/ZIP | 集成使用真实PNG/二维码字节与ZIP解码/hash检查，外部模型/Storage/HTTP使用替身；不能称真实Supabase文件交付成功 |
| 类型与构建 | 类型检查和构建已通过；最终提交CI另外报告 |
| 生产只读 | 指定DevBox域名health200；数据库10个迁移存在；旧失败仅TASK_FAILED/无stage；另有历史成功；未做生产写入 |

## 不能宣称通过

- 两个真实AI商品在当前生产域名发布、真实HTTPS浏览器验收和Supabase成套交付尚未执行。
- Web与Worker实际SHA、唯一进程、生产Chromium可执行路径/stderr和OOM证据仍未拿到。
- 上述测试证明代码缺陷和回归行为，不证明两个历史失败的确切原因，不证明DevBox最新部署版本。
- 不提供虚构/p链接；当前没有本轮可安全分享的真实新测试站。

## 发布后验收步骤

所有者批准PR版本部署后，用隔离测试身份和已批准作品执行publish→三宽度URL/revision/交互→delivery→实际Storage PNG/QR/ZIP解码/哈希；不同商品不串素材。新revision失败期间反复读取旧公开页，确认旧成功版本未变；重新打开客户workspace，只有publication.verified与真实URL相符才能提供复制入口。域名变更遇DELIVERY_ORIGIN_CHANGED单独处理，禁止覆盖旧印发二维码。
