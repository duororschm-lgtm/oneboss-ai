# B 引擎开源与集成审计

本文件记录当前 Next 工程的实际接入决策。原始 B 仓库的审计在其 docs/opensource-audit-b.md，描述的是独立演示工程；其中 React18、Vite、React Router 等版本不代表当前部署。当前精确依赖以本仓库 package-lock.json 和 THIRD_PARTY_NOTICES.md 为准。

| 能力            | 实际选择                          | 来源/许可记录                                      | 与当前工程的关系                                                  |
| --------------- | --------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| 网站及设计预设  | 项目自有 B React 引擎             | src/vendor/creative-b/PROVENANCE.md 记录原提交     | 复用布局、交互、产品目录，不引入 React Router/Vite 或另一套 React |
| 结构化渲染输入  | A共享Zod合同与单一映射边界        | A合同 src/contracts/index.ts；引擎schema仅内部使用 | 不使用B演示订单、支付或localStorage数据                           |
| PNG海报         | B受控SVG几何 + 当前Sharp          | Sharp Apache-2.0，保留npm/native分发许可           | 竖版与方形独立排版；无需Satori或第二套海报编辑器                  |
| 二维码          | B模块矩阵及qrcode                 | qrcode MIT                                         | 依赖包内路径，升级需实际PNG/二维码回归；独立文件由A存储和授权签名 |
| 图标            | lucide-react                      | ISC                                                | 当前工程的单一图标依赖                                            |
| 图片/二维码验收 | Sharp + jsqr                      | Apache-2.0                                         | 独立读最终像素；不是以模型自评当验收                              |
| 交互浏览器验收  | playwright-core + Chromium/Edge   | Apache-2.0；浏览器保留包内许可                     | 发布worker三宽度检查，客户工作台真实浏览器回归                    |
| 字体            | Docker的fonts-noto-cjk/fontconfig | 保留系统包版权记录                                 | 不打包商业字体或私有字体文件                                      |

未安装 Puck、Design Editor、React Flow 或 Motion。当前 P0 使用受控规格、自然语言修改和真实任务列表；拖拽、复杂图层及任务流程图属于原策划的可选增强，未描述为已完成。

回退：CREATIVE_ADAPTER_MODULE 选择受信任部署模块，builtin:b 为当前正式实现；回退发布版本可使用现有批准作品指针，不复制新的B渲染器。适配器、授权素材路径和两种尺寸的回归必须同时通过，不能用静态截图代替真实PNG或公开网页。
