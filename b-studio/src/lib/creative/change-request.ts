import type { ChangeOperation, ChangeRequest, Palette } from '../../types/contracts';

export const BLACK_GOLD: Partial<Palette> = {
  background: '#0b0b0c',
  surface: '#161513',
  text: '#f4ead3',
  muted: '#a89c82',
  accent: '#c9a45c',
  accentText: '#15120b',
  border: '#2c2820',
};

export interface ParseContext {
  projectId: string;
  baseRevision: number;
  currentPrice: string;
  productId: string;
}

export interface ParseOptions {
  id?: string;
  createdAt?: string;
}

const has = (text: string, pattern: RegExp) => pattern.test(text);

function splitPrice(price: string): { prefix: string; amount: string; suffix: string } {
  const match = price.match(/^(.*?)(?:¥|￥)\s*([\d.]+)(.*)$/);
  if (!match) return { prefix: '', amount: '', suffix: ' ' };
  return { prefix: match[1].trim(), amount: match[2], suffix: match[3] };
}

function formatPriceLike(current: string, nextAmount: string): string {
  const { prefix, suffix } = splitPrice(current);
  const head = prefix ? `${prefix} ` : '';
  const tail = suffix && !suffix.startsWith(' ') ? ` ${suffix}` : suffix;
  return `${head}¥${nextAmount}${tail}`;
}

/**
 * 把客户自然语言改造成受控 ChangeRequest。
 * 这里只做意图解析与范围判定；价格等商品事实永远不能在这里直接写入，
 * 必须走 A 组事实库审批（本演示用“模拟审核”按钮表示）。
 */
