# 3D 模型与依赖许可证清单

> 审核日期：2026-11-08 · 分支：`feat/product-3d-pipeline`
> **硬性约束：禁止 Meshy；禁止任何第三方托管商业 3D 生成 API。**

## 核心框架（已集成）

| 项目 | 版本 | 许可证 | 用途 | 状态 |
|---|---|---|---|---|
| Three.js | 0.170.x | MIT | WebGL 3D 渲染基础 | ✅ 已集成 |
| @react-three/fiber | ^9.x | MIT | React 3D 渲染绑定 | ✅ 已集成 |
| @react-three/drei | ^10.x | MIT | R3F 辅助组件（OrbitControls 等） | ✅ 已集成 |

## 建模路线候选（待部署到 GPU Worker）

### 路线 C：AI 单图 3D — TRELLIS.2

| 项目 | 来源 | 许可证 | 风险 | 状态 |
|---|---|---|---|---|
| microsoft/TRELLIS.2 | github.com/microsoft/TRELLIS.2 | MIT（主仓库） | ⚠️ 见下 | 待 POC |
| microsoft/TRELLIS.2-4B | huggingface.co/microsoft/TRELLIS.2-4B | MIT（模型卡） | ⚠️ | 待 POC |
| NVlabs/nvdiffrast | github.com/NVlabs/nvdiffrast | **NVIDIA Source Code License（非商业）** | ❌ **禁止商业使用** | 需替换或取得许可 |
| NVlabs/nvdiffrec | github.com/NVlabs/nvdiffrec | **NVIDIA Source Code License（非商业）** | ❌ **禁止商业使用** | 需替换或取得许可 |

**TRELLIS.2 许可证风险详述：**
TRELLIS.2 官方安装脚本提供 `nvdiffrast` / `nvdiffrec` 安装选项。这两个 NVIDIA 组件采用 NVIDIA Source Code License，限制非商业用途。OneBoss 是商业 SaaS：
1. 不允许直接照抄官方安装命令部署到生产
2. 必须审计实际推理链中哪些步骤依赖这两个组件
3. 优先用 Open3D / Three.js 等 MIT 组件替换
4. 如果核心推理链无法在不用受限依赖下工作，该路线不得用于生产

### 路线 D：快速单图 — TripoSR

| 项目 | 来源 | 许可证 | 风险 | 状态 |
|---|---|---|---|---|
| VAST-AI-Research/TripoSR | github.com/VAST-AI-Research/TripoSR | MIT | 低 | 待部署 |

### 路线 B：摄影测量 — COLMAP + Open3D

| 项目 | 来源 | 许可证 | 风险 | 状态 |
|---|---|---|---|---|
| colmap/colmap | github.com/colmap/colmap | BSD | 低 | 待部署 |
| isl-org/Open3D | github.com/isl-org/Open3D | MIT | 低 | 待部署 |
| cdcseacave/openMVS | github.com/cdcseacave/openMVS | **AGPL** | ❌ **商业 SaaS 需法律评估** | **不作默认依赖** |

### 路线 A：CAD 导入

| 项目 | 来源 | 许可证 | 风险 | 状态 |
|---|---|---|---|---|
| kovacsv/occt-import-js | github.com/kovacsv/occt-import-js | LGPL-2.1 | 中（需按 LGPL 条款集成） | 待集成 |
| donmccurdy/glTF-Transform | github.com/donmccurdy/glTF-Transform | MIT | 低 | 待集成 |

## 可选研究（默认不集成）

| 项目 | 许可证 | 决定 |
|---|---|---|
| Tencent-Hunyuan/Hunyuan3D-2.1 | Tencent Hunyuan 3D 2.1 Community License | 不集成（需逐条法律审查） |

## 审核规则

1. 主仓库 MIT ≠ 全部依赖可商用
2. 每个模型权重需单独审查
3. 每个传递依赖需审查许可证
4. 非商业限制组件禁止进生产
5. 记录许可证来源 URL 和审查日期
