/**
 * 开发模拟数据。
 *
 * 只有在 `NEXT_PUBLIC_ADMIN_MODE=mock` 时才会被 api.ts 引用，生产默认 live。
 * 使用期间界面顶部常驻「开发模拟数据」横幅，任何金额都不得被当成真实经营数据。
 */
import type {
  AgentRun,
  ApprovalItem,
  AuditEntry,
  CustomerRow,
  DashboardMetrics,
  RevenuePoint,
  WorkReview,
} from './types';

const day = (offset: number) => {
  const base = new Date('2026-11-07T10:00:00+08:00');
  base.setDate(base.getDate() - offset);
  return base.toISOString();
};

const metrics: DashboardMetrics = {
  todayConfirmedMinor: 79800,
  monthNetMinor: 1_046_600,
  totalOrders: 37,
  pendingPaymentReviews: 3,
  pendingReleases: 4,
  projectsInProduction: 5,
  pendingWorkReviews: 2,
  pendingRefunds: 1,
  recentOrders: [],
  pendingApprovals: [],
  agentIncidents: [],
};

const approvals: ApprovalItem[] = [
  {
    id: 'ap_1001',
    kind: 'payment_review',
    orderId: 'or_1001',
    orderNo: 'OB-DEMO-1001',
    projectId: null,
    organization: '演示客户 A',
    amountMinor: 199,
    submittedAt: day(0),
    status: 'pending',
    reason: '客户提交了转账说明，待核对真实入账',
    evidence: '付款备注 OB-1001',
  },
  {
    id: 'ap_1002',
    kind: 'production_release',
    orderId: 'or_1002',
    orderNo: 'OB-DEMO-1002',
    projectId: 'pj_1002',
    organization: '演示客户 B',
    amountMinor: 599,
    submittedAt: day(1),
    status: 'pending',
    reason: '资料完整度检查通过，等待放行制作',
    evidence: null,
  },
  {
    id: 'ap_1003',
    kind: 'work_review',
    orderId: 'or_1003',
    orderNo: 'OB-DEMO-1003',
    projectId: 'pj_1003',
    organization: '演示客户 C',
    amountMinor: 599,
    submittedAt: day(2),
    status: 'pending',
    reason: '海报与文案待人工复核',
    evidence: 'v2 版本',
  },
];

const agentRuns: AgentRun[] = [
  {
    id: 'run_2001',
    role: 'creative_director',
    status: 'SUCCEEDED',
    projectId: 'pj_1002',
    projectName: '演示项目 B',
    startedAt: day(0),
    completedAt: day(0),
    model: 'mimo-v2.6-pro',
    tokens: 3878,
    costMinor: 42,
    errorSummary: null,
  },
  {
    id: 'run_2002',
    role: 'poster_designer',
    status: 'FAILED',
    projectId: 'pj_1003',
    projectName: '演示项目 C',
    startedAt: day(1),
    completedAt: day(1),
    model: 'mimo-v2.6-pro',
    tokens: 12069,
    costMinor: 128,
    errorSummary: '网关返回非 JSON 响应，已进入重试队列',
  },
  {
    id: 'run_2003',
    role: 'qa_reviewer',
    status: 'NEEDS_REVIEW',
    projectId: 'pj_1003',
    projectName: '演示项目 C',
    startedAt: day(2),
    completedAt: null,
    model: 'mimo-v2.6-pro',
    tokens: 921,
    costMinor: 11,
    errorSummary: '二维码静区检测未通过，需人工确认',
  },
];

const workReviews: WorkReview[] = [
  {
    id: 'wk_3001',
    projectId: 'pj_1003',
    organization: '演示客户 C',
    siteUrl: 'https://example.invalid/p/demo-1003',
    posterUrl: null,
    posterWidth: 1080,
    posterHeight: 1350,
    qrTarget: 'https://example.invalid/p/demo-1003',
    copyTitle: '演示文案标题',
    copyBody: '演示正文，仅用于界面走查。',
    hashtags: ['#演示'],
    productName: '演示产品',
    price: '¥1,299',
    revision: 2,
    qaResult: '二维码静区 4 模块，边缘 8px 内检出对比度不足',
    clientConfirmed: false,
  },
];

const customers: CustomerRow[] = [
  {
    id: 'cu_1',
    name: '演示客户 A',
    email: null,
    orderCount: 3,
    currentProject: '演示项目 A',
    createdAt: day(30),
  },
  {
    id: 'cu_2',
    name: '演示客户 B',
    email: null,
    orderCount: 1,
    currentProject: null,
    createdAt: day(12),
  },
];

const auditLogs: AuditEntry[] = [
  {
    id: 'au_1',
    actor: 'demo-reviewer',
    at: day(0),
    target: 'OB-DEMO-1001',
    action: 'confirm-manual',
    result: 'success',
    reason: '已核对入账流水',
  },
  {
    id: 'au_2',
    actor: 'demo-operator',
    at: day(1),
    target: 'OB-DEMO-1002',
    action: 'production-release',
    result: 'failure',
    reason: '资料未完整',
  },
];

function buildRevenue(from: string, to: string): RevenuePoint[] {
  const start = new Date(`${from}T00:00:00+08:00`);
  const end = new Date(`${to}T00:00:00+08:00`);
  const points: RevenuePoint[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const index = Math.abs(cursor.getDate());
    const confirmed = 39900 + ((index * 7919) % 120000);
    const refunded = index % 5 === 0 ? 19900 : 0;
    points.push({
      date: new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Shanghai',
      }).format(cursor),
      confirmedMinor: confirmed,
      refundedMinor: refunded,
      netMinor: confirmed - refunded,
      orderCount: 3 + (index % 6),
    });
  }
  return points;
}

export const MOCK = {
  dashboard: metrics,
  approvals,
  agentRuns,
  workReviews,
  customers,
  auditLogs,
  revenue: buildRevenue,
};
