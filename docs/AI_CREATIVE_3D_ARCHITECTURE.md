# AI Creative Director + 交互式 3D — 架构说明

## 1. 整体架构

```
客户输入（商品资料 + 图片 + Brief）
         │
         ▼
    素材质量评估（asset-quality.ts）
    ├── 0 图 → AI 创意概念 / 参数化概念 3D
    ├── 1 图 → 真实原图 + 概念补充 / 外观 3D
    └── 2-5 图 → 多角度外观 3D / 概念拆解
         │
         ▼
    MiMo 创意总监 → Design DNA + Site Blueprint
         │
         ▼
    directionId 审批 → Production
         │
         ├─→ B 渲染器（网站 + Section Layout 变体）
         │        │
         │        └─→ product-3d Section → R3F Viewer
         │                                    ├── ConceptChair（程序化 Mesh）
         │                                    ├── Explode 滑块
         │                                    └── 部件选择/高亮
         │
         ├─→ 海报生成（Sharp/SVG）
         ├─→ 二维码
         └─→ 小红书文案
```

## 2. 3D 信任分级

| 级别 | 含义 | 可拆解 | 来源 |
|---|---|---|---|
| `appearance_3d` | 外观 3D 旋转 | ❌ 仅旋转 | 图生 3D / 客户上传 |
| `conceptual_exploded` | 概念分件拆解 | ✅ 概念偏移 | 程序化几何 / 确认部件分类 |
| `verified_exploded` | 真实分件拆解 | ✅ 工程真实 | GLB/CAD 多 Mesh + 客户确认 |
| `static_fallback` | 静态封面 | ❌ 无交互 | WebGL 不可用时降级 |

## 3. 概念椅 Mesh 组成

```
ConceptChair (Group)
├── Backrest    ← 弧形靠背（Box + 装饰板）
├── Seat        ← 坐垫（Box）
├── Frame       ← 支撑结构（Box）
├── Leg-FL      ← 前左椅腿（Box）
├── Leg-FR      ← 前右椅腿（Box）
├── Leg-BL      ← 后左椅腿（Box）
└── Leg-BR      ← 后右椅腿（Box）
```

每个 Mesh 有独立的 `explodeOffset`，拆解滑块对 `position` 做线性插值。

## 4. 素材决策矩阵

| 输入 | 策略 | 标注 |
|---|---|---|
| 0 图 + 有描述 | concept_3d_appearance | 概念结构示意 · 非商家实拍 |
| 0 图 + 无描述 | ai_creative_concept | 概念视觉 · AI 创意示意 |
| 1 图清晰 | concept_3d_appearance | AI 近似外观 3D · 概念展示 |
| 1 图模糊 | real_plus_concept | 概念补充展示 · 非商家实拍 |
| 2-5 图多角度 | concept_3d_exploded | 概念拆解 · 非工程验证结构 |
| 客户 GLB | verified_exploded | 真实分件拆解 |

## 5. Provider 抽象

```
ThreeDGenerationProvider (interface)
├── createTask(imageUrls) → { taskId, costEstimate }
├── getTask(taskId) → ThreeDTaskRecord
└── cancel(taskId)

实现：
├── MeshyProvider    — 真实 Meshy API（需 MESHY_API_KEY）
└── Mock3DProvider   — 测试用，不产生费用

getThreeDProvider() 自动选择：有 Key → Meshy，无 Key → Mock
```

## 6. 安全约束

- 3D 组件 `ssr: false` 懒加载
- WebGL 检测 + 降级
- 概念标注强制显示
- 3D 资产用服务端 ID，不接受外部 URL
- `NEXT_PUBLIC_*` 不存 API Key
