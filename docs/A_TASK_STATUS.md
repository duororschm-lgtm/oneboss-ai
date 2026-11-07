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

## 最终托管验收结果

Render 已手动部署 14101fe，部署 dep-dbne9j9srm7s7396ndt0 显示 Live；启用 builtin:b，health 四组配置均为 true。保留原 Free 资源与生产 sandbox 关闭状态，本机代理未复制到托管环境。

明确标识的临时 demo 订单已走完真实 Render worker/MiMo 设计与生成、B 渲染、HTTPS 发布、三种宽度浏览器交互、私有 PNG/ZIP 下载校验及客户验收。用户亲自手机扫码，确认能打开并切换标签。授权来自受保护的服务端 demo helper，没有真实付款；公开 sandbox 接口仍拒绝调用。临时业务记录、私有文件、Auth 用户和公开测试页均已删除。

本地原生数据库连接曾重置，原验收脚本中断；使用同一临时账号/项目恢复下载、验收和清理，未新建第二批业务数据。后续脚本增加 HTTPS 轮询、严格 TLS 下的有限连接重试及幂等清理。完整证据见 A_ACCEPTANCE.md。

A 的后端、B 引擎集成与公网交付验收已完成。B 客户工作台接真实 Supabase 登录及 A HTTP API 仍属 B 的剩余工作，当前 localStorage 演示界面不能作为真实订单工作台；正式商户收款渠道也未验收。
