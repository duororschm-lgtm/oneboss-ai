# A 组实现与验证记录

日期：2026-11-06。此记录区分代码验证、测试替身和外部真实验收，不把尚未接入的服务标为已完成。

## 已实现

- Next.js/TypeScript/Tailwind 工程、共享 Zod 合同、A/B 模块边界及适配器。
- Supabase 兼容数据库迁移与 RLS；服务端 Supabase Bearer 身份验证与私有 Storage 接口。
- 服务器套餐/增项报价、历史快照、演示与人工核验隔离、幂等支付确认、权益与退款状态。
- 持久化 worker、心跳租约、fencing、有限重试、MiMo JSON/Schema/业务三层验证、真实运行日志接口。
- 资料确认、设计候选选择、生成、定向修改、预览版本、审批、公开路由、多页面、发布失败回退。
- PNG 文件头/尺寸/非空/真实 QR 解码检查、私有 ZIP、manifest、短期下载和验收接口。
- 敏感配置仅环境变量；图片重编码、像素上限、外链限制、权限门禁、请求及任务预算限制。

## 实际执行通过

| 检查 | 结果 |
|---|---|
| npm run typecheck | 通过 |
| npm test | 3个文件，44项通过，0跳过 |
| npm run test:integration | 真实 PostgreSQL 17，21项通过，0跳过 |
| npm run build | 生产构建通过，包含 API、/p/[slug]、子页面路由 |
| npm audit --omit=dev --audit-level=high | 0 个已报告漏洞；发现 Sharp 旧版高危后升级至0.35.5并重新验证 |
| db:migrate | 空数据库成功应用两份迁移；重复执行成功，无重复建表 |
| 生产服务器内部 HTTP | health 200、套餐/增项200、未登录项目访问401 |
| B 模块加载连线 | 生产服务器成功从临时测试 JS 模块加载并返回200；模块只返回明确的测试字符串，不能生产海报，也不通过 QA |

21项数据库测试包含：锁价、增项、客户端金额拒绝、Webhook拒绝、未付款禁止生产、跨组织拒绝、10个并发重复支付只开通一次、三类表RLS、禁止客户端直接改付款、事实快照、租约接管、缺凭据真实失败、定向修改保留海报、发布HTTP失败回退、人工核验权限、退款状态。

模型生成/修改的集成用例使用受控 mock，仅验证真实数据库中的保存与状态行为。发布失败测试模拟网络失败；不是公网部署证明。
PNG 单元测试实际创建1080×1350测试图并嵌入 QR，使用独立解码器解码；这是验证器测试，不是 B 的客户海报。

## 历史阻塞及当前进展

初次 `npm run smoke:mimo` 因未配置返回 MIMO_NOT_CONFIGURED。用户发布安全配置后，平台确认密钥与模型变量 ready，已完成三项真实 MiMo 调用。

原生工具测试最初因 JSON 文本模式与 native tool calling 冲突未通过；修正请求模式、限制只读工具名称及空参数后通过。未执行任何模型生成的数据库写入、支付或发布工具。

2026-11-06 真实 API 验证记录（不是数据库 agent_runs ID）：

| 检查 | 结果 | Token总量 | Provider request ID |
|---|---|---:|---|
| JSON解析及Schema | 通过 | 161 | ada2e9ab-9b89-46a4-94a4-b482d9d4cb5b_d75e884f1b244274a3f554521f450880 |
| 原生只读函数调用 | 通过 | 194 | a98034e6-b000-4338-829d-00c49aa2f629_e5ccae58732a4b8682afacc5e984cbf5 |
| 图片内容识别 | 通过 | 190 | 84a4e9db-c0fb-416c-93f9-f274fe6f576e_3813856171944246be9fa5c77d7853c2 |

图片测试随机生成红/绿/蓝色块，模型输出三选一，程序独立比对实际颜色；不再以仅接受图片请求作为图片理解通过的证据。

历史 GitHub API 域名拒绝已由用户添加允许域名并发布解决。目前可读取 PR #1；PR 仍开放，代码推送不代表已合并。

## 未执行的外部验收

- Supabase Auth 的真实用户登录与完整应用授权联调；Auth settings 可达，Storage 上传/签名下载/匿名拦截已单独验证。
- 真实生产订单的 MiMo 编排产物兼容性与持久化运行记录；基础 JSON、tool calling 和图片输入识别现已通过。
- B 审核共享合同、交付真实网站/海报渲染器及创意规则。
- 正式 HTTPS 部署的375/768/1280px浏览器交互检查、中文海报排版和手机扫码。
- 真实客户网站URL、客户PNG、ZIP下载与端到端客户验收。

