/**
 * 管理员平台唯一的请求出口。
 *
 * 规则（任务书 §3、§5.2、§10）：
 * - 页面组件不写死 URL，一律走这里；
 * - 写操作以服务端返回为准，前端不把订单改成 paid/approved/released；
 * - 后端没有的接口返回 `unsupported`，页面显示缺口编号，不伪造数据；
 * - mock 只在 NEXT_PUBLIC_ADMIN_MODE === 'mock' 时启用，并在界面常驻横幅。
 */
import { browserAuth } from '../../components/customer/session';
import { requestCustomerJSON } from '../customer/request';
import type {
  AdminOrder,
  AdminRefund,
  AdminWorkspacePayload,
  AgentRun,
  ApiFailureBody,
  ApprovalItem,
  AuditEntry,
  CustomerRow,
  DashboardMetrics,
  ManualAttempt,
  PlanRow,
  RevenuePoint,
  WorkReview,
} from './types';
import { MOCK } from './mock';

export const MOCK_MODE = process.env.NEXT_PUBLIC_ADMIN_MODE === 'mock';

export interface EndpointSpec {
  id: string;
  method: 'GET' | 'POST';
  path: string;
  gap?: string;
  note: string;
}

/** 端点登记表：页面和缺口页共用，避免文档与实现漂移。 */
export const ENDPOINTS = {
  workspace: {
    id: 'workspace',
    method: 'GET',
    path: '/api/core/admin',
    note: '现有接口：订单 / 退款 / 待人工核验收款',
  },
  dashboard: {
    id: 'dashboard',
    method: 'GET',
    path: '/api/admin/dashboard',
    gap: 'A-01',
    note: '经营总览聚合指标',
  },
  revenue: {
    id: 'revenue',
    method: 'GET',
    path: '/api/admin/revenue',
    gap: 'A-02',
    note: '按日聚合收入',
  },
  orders: {
    id: 'orders',
    method: 'GET',
    path: '/api/admin/orders',
    gap: 'A-03',
    note: '订单分页与筛选',
  },
  approvals: {
    id: 'approvals',
    method: 'GET',
    path: '/api/admin/approvals',
    gap: 'A-05',
    note: '审批队列',
  },
  agentRuns: {
    id: 'agentRuns',
    method: 'GET',
    path: '/api/admin/agents/runs',
    gap: 'A-06',
    note: 'AI 员工运行记录',
  },
  workReviews: {
    id: 'workReviews',
    method: 'GET',
    path: '/api/admin/works/reviews',
    gap: 'A-08',
    note: '作品审核队列',
  },
  customers: {
    id: 'customers',
    method: 'GET',
    path: '/api/admin/customers',
    gap: 'A-09',
    note: '客户列表',
  },
  auditLogs: {
    id: 'auditLogs',
    method: 'GET',
    path: '/api/admin/audit-logs',
    gap: 'A-11',
    note: '审计日志',
  },
  plans: {
    id: 'plans',
    method: 'GET',
    path: '/api/core/plans',
    note: '现有公开接口：套餐与增值服务只读',
  },
} satisfies Record<string, EndpointSpec>;

export type AdminFailure =
  | { ok: false; kind: 'unsupported'; spec: EndpointSpec }
  | { ok: false; kind: 'unauthorized'; message: string }
  | { ok: false; kind: 'forbidden'; message: string }
  | { ok: false; kind: 'error'; message: string; code: string; requestId?: string };

export type AdminResult<T> = { ok: true; data: T; mock: boolean } | AdminFailure;

const MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: '登录已过期，请重新登录。',
  FORBIDDEN: '你的账号没有访问管理员平台的权限。',
  PLATFORM_ADMIN_REQUIRED: '此页面仅供已授权的平台管理员使用。',
  NOT_FOUND: '该记录不存在或已被处理。',
  CONFLICT: '操作冲突，请刷新后重试。',
  RATE_LIMITED: '操作较频繁，请稍后再试。',
  SERVICE_TEMPORARILY_UNAVAILABLE: '服务暂时不可用，请稍后重试。',
};

export class AdminRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    public requestId?: string,
  ) {
    super(MESSAGES[code] ?? `操作未完成（${code}），请刷新或稍后重试。`);
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await browserAuth().auth.getSession();
  const headers = new Headers();
  if (data.session) headers.set('Authorization', `Bearer ${data.session.access_token}`);
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    headers.set('Idempotency-Key', crypto.randomUUID());
  }
  const { response, value } = await requestCustomerJSON(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const failure = value as ApiFailureBody;
    throw new AdminRequestError(
      response.status,
      failure.error?.code ?? 'REQUEST_FAILED',
      failure.error?.requestId,
    );
  }
  return value as T;
}

