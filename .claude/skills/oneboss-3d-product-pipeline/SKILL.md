# OneBoss 3D 产品资产生成流水线

## 技能用途

指导 OneBoss 项目的 3D 资产生成、导入、重建、优化和展示。
适用于从客户输入到最终 GLB 交付的完整流程。

## 3D 资产分级（真实性标注）

| 等级 | 来源 | 拆解 | 标注 |
|---|---|---|---|
| `cad_exact` | 客户 CAD/STEP/GLB | ✅ 真实分件 | `CAD 精确资产` |
| `photogrammetry_reconstruction` | 多视角照片重建 | ❌ 仅旋转 | `实物照片重建` |
| `ai_image_approximation` | 自部署 AI 单图/少图 | ❌ 仅旋转 | `AI 生成近似模型` |
| `parametric_concept` | 参数化概念模型 | ✅ 概念拆解 | `AI 参数化概念模型` |

## 四条建模路线

### 路线 A：客户 CAD / GLB（优先级最高）
- 使用 `occt-import-js` 导入 STEP/IGES
- 使用 Three.js GLTFLoader 导入 GLB/GLTF
- 保留节点树、部件名称和层级
- 可支持真实拆解（仅当有多 Mesh）

### 路线 B：多视角摄影测量（≥20 张照片）
- COLMAP：相机注册 + 点云
- Open3D：点云处理 + 网格重建
- 保留照片颜色信息
- 不自动还原内部结构

### 路线 C：AI 单图 3D（自部署）
- TRELLIS.2（优先 POC，需许可证审查）
- TripoSR（MIT，快速兜底）
- 输出标注"AI 近似模型"
- 不宣称精确还原

### 路线 D：参数化概念模型
- 按品类调用 Builder
- MiMo 输出 Product3DSpec
- 真实分离 Mesh 可做概念拆解
- 标注"概念结构示意"

## 路由决策规则

```
有 CAD/GLB? → 路线 A
有 ≥20 张多角度照片? → 路线 B
有 2-5 张照片? → 路线 C
有描述? → 路线 D
```

## MiMo 职责边界

MiMo **负责**：理解商品、评估资料、追问客户、选择路线、生成 Product3DSpec
MiMo **不负责**：生成 Mesh、写代码、调用 Meshy、指定文件路径

## 禁止事项

- ❌ 禁止 Meshy 或任何外部 3D 生成 SaaS
- ❌ 禁止把单张照片模型称为"真实扫描"
- ❌ 禁止把单一 Mesh 伪装成真实装配体
- ❌ 禁止把非商业依赖放生产环境
- ❌ 禁止提交模型权重到 Git
- ❌ 禁止 MiMo 输出可执行代码

## GLB 质量门禁

1. 文件类型和大小检查
2. 网格有效性（法线、非流形、孔洞）
3. 纹理和材质检查
4. Node 层级检查
5. glTF-Transform 优化
6. 重新导入验证
7. Three.js 渲染验收

## 运行测试

```bash
npm run typecheck
npm test          # 单元测试
npm run build     # 构建
```

## 关键文件

- `src/contracts/product3d.ts` — Product3DSpec Schema
- `src/lib/three-d/model-router.ts` — 路线路由
- `src/lib/three-d/parametric-builder.ts` — 多品类 Builder
- `src/lib/three-d/glb-validator.ts` — GLB 安全验证
- `src/lib/three-d/provider.ts` — 3D Provider 抽象
