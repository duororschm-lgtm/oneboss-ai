# AI 个性化视觉设计引擎 — 工程审计（阶段 0）

- 仓库：`duororschm-lgtm/oneboss-ai`
- 基线：`feat/core` @ `687c834`
- 开发分支：`feat/ai-custom-design-engine`
- 审计时间：2026-11-08

## 0. 会话环境说明（如实记录）

任务书假设 Claude Code 通过 MiMo API 工作。实际本次会话由 Claude Sonnet 5 驱动，并非 MiMo。
这不影响代码工作本身（开发时模型只负责读写代码），但不谎称"已确认 MiMo 连接"。
产品运行时 MiMo 网关（`src/lib/mimo/gateway.ts`）保持原样，未做任何改动，也未触碰任何 API Key 或全局 Claude Code 配置。

## 1. 已有能力与证据

| 能力 | 证据 | 状态 |
|---|---|---|
| Next.js / React 工程 | `package.json`（Next 16.4.5、React 19.2、Tailwind 4、Zod 4.6.7） | 已验证 |
| 共享数据合同 | `src/contracts/index.ts`（DesignSystem、Section、SiteSpec、Production 等） | 已验证 |
| MiMo 网关 + Agent Run | `src/lib/mimo/gateway.ts`、`src/lib/workflows/runner.ts` | 已验证 |
| 商品分析 / 事实确认 | `runner.ts` `role='intake'` | 已验证 |
| Creative Brief 审批 | `route.ts` `approve-brief` | 已验证 |
| 2–3 套创意方向生成 | `runner.ts` `role='design'` | 已验证，但受限（见 §3） |
| B 侧 React 渲染器 | `src/vendor/creative-b/components/site-renderer/SiteRenderer.tsx` | 已验证 |
| 海报 SVG/Sharp 生成 | `src/vendor/creative-b/lib/creative/composer.ts` | 已验证 |
| 方向预览 | `src/lib/customer/direction-preview.ts` | 已验证，但受限（见 §4） |
| 私有预览 / 发布 / 交付 | `src/lib/publishing/`、`src/lib/delivery/` | 已验证 |
| 单元测试 | `tests/unit/`（contracts、b-adapter、gateway 等 13 个文件） | 已验证 |

## 2. 当前真实数据流

```
intake → facts(verified) → brief(approved)
  → design(runner) → DesignChoices{choices:[DesignSystem×2-3]}  ← styleId 三选一
  → 客户 approve-design(styleId) → design_systems 表
  → generate(runner) → Production{site,posters,copy}
  → b-mapping.mapSite → B SiteRenderer / composer → 预览 → 发布 → 交付
```

方向预览旁路：`studio.tsx` → `directionPreview()` → `mapDirectionSite()` → `SiteFrame`。

## 3. 三个 styleId 限制（`src/lib/workflows/runner.ts:71-80`）

- design 提示词强制从 `editorial-minimal / future-tech / young-vibrant` 选择；
- 校验要求 `styleId` 互不相同、`layoutMode` 在 `editorial / split / centered / staggered` 中互不相同；
- 结果：AI 只能"选标签"，无法自主设计。

## 4. 方向预览固定结构限制（`src/lib/customer/direction-preview.ts`）

`directionPreview()` 硬编码 `hero + specs` 两个 Section，`allowedSectionTypes` 也只允许这两个。
三套方案在客户眼中只有配色/字体差异，页面结构完全一致 → 违反 P0。

## 5. b-mapping 丢失的字段（`src/lib/creative/b-mapping.ts:63-108`）

| 丢失点 | 后果 |
|---|---|
| `mapDesign()` 对未知 styleId 静默回退三个预设 | 自定义设计身份被丢弃 |
| 只覆盖 `base.palette` 里已有的键 | 模型新增语义色无法进入渲染 |
| 只映射 `display/body/mono` 字体键 | 字阶、字重、行高被丢弃 |
| `layoutMode` 只接受 4 种，其余回退 | 新布局被静默改写 |
| `radiusScale` 只取 `[0]` 并夹到 48 | 语义丢失 |
| `mapSiteForView()` 不传递 Section 的 `variant/columns/alignment` | B 侧 Section 无布局参数可用 |
| `motionPreset` 三值折叠 | `none`→`reduced` 映射尚可，但无中间态 |

## 6. 当前审批接口依赖（`src/app/api/[...path]/route.ts:437-456`）

