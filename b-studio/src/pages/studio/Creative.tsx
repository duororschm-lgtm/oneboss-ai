import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Check, Palette, Sparkles } from 'lucide-react';
import { ProductArt } from '../../components/site-renderer/ProductArt';
import { Badge, Notice, SectionHeading } from '../../components/ui';
import { designPresets } from '../../data/design-presets';
import { useProjectBundle, useStudio } from '../../lib/store';
import type { DesignSystem, Product, ProjectSeed } from '../../types/contracts';

const sectionNames: Record<string, string> = {
  hero: '主视觉',
  gallery: '图库',
  features: '卖点',
  specs: '参数',
  products: '产品目录',
  story: '品牌故事',
  cta: '行动入口',
};

const layoutNames: Record<DesignSystem['layoutMode'], string> = {
  editorial: '编辑式留白',
  split: '左右分栏',
  centered: '居中舞台',
  staggered: '错位叠放',
};

const motionNames: Record<DesignSystem['motionPreset'], string> = {
  subtle: '克制淡入',
  dynamic: '弹性入场',
  reduced: '减少动效',
};

export function Creative() {
  const { projectId = '' } = useParams();
  const bundle = useProjectBundle(projectId);
  const { selectStyle, approveDesign } = useStudio();
  const changes = bundle.state.changeRequests.filter((request) => request.approvalState === 'preview' || request.approvalState === 'approved');
  const siteOnlyChange = changes.find((request) => request.targetArtifacts.includes('site') && !request.targetArtifacts.includes('poster'));
  const design = designPresets[bundle.state.styleId];

  return (
    <div className="studio-page creative-page">
      <SectionHeading
        eyebrow="AI CREATIVE DIRECTOR"
        title="选择创意方向"
        description="三套方案在 Hero 构图、章节顺序、卡片语言与动效节奏上都有实质差异，不只是换颜色。选中后，网站与海报共用这套设计基线。"
        actions={
          bundle.state.designApproved ? (
            <Badge tone="good">
              <Check size={13} /> 已确认 {design.name}
            </Badge>
          ) : (
            <Badge tone="warn">待确认方向</Badge>
          )
        }
      />

      <Notice tone="info" title="创意总监由谁生成？">
        方案的结构与设计策略由 B 组定义（本页为确定性的设计预设，可在接入 A 组 MiMo 后由模型按同一 JSON 合同输出）。
        页面不会伪造模型调用记录，也不会编造未确认的产品卖点。
      </Notice>

      <div className="direction-grid">
        {bundle.seed.designStyles.map((styleId, index) => {
          const direction = designPresets[styleId];
          const selected = bundle.state.styleId === styleId;
          return (
            <article className={`direction-card ${selected ? 'selected' : ''}`} key={styleId}>
              <StyleMini design={direction} seed={bundle.seed} product={bundle.products[0]} />
              <div className="direction-body">
                <div className="direction-title">
                  <span>
                    {String.fromCharCode(65 + index)} · {direction.name}
                  </span>
                  {selected && <Badge tone="accent">当前方向</Badge>}
                </div>
                <h3>{direction.tagline}</h3>
                <p>{direction.rationale}</p>

                <dl className="direction-tokens">
                  <div>
                    <dt>版式</dt>
                    <dd>{layoutNames[direction.layoutMode]}</dd>
                  </div>
                  <div>
                    <dt>动效</dt>
                    <dd>{motionNames[direction.motionPreset]}</dd>
                  </div>
                  <div>
                    <dt>海报</dt>
                    <dd>{direction.posterLayout}</dd>
                  </div>
                  <div>
                    <dt>语气</dt>
                    <dd>{direction.copyTone}</dd>
                  </div>
                </dl>

                <div className="swatch-row" aria-label="配色">
                  <Palette size={14} />
                  {Object.values(direction.palette).map((color, colorIndex) => (
                    <i key={`${color}-${colorIndex}`} style={{ background: color }} title={color} />
                  ))}
                </div>

                <div className="flow-row" aria-label="章节顺序">
                  {direction.sectionFlow.slice(0, 6).map((section, flowIndex) => (
                    <span key={section}>
                      {String(flowIndex + 1).padStart(2, '0')} {sectionNames[section] ?? section}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  className={selected ? 'button dark full' : 'button ghost full'}
                  onClick={() => selectStyle(projectId, styleId)}
                  disabled={selected}
                >
                  {selected ? '正在使用此方向' : '使用此方向'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="creative-footer">
        <div>
          <strong>已选择：{design.name}</strong>
          <span>确认后网站、海报与文案都使用同一设计基线；后续仍可只改其中一件作品。</span>
          {siteOnlyChange && <span className="creative-note">注意：当前网站已有一次只作用于网站的修改（{siteOnlyChange.instruction}），海报保持原版本。</span>}
        </div>
        <div className="creative-footer-actions">
          {!bundle.state.designApproved ? (
            <button type="button" className="button primary" onClick={() => approveDesign(projectId)}>
              <Sparkles size={16} /> 确认创意方向
            </button>
          ) : (
            <Link className="button primary" to={`/projects/${projectId}/site`}>
              查看网站预览 <ArrowRight size={16} />
            </Link>
          )}
          <Link className="button ghost" to={`/projects/${projectId}/posters`}>
            查看海报
          </Link>
        </div>
      </div>
    </div>
  );
}

function StyleMini({ design, seed, product }: { design: DesignSystem; seed: ProjectSeed; product: Product }) {
  const asset = seed.assets.find((item) => product.assetRefs.includes(item.id));
  const vars = {
    '--m-bg': design.palette.background,
    '--m-surface': design.palette.surface,
    '--m-text': design.palette.text,
    '--m-muted': design.palette.muted,
    '--m-accent': design.palette.accent,
    '--m-accent-text': design.palette.accentText,
    '--m-border': design.palette.border,
    '--m-display': design.typography.display,
    '--m-body': design.typography.body,
    '--m-mono': design.typography.mono,
    '--m-radius': `${design.radiusScale}px`,
  } as React.CSSProperties;

  return (
    <div className={`style-mini mini-${design.styleId}`} style={vars} aria-label={`${design.name} 方向预览`}>
      <div className="mini-top">
        <span>{seed.brand}</span>
        <span>OBJECT 01</span>
      </div>
      <div className="mini-hero">
        <div className="mini-copy">
          <small>
            {seed.category} / {seed.scenario}
          </small>
          <strong>{product.name}</strong>
          <em>{product.price}</em>
        </div>
        <div className="mini-art">
          <ProductArt asset={asset} palette={design.palette} styleId={design.styleId} />
        </div>
      </div>
      <div className="mini-meta">
        <span>已确认信息</span>
        <span>{product.unknown.length > 0 ? `${product.unknown.length} 项待确认` : '资料完整'}</span>
      </div>
      <div className="mini-blocks" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}


