# 3D 建模流水线详细说明

## 输入路由

```
客户输入分析
  │
  ├─ CAD/STEP/IGES/GLB 文件? → 路线 A: cad_import
  │    └─ 保留节点树/部件名称/材质
  │    └─ 单位统一（mm/cm/m → m）
  │    └─ 可真实拆解（仅当多 Mesh）
  │
  ├─ ≥20 张多角度照片? → 路线 B: photogrammetry
  │    └─ COLMAP: 相机注册 + 点云
  │    └─ Open3D: 法线 + 网格重建
  │    └─ 仅外观旋转，不还原内部
  │
  ├─ 2-5 张照片? → 路线 C: image_to_3d
  │    └─ TRELLIS.2（需许可证审查）
  │    └─ TripoSR（MIT 兜底）
  │    └─ AI 近似，标注来源
  │
  └─ 仅文字描述? → 路线 D: parametric
       └─ 按品类 Builder 生成
       └─ 概念拆解（真实分离 Mesh）
       └─ 标注"概念结构示意"
```

## Product3DSpec 核心字段

- `fidelityLevel`: cad_exact / photogrammetry / ai_approx / parametric_concept
- `modelStrategy.pipeline`: cad_import / photogrammetry / image_to_3d / parametric
- `parts[]`: 每个部件有 geometry/transform/material/source/confidence
- `sourceEvidence[]`: 输入来源、置信度
- `unknowns[]`: 未知信息列表
- `warnings[]`: 风险提示

## 质量门禁

1. 输入文件安全检查
2. 坐标轴/单位/尺度统一
3. 网格有效性（法线、非流形、孔洞）
4. 纹理/材质检查
5. GLB 导出
6. glTF-Transform 优化
7. 重新导入验证
8. Three.js 渲染验收
9. 生成 QualityReport

## PBR 材质预设

wood / brushed_metal / polished_metal / aluminum / stainless_steel /
plastic / rubber / leather / fabric / glass / ceramic / paper /
cardboard / transparent_acrylic / painted_surface / screen_glass / custom

## 展示环境预设

studio_clean / luxury_dark / bright_minimal / technical_showcase /
warm_lifestyle / outdoor_natural / industrial_precision

## 品类路由

furniture / vehicle / electronics / appliance / packaging /
bottle_container / beauty_personal_care / fashion_accessory /
footwear / sports_outdoor / toy / mechanical_tool /
industrial_equipment / home_living / food_beverage / other

未知品类 → GenericProductBuilder（分析轮廓/体块/曲面/厚度）