- 请求体 `{ runId, styleId }`；
- 服务端用 `styleId` 从 `DesignChoices.choices` 查找方案；
- 找到后写入 `design_systems`，`version = revision`，`approvedByClient = true`；
- 没有 `directionId` 概念，选择键完全依赖模型输出的 styleId 字符串。

## 7. 需要改动的最少文件

| 文件 | 改动 |
|---|---|
| `src/contracts/index.ts` | 新增 `SiteBlueprint`；扩展 `DesignSystem`（Design DNA + `directionId` + `siteBlueprint`）；扩展 `Section.props` 布局字段 |
| `src/lib/workflows/runner.ts` | design 提示词升级；服务端分配 `directionId`；差异校验器；generate 提示词带 Blueprint 约束 |
| `src/lib/customer/direction-preview.ts` | 按 Blueprint 构建真实 SiteSpec（P0） |
| `src/lib/creative/b-mapping.ts` | 自定义 Token 优先映射；Section Layout 透传 |
| `src/vendor/creative-b/types/contracts.ts` | Section 增加 `layout`；`styleId` 放宽为受控字符串（保留 3 预设兼容） |
| `src/vendor/creative-b/components/site-renderer/SiteRenderer.tsx` | 按 `layout.variant` 渲染变体 |
| `src/vendor/creative-b/site.css` | 布局变体样式 |
| `src/components/customer/studio.tsx` | `directionId` 展示与审批 |
| `src/app/api/[...path]/route.ts` | `directionId` 审批，兼容 `styleId` |
| `tests/unit/*` | Schema、Blueprint、差异、映射、预览测试 |

## 8. 兼容风险

| 风险 | 缓解 |
|---|---|
| 旧 `design_systems` 行 body 无新字段 | 所有新字段 `.optional()`，Zod 严格模式下仍可解析 |
| 旧 run 的 `DesignChoices` 无 `siteBlueprint` | 方向预览对缺失 Blueprint 回退固定 hero+specs（旧行为），并标注 |
| B 侧 `styleIdSchema` 是 3 值枚举 | 放宽为字符串但保留 3 个预设 key；旧作品渲染路径不变 |
| `posterSpecSchema.styleId` 同样是枚举 | 海报本次不动，保持原枚举 |
| `mapDesign` 行为变化影响既有海报/网站渲染 | 保留 preset 作为缺失字段回退；旧 styleId 输入结果不变 |
| `SiteSpec` 增加可选布局字段 | `.strict()` + `.optional()` 兼容；旧产物仍可解析 |
| 模型输出新增字段导致 Schema 校验失败 | design 提示词明确字段清单；`callMimo` 已有 Schema 校验重试机制（见 gateway） |

## 9. 计划新增的 Schema

```ts
BlueprintSectionLayout = {
  variant?, columns?, alignment?, width?, emphasis?, background?, imageRatio?
}
BlueprintSection = { type, layout, factKeys?, assetRoles?, note? }
SiteBlueprint = {
  pages: [{ slug, title, sections: BlueprintSection[] }],
  contentWidth?, visualRhythm?
}
DesignSystem += {
  directionId?, name?, tagline?, visualConcept?, visualKeywords?,
  density?, imageTreatment?, heroComposition?, pageGrid?, siteBlueprint?
}
```

语义引用规则：`factKeys` / `assetRoles` 由服务端解析为真实 `factRefs` / `assetRefs`，模型不生成 UUID。

## 10. 测试策略

1. **Schema 兼容**：旧 DesignSystem / SiteSpec fixture 仍能解析；新字段可选。
2. **Blueprint 构建**：`directionPreview()` 按 Blueprint 生成 Section 序列，不再固定 hero+specs。
3. **差异校验**：构造仅 palette 不同的两套方案 → 必须报 `DESIGN_DIRECTIONS_NOT_DISTINCT`；构造结构不同的 → 通过。
4. **映射透传**：`mapDesign` 保留自定义 Token；`mapSiteForView` 传递 layout。
5. **审批兼容**：`directionId` 命中优先；仅 `styleId` 的旧请求仍可用。
6. **回归**：`npm run typecheck && npm test && npm run build` 全绿。
7. **浏览器**：375 / 768 / 1280 截图（需真实运行环境，见交付说明）。

## 11. 结论

现有架构可增量升级，无需推倒重来。P0 核心是：
1. 给 Design Choices 增加独立 `SiteBlueprint`；
2. 方向预览改为按 Blueprint 构建 SiteSpec；
3. 自定义 Design DNA + Section Layout 完整进入 B 渲染器；
4. `directionId` 贯穿选择与审批；
5. 差异校验保证三套方案不是换颜色。

以下按阶段 2–8 实施。
