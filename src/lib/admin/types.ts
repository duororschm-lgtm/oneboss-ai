/**
 * 管理员平台领域类型。
 *
 * 状态枚举全部来自现有数据库 check 约束与 statusLabel()，不新造枚举：
 * - service_orders.pay_state  见 supabase/migrations/202611060001_core.sql
 * - refunds.status            同上
 * - projects.status           同上
 * - agent_runs.status         数据库为自由文本，此处按任务书建议值收窄
 */

export type PayState =
  | 'UNPAID'
  | 'PENDING_CONFIRMATION'
  | 'PAID'
  | 'CLOSED'
  | 'REFUND_PENDING'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export type RefundStatus = 'REQUESTED' | 'CONFIRMED' | 'REJECTED';

export type ProjectStatus =
  | 'WAITING_INPUT'
  | 'BRIEF_APPROVAL'
  | 'DESIGN_APPROVAL'
  | 'READY_TO_GENERATE'
  | 'QA_REVIEW'
  | 'GENERATION_FAILED'
  | 'PUBLISHED'
  | 'DELIVERED'
  | 'ACCEPTED';

export type AgentRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'NEEDS_REVIEW';

export type ApprovalKind =
  | 'payment_review'
  | 'production_release'
  | 'order_exception'
  | 'work_review'
  | 'publish_review'
  | 'refund_review'
  | 'agent_failure';

/** GET /api/core/admin —— 目前唯一真实可用的管理员数据源。 */
export interface AdminOrder {
  id: string;
  order_no: string;
  org_id: string;
  pay_state: PayState;
  amount_minor: number;
  is_demo: boolean;
  created_at: string;
  plan_name: string | null;
  organization: string | null;
}

export interface AdminRefund {
  id: string;
  order_id: string;
  amount_minor: number;
  status: RefundStatus;
  created_at: string;
  provider_ref: string | null;
  order_no: string;
  plan_name: string | null;
}

export interface ManualAttempt {
  payment_channel: 'wechat' | 'alipay' | null;
  id: string;
  order_id: string;
  amount_minor: number;
  created_at: string;
  order_no: string;
  plan_name: string | null;
  payment_memo: string | null;
  customer_report: string | null;
  reported_at: string | null;
}

export interface AdminWorkspacePayload {
  role?: import('./permissions').AdminRole;
  orders: AdminOrder[];
  refunds: AdminRefund[];
  manualAttempts: ManualAttempt[];
}

/* ------------------------- 以下为 A 组待补接口的契约 ------------------------- */

export interface DashboardMetrics {
  undatedRefundCount?: number;
  todayConfirmedMinor: number | null;
  monthNetMinor: number | null;
  totalOrders: number;
  pendingPaymentReviews: number;
  pendingReleases: number;
  projectsInProduction: number;
  pendingWorkReviews: number;
  pendingRefunds: number;
  recentOrders: AdminOrder[];
  pendingApprovals: ApprovalItem[];
  agentIncidents: AgentRun[];
}

export interface RevenuePoint {
  date: string;
  confirmedMinor: number;
  refundedMinor: number;
  netMinor: number;
  orderCount: number;
}

export interface ApprovalItem {
  id: string;
  kind: ApprovalKind;
  orderId: string | null;
  orderNo: string | null;
  projectId: string | null;
  organization: string | null;
  amountMinor: number | null;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'on_hold';
  reason: string | null;
  evidence: string | null;
}

export interface AgentRun {
  employeeKey?: string;
  stage?: string | null;
  id: string;
  role: string;
  status: AgentRunStatus;
  projectId: string;
  projectName: string | null;
  startedAt: string;
  completedAt: string | null;
  model: string | null;
  tokens: number | null;
  costMinor: number | null;
  errorSummary: string | null;
}

export interface WorkReview {
  id: string;
  projectId: string;
  organization: string | null;
  siteUrl: string | null;
  posterUrl: string | null;
  posterWidth: number | null;
  posterHeight: number | null;
  qrTarget: string | null;
  copyTitle: string | null;
  copyBody: string | null;
  hashtags: string[];
  productName: string | null;
  price: string | null;
  revision: number;
  qaResult: string | null;
  clientConfirmed: boolean;
}

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  orderCount: number;
  currentProject: string | null;
  createdAt: string;
}

export interface PlanRow {
  code: string;
  name: string;
  priceMinor: number;
  currency: string;
  productLimit: number;
  posterCount: number;
  revisionRounds: number;
  hostingDays: number;
  isActive: boolean;
}

export interface AuditEntry {
  id: string;
  actor: string;
  at: string;
  target: string;
  action: string;
  result: 'success' | 'failure';
  reason: string | null;
}

/** 统一失败响应，与任务书 §5.2 建议结构一致。 */
export interface ApiFailureBody {
  error?: { code?: string; message?: string; requestId?: string };
}
