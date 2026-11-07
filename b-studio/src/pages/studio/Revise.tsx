import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, GitBranch, History, Rocket, ShieldAlert, Sparkles, X } from 'lucide-react';
import { Badge, Notice, SectionHeading, formatDateTime } from '../../components/ui';
import { useProjectBundle, useStudio } from '../../lib/store';
import type { ChangeRequest } from '../../types/contracts';

const stateLabels: Record<ChangeRequest['approvalState'], string> = {
  draft: '待生成预览',
  'pending-fact-approval': '等待事实审核',
  preview: '预览待批准',
  approved: '已批准',
  rejected: '已驳回',
};

const stateTone: Record<ChangeRequest['approvalState'], 'neutral' | 'warn' | 'good' | 'accent'> = {
  draft: 'warn',
  'pending-fact-approval': 'warn',
  preview: 'accent',
  approved: 'good',
  rejected: 'neutral',
};

const examples = ['网站改黑金，海报不要动', '只把海报二维码换到左下角', '价格从129改139', '标题更高级些', '换一张主图'];

export function Revise() {
  const { projectId = '' } = useParams();
  const bundle = useProjectBundle(projectId);
  const { submitChange, applyChange, approveChange, rejectChange, approveFactChange, publish } = useStudio();
  const [instruction, setInstruction] = useState('网站改黑金，海报不要动');
  const [selectedId, setSelectedId] = useState<string | null>(bundle.state.changeRequests[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requests = bundle.state.changeRequests;
  const selected = requests.find((request) => request.id === selectedId) ?? requests[0] ?? null;

  const run = async (action: () => void | Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!instruction.trim()) return;
    const request = submitChange(projectId, instruction.trim());
    setSelectedId(request.id);
    setNotice(null);
  };

  return (
    <div className="studio-page revise-page">
      <SectionHeading
        eyebrow="CHANGE REQUEST"
        title="只改需要改的作品"
        description="先解析客户原话，再决定影响范围。价格等商品事实不能在这里直接改，必须交给 A 组事实库审核；预览版本不会覆盖已批准版本。"
      />

      <div className="revise-layout">
        <section className="revise-main">
          <div className="panel">
            <span className="card-kicker">NATURAL LANGUAGE</span>
            <h2>客户修改指令</h2>
            <label className="field">
              <span className="field-label">用一句话描述修改</span>
              <textarea
                value={instruction}
                rows={3}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="例如：网站改黑金，海报不要动"
              />
            </label>
            <div className="example-row">
              {examples.map((example) => (
                <button key={example} type="button" className="chip" onClick={() => setInstruction(example)}>
                  {example}
                </button>
              ))}
            </div>
            <div className="revise-actions">
              <button type="button" className="button primary" onClick={submit} disabled={!instruction.trim()}>
                <Sparkles size={16} /> 解析修改意图
              </button>
              <span className="muted">解析规则在浏览器内执行；正式环境由 A 组 MiMo 返回同结构 JSON 并做 Zod 校验。</span>
            </div>
            {notice && <Notice tone="good">{notice}</Notice>}
            {error && (
              <Notice tone="error" title="操作失败">
                {error}
              </Notice>
            )}
          </div>

          {selected && (
            <div className="panel request-panel">
              <div className="request-head">
                <div>
                  <span className="card-kicker">PARSED REQUEST · {selected.id}</span>
                  <h2>{selected.instruction}</h2>
                </div>
                <Badge tone={stateTone[selected.approvalState]}>{stateLabels[selected.approvalState]}</Badge>
              </div>

              <dl className="request-meta">
                <div>
                  <dt>影响作品</dt>
                  <dd>{selected.targetArtifacts.map((target) => ({ site: '网站', poster: '海报', copy: '文案' })[target]).join(' + ')}</dd>
                </div>
                <div>
                  <dt>版本</dt>
                  <dd>
                    V{selected.baseRevision} → 预览 V{selected.previewRevision}
                  </dd>
                </div>
                <div>
                  <dt>事实修改</dt>
                  <dd>{selected.isFactChange ? '是 · 需 A 组审核' : '否'}</dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>{formatDateTime(selected.createdAt)}</dd>
                </div>
              </dl>

              <div className="diff-list">
                {selected.parsedOperations.map((op, index) => (
                  <div className="diff-row" key={`${op.kind}-${index}`}>
                    <span className="diff-kind">{op.kind}</span>
                    <code>{op.path}</code>
                    {op.from !== op.to ? (
                      <div className="diff-values">
                        <del>{op.from}</del>
                        <span aria-hidden>→</span>
                        <ins>{op.to}</ins>
                      </div>
                    ) : null}
                    <p>{op.description}</p>
                  </div>
                ))}
              </div>

              {selected.potentialRisks.length > 0 && (
                <Notice tone="warn" title="风险与约束">
                  <ul className="plain-list">
                    {selected.potentialRisks.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                </Notice>
              )}

              {selected.approvalState === 'pending-fact-approval' && (
                <Notice tone="warn" title="等待 A 组事实审核">
                  价格属于商品事实，B 组不能直接写入。下面按钮只是演示 A 组事实库审核通过的联动效果：
                  网站、海报与文案会一起升级事实版本与版本号，旧版本保留在修改记录中。
                </Notice>
              )}

              <div className="request-actions">
                {selected.approvalState === 'draft' && (
                  <>
                    <button type="button" className="button dark" disabled={busy} onClick={() => run(() => applyChange(projectId, selected.id))}>
                      <GitBranch size={16} /> 生成预览版本
                    </button>
                    <button type="button" className="button ghost" disabled={busy} onClick={() => run(() => rejectChange(projectId, selected.id))}>
                      <X size={16} /> 丢弃
                    </button>
                  </>
                )}

                {selected.approvalState === 'pending-fact-approval' && (
                  <>
                    <button
                      type="button"
                      className="button dark"
                      disabled={busy}
                      onClick={() =>
                        run(() => {
                          approveFactChange(projectId, selected.id);
                          setNotice('已模拟 A 组事实审核通过：价格、网站、海报与文案已按新事实版本重新生成。');
                        })
                      }
                    >
                      <ShieldAlert size={16} /> 模拟事实审核通过
                    </button>
                    <button type="button" className="button ghost" disabled={busy} onClick={() => run(() => rejectChange(projectId, selected.id))}>
                      <X size={16} /> 驳回
                    </button>
                  </>
                )}

                {selected.approvalState === 'preview' && (
                  <>
                    <button
                      type="button"
                      className="button dark"
                      disabled={busy}
                      onClick={() =>
                        run(() => {
                          approveChange(projectId, selected.id);
                          setNotice('预览已批准；如需对外可见，请发布演示站点。');
                        })
                      }
                    >
                      <Check size={16} /> 批准此预览
                    </button>
                    {selected.targetArtifacts.includes('site') && (
                      <button
                        type="button"
                        className="button ghost"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await publish(projectId);
                            setNotice('网站已按当前预览发布为演示站点，海报二维码同步切换。');
                          })
                        }
                      >
                        <Rocket size={16} /> 发布网站
                      </button>
                    )}
                    <button type="button" className="button ghost" disabled={busy} onClick={() => run(() => rejectChange(projectId, selected.id))}>
                      <X size={16} /> 驳回
                    </button>
                  </>
                )}

                {selected.approvalState === 'approved' && (
                  <Link className="button dark" to={`/projects/${projectId}/delivery`}>
                    <Check size={16} /> 已批准 · 前往交付中心
                  </Link>
                )}
                {selected.approvalState === 'rejected' && <span className="muted">已驳回，当前作品保持原版本。</span>}
              </div>
            </div>
          )}
        </section>

        <aside className="revise-side">
          <section className="panel">
            <span className="card-kicker">VERSION SCOPE</span>
            <h2>当前版本</h2>
            <dl className="kv-list">
              <div>
                <dt>网站</dt>
                <dd>V{bundle.state.siteRevision}</dd>
              </div>
              <div>
                <dt>海报</dt>
                <dd>V{bundle.state.posterRevision}</dd>
              </div>
              <div>
                <dt>文案</dt>
                <dd>V{bundle.state.copyRevision}</dd>
              </div>
              <div>
                <dt>事实</dt>
                <dd>V{bundle.factVersion}</dd>
              </div>
              <div>
                <dt>已发布</dt>
                <dd>{bundle.state.published ? `网站 V${bundle.state.published.siteRevision}` : '未发布'}</dd>
              </div>
            </dl>
            <p className="muted">
              只改网站的指令只会增加网站版本号；海报版本号保持不变，这就是“局部修改”的可验证证据。
            </p>
            {selected?.targetArtifacts.includes('site') && !selected.targetArtifacts.includes('poster') && (
              <div className="scope-proof">
                <strong>本次不影响海报</strong>
                <span>海报保持 V{bundle.state.posterRevision}，二维码、价格与文案文件不重新生成。</span>
              </div>
            )}
          </section>

          <section className="panel">
            <span className="card-kicker">
              <History size={14} /> HISTORY
            </span>
            <h2>修改记录</h2>
            {requests.length === 0 && <p className="muted">还没有修改记录。</p>}
            <ul className="history-list">
              {requests.map((request) => (
                <li key={request.id}>
                  <button type="button" className={selected?.id === request.id ? 'active' : ''} onClick={() => setSelectedId(request.id)}>
                    <span>
                      <strong>{request.instruction}</strong>
                      <small>
                        {request.targetArtifacts.join(' + ')} · V{request.baseRevision} → V{request.previewRevision} ·{' '}
                        {formatDateTime(request.createdAt)}
                      </small>
                    </span>
                    <Badge tone={stateTone[request.approvalState]}>{stateLabels[request.approvalState]}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel panel-muted">
            <span className="card-kicker">HOW IT WORKS</span>
            <h2>修改链路</h2>
            <ol className="steps-list">
              <li>解析客户原话，判断目标作品与是否事实修改。</li>
              <li>基于当前批准版本生成 previewRevision，不覆盖旧版。</li>
              <li>客户批准后发布；失败时保留旧版本。</li>
              <li>A 组保存 ChangeRequest 与版本记录，B 只负责解析与预览。</li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

