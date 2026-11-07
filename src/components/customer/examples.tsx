'use client';
import { useState } from 'react';
import { directionPreview } from '../../lib/customer/direction-preview';
import { designPresets } from '../../vendor/creative-b/data/design-presets';
import type { FactType } from '../../contracts';
import { SiteFrame } from './site-frame';
const projectId = '11111111-1111-4111-8111-111111111111',
  productId = '22222222-2222-4222-8222-222222222222';
const facts: FactType[] = [
  ['name', 'OneBoss 创意宣传'],
  ['description', '交互网站、高清海报与文案制作服务。此处为公开排版演示，不是真实客户案例。'],
  ['brand', 'BlackCode'],
  ['contact', '微信 18001132767 · 邮箱 18510820722@qq.com'],
].map(([key, value], i) => ({
  id: `33333333-3333-4333-8333-${String(i + 1).padStart(12, '0')}`,
  productId,
  key,
  value,
  source: 'customer',
  verified: true,
  version: 1,
}));
export function ExampleGallery() {
  const [style, setStyle] = useState<keyof typeof designPresets>('editorial-minimal'),
    [mobile, setMobile] = useState(false);
  const p = designPresets[style],
    mapped = directionPreview(
      projectId,
      1,
      {
        version: 1,
        styleId: style,
        rationale: '公开排版演示',
        palette: p.palette,
        typography: { display: p.typography.display, body: p.typography.body },
        spacingScale: [8, 16, 24, 48],
        radiusScale: [p.radiusScale],
        layoutMode: p.layoutMode,
        motionPreset: 'subtle',
        approvedByClient: false,
        factVersion: 1,
      },
      facts,
    );
  return (
    <section className="ob-section">
      <span className="ob-eyebrow">TRY THE INTERACTION</span>
      <h2>亲手切换，看看不同表达。</h2>
      <p>这是实际网站组件的排版演示，内容用于介绍 OneBoss 服务；不代表客户订单或模型生成记录。</p>
      <div className="ob-actions" role="group" aria-label="演示风格">
        {Object.entries(designPresets).map(([id, p]) => (
          <button
            className={`ob-button ob-ghost ${id === style ? 'ob-active' : ''}`}
            aria-pressed={id === style}
            key={id}
            onClick={() => setStyle(id as keyof typeof designPresets)}
          >
            {p.name}
          </button>
        ))}
        <button
          className="ob-button ob-ghost"
          aria-pressed={mobile}
          onClick={() => setMobile(!mobile)}
        >
          {mobile ? '切换桌面视口' : '切换手机视口'}
        </button>
      </div>
      <SiteFrame mapped={mapped} width={mobile ? 375 : '100%'} title="交互作品演示" height={800} />
    </section>
  );
}
