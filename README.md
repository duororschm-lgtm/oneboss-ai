# oneboss-ai
OneBoss AI - An AI-powered e-commerce marketing platform for product onboarding, intelligent consultation, content generation, and merchant management.

## B 组创意工作台（`b-studio/`）

`b-studio/` 是可独立运行的 B 组创意渲染演示：描述产品 → 生成可交互宣传网站、1080×1350 / 1080×1080 PNG 海报、二维码与小红书文案，并支持修改范围、版本、发布演示与 ZIP 交付。

```bash
cd b-studio
npm install
npm run dev        # http://localhost:5173
npm test           # 34 项合同 / 生成器 / 海报像素 / QR 解码测试
npm run build
npm run qa:visual  # Playwright 42 项检查（需要 Python Playwright）
npm run render:posters  # 24 张真实 PNG + 二维码 + manifest
```

主要入口：`/create`（描述生成）、`/projects/demo-chair-001/site`（交互网站）、`/projects/demo-chair-001/posters`（海报与文案）、`/projects/demo-chair-001/delivery`（交付中心）。

说明：当前为 B 组本地演示，MiMo、支付、正式发布、数据库与文件存储由 A 组负责；详见 `b-studio/docs/creative-handoff.md` 与 `b-studio/docs/visual-qa.md`。

