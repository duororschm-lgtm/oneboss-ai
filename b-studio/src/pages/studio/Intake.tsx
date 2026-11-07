import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, CircleHelp, FileCheck2, SkipForward } from 'lucide-react';
import { Notice, SectionHeading } from '../../components/ui';
import { useProjectBundle, useStudio } from '../../lib/store';
import type { Product } from '../../types/contracts';

export function Intake() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const bundle = useProjectBundle(projectId);
  const { updateIntake, approveDesign } = useStudio();
  const intake = bundle.state.intake;
  const [activeProduct, setActiveProduct] = useState(0);
  const [note, setNote] = useState(intake.note);
  const products = bundle.products;
  const product: Product = products[Math.min(activeProduct, products.length - 1)];

  const answeredCount = products.reduce((sum, item) => sum + item.unknown.filter((key) => intake.answered.includes(`${item.id}:${key}`)).length, 0);
  const skippedCount = products.reduce((sum, item) => sum + item.unknown.filter((key) => intake.skipped.includes(`${item.id}:${key}`)).length, 0);
  const pendingCount = products.reduce((sum, item) => sum + item.unknown.length, 0) - answeredCount - skippedCount;

  const mark = (productId: string, key: string, action: 'answered' | 'skipped') => {
    const id = `${productId}:${key}`;
    updateIntake(projectId, {
      answered: action === 'answered' ? [...intake.answered.filter((item) => item !== id), id] : intake.answered.filter((item) => item !== id),
      skipped: action === 'skipped' ? [...intake.skipped.filter((item) => item !== id), id] : intake.skipped.filter((item) => item !== id),
    });
  };

  const confirm = () => {
    updateIntake(projectId, { note, briefApproved: true });
    approveDesign(projectId);
    navigate(`/projects/${projectId}/creative`);
  };

  return (
    <div className="studio-page">
      <SectionHeading
        eyebrow="INTAKE / 事实核对"
        title="先确认产品事实，再谈设计"
        description="B 组只消费 A 组确认的事实。没有提供的信息保持“待确认”，设计系统不会替客户补写材质、尺寸、续航或销量。"
      />

      <div className="intake-layout">
        <section className="intake-main">
          <div className="intake-tabs" role="tablist" aria-label="选择产品">
            {products.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={index === activeProduct}
                className={index === activeProduct ? 'active' : ''}
                onClick={() => setActiveProduct(index)}
              >
                {item.name}
              </button>
            ))}
          </div>

          <div className="fact-table" role="table" aria-label="已确认产品事实">
            <div className="fact-row head" role="row">
              <span role="columnheader">字段</span>
              <span role="columnheader">内容</span>
              <span role="columnheader">来源</span>
              <span role="columnheader">状态</span>
            </div>
            {Object.values(product.facts).map((fact) => (
              <div className="fact-row" role="row" key={fact.key}>
                <span role="cell">{fact.label}</span>
                <span role="cell">
                  <strong>{fact.value}</strong>
                </span>
                <span role="cell" className="fact-source">
                  {fact.source === 'customer' ? '客户确认' : fact.source === 'document' ? '文档' : fact.source === 'image_inferred' ? '图片推断' : '演示 fixture'}
                </span>
                <span role="cell">
                  <em className={fact.verified ? 'fact-ok' : 'fact-pending'}>
                    <Check size={13} /> {fact.verified ? '已确认' : '待确认'}
                  </em>
                </span>
              </div>
            ))}
          </div>

          <div className="unknown-block">
            <h3>
              <CircleHelp size={17} /> 需要客户补充的信息（可以先跳过）
            </h3>
            {product.unknown.map((key) => {
              const id = `${product.id}:${key}`;
              const answered = intake.answered.includes(id);
              const skipped = intake.skipped.includes(id);
              return (
                <div className="unknown-row" key={key}>
                  <span>{key}</span>
                  <div className="unknown-actions">
                    <button type="button" className={answered ? 'chip active' : 'chip'} onClick={() => mark(product.id, key, 'answered')}>
                      <FileCheck2 size={14} /> 客户会补充
                    </button>
                    <button type="button" className={skipped ? 'chip active' : 'chip'} onClick={() => mark(product.id, key, 'skipped')}>
                      <SkipForward size={14} /> 先跳过
                    </button>
                  </div>
                </div>
              );
            })}
            {product.unknown.length === 0 && <p className="muted">这款产品的资料已经确认完整。</p>}
          </div>

          <label className="field">
            <span className="field-label">补充说明（可选）</span>
            <textarea
              value={note}
              rows={4}
              placeholder="例如：客户下周会提供实拍图和尺寸表；本次先用概念图形。"
              onChange={(event) => setNote(event.target.value)}
            />
            <span className="field-hint">演示环境只记录状态，不上传文件；正式环境由 A 组 /intake 与 /assets 接口处理。</span>
          </label>

          <div className="intake-actions">
            <button type="button" className="button primary" onClick={confirm}>
              确认简报并选择创意方向 <ArrowRight size={16} />
            </button>
            <span className="muted">确认只代表已知事实可用，不会把未确认信息写入宣传。</span>
          </div>
        </section>

        <aside className="intake-aside">
          <div className="panel">
            <span className="card-kicker">FACT STATUS</span>
            <h2>事实进度</h2>
            <ul className="stat-list">
              <li>
                <strong>{Object.keys(product.facts).length}</strong>
                <span>已确认字段</span>
              </li>
              <li>
                <strong>{pendingCount}</strong>
                <span>待确认</span>
              </li>
              <li>
                <strong>{answeredCount}</strong>
                <span>客户会补充</span>
              </li>
              <li>
                <strong>{skippedCount}</strong>
                <span>本次跳过</span>
              </li>
            </ul>
            {intake.briefApproved && (
              <Notice tone="good" title="简报已确认">
                已进入创意阶段。未确认信息仍会在网站与海报中标注“待确认”。
              </Notice>
            )}
          </div>

          <div className="panel panel-muted">
            <span className="card-kicker">ABOUT THIS UI</span>
            <h2>AI 接待由谁执行？</h2>
            <p>
              这里的追问卡片、已知/未知事实与跳过按钮由 B 组设计；真正的反问与事实提取由 A 组调用 MiMo 网关执行，
              并使用同一套 Zod 合同校验。当前页面使用预置问题演示信息结构，不冒充真实模型输出。
            </p>
          </div>

          <div className="panel panel-warn">
            <span className="card-kicker">CONSTRAINTS</span>
            <h2>本项目的红线</h2>
            <ul className="plain-list">
              {bundle.seed.constraints.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

