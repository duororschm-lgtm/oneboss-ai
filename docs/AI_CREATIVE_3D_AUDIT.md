# AI Creative Director + 交互式 3D — 工程审计报告

- 仓库：`duororschm-lgtm/oneboss-ai`
- 基线：`feat/core` + `feat/ai-custom-design-engine` (V2 基础)
- 开发分支：`feat/ai-creative-3d`
- 审计时间：2026-11-08

## 1. 现有成果（已验证）

| 能力 | 状态 | 来源 |
|---|---|---|
| Design DNA + Site Blueprint Schema | ✅ 已实现 | V2 |
| directionId 服务端分配 + 审批 | ✅ 已实现 | V2 |
| 方向差异校验器（≥4 维结构差异） | ✅ 已实现 | V2 |
| 基于 Blueprint 的真实方向预览 | ✅ 已实现 | V2 |
| B Renderer Section Layout 变体 | ✅ 已实现 | V2 |
| Production 遵循批准 Blueprint | ✅ 已实现 | V2 |
| R3F 3D Viewer（概念椅 Mesh） | ✅ 已实现 | V3 |
| Explode 滑块 + 部件选择 + 高亮 | ✅ 已实现 | V3 |
| WebGL 降级 | ✅ 已实现 | V3 |
| `product-3d` Section 集成 | ✅ 已实现 | V3 |
| 素材质量评估 | ✅ 已实现 | V3 |
| 3D Provider 抽象（Meshy + Mock） | ✅ 已实现 | V3 |
| ModelTrust / ExplodedViewSpec 合同 | ✅ 已实现 | V3 |
| 单元测试 133 个 | ✅ 全过 | V2+V3 |

## 2. 关键缺口与本次覆盖

| 缺口 | 覆盖方式 | 状态 |
|---|---|---|
| 无 R3F/Three.js 依赖 | 已安装 R3F v9 + Drei v10 + Three.js | ✅ |
| 无 3D Viewer | `ProductViewer.tsx` + `ConceptChair.tsx` 真实 Mesh | ✅ |
| 无 product-3d Section | B 合同 + SiteRenderer 集成 | ✅ |
| 无素材质量评估 | `asset-quality.ts` 决策矩阵 | ✅ |
| 无 3D Provider 抽象 | `provider.ts`（Meshy 适配器 + Mock） | ✅ |
| 无 ModelTrust 分级 | 合同中定义 4 级信任 | ✅ |
| 无 ExplodedViewSpec | 合同中定义，含 parts/camera | ✅ |
| 真实 Meshy API 调用 | ⚠️ 需 MESHY_API_KEY（未配置） | 待联调 |
| 浏览器 3D 截图 | ⚠️ 需运行环境 + 浏览器 | 待执行 |

## 3. 本次新增文件

| 文件 | 职责 |
|---|---|
| `src/components/creative/three-d-viewer/ProductViewer.tsx` | R3F 3D Viewer（懒加载、OrbitControls、拆解滑块、部件面板） |
| `src/components/creative/three-d-viewer/ConceptChair.tsx` | 程序化概念椅（7 个独立 Three.js Mesh） |
| `src/components/creative/three-d-viewer/index.tsx` | Next.js dynamic 懒加载入口 |
| `src/lib/visual-assets/asset-quality.ts` | 素材质量评估 + 决策矩阵 |
| `src/lib/three-d/provider.ts` | ThreeDGenerationProvider 抽象 + Meshy 适配器 + Mock |
| `src/contracts/index.ts` | +ModelTrust, ModelAssetRecord, ExplodedViewSpec, product-3d |
| `src/vendor/creative-b/types/contracts.ts` | +product-3d section variant |
| `src/vendor/creative-b/components/site-renderer/SiteRenderer.tsx` | +Product3DSection |
| `tests/unit/asset-quality-3d.test.ts` | 14 个新测试 |

## 4. 安全边界

- 3D 组件纯客户端渲染（`dynamic` + `ssr: false`），不在 Node.js 阶段访问 WebGL
- 所有概念模型标注"概念结构示意 · 非商家实拍"
- ModelTrust 四级信任体系，`static_fallback` 不冒充互动 3D
- 3D 资产用服务端 ID 引用，不接受模型输出外部 URL
- Meshy Provider 未配置时自动降级为 Mock，不产生外部费用

## 5. 测试策略与结果

```
npm run typecheck  →  0 errors
npm test           →  17 files, 133 tests, all passed
npm run build      →  [见构建验证]
```

## 6. 风险与待办

1. **真实 Meshy API 联调**：需要 MESHY_API_KEY 和预算授权
2. **浏览器 3D 验收**：需要运行环境做 375/768/1280 截图
3. **发布 QA 集成**：3D 页面负载可能影响 Render Free 的 Chromium QA
4. **GLB 上传验证**：文件格式/安全检查模块待实现
