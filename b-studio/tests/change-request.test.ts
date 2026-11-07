import { describe, expect, it } from 'vitest';
import { parseChangeRequest } from '../src/lib/creative/change-request';
import { changeRequestSchema } from '../src/types/contracts';

const ctx = {
  projectId: 'demo-chair-001',
  baseRevision: 3,
  currentPrice: '¥129 / 把',
  productId: 'chair-01',
};

const parse = (instruction: string, context = ctx) => {
  const request = parseChangeRequest(instruction, context, { id: 'cr-test', createdAt: '2026-11-07T00:00:00.000Z' });
  expect(() => changeRequestSchema.parse(request)).not.toThrow();
  return request;
};

describe('自然语言修改的范围解析', () => {
  it('“网站改黑金，海报不要动”只生成网站变更', () => {
    const request = parse('网站改黑金，海报不要动');
    expect(request.targetArtifacts).toEqual(['site']);
    expect(request.isFactChange).toBe(false);
    expect(request.needsRegenerate).toEqual(['site']);
    expect(request.parsedOperations[0].kind).toBe('sitePalette');
    expect(request.potentialRisks.join(' ')).toContain('海报与文案保持原版本');
    expect(request.affectedArtifactIds).toEqual(['demo-chair-001:site']);
  });

  it('“只把海报二维码换到左下角”只改海报，不重建网站', () => {
    const request = parse('只把海报二维码换到左下角');
    expect(request.targetArtifacts).toEqual(['poster']);
    expect(request.parsedOperations[0]).toMatchObject({ kind: 'posterQrPlacement', to: 'bottom-left' });
    expect(request.parsedOperations[0].description).toContain('网站与文案不重新生成');
  });

  it('“价格从129改139”触发事实审核并标记所有受影响作品', () => {
    const request = parse('价格从129改139');
    expect(request.isFactChange).toBe(true);
    expect(request.factChangeNeedsApproval).toBe(true);
    expect(request.targetArtifacts).toEqual(['site', 'poster', 'copy']);
    expect(request.approvalState).toBe('pending-fact-approval');
    expect(request.parsedOperations[0]).toMatchObject({
      kind: 'productFact',
      path: 'chair-01:product.price',
      from: '¥129 / 把',
      to: '¥139 / 把',
    });
    expect(request.potentialRisks.join(' ')).toContain('A 组事实库审核');
  });

  it('汽车指导价变更保留前缀与单位，不丢“指导价/万”', () => {
    const request = parse('指导价从18.98万改19.98万', {
      projectId: 'demo-car-002',
      baseRevision: 1,
      currentPrice: '指导价 ¥18.98 万',
      productId: 'nova-c7',
    });
    expect(request.parsedOperations[0].to).toBe('指导价 ¥19.98 万');
    expect(request.isFactChange).toBe(true);
  });

  it('“标题更高级些”改写文案与海报主标题，不动价格', () => {
    const request = parse('标题更高级些');
    expect(request.targetArtifacts).toEqual(['copy', 'poster']);
    expect(request.isFactChange).toBe(false);
    expect(request.parsedOperations[0].kind).toBe('copyHeadline');
    expect(request.potentialRisks.join(' ')).toContain('绝对化');
  });

  it('“换一张主图”要求客户上传授权素材，不生成假实拍', () => {
    const request = parse('换一张主图');
    expect(request.isFactChange).toBe(false);
    expect(request.parsedOperations[0].kind).toBe('note');
    expect(request.potentialRisks.join(' ')).toContain('不会用 AI 生成图冒充实拍');
  });

  it('无法识别的指令只生成网站预览，不误改价格', () => {
    const request = parse('再高级一点吧');
    expect(request.targetArtifacts).toEqual(['site']);
    expect(request.isFactChange).toBe(false);
    expect(request.potentialRisks.join(' ')).toContain('不够具体');
  });
});