export function parseChangeRequest(instruction: string, ctx: ParseContext, options: ParseOptions = {}): ChangeRequest {
  const text = instruction.trim();
  const ops: ChangeOperation[] = [];
  const risks: string[] = [];
  let isFactChange = false;
  let targetArtifacts: ('site' | 'poster' | 'copy')[] = ['site'];

  const posterFrozen = has(text, /海报(?:不要动|不动|不改|别动|先别动)/) || has(text, /不要动海报|别改海报/);
  const siteFrozen = has(text, /网站(?:不要动|不动|不改|别动)/) || has(text, /网页(?:不要动|不动|不改)/);

  // 1. 商品事实（价格）修改
  const pricePair = text.match(
    /(?:从\s*)?(?:¥|￥)?\s*(\d+(?:\.\d+)?)\s*(?:万元|元|块|万|千)?\s*(?:改|调|换)(?:成|到|为)?\s*(?:¥|￥)?\s*(\d+(?:\.\d+)?)/,
  );
  const priceTarget = text.match(/(?:价格|售价|单价)[^\d]{0,6}(?:改成|改为|改到|调到|变成|设为|定为)\s*(?:¥|￥)?\s*(\d+(?:\.\d+)?)/);
  const priceIntent = /价格|售价|单价|改\s*\d|从\s*\d.*改/.test(text) && (pricePair || priceTarget || /改\s*\d/.test(text));

  if (priceIntent) {
    const current = splitPrice(ctx.currentPrice);
    const nextAmount = pricePair?.[2] ?? priceTarget?.[1] ?? '';
    const fromAmount = pricePair?.[1] ?? current.amount;
    const nextPrice = nextAmount ? formatPriceLike(ctx.currentPrice, nextAmount) : ctx.currentPrice;
    isFactChange = true;
    // 商品事实影响所有作品；即使客户说“海报不动”，也必须提示全部受影响。
    targetArtifacts = ['site', 'poster', 'copy'];
    ops.push({
      kind: 'productFact',
      path: `${ctx.productId}:product.price`,
      from: ctx.currentPrice,
      to: nextPrice,
      description:
        fromAmount && nextAmount
          ? `商品价格从 ${fromAmount} 调整为 ${nextAmount}（${ctx.currentPrice} → ${nextPrice}）`
          : `商品价格改为 ${nextPrice}`,
    });
    risks.push('价格属于商品事实：必须由 A 组事实库审核确认，不能由创意编辑器直接写入。');
    risks.push('价格变更会同时影响网站、海报和文案，旧版本保留，审核通过后才生成新版本。');
  } else if (has(text, /换.{0,3}(?:主图|图片)|主图.{0,3}换|换一张图/)) {
    targetArtifacts = ['site', 'poster'];
    ops.push({
      kind: 'note',
      path: 'assetRefs',
      from: '当前概念图形',
      to: '待客户上传授权素材',
      description: '更换主图需要客户提供有授权的真实素材，系统不会调用外部图片或生成假实拍。',
    });
    risks.push('未收到授权素材前，主图不会改变；也不会用 AI 生成图冒充实拍。');
  } else {
    // 2. 二维码位置（只改海报）
    const qrIntent = has(text, /二维码/) && has(text, /左下|左上|右下|右上|左|右/);
    // 3. 网站配色（黑金 / 深色）
    const paletteIntent = has(text, /黑金|深色|暗色|黑色|黑底/) && has(text, /网站|网页|站点/);
    // 4. 标题 / 文案
    const headlineIntent = has(text, /标题|文案|副标题|slogan|Slogan|主标题/);

    if (qrIntent && !paletteIntent && !headlineIntent) {
      const toLeft = has(text, /左下|左上|左/);
      targetArtifacts = ['poster'];
      ops.push({
        kind: 'posterQrPlacement',
        path: `${ctx.projectId}:poster.qr.placement`,
        from: 'auto',
        to: toLeft ? 'bottom-left' : 'bottom-right',
        description: `只调整海报二维码到${toLeft ? '左下角' : '右下角'}，网站与文案不重新生成。`,
      });
      risks.push('若指定位置与主图/价格冲突，海报会把二维码移回安全侧并提示设计师。');
    } else if (paletteIntent) {
      // 配色属于网站设计基线变更：默认只作用于网站，海报与文案保持原版本。
      targetArtifacts = ['site'];
      ops.push({
        kind: 'sitePalette',
        path: `${ctx.projectId}:site.palette`,
        from: '当前设计基线',
        to: 'black-gold',
        description: '网站切换为黑金配色（深色底、暖金强调），版式与内容结构保持不变。',
      });
      if (posterFrozen) {
        risks.push('客户明确要求“海报不动”，海报与文案保持原版本。');
      }
    } else if (headlineIntent) {
      const next = extractHeadline(text);
      targetArtifacts = ['copy', 'poster'];
      ops.push({
        kind: 'copyHeadline',
        path: `${ctx.projectId}:copy.headline`,
        from: '当前海报主标题',
        to: next ?? '（由 A 组 MiMo 生成更合适的标题）',
        description: next
          ? `文案与海报主标题改写为「${next}」，保留已确认的产品事实。`
          : '文案与海报主标题改写为更高一档的语气，保留已确认的产品事实。',
      });
      risks.push('标题改写只动文案层，不能添加未经确认的绝对化卖点。');
    } else {
      targetArtifacts = ['site'];
      ops.push({
        kind: 'note',
        path: `${ctx.projectId}:site`,
        from: '当前网站版本',
        to: '待解析的视觉微调',
        description: '未识别到明确的可执行指令，先生成网站预览；请补充更具体的要求。',
      });
      risks.push('指令不够具体，本次只生成网站预览，不改动价格与素材。');
    }
  }

  // 显式冻结范围（价格变更时同样适用）
  if (posterFrozen && !isFactChange) targetArtifacts = targetArtifacts.filter((target) => target !== 'poster');
  if (siteFrozen && targetArtifacts.includes('site') && !isFactChange) {
    targetArtifacts = targetArtifacts.filter((target) => target !== 'site');
  }
  if (targetArtifacts.length === 0) targetArtifacts = ['site'];

  const factChangeNeedsApproval = isFactChange;
  const affectedArtifactIds = targetArtifacts.flatMap((target) =>
    target === 'site'
      ? [`${ctx.projectId}:site`]
      : target === 'poster'
        ? [`${ctx.projectId}:poster:1350`, `${ctx.projectId}:poster:1080`]
        : [`${ctx.projectId}:copy:1350`, `${ctx.projectId}:copy:1080`],
  );
  const scopeLabel = targetArtifacts
    .map((target) => ({ site: '网站', poster: '海报', copy: '文案' })[target])
    .join(' + ');

  return {
    id: options.id ?? `cr-${Date.now().toString(36)}`,
    projectId: ctx.projectId,
    instruction: text,
    targetArtifacts,
    parsedOperations: ops,
    isFactChange,
    factChangeNeedsApproval,
    affectedArtifactIds,
    baseRevision: ctx.baseRevision,
    previewRevision: ctx.baseRevision + 1,
    approvalState: isFactChange ? 'pending-fact-approval' : 'draft',
    needsRegenerate: targetArtifacts,
    previewSummary: isFactChange
      ? '检测到商品事实修改：已生成范围说明，等待 A 组事实审核。'
      : `影响范围：${scopeLabel}${posterFrozen ? '（海报已按指令冻结）' : ''}。其余作品保持当前版本。`,
    potentialRisks: risks,
    createdAt: options.createdAt ?? new Date().toISOString(),
  };
}

function extractHeadline(text: string): string | null {
  const quoted = text.match(/[「“"]([^」”"]{2,30})[」”"]/);
  return quoted?.[1] ?? null;
}
