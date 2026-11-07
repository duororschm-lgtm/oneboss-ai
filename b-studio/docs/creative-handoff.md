# OneBoss B 组创意渲染交接

> 更新：2026-11-07 · 对应仓库根目录 `oneboss-creative-studio@0.2.0`
> 本文只描述真实存在的接口、文件和实测结果；未接入的能力会被明确标注为 Demo。

## 1. B 组对外暴露的渲染接口

所有输入输出都经过 `src/types/contracts.ts` 的 Zod 合同校验，不依赖 UI 点击顺序。

### 1.1 网站

```ts
// src/lib/creative/composer.ts
buildSiteSpec(input: ComposeInput): SiteSpec
```

```tsx
// src/components/site-renderer/SiteRenderer.tsx
<SiteRenderer spec={siteSpec} designSystem={designSystem} seed={projectSeed} mode="public" />
```

- `ComposeInput`：`seed`、`design`、`siteRevision`、`posterRevision`、`copyRevision`、`factOverrides`、`factVersion`、`qrUrl`、`qrSource`、`qrRequested`、`headlineOverride`。
- `SiteSpec` 只包含受控章节枚举（hero / gallery / features / specs / products / story / cta）与交互枚举（carousel / tabs / accordion / scrollReveal），没有 HTML 或可执行代码。
- A 组负责 `publishSite`、`/p/[slug]`、权限与已发布指针；B 组只保证传入 `SiteSpec + DesignSystem + seed` 能渲染真实交互页面。

### 1.2 描述生成项目（本地演示）

```ts
// src/lib/creative/project-generator.ts
generateProjectFromBrief(input: BriefInput, options?: { suffix?: string; existingSlugs?: string[] }): {
  seed: ProjectSeed;
  recommendedStyleId: StyleId;
  notes: string[];
  missing: string[];
}
```

- 输入：产品名称、品牌/价格（可选）、品类、场景、描述、风格偏好。
- 只提取描述里明确写出的品牌与价格；缺失项标记“待确认”，`price` 不会猜金额。
- 输出受控 `ProjectSeed`，可直接交给 `buildSiteSpec` / `buildPoster` / `buildCopies`。
- 这是 B 组的确定性本地实现，不调用 MiMo；A 组正式接入时用 MiMo 输出同一 JSON 结构，再走相同 Zod 合同。
- 演示应用把生成的 seed 存在 localStorage（`oneboss.demo.state.v3`），服务端持久化由 A 组负责。

### 1.3 海报

```ts
buildPoster(input: ComposeInput, height: 1350 | 1080): {
  spec: PosterSpec;
  decision: { placement: 'bottom-right' | 'bottom-left'; reason: string; conflicts: Record<... , string[]> };
  warnings: string[];
}
```

```ts
buildPosterSvg(spec, design, seed): string          // 纯 SVG 字符串，浏览器与 Node 共用
renderPosterPng(spec, design, seed): Promise<{      // 浏览器 Canvas 光栅化
  blob: Blob; width: 1080; height: 1080 | 1350;
  bytes: number; distinctColors: number; valid: boolean;
}>
renderQrPng(url, size = 800): Promise<RenderedPoster>
buildCopies(input, height): PosterCopyBundle        // 与海报同源的小红书文案
```

`PosterSpec` 自带 `safeZones`（主视觉 / 价格 / 标题 / 二维码卡位），A 组可以据此做自动质检。

### 1.4 修改

```ts
// src/lib/creative/change-request.ts
parseChangeRequest(instruction, { projectId, baseRevision, currentPrice, productId }): ChangeRequest
```

- 只解析意图与影响范围，不直接写商品事实。
- 价格修改返回 `pending-fact-approval`，必须由 A 组事实库审核后生效。
- 网站配色变更只产生 `sitePalette` 操作；二维码位置变更只产生 `posterQrPlacement` 操作。

### 1.5 角色提示词（给 A 组 MiMo 网关）

```ts
// src/lib/creative/prompts/index.ts
rolePrompts['creative-director' | 'site-designer' | 'poster-designer' | 'copywriter' | 'change-parser' | 'product-analyst' | 'qa-reviewer' | 'project-manager']
```

这些是**业务行为约束**，不含 API Key 或调用实现；A 组负责真实调用、JSON 解析、重试与日志。输出仍必须通过本仓库 Zod 合同校验。

### 1.6 交付

```ts
// src/lib/zip.ts
createZip(entries: { name: string; data: Uint8Array }[]): Blob
```

浏览器内真实生成 ZIP（store 模式），交付中心会把 2 张 PNG、独立二维码、2 份文案、`site-url.txt`、`manifest.json`、`README-交付说明.md` 打包。Node 侧文件存储、签名下载与 ZIP 归属权由 A 组实现。

## 2. 共享合同（与 A 组对齐）

`src/types/contracts.ts` 已用 Zod 定义并实际校验：

| DTO | 关键字段 |
| --- | --- |
| `ProductFact` | `key/label/value/verified/source/priceType` |
| `DesignSystem` | `styleId/palette/typography/layoutMode/motionPreset/heroComposition/posterLayout/sectionFlow/factVersion` |
| `SiteSpec` | `schemaVersion/projectId/revision/designSystemVersion/factVersion/pages/interactions/seo/warnings` |
| `PosterSpec` | `canvas/layout/posterId/headline/price/tags/qr{placement,urlSource,url,caption,quietZoneModules}/safeZones` |
| `PosterCopyBundle` | `posterId/title/body/hashtags/coverCaption/cta/factVersion/posterFile/complianceNotes` |
| `ChangeRequest` | `targetArtifacts/parsedOperations/isFactChange/factChangeNeedsApproval/baseRevision/previewRevision/approvalState` |
| `Order` | `payState/workState/isDemo/paymentMode/amountMinor/projectId` |
| `DeliveryManifest` | `publicSiteUrl/siteRevision/posters/copy/qrAssets/zipPath/deliveryStatus` |