function normalize(error: unknown, spec: EndpointSpec): AdminFailure {
  if (error instanceof AdminRequestError) {
    if (error.status === 401) return { ok: false, kind: 'unauthorized', message: error.message };
    if (error.status === 403) return { ok: false, kind: 'forbidden', message: error.message };
    // 404 说明该管理端点尚未由 A 组提供 —— 显式标注，不吞掉。
    if (error.status === 404) return { ok: false, kind: 'unsupported', spec };
    return {
      ok: false,
      kind: 'error',
      message: error.message,
      code: error.code,
      requestId: error.requestId,
    };
  }
  return {
    ok: false,
    kind: 'error',
    message: error instanceof Error ? error.message : '请求失败，请稍后重试。',
    code: 'TRANSPORT_FAILED',
  };
}

/* ------------------------------- 读取 ------------------------------- */

/** 分页响应统一解包：后端返回 { items, total, ... }，页面多数只要列表。 */
interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
}

const unwrap = <T,>(payload: Paged<T> | T[]): T[] =>
  Array.isArray(payload) ? payload : (payload.items ?? []);

export interface OrderRow {
  id: string;
  order_no: string;
  org_id: string;
  pay_state: string;
  amount_minor: number;
  is_demo: boolean;
  created_at: string;
  plan_name: string | null;
  organization: string | null;
  work_state: string | null;
  publish_slug: string | null;
}

export interface OrderQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  payState?: string;
  from?: string;
  to?: string;
}

const queryString = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
};

/** 订单服务端分页与筛选（A-03 已实现）。 */
export async function fetchOrders(
  params: OrderQueryParams,
): Promise<AdminResult<Paged<OrderRow>>> {
  if (MOCK_MODE) return { ok: true, data: { items: [], page: 1, pageSize: 20, total: 0, hasNextPage: false }, mock: true };
  try {
    return {
      ok: true,
      mock: false,
      data: await request<Paged<OrderRow>>(`${ENDPOINTS.orders.path}${queryString({ ...params })}`),
    };
  } catch (error) {
    return normalize(error, ENDPOINTS.orders);
  }
}

export interface OrderDetail {
  order: Record<string, any>;
  entitlement: Record<string, any> | null;
  payments: { kind: string; provider: string; status: string; amount_minor: number | null; external_ref: string | null; created_at: string }[];
  project: Record<string, any> | null;
  versions: { revision: number; status: string; fact_version: number; created_at: string; approved_by: string | null }[];
  runs: { id: string; role: string; status: string; attempt: number; error_class: string | null; usage: any; created_at: string; completed_at: string | null }[];
  refunds: { id: string; amount_minor: number; status: string; provider_ref: string | null; created_at: string }[];
  changes: { id: string; base_revision: number; target: string; status: string; instruction: string; created_at: string }[];
}

export async function fetchOrderDetail(orderId: string): Promise<AdminResult<OrderDetail>> {
  try {
    return { ok: true, mock: false, data: await request<OrderDetail>(`${ENDPOINTS.orders.path}/${orderId}`) };
  } catch (error) {
    return normalize(error, ENDPOINTS.orders);
  }
}

export async function fetchWorkspace(): Promise<AdminResult<AdminWorkspacePayload>> {
  try {
    return { ok: true, data: await request<AdminWorkspacePayload>('/api/core/admin'), mock: false };
  } catch (error) {
    return normalize(error, ENDPOINTS.workspace);
  }
}

/**
 * 总览指标：优先请求 A-01 聚合接口；接口不存在时，只能用现有
 * `/api/core/admin` 的原始列表做**计数**展示，是否展示金额由调用方决定。
 */
export async function fetchDashboard(): Promise<AdminResult<DashboardMetrics>> {
  if (MOCK_MODE) return { ok: true, data: MOCK.dashboard, mock: true };
  try {
    return { ok: true, data: await request<DashboardMetrics>(ENDPOINTS.dashboard.path), mock: false };
  } catch (error) {
    return normalize(error, ENDPOINTS.dashboard);
  }
}

export async function fetchRevenue(
  from: string,
  to: string,
  groupBy: 'day' | 'week' | 'month',
): Promise<AdminResult<RevenuePoint[]>> {
  if (MOCK_MODE) return { ok: true, data: MOCK.revenue(from, to), mock: true };
  try {
    return {
      ok: true,
      data: await request<RevenuePoint[]>(
        `${ENDPOINTS.revenue.path}?from=${from}&to=${to}&groupBy=${groupBy}`,
      ),
      mock: false,
    };
  } catch (error) {
    return normalize(error, ENDPOINTS.revenue);
  }
}

export async function fetchApprovals(): Promise<AdminResult<ApprovalItem[]>> {
  if (MOCK_MODE) return { ok: true, data: MOCK.approvals, mock: true };
  try {
    return { ok: true, data: await request<ApprovalItem[]>(ENDPOINTS.approvals.path), mock: false };
  } catch (error) {
    return normalize(error, ENDPOINTS.approvals);
  }
}

