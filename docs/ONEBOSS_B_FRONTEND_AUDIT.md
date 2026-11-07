# OneBoss B 前端体验审计报告

> 分支：`feat/ai-interactive-web-v4` · 日期：2026-11-08
> 角色：B 成员 / 前端与用户体验负责人

## 1. 现有页面盘点

| 页面 | 文件路径 | 使用 API | 数据来源 | 状态 |
|---|---|---|---|---|
| 客户结账 | `checkout.tsx` | `/api/core/plans`, `commerce/quotes`, `commerce/orders` | 真实 API | ✅ 已修复 |
| 人工支付 | `manual-payment.tsx` | `commerce/orders/:id/checkout`, `report-manual-payment` | 真实 API | ✅ 良好 |
| 财务后台 | `finance/page.tsx` | `fetchRevenue` (Admin API) | 真实 API | ✅ 已升级 |
| AI 监控 | `agents/page.tsx` | `fetchAgentRuns` (Admin API) | 真实 API | ✅ 已修复 |
| 客户工作台 | `studio.tsx` | `core/projects/:id/workspace` | 真实 API | ✅ 完善 |
| 制作进度 | `production-progress.tsx` | `core/projects/:id/workspace` | 真实 API | ✅ 新增 |

## 2. 修复的问题

### 2.1 支付页面

| 问题 | 根因 | 修复 |
|---|---|---|
| 加购数量清空被强制变 0 | `Number('')` → 0 | 改为字符串状态 `type="text"` + 空字符串保留 |
| 无法输入 0 | `Math.max(0, ...)` 阻止 | 允许输入 "0" |
| 支付方式只有微信 | 硬编码 radio | 新增微信/支付宝双渠道选择 |
| 价格客户端计算 | `plan.price_minor + addons.reduce()` | 保留展示用 `qty()` 辅助函数，提交走服务端报价 |

### 2.2 AI 员工监控

| 问题 | 根因 | 修复 |
|---|---|---|
| 卡片"暂无任务"但有记录 | 后端 `role` 用 `intake/design/generate`，前端用 `product_analyst/creative_director` | 修复映射 `AGENT_ROLES`，加入 `matchesAgentRole()` |

### 2.3 财务图表

| 问题 | 根因 | 修复 |
|---|---|---|
| 图表拉伸变形 | `preserveAspectRatio="none"` | 改为响应式 `viewBox` + `ResizeObserver` |
| 线条重叠 | confirmedMinor 和 netMinor 太接近 | 加入 refunded 线（红虚线），颜色/线型区分 |
| 无 hover 详情 | SVG `<title>` 原生提示 | 新增自定义 tooltip 浮层 |
| 无订单数 | 缺失 | 加入右侧 Y 轴 + 订单量柱状图 |
| 无快捷筛选 | 只有手动日期输入 | 加入 7/14/30/90 天快捷按钮 |
| 无汇总指标 | 缺失 | 加入 4 个指标卡（到账/退款/净收款/订单数） |

## 3. 新增功能

### 3.1 制作进度中心（ProductionProgress）

文件：`src/components/customer/production-progress.tsx`

核心能力：
- **10 阶段时间线**：资料接收 → 商品分析 → 创意设计 → 等待选择 → 网站生成 → 海报文案 → 质量审核 → 发布验证 → 交付整理 → 完成
- **真实进度条**：基于已完成阶段数 / 总阶段数（非假百分比）
- **智能轮询**：活跃 3s / 空闲 15s / 页面隐藏 30s
- **连接状态**：在线/重连中指示器
- **失败恢复**：上下文错误信息 + 重试按钮
- **最近活动**：最近 5 条运行记录
- **刷新恢复**：URL projectId 找回任务，不重新创建

## 4. 响应式支持

| 视口 | 375px | 768px | 1280px | 1440px |
|---|---|---|---|---|
| 结账页 | ✅ | ✅ | ✅ | ✅ |
| 进度页 | ✅ | ✅ | ✅ | ✅ |
| 财务图表 | ✅ | ✅ | ✅ | ✅ |
| AI 监控 | ✅ | ✅ | ✅ | ✅ |

## 5. 需要 A 处理的接口

| 接口需求 | 说明 |
|---|---|
| `GET /core/projects/:id/progress` | 制作进度专用接口（含阶段列表和百分比） |
| `GET /admin/revenue/summary` | 财务汇总指标（非列表累加） |
| `POST /commerce/quotes` | 服务端报价 API（加购单价校验） |

## 6. 测试结果

| 测试 | 结果 |
|---|---|
| TypeScript | ✅ 0 errors |
| 单元测试 | ✅ 176/176 |
| 构建 | ✅ 成功 |
