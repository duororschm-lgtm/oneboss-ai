# OneBoss 3D 资产生成系统架构

## 系统组成

```
Customer Browser
    │
    ▼
OneBoss Web App (Next.js)
    ├── MiMo API (理解/规划/追问/调度)
    ├── Supabase (任务记录/资产元数据/版本)
    └── Object Storage (照片/模型/中间文件/最终 GLB)
              ▲
              │ 私有受控任务 API
              ▼
      OneBoss 3D Worker (独立服务)
        ├── CAD Import Adapter (occt-import-js)
        ├── COLMAP Reconstruction Adapter
        ├── Open3D Processing Adapter
        ├── TRELLIS.2 Adapter (许可证门禁)
        ├── TripoSR Adapter
        ├── Parametric Builder
        ├── Mesh Quality Gate
        └── GLB Export / Optimization
              │
              ▼
      Three.js / R3F Viewer (客户浏览器)
```

## 四条建模路线

| 路线 | 输入 | Pipeline | FidelityLevel | 可拆解 |
|---|---|---|---|---|
| A | CAD/STEP/GLB | cad_import | cad_exact | ✅ 真实分件 |
| B | ≥20张多角度照片 | photogrammetry | photogrammetry_reconstruction | ❌ |
| C | 2-5张照片 | image_to_3d | ai_image_approximation | ❌ |
| D | 文字描述 | parametric | parametric_concept | ✅ 概念 |

## 任务状态机

```
queued → analyzing → [awaiting_customer_input →] preprocessing
→ generating → postprocessing → validating → uploading → completed
                                    ↓
                              fallback_available / failed
```

## 拆解真实性规则

- CAD 多 Mesh + 客户确认 → `verified_exploded`
- 程序化参数模型 → `conceptual_exploded`
- 单 Mesh / 摄影测量 / AI 生成 → 仅外观旋转（`appearance_3d`）
- WebGL 不可用 → `static_fallback`

## GPU Worker 要求

- 独立于 Next.js Web 进程
- Python + FastAPI 或等效任务服务
- 持久化模型缓存
- 任务队列异步执行
- 不暴露任意文件路径
- 崩溃后可重试/标记失败

## 安全约束

- API Key 只存服务端
- 上传文件限制大小/格式/数量
- CAD/GLB 做安全校验
- 不执行 MiMo 任意代码
- 3D 失败不影响海报/文案/网站
- 审批后版本不被静默覆盖
