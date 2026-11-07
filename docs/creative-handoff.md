# 创意引擎与客户工作台交接

实际 B 引擎来源：项目所有者提供的 sibling onsboss-b，提交 cdc04e2e914d631b098acb62dab5db30b09add3a。工程复用其 React 网站、SVG/Sharp 海报、设计预设、几何与二维码模块，原 sibling 未修改。来源与集成改动详见 src/vendor/creative-b/PROVENANCE.md。

- 唯一 HTTP/数据库契约：src/contracts/index.ts。B 引擎内部 schema 只描述渲染输入，映射集中在 src/lib/creative/b-mapping.ts。
- 网站：src/lib/creative/b-adapter.tsx 的 renderSite，供公开 /p/[slug]、子页面及已授权预览使用。真实组件支持图库、信息标签、产品目录和详情、导航与响应式；多页导航由受信任公开路径派生。
- 海报：同一适配器的 renderPoster，输入批准设计、事实、授权资产和已核验公开地址；返回 PNG 与独立 QR PNG。1080×1350/1080×1080使用不同几何排版，未裁切竖版。renderPosterPreview 显式遮住 QR 并加草稿标识。
- 工作台：src/components/customer/studio.tsx，调用真实 Auth/HTTP/队列。新资料可逐张选尺寸，选择不同尺寸会占用对应海报数量；旧订单和旧稿件不变。
- 交付：src/lib/delivery/service.ts，独立 PNG、QR、Markdown、manifest 与 ZIP。二维码的独立下载也经过组织授权、当前版本和路径检查。
- 修改：原事实引用保持单一真相；只改网站必须保持海报/文案内容，改事实返回批准要求，历史发布不被静默覆盖。

运行依赖：Node、React、Next、Sharp/libvips、qrcode、jsqr、JSZip；字体及 Chromium 随 Docker 安装。版本以 package-lock.json 为准，许可证见 THIRD_PARTY_NOTICES.md。没有从 B 的 localStorage 导入订单、支付或 Agent 运行记录。

验证范围：隔离浏览器流程使用真实 Auth/API/B渲染与明确 fixture，不能替代真实模型或公网交付证据。真实托管模型、发布、下载、回滚证据见 A_ACCEPTANCE.md；新双尺寸/多产品补测以该文件最新记录为准。原策划书要求和暂缓配置保留在 PROJECT_COMPLETION.md。