因此目前无真实客户交付文件、公开站点、二维码目标或交付文件hash可列出，不能宣称 A 组最终商业链路已经验收。
所需接入和恢复步骤见 RUNBOOK.md，B 接入接口见 PROJECT_CONTRACT.md。

## 托管服务接入与 SQL Editor 初始化（2026-11-07）

已实际验证 Supabase Auth settings 和 Storage 管理接口均返回200；并创建 oneboss-private 私有桶，使用临时PNG验证上传、签名下载字节一致、匿名读取被拒绝，随后删除临时测试对象。未读取或打印凭据。

本环境 PostgreSQL TCP 访问列表为空，指定 TCP 代理拒绝连接；原生数据库连接仍未就绪。新增 docs/setup-supabase.sql 供用户在新项目的官方SQL Editor运行，不修改网络路由或绕过代理。

初始化脚本已在本地PostgreSQL17验证，模拟开启自动RLS，21项集成测试通过；重复执行保留业务数据并匹配迁移hash；已有无关业务表时拒绝并回滚。用户已在 OneBoss 托管项目的 SQL Editor 成功执行初始化脚本；已通过 HTTPS Data API 独立核对活跃套餐和增项，并确认匿名订单及迁移记录访问被拒绝。原生应用连接仍未验证。

### 托管建表后接口核验（2026-11-07）

- 使用可发布凭据读取 service_plans：HTTP200，恰好返回 basic=19900、professional=49900，未返回停用的 custom 套餐。
- 读取 service_addons：HTTP200，返回3条已配置增项。
- 相同匿名身份读取 service_orders、oneboss_migrations：均HTTP401，访问被拒绝。
- 服务端读取 oneboss-private 桶元数据：HTTP200，public=false。

用户截图显示 SQL 初始化结果行；上述 HTTPS 核验确认表和访问授权已实际生效。未显示或记录任何凭据。当前仍无 DATABASE_URL，TCP代理仍不可用，尚不能宣称 A 应用已连接托管业务数据库或跑通订单到交付的全链路。

### Docker 开发部署准备（2026-11-07）

新增 Dockerfile、Render Free Web Service 蓝图和双进程启动器。44项单元测试、21项数据库集成测试通过；Docker内生产构建通过。以node非root用户运行真实镜像，验证套餐查询、未登录请求拒绝及worker存活；未嵌入.env或临时构建CA。意外终止worker会停止HTTP服务并退出1，正常平台停止则退出0。

数据库支持单独的原始DATABASE_PASSWORD，避免手机手动URL编码；远程TLS强制验证，URL参数不能降低证书验证。Docker仅在本地测试数据库上运行，Render账号/服务尚未创建，托管Postgres原生TLS握手仍未实测，不能称为已经部署上线。

### Render 已上线与 A 独立验收补充（2026-11-07）

更新上述历史状态：用户已创建 Render `oneboss-ai`，部署33b0b7b。首次运行出现SELF_SIGNED_CERT_IN_CHAIN，补充Supabase Root 2021 CA到DATABASE_CA_CERT后重新部署。用户提供的 `/api/core/plans` 成功响应确认应用已通过原生连接读出托管套餐与增项，`/api/health` 的配置标记不再作为唯一证据。

新增 `scripts/acceptance-a.ts`，真实Supabase临时用户密码登录 + 本地Next生产HTTP + 独立worker + 真实MiMo + 一次性PostgreSQL业务库验收通过，无Auth/模型mock。修复角色历史输出字段对严格Schema的干扰后，任务e2829a9b-0d3d-4f16-b6fe-0466f75bdfed首轮成功，usage.total_tokens=2061，结果持久化；临时Auth用户2个全部删除。没有对生产业务库付款、写订单或改管理员权限。具体检查和仍需Render/B联调的边界见 A_ACCEPTANCE.md。

### Render 真实 Auth 与权限核验（2026-11-07）

新环境已恢复，Render域名策略生效。Codex直接验证health、套餐查询、匿名/无效令牌拒绝、伪造webhook拒绝。使用新建临时Auth用户真实密码登录，Render接受真实Bearer并完成授权数据库查询（不存在run返回404）；同一用户在Supabase Data API读取订单/项目/权益均为空，直接修改支付状态返回42501。`acceptance:hosted`通过，临时用户1个已删除，无业务记录创建。

service-role的Data API业务表读写也受42501限制，因此没有为线上测试扩大授权，也没有创建无法清理的演示订单。托管订单写入/worker仍未验收；详见A_ACCEPTANCE.md。仅新增可复用验收脚本和记录，不自动合并PR。
