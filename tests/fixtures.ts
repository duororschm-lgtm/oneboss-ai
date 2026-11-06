import { randomUUID } from 'node:crypto';
import { Production, DesignSystem, type FactType } from '../src/contracts';
export function fixture() {
  const projectId = randomUUID(),
    orgId = randomUUID(),
    productId = randomUUID(),
    factId = randomUUID(),
    copyId = randomUUID(),
    posterId = randomUUID();
  const fact: FactType = {
    id: factId,
    productId,
    key: 'name',
    value: '测试椅子',
    source: 'customer',
    verified: true,
    version: 1,
  };
  const design = DesignSystem.parse({
    version: 1,
    styleId: 'minimal',
    rationale: '留白布局',
    palette: { background: '#ffffff' },
    typography: { body: 'sans-serif' },
    spacingScale: [8, 16],
    radiusScale: [4],
    layoutMode: 'minimal',
    motionPreset: 'subtle',
    approvedByClient: true,
    factVersion: 1,
  });
  const production = Production.parse({
    site: {
      schemaVersion: '1.0',
      projectId,
      revision: 1,
      designSystemVersion: 1,
      pages: [
        {
          slug: '',
          title: '测试椅子',
          sections: [
            { type: 'hero', props: { alignment: 'center' }, factRefs: [factId], assetRefs: [] },
          ],
        },
      ],
      allowedSectionTypes: ['hero'],
      interactions: ['accordion'],
      seo: { title: '测试椅子', description: '已确认商品资料' },
      factVersion: 1,
    },
    posters: [
      {
        schemaVersion: '1.0',
        projectId,
        revision: 1,
        designSystemVersion: 1,
        canvas: { width: 1080, height: 1350 },
        layers: [{ type: 'text', factRef: factId, role: 'headline' }],
        productFactRefs: [factId],
        assetRefs: [],
        textRefs: [factId],
        qr: { placement: 'auto_bottom_right_or_left', caption: '扫码查看详情' },
        copyPackRef: copyId,
        factVersion: 1,
      },
    ],
    copy: [
      {
        id: copyId,
        posterId,
        title: '测试椅子',
        body: '已确认信息',
        hashtags: ['椅子'],
        cta: '了解详情',
        factVersion: 1,
        factRefs: [factId],
      },
    ],
  });
  return { projectId, orgId, productId, factId, copyId, posterId, fact, design, production };
}
