# 阶段 3｜前端 API 对接表

生成时间：2026-11-07　分支：`feat/admin-console`

> 所有请求都经过 `src/lib/admin/api.ts` 一个出口，页面组件里没有散落的 `fetch`。
> 「状态」列只有三种：**真实**（已接通现有接口）、**缺口**（后端未提供，页面显示缺口编号）、**只读真实**。

| 页面 | 用途 | 端点 | 状态 | 缺口 |
| --- | --- | --- | --- | --- |
| `/admin` | 8 张指标卡 | `GET /api/admin/dashboard` | 缺口 | A-01 |
| `/admin` | 收款趋势 | `GET /api/admin/revenue?from=&to=&groupBy=` | 缺口 | A-02 |
| `/admin` | 待办数量 | `GET /api/core/admin` | 真实 | — |
| `/admin` | 最近订单 | `GET /api/core/admin` | 真实 | — |
| `/admin/orders` | 订单列表 | `GET /api/core/admin` | 真实（前端筛选，非服务端分页） | A-03 |
| `/admin/orders` | 制作状态列 | 同上，缺 `work_state` 字段 | 缺口 | A-03 |
| `/admin/orders` | 订单详情抽屉 | `GET /api/admin/orders/:id` | 缺口 | A-04 |
| `/admin/finance` | 收入趋势与明细 | `GET /api/admin/revenue` | 缺口 | A-02 |
| `/admin/finance` | 成本与结余 | 同上（需成本归集） | 缺口 | A-02 |
| `/admin/approvals` | 待核验收款列表 | `GET /api/core/admin` → `manualAttempts` | 真实 | — |
| `/admin/approvals` | 登记收款核验 | `POST /api/commerce/orders/:id/confirm-manual` | 真实 | — |
| `/admin/approvals` | 退款申请列表 | `GET /api/core/admin` → `refunds` | 真实 | — |
| `/admin/approvals` | 确认/驳回退款 | `POST /api/commerce/orders/:id/finalize-refund` | 真实 | — |
| `/admin/approvals` | 制作放行 / 暂缓 / 补充资料 / 转交 | `POST /api/admin/orders/:id/production-release` 等 | 缺口 | A-05 |
| `/admin/agents` | 8 员工状态卡 | `GET /api/admin/agents/runs` | 缺口 | A-06 |
| `/admin/agents` | 运行记录表 | 同上 | 缺口 | A-06 |
| `/admin/reviews` | 作品审核队列 | `GET /api/admin/works/reviews` | 缺口 | A-08 |
| `/admin/reviews` | 通过 / 驳回 / 返工 | `POST /api/admin/works/:workId/review` | 缺口 | A-08 |
| `/admin/customers` | 客户档案 | `GET /api/admin/customers` | 缺口 | A-09 |
| `/admin/customers` | 组织派生视图 | `GET /api/core/admin` 前端派生 | 派生视图 | — |
| `/admin/plans` | 套餐只读 | `GET /api/core/plans` | 只读真实 | — |
| `/admin/audit-logs` | 审计日志 | `GET /api/admin/audit-logs` | 缺口 | A-11 |
| 全局 | 管理员身份判定 | `GET /api/core/admin`（403 即无权） | 真实 | A-07 |

## 权限渲染

| 能力 | 来源 | 现状 |
| --- | --- | --- |
| 是否管理员 | `/api/core/admin` 返回 200 / 403 | 真实可用 |
| 四角色（owner/finance/operations/reviewer） | `platform_admins.role` | **不存在**，缺口 A-07 |
| 按角色隐藏菜单与按钮 | —— | 无法真实生效，当前按「是管理员 = 全量能力」渲染 |

> 隐藏按钮不等于安全。所有写操作最终由服务端 `platformAdmin()` 校验。

## 错误处理

| HTTP | 前端行为 |
| --- | --- |
| 401 | 显示「登录已过期」，引导回 `/admin/login` |
| 403 | 显示无权访问页，不再请求其它接口 |
| 404（管理端点不存在） | 显示「后端接口尚未提供 + 缺口编号」，**不显示数字** |
| 409 / 422 | 保留上下文，提示刷新后重试 |
| 429 | 提示操作过频 |
| 500 | 显示 requestId，提供重试 |

## 开发模拟数据

`NEXT_PUBLIC_ADMIN_MODE=mock` 时，A-01/A-02/A-05/A-06/A-08/A-09/A-11 返回固定演示数据，
且页面顶部常驻「开发模拟数据」横幅。生产默认 `live`，不加载 `mock.ts`。
