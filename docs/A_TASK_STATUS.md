# A 组交付核对（2026-11-07）

## 已实现并有本地证据

| A 责任 | 代码 / 验证 |
|---|---|
| 套餐、报价、订单、幂等、演示/人工核验及退款 | core/service.ts、统一 API、真实数据库回归；不宣称正式商户渠道已接通 |
| Auth / 租户权限 / RLS / 私有下载 | security/auth.ts、版本迁移、数据库与授权下载回归；历史真实认证证据见 A_ACCEPTANCE.md |
| MiMo 网关和任务 | 官方端点、Schema、工具白名单、持久化队列/租约/心跳/重试；新回归不调用真实模型 |
| 资料与批准、限定修改 | 不可变事实版本、设计批准、指定范围保持、用量及终态记录 |
| 发布与回滚 | 批准门禁、真实 HTTP 核验代码、失败回退测试、精确版本浏览器脚本 |
| 文件与 ZIP 交付 | PNG 头/尺寸/非空/二维码目标及角落检查、私有存储、manifest/散列、验收门禁 |
| 本地运行与排查 | Node 24、锁定依赖、配置检查、Windows 操作指南、Docker HTTP/worker 启动器 |

最新验证：54 单元 + 27 PostgreSQL 集成 + 类型检查 + 生产构建全部通过。普通数据库回归中模型、公开 HTTP 和 Storage 使用替身；另外 `acceptance:a`、`acceptance:hosted`、`acceptance:b` 已使用真实 Auth/HTTP/数据库/MiMo/独立 worker，并在本机用实际 B 组件通过 375/768/1280 浏览器交互。真实 Production 的 B PNG 样张已通过尺寸、二维码和中文目视检查；样张使用测试 QR 目标，不是公网客户交付。详见 A_ACCEPTANCE.md。

本地凭据与现有代理已配置，实际 B 引擎已通过 `CREATIVE_ADAPTER_MODULE=builtin:b` 接入；B 原目录未修改。私有预览 API/页面需要真实 Bearer，不发布草稿。B 的客户工作台仍是 localStorage 演示，需要 B 继续接真实登录及 A API。

## 完成 A 最终成功定义仍需

1. 将最新集成提交手动部署到现有 Render，设置 `CREATIVE_ADAPTER_MODULE=builtin:b`，核对运行提交和两个进程；本机代理地址不得复制到 Render。自动浏览器控制当前持续超时，未触发部署。
2. 使用能保证清理的隔离环境或数据库连接，验证托管订单写入和真实 worker 持久化；不扩大生产 Data API 授权、不伪造收款。
3. B 客户工作台接真实 Supabase 登录及 A HTTP API，取代本地演示订单/Agent 状态；按 PROJECT_CONTRACT.md 使用私有预览数据。
4. 真实订单/明确 demo 订单走到 HTTPS 发布，公网 375/768/1280 浏览器交互通过，手机扫码、私有 PNG/ZIP 下载及客户验收形成证据。

整体状态是“本地真实 A/B 创意链路与私有预览已验证，最终生产部署、客户工作台与公网交付验收未完成”。