注意：

- **商品价格与 OneBoss 服务费完全独立**；`Order.amountMinor` 是服务费，`PosterSpec.price` 是客户商品价格。
- 事实版本贯穿网站、海报、文案；任一商品事实变更需要三件作品一起升级版本。
- B 组没有、也不应该拥有 `payment_attempts` / `service_orders.pay_state` 的写权限。

## 3. A 组接入步骤

1. A 组在服务端构建 `seed`（产品事实 + 资产引用）与已批准的 `DesignSystem`，并从事实库注入 `factOverrides` / `factVersion`。
2. 调用 `buildSiteSpec` 生成 `SiteSpec`，校验通过后保存为待发布版本；发布路由只使用已批准 revision。
3. 调用 `buildPoster` 生成两种尺寸的 `PosterSpec`，再调用 `buildPosterSvg` + Sharp 输出 PNG。
4. **只有拿到已验证的公开 HTTPS URL 后**，再以 `qrSource: 'published-site'`、`qrUrl: <publicUrl>` 重新执行第 3 步，生成最终二维码海报。
5. 用 `PosterSpec.safeZones` 检查二维码卡位、价格遮挡；用文件尺寸、字节数与二维码解码做验收。
6. 保存 `PosterCopyBundle` 与海报的绑定关系，交付 ZIP 的 `manifest.json` 应复用同一 `posterId/factVersion`。

### Node 导出示例

```ts
import sharp from 'sharp';
import { buildPoster } from './src/lib/creative/composer';
import { buildPosterSvg } from './src/lib/creative/poster-renderer/svg';

const input = { seed, design, siteRevision, posterRevision, copyRevision, factOverrides, factVersion, qrUrl, qrSource: 'published-site' };
const { spec } = buildPoster(input, 1350);
const png = await sharp(Buffer.from(buildPosterSvg(spec, design, seed))).png({ compressionLevel: 9 }).toBuffer();
```

已实测：Sharp 在 Windows + 系统中文字体下可以正确渲染 CJK；生产环境需确认字体授权与部署镜像字体。

## 4. 实测产物与证据

### Node 导出（`npm run render:posters`）

- 24 张：4 个项目 × 3 个设计方向 × 2 个尺寸。
- 尺寸全部 1080×1350 或 1080×1080，单张约 60–86 KB。
- 每张 PNG 都从**最终像素**用 jsQR 反解出同一个 URL，0 失败。
- 额外输出：4 个 800×800 独立二维码、24 份小红书 Markdown、`public/output/manifest.json`。

### 浏览器导出（交付中心）

- Canvas 光栅化后的 PNG 约 107–125 KB（1080×1350），108 种取色；`valid` 校验要求 >20 KB 且至少 4 种取色。
- 交付中心会先渲染 2 张 PNG + 1 张二维码并检查，再允许下载 ZIP；ZIP 内 8 个文件，可由系统解压。

### 自动化测试（`npm test`）

34 项通过，覆盖：

- 四个 fixture 与全部方向 × 尺寸的 Zod 合同；
- 二维码默认右下、价格冲突时自动左下、强制指定与冲突报告；
- 自动卡位与主视觉/价格/标题/页脚零重叠；
- 竖版与方版两套独立排版；
- Sharp PNG 尺寸、中文标题区域深色像素、jsQR 解码一致；
- 无图兜底、多产品目录、汽车参数边界；
- 网站/海报/文案价格与事实版本一致；
- 修改范围（只网站 / 只海报 / 价格需审批 / 标题 / 换图）。

## 5. 与 A 组的边界（不要越界）

- B 不实现 MiMo 调用、密钥管理、支付、退款、数据库、文件存储、正式发布与 ZIP 归属权。
- B 不编造商品事实；未知项在 UI 与导出物中保持“待确认”。
- B 不使用未经授权素材；所有演示图为概念图形并带“非实拍”标注。
- B 不把演示发布地址当成正式公网地址；正式二维码必须使用 A 组验证过的 HTTPS URL。

## 6. 已知限制

| 限制 | 影响 | 处理建议 |
| --- | --- | --- |
| 未接真实 MiMo | 创意方向与文案为 B 组的确定性策略，不是模型输出 | A 组按同一 JSON 合同调用 MiMo，B 只消费结果 |
| 演示发布 | 公开 URL 是本机 `/p/:slug`，外部不可访问 | A 组部署 `publishSite` 并通过 HTTPS 验证后替换 |
| 概念图形 | 不是商家实拍 | 客户上传授权素材后替换 `assetRefs`，海报自动重排 |
| 系统字体 | 依赖部署机 CJK 字体 | 生产镜像安装合规字体，或在 Satori 方案中显式加载 |
| 多产品详情 | 页内切换，不是独立产品路由 | 需要独立详情页时给 `SiteSpec.pages` 增加页面 |
| ZIP 在浏览器生成 | 受浏览器内存限制 | 大批量交付由 A 组服务端生成 ZIP 并签名下载 |
| 无版本持久化 | 演示状态存 `localStorage`，清缓存即重置 | 正式版本由 A 组 `artifact_versions` 持久化 |
| 描述生成是本地启发式 | 只做关键词/正则提取，不等于真实模型理解 | A 组用 MiMo 生成同结构 JSON；B 组保留 Zod 合同与渲染器 |
| 自定义项目仅本浏览器 | 分享公开链接到其他设备时 localStorage 没有该 seed | A 组服务端保存 ProjectSeed 后，公开路由从数据库读取 |


