# B 组开源资产审计（实际安装版本）

> 核对时间：2026-11-07 · 依据仓库 `package.json` 与 `node_modules/*/package.json` 的实际版本/许可证字段。
> 原则：一个依赖只解决一个问题；不把多个完整编辑器拼在一起；P0 之外的项目没有安装。

## 1. 正式依赖（随产品构建/运行）

| 项目/包 | 实际版本 | 用途 | 引入位置 / 模块 | 许可证 | 引入方式 | 引入成本 | 是否进入正式版本 | 回退方案 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `react` / `react-dom` | 18.3.1 | UI 与站点渲染器 | 全站组件、`SiteRenderer` | MIT | npm 正式依赖 | 低 | 是 | 可迁移到 A 组 Next.js App Router；渲染器是纯 React 组件 |
| `react-router-dom` | 6.28.1 | 演示路由（官网、工作台、公开站点） | `src/App.tsx`、`src/main.tsx` | MIT | npm 正式依赖 | 低 | 是 | 迁到 Next.js 文件路由时删除，页面组件不需要业务改动 |
| `zod` | 3.24.1 | 共享合同校验；拒绝越界 AI 输出 | `src/types/contracts.ts` | MIT | npm 正式依赖 | 低 | 是 | 与 A 组合同必须同源；如 A 用别的校验库，仅保留类型并做边界适配 |
| `qrcode` | 1.5.4 | 生成二维码模块矩阵 | `src/lib/creative/qr.ts`（深导入 `qrcode/lib/core/qrcode`） | MIT | npm 正式依赖 | 低 | 是 | 深导入依赖包内部路径，升级大版本有风险；回退到 `qrcode.toString({type:'svg'})` 或 `qrcode-generator` |
| `lucide-react` | 0.468.0 | 统一图标（导航、状态、操作） | 全站 | ISC | npm 正式依赖 | 低 | 是 | 图标都是独立组件，可替换为内联 SVG |
| `sharp` | 0.33.5 | 服务端 SVG→PNG、图片元数据 | `scripts/render-posters.ts` | Apache-2.0 | npm devDependency（仅 Node 导出脚本） | 中（原生二进制） | 是（构建期，不进入浏览器包） | 浏览器 Canvas 导出已可用；服务端可换 `@resvg/resvg-js` 或 Satori+Sharp |

## 2. 测试/质量依赖

| 包 | 版本 | 用途 | 许可证 | 说明 |
| --- | --- | --- | --- | --- |
| `vitest` | 3.0.5 | 合同、组合器、几何、PNG 回归 | MIT | 34 项测试，包含真实 PNG 像素与二维码解码 |
| `jsqr` | 1.4.0 | 从最终 PNG 像素反解二维码 | Apache-2.0 | 仅测试与导出脚本使用；这是“二维码可扫”的程序化证据 |
| `typescript` | 5.7.2 | 类型检查 | Apache-2.0 | `tsc -b` |
| `tsx` | 4.19.2 | 运行 Node 导出脚本 | MIT | `npm run render:posters` |
| `vite` / `@vitejs/plugin-react` | 6.0.5 / 4.3.4 | 开发服务器与构建 | MIT | — |
| Playwright（Python） | 环境自带 | 375/768/1280 视觉与交互 QA | Apache-2.0 | 未写入 package.json；`npm run qa:visual` 需要 Python Playwright |

## 3. 策划书中评估但未安装的项目

| 项目 | 为什么没有安装 | 当前替代 | 何时再评估 |
| --- | --- | --- | --- |
| `vercel/satori` | 中文排版与 Flex 兼容需要额外字体配置；先用受控 SVG + Sharp 达到同样“确定性模板→PNG”的效果（B 策划书明确允许的兜底路径） | `poster-renderer/svg.ts` + Sharp/Canvas | 当 A 组服务端需要统一字体排版且已验证 Satori 中文结果时 |
| `kozakdenys/qr-code-styling` | 海报二维码只需要高对比、标准纠错与静区；花哨样式反而有扫码风险 | `qrcode` 模块矩阵 → 单 path，`jsQR` 验证 | 需要品牌化二维码且通过扫码测试后 |
| `motiondivision/motion` | P0 动效可以由 CSS + IntersectionObserver 完成，且更容易尊重 `prefers-reduced-motion` | `SiteRenderer` 的 reveal/transition | 需要复杂布局动画/手势编排时 |
| `shadcn-ui/ui` | 组件依赖 Radix + Tailwind，当前是轻量演示，手写组件更可控；未引入第二套设计 token | `src/components/ui.tsx` + `styles.css` | 客户工作台页面数量继续增长时 |
| `puckeditor/puck` | P2；结构化 SiteSpec 已可被编辑器消费，先保证渲染真实可用 | 受控 SiteSpec + 修改解析 | P0 稳定且需要非技术客户拖拽时 |
| `fastlabai/design-editor` | P2；会引入第二套海报图层真相，和 SVG 渲染器冲突 | 受控版式 + 安全区 + Revise | 只在时间允许时作为增强，不阻塞 PNG |
| `xyflow/xyflow` | P1 展示增强；当前运行记录用真实状态位展示 | `Agents` 页面（明确标注演示） | A 组有真实 run/task 事件并可复用时 |

## 4. 许可证与合规备注

- 所有正式依赖的许可证均为 MIT / ISC / Apache-2.0，允许商业使用；未拷贝第三方仓库源码。
- `sharp` 与 `jsqr` 的 Apache-2.0 需要在分发时保留 NOTICE/许可文本；本仓库未内嵌其源码。
- `qrcode` 深导入 `lib/core/qrcode` 属于包内路径，**升级时需回归** `scripts/render-posters.ts` 与 `tests/poster.test.ts`。
- 字体：当前使用系统 CJK 字体（Microsoft YaHei / PingFang SC / SimSun 等），未打包任何需要授权分发的字体文件。生产部署必须使用有授权的字体资源。
- 产品图片：全部为 B 组自绘概念图形，不是商家实拍；正式客户交付必须替换为已授权素材。