export async function fetchAgentRuns(): Promise<AdminResult<AgentRun[]>> {
  if (MOCK_MODE) return { ok: true, data: MOCK.agentRuns, mock: true };
  try {
    const payload = await request<Paged<AgentRun>>(`${ENDPOINTS.agentRuns.path}?pageSize=50`);
    return { ok: true, data: unwrap(payload), mock: false };
  } catch (error) {
    return normalize(error, ENDPOINTS.agentRuns);
  }
}

export async function fetchWorkReviews(): Promise<AdminResult<WorkReview[]>> {
  if (MOCK_MODE) return { ok: true, data: MOCK.workReviews, mock: true };
  try {
    const payload = await request<Paged<WorkReview>>(`${ENDPOINTS.workReviews.path}?pageSize=50`);
    return { ok: true, data: unwrap(payload), mock: false };
  } catch (error) {
    return normalize(error, ENDPOINTS.workReviews);
  }
}

export async function fetchCustomers(): Promise<AdminResult<CustomerRow[]>> {
  if (MOCK_MODE) return { ok: true, data: MOCK.customers, mock: true };
  try {
    const payload = await request<Paged<CustomerRow>>(`${ENDPOINTS.customers.path}?pageSize=50`);
    return { ok: true, data: unwrap(payload), mock: false };
  } catch (error) {
    return normalize(error, ENDPOINTS.customers);
  }
}

export async function fetchAuditLogs(): Promise<AdminResult<AuditEntry[]>> {
  if (MOCK_MODE) return { ok: true, data: MOCK.auditLogs, mock: true };
  try {
    const payload = await request<Paged<AuditEntry>>(`${ENDPOINTS.auditLogs.path}?pageSize=50`);
    return { ok: true, data: unwrap(payload), mock: false };
  } catch (error) {
    return normalize(error, ENDPOINTS.auditLogs);
  }
}

interface PlansPayload {
  plans: {
    code: string;
    name: string;
    price_minor: number;
    currency: string;
    product_limit: number;
    poster_count: number;
    revision_rounds: number;
    hosting_days: number;
  }[];
  addons: { code: string; name: string; price_minor: number; entitlement: string }[];
}

/** 套餐是公开只读接口，属于真实数据。 */
export async function fetchPlans(): Promise<AdminResult<PlanRow[]>> {
  try {
    const payload = await request<PlansPayload>(ENDPOINTS.plans.path);
    return {
      ok: true,
      mock: false,
      data: payload.plans.map((plan) => ({
        code: plan.code,
        name: plan.name,
        priceMinor: plan.price_minor,
        currency: plan.currency,
        productLimit: plan.product_limit,
        posterCount: plan.poster_count,
        revisionRounds: plan.revision_rounds,
        hostingDays: plan.hosting_days,
        isActive: true,
      })),
    };
  } catch (error) {
    return normalize(error, ENDPOINTS.plans);
  }
}

/* ------------------------------- 写入 ------------------------------- */

export interface ConfirmManualInput {
  attemptId: string;
  amountMinor: number;
  reference: string;
}

/** 人工核验收款：只在管理员已核对真实入账后调用（任务书 §4 支付核验原则）。 */
export async function confirmManualPayment(orderId: string, input: ConfirmManualInput) {
  return request(`/api/commerce/orders/${orderId}/confirm-manual`, {
    attemptId: input.attemptId,
    amountMinor: input.amountMinor,
    currency: 'CNY',
    eventId: crypto.randomUUID(),
    evidenceRef: input.reference,
  });
}

export interface FinalizeRefundInput {
  refundId: string;
  reference: string;
  confirmed: boolean;
}

/** 退款核验：confirmed=false 等于驳回申请，不产生退款。 */
export async function finalizeRefund(orderId: string, input: FinalizeRefundInput) {
  return request(`/api/commerce/orders/${orderId}/finalize-refund`, {
    refundId: input.refundId,
    reference: input.reference,
    confirmed: input.confirmed,
  });
}

/** 尚未由 A 组实现的动作，调用即抛错，避免前端悄悄"假装成功"。 */
export async function unsupportedAction(spec: EndpointSpec): Promise<never> {
  throw new Error(`后端接口未提供：${spec.method} ${spec.path}（缺口 ${spec.gap ?? '—'}）`);
}

export const sampleOrders = (rows: AdminOrder[]) => rows.slice(0, 10);
export const sampleRefunds = (rows: AdminRefund[]) => rows.filter((r) => r.status === 'REQUESTED');
export const sampleManual = (rows: ManualAttempt[]) => rows;

export interface WorkerHealth {id:string;version:string;last_seen_at:string;status:'online'|'offline'|'stopped';current_run_id:string|null;}
export async function fetchWorkerHealth():Promise<AdminResult<WorkerHealth[]>>{
 try{return {ok:true,mock:false,data:await request<WorkerHealth[]>('/api/admin/agents/workers')};}
 catch(error){return normalize(error,ENDPOINTS.agentRuns);}
}
