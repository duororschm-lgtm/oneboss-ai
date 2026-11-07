import type { AgentRunStatus, PayState, ProjectStatus, RefundStatus } from './types';

/** 金额统一按整数分传入、按人民币格式化；不在前端做跨行汇总。 */
export const money = (minor: number | null | undefined) =>
  typeof minor === 'number' && Number.isFinite(minor)
    ? new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(minor / 100)
    : '—';

export const dateTime = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Shanghai',
      }).format(new Date(value))
    : '—';

export const dateOnly = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Shanghai',
      }).format(new Date(value))
    : '—';

export const dayKey = (value: string) =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value));

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const PAY_STATE: Record<PayState, { label: string; tone: Tone }> = {
  UNPAID: { label: '待付款', tone: 'neutral' },
  PENDING_CONFIRMATION: { label: '待确认付款', tone: 'warning' },
  PAID: { label: '已确认付款', tone: 'success' },
  CLOSED: { label: '已关闭', tone: 'neutral' },
  REFUND_PENDING: { label: '退款审核中', tone: 'warning' },
  PARTIALLY_REFUNDED: { label: '部分退款', tone: 'info' },
  REFUNDED: { label: '已退款', tone: 'danger' },
};

const REFUND_STATUS: Record<RefundStatus, { label: string; tone: Tone }> = {
  REQUESTED: { label: '待审核', tone: 'warning' },
  CONFIRMED: { label: '已退款', tone: 'success' },
  REJECTED: { label: '已驳回', tone: 'neutral' },
};

const PROJECT_STATUS: Record<string, { label: string; tone: Tone }> = {
  WAITING_INPUT: { label: '待提交资料', tone: 'neutral' },
  BRIEF_APPROVAL: { label: '待确认资料', tone: 'warning' },
  DESIGN_APPROVAL: { label: '待选择设计', tone: 'warning' },
  READY_TO_GENERATE: { label: '待制作', tone: 'info' },
  QA_REVIEW: { label: '待审核', tone: 'warning' },
  GENERATION_FAILED: { label: '制作失败', tone: 'danger' },
  PUBLISHED: { label: '已发布', tone: 'success' },
  DELIVERED: { label: '已交付', tone: 'info' },
  ACCEPTED: { label: '已验收', tone: 'success' },
};

const AGENT_STATUS: Record<AgentRunStatus, { label: string; tone: Tone }> = {
  QUEUED: { label: '排队中', tone: 'neutral' },
  RUNNING: { label: '执行中', tone: 'info' },
  SUCCEEDED: { label: '已完成', tone: 'success' },
  FAILED: { label: '失败', tone: 'danger' },
  CANCELLED: { label: '已取消', tone: 'neutral' },
  NEEDS_REVIEW: { label: '待人工', tone: 'warning' },
};

export const payState = (value: string) =>
  PAY_STATE[value as PayState] ?? { label: value, tone: 'neutral' as Tone };

export const refundStatus = (value: string) =>
  REFUND_STATUS[value as RefundStatus] ?? { label: value, tone: 'neutral' as Tone };

export const projectStatus = (value: string) =>
  PROJECT_STATUS[value] ?? { label: value, tone: 'neutral' as Tone };

export const agentStatus = (value: string) =>
  AGENT_STATUS[value as AgentRunStatus] ?? { label: value, tone: 'neutral' as Tone };

/** 客户标识脱敏：保留首尾各 2 字符，中间用 * 填充。 */
export const maskName = (value: string | null | undefined) => {
  if (!value) return '—';
  const text = value.trim();
  if (text.length <= 4) return text.slice(0, 1) + '***';
  return `${text.slice(0, 2)}***${text.slice(-2)}`;
};

export const AGENT_ROLES = [
  { key: 'intake', name: '产品分析师' },
  { key: 'design', name: 'AI 创意总监' },
  { key: 'generate', name: '网站设计师' },
  { key: 'change', name: '项目经理' },
  { key: 'publish', name: '发布交付专员' },
  { key: 'delivery', name: '交付专员' },
] as const;

/** Map backend agent_run.role to display role for card matching. */
export function matchesAgentRole(runRole: string, roleKey: string): boolean {
  if (runRole === roleKey) return true;
  // Generate covers site + poster + copy (composite task)
  if (roleKey === 'generate' && runRole === 'generate') return true;
  return false;
}

export const agentRoleName = (role: string) =>
  AGENT_ROLES.find((item) => item.key === role || item.name === role)?.name ?? role;
