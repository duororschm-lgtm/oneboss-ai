# A 组开源选型审计

2026-11-06 检查官方 raw GitHub 文件及 npm 安装包。未整仓复制，未复制候选仓库应用源码。实际依赖版本以 package-lock.json 为准。

| 项目 | 实际检查 | 许可证与选择 | 集成/撤回 |
|---|---|---|---|
| nextjs/saas-starter | README、LICENSE、app/api/stripe/webhook/route.ts | MIT。仅参考服务器确认支付与角色边界，不采用订阅、Drizzle 或其自建 JWT | 不引入依赖，无需撤回；OneBoss 单独实现一次性订单 |
| vercel/platforms | README、proxy.ts；LICENSE、license.md 路径返回404 | 许可未核实，不复制源码。只参考公开/租户路由分离，采用 /p/[slug] | 不引入 Redis、子域名代理；独立域名留 P2 |
| supabase/supabase-js | README、LICENSE、安装包 auth.getUser 和 storage API | MIT，正式依赖；与唯一 Supabase Auth/Storage 方案配套 | 若平台不可用，先停止真实验收，不再叠加另一套身份系统 |
| vercel/ai | README 指向 packages/ai/README.md；LICENSE | Apache-2.0。暂不引入，MiMo 使用服务器 HTTP 封装 | 当前尚无真实凭据兼容性证据；fetch 选择是最小实现，不能声称 SDK 已被实测判定不兼容 |
| Stuk/jszip | README.markdown、LICENSE.markdown、安装包 generateAsync 接口 | 双许可选择 MIT，正式依赖 | 输出上限50MiB，超限失败；大文件流式交付属于后续扩展 |
| stripe-samples/checkout-one-time-payments | README、LICENSE、server/node/server.js | MIT，仅研究一次性 Checkout 与原始回调体思路，无源码复制 | 未提供正式商户凭据，不安装 Stripe 或声称已上线收款；以后接入须验签+查单+幂等 |

安装及新增依赖：Next.js/React 工程、postgres 事务、Zod 合同、Supabase SDK、JSZip、Sharp/JSQR 验实际交付文件、Undici 保留代理与 TLS。
qrcode 仅用于测试生成可解码 PNG，不是 A 组的正式海报或二维码渲染器。
Tailwind 提供 B 接入所需基础能力；不制作 B 组视觉页面。
Vitest 验合同及数据库；Playwright 用于真实部署的浏览器检查。完整 B 创意渲染依赖仍由 B 选择、审计。
