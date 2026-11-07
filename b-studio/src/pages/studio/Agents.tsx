import { useParams } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Clock3, Cpu, TriangleAlert } from 'lucide-react';
import { Badge, Notice, SectionHeading } from '../../components/ui';
import { useProjectBundle } from '../../lib/store';

type RunStatus = 'done' | 'running' | 'waiting' | 'failed';

const roles: { role: string; task: string; status: RunStatus; duration: string; output: string }[] = [
  { role: '项目经理', task: '校验订单权益与资料完整性', status: 'done', duration: '0.8s', output: '任务计划 · 6 个步骤' },
  { role: '产品分析师', task: '提取已确认事实与待确认项', status: 'done', duration: '1.4s', output: '事实 4 条 · 待确认 3 条' },
  { role: '创意总监', task: '生成三套差异化设计方向', status: 'done', duration: '2.1s', output: 'DesignSystem × 3' },
  { role: '网站设计师', task: '编排 SiteSpec 与章节顺序', status: 'done', duration: '1.7s', output: 'SiteSpec V1 · 6 个组件' },
  { role: '海报设计师', task: '规划版式、二维码安全区与价格层级', status: 'done', duration: '1.9s', output: 'PosterSpec × 2' },
  { role: '小红书文案师', task: '生成与海报同源的标题、正文、标签', status: 'done', duration: '1.1s', output: 'CopyBundle × 2' },
  { role: '质量审核员', task: '检查事实一致性、二维码与文件尺寸', status: 'running', duration: '进行中', output: '等待 PNG 核验' },
  { role: '交付协调员', task: '等待客户批准并生成交付包', status: 'waiting', duration: '等待审批', output: '—' },
];

const statusMeta: Record<RunStatus, { label: string; tone: 'good' | 'accent' | 'neutral' | 'warn'; icon: typeof CheckCircle2 }> = {
  done: { label: '完成', tone: 'good', icon: CheckCircle2 },
  running: { label: '进行中', tone: 'accent', icon: Clock3 },
  waiting: { label: '等待审批', tone: 'neutral', icon: CircleDashed },
  failed: { label: '失败', tone: 'warn', icon: TriangleAlert },
};

export function Agents() {
  const { projectId = '' } = useParams();
  const bundle = useProjectBundle(projectId);
  const done = roles.filter((role) => role.status === 'done').length;

  return (
    <div className="studio-page agents-page">
      <SectionHeading
        eyebrow="AGENT RUNS"
        title="运行记录"
        description="按角色展示任务状态与产物引用。本页是 B 组的界面与信息结构演示，使用预置事件；真实 run/task 事件由 A 组 MiMo 网关写入。"
        actions={<Badge tone="warn">演示记录 · 非真实模型调用</Badge>}
      />

      <Notice tone="warn" title="诚信说明">
        这里不会伪造“AI 已完成”的模型响应。当前展示的是预设的任务编排示例；正式环境应读取 A 组
        <code>/api/core/runs/:runId</code> 的真实状态、耗时、Token 与产物引用，并在失败时显示具体错误。
      </Notice>

      <div className="agents-layout">
        <section className="run-timeline">
          <header className="run-head">
            <div>
              <span className="card-kicker">RUN · DEMO-{bundle.seed.id.toUpperCase()}</span>
              <h2>{bundle.seed.name}</h2>
            </div>
            <div className="run-progress">
              <strong>
                {done} / {roles.length}
              </strong>
              <span>角色完成</span>
            </div>
          </header>
          <ol>
            {roles.map((role, index) => {
              const meta = statusMeta[role.status];
              const Icon = meta.icon;
              return (
                <li key={role.role} className={`run-item ${role.status}`}>
                  <div className="run-index">{String(index + 1).padStart(2, '0')}</div>
                  <div className="run-body">
                    <div className="run-title">
                      <strong>{role.role}</strong>
                      <Badge tone={meta.tone}>
                        <Icon size={12} /> {meta.label}
                      </Badge>
                    </div>
                    <p>{role.task}</p>
                    <div className="run-meta">
                      <span>
                        <Clock3 size={13} /> {role.duration}
                      </span>
                      <span>
                        <Cpu size={13} /> 产物：{role.output}
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="run-side">
          <section className="panel">
            <span className="card-kicker">INPUTS</span>
            <h2>本次输入</h2>
            <dl className="kv-list">
              <div>
                <dt>事实版本</dt>
                <dd>V{bundle.factVersion}</dd>
              </div>
              <div>
                <dt>设计方向</dt>
                <dd>{bundle.designBase.name}</dd>
              </div>
              <div>
                <dt>网站版本</dt>
                <dd>V{bundle.state.siteRevision}</dd>
              </div>
              <div>
                <dt>海报版本</dt>
                <dd>V{bundle.state.posterRevision}</dd>
              </div>
            </dl>
          </section>

          <section className="panel panel-muted">
            <span className="card-kicker">BOUNDARY</span>
            <h2>角色边界</h2>
            <ul className="plain-list">
              <li>模型只能使用白名单工具，不能直接改价、发布或调用支付。</li>
              <li>输出必须通过 JSON 解析、Zod 校验与业务事实检查。</li>
              <li>失败时明确显示等待资料、生成失败或需人工审核。</li>
              <li>简单修改可以缩短流程，不强制每次都跑满 8 个角色。</li>
            </ul>
          </section>

          <section className="panel">
            <span className="card-kicker">RETRY</span>
            <h2>失败处理</h2>
            <p>坏 JSON 与超时会有限重试；渲染失败会退回受控模板；发布失败保留旧版本，不会把失败显示成完成。</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
