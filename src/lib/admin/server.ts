/**
 * 管理员平台的只读查询层。
 *
 * 注意：这里不新增第二套业务逻辑，所有 SQL 都是跨租户只读聚合；
 * 写操作仍然走既有接口（confirm-manual / finalize-refund）。
 * 每个统计口径都在函数注释里写明，前端会把口径展示给运营。
 */
import type { Actor, Tx } from '../core/db';
import { platformAdmin } from '../core/service';
import { AppError } from '../core/errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseId(value: string | undefined) {
  if (!value || !UUID.test(value)) throw new AppError('NOT_FOUND', 404);
  return value;
}

export interface Page {
  page: number;
  pageSize: number;
}

export const paging = (page?: string, pageSize?: string): Page => {
  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  return { page: p, pageSize: size };
};

const offset = (page: Page) => (page.page - 1) * page.pageSize;

/**
 * 经营总览。
 * 口径：
 * - 今日确认到账 = payment_events 中今日处理的、非演示订单的金额之和
 * - 本月净收款 = 本月到账 − 本月已确认退款（按实际确认时间归月，历史未知时间单列）
 * - 待制作放行 = 已付款但还没有创建项目的订单数
 * - 制作中 = projects 处于资料/设计/生成/审核阶段
 * - 待作品审核 = projects.status = 'QA_REVIEW'
 */
export async function overview(tx: Tx, actor: Actor) {
  const role=await platformAdmin(tx, actor, 'view.dashboard');
  const [row] = await tx`
    select
      coalesce((select sum(o.amount_minor) from (select order_id,min(processed_at) as processed_at from payment_events group by order_id) e
        join service_orders o on o.id = e.order_id
        where o.is_demo = false and e.processed_at >= (date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')), 0)::int as today_confirmed,
      coalesce((select sum(o.amount_minor) from (select order_id,min(processed_at) as processed_at from payment_events group by order_id) e
        join service_orders o on o.id = e.order_id
        where o.is_demo = false and e.processed_at >= (date_trunc('month', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')), 0)::int as month_confirmed,
      coalesce((select sum(r.amount_minor) from refunds r
        join service_orders o on o.id = r.order_id
        where o.is_demo = false and r.status = 'CONFIRMED'
          and r.confirmed_at >= (date_trunc('month', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')), 0)::int as month_refunded,
      (select count(*) from refunds r join service_orders o on o.id=r.order_id where not o.is_demo and r.status='CONFIRMED' and r.confirmed_at is null)::int as undated_refunds,
      (select count(*) from service_orders)::int as total_orders,
      (select count(*) from payment_attempts a
        join service_orders o on o.id = a.order_id
        where a.provider = 'manual_verified' and a.status = 'PENDING'
          and o.pay_state = 'PENDING_CONFIRMATION')::int as pending_payment_reviews,
      (select count(*) from service_orders o
        where o.pay_state = 'PAID'
          and not exists (select 1 from projects p where p.service_order_id = o.id))::int as pending_releases,
      (select count(*) from projects
        where status in ('BRIEF_APPROVAL','DESIGN_APPROVAL','READY_TO_GENERATE'))::int as projects_in_production,
      (select count(*) from projects where status = 'QA_REVIEW')::int as pending_work_reviews,
      (select count(*) from refunds where status = 'REQUESTED')::int as pending_refunds
  `;

  const recentOrders = await tx`
    select o.id, o.order_no, o.org_id, o.pay_state, o.amount_minor, o.is_demo, o.created_at,
           o.plan_snapshot->>'name' as plan_name, g.name as organization,
           p.status as work_state
    from service_orders o
    join organizations g on g.id = o.org_id
    left join projects p on p.service_order_id = o.id
    order by o.created_at desc limit 8
  `;

  const incidents = await tx`
    select r.id, r.role,r.employee_key,r.stage, r.status, r.project_id, r.error_class, r.created_at, r.completed_at,
           r.usage, p.publish_slug
    from agent_runs r left join projects p on p.id = r.project_id
    where r.status in ('FAILED','NEEDS_REVIEW')
    order by r.created_at desc limit 5
  `;

  return {
    todayConfirmedMinor: ['owner','finance'].includes(role) ? row.today_confirmed : null,
    undatedRefundCount: row.undated_refunds,
    monthNetMinor: ['owner','finance'].includes(role) ? row.month_confirmed - row.month_refunded : null,
    totalOrders: row.total_orders,
    pendingPaymentReviews: row.pending_payment_reviews,
    pendingReleases: row.pending_releases,
    projectsInProduction: row.projects_in_production,
    pendingWorkReviews: row.pending_work_reviews,
    pendingRefunds: row.pending_refunds,
    recentOrders,
    pendingApprovals: [],
    agentIncidents: incidents.map((run) => ({
      id: run.id,
      role: run.role,
      employeeKey: run.employee_key,
      stage: run.stage,
      status: run.status,
      projectId: run.project_id,
      projectName: run.publish_slug ?? null,
      startedAt: run.created_at,
      completedAt: run.completed_at,
      model: null,
      tokens: run.usage?.total_tokens ?? null,
      costMinor: null,
      errorSummary: run.error_class,
    })),
    definitions: {
      todayConfirmed: 'payment_events 今日处理的非演示订单金额之和',
      monthNet: '本月到账 − 本月已确认退款（按实际确认时间归月，历史未知时间单列）',
      pendingReleases: '已付款但尚未创建项目的订单',
      production: '项目状态为待确认资料 / 待选设计 / 待制作',
      workReviews: '项目状态为 QA_REVIEW',
    },
  };
}

/** 收入明细：按日/周/月聚合，只统计非演示订单。 */
export async function revenue(
  tx: Tx,
  actor: Actor,
  from: string,
  to: string,
  groupBy: 'day' | 'week' | 'month',
) {
  await platformAdmin(tx, actor, 'view.finance');
  const start = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
      !Number.isFinite(+start) || !Number.isFinite(+end) || start.toISOString().slice(0,10)!==from || end.toISOString().slice(0,10)!==to ||
      +end < +start || +end - +start > 366 * 86400000) throw new AppError('DATE_RANGE_INVALID',400);
  const unit = groupBy === 'week' ? 'week' : groupBy === 'month' ? 'month' : 'day';
  return tx`
    with buckets as (
      select generate_series(date_trunc(${unit},${from}::date::timestamp),
        date_trunc(${unit},${to}::date::timestamp),('1 '||${unit})::interval) as bucket
    ), payment_facts as (
      select order_id,min(processed_at) as processed_at from payment_events group by order_id
    ), receipts as (
      select date_trunc(${unit},e.processed_at at time zone 'Asia/Shanghai') as bucket,
        sum(o.amount_minor)::bigint as amount,count(*)::int as orders
      from payment_facts e join service_orders o on o.id=e.order_id
      where not o.is_demo and (e.processed_at at time zone 'Asia/Shanghai')::date between ${from}::date and ${to}::date
      group by 1
    ), returned as (
      select date_trunc(${unit},r.confirmed_at at time zone 'Asia/Shanghai') as bucket,sum(r.amount_minor)::bigint as amount
      from refunds r join service_orders o on o.id=r.order_id
      where not o.is_demo and r.status='CONFIRMED' and r.confirmed_at is not null
        and (r.confirmed_at at time zone 'Asia/Shanghai')::date between ${from}::date and ${to}::date group by 1
    ) select to_char(b.bucket,'YYYY-MM-DD') as date,
      coalesce(c.amount,0)::float8 as "confirmedMinor",coalesce(r.amount,0)::float8 as "refundedMinor",
      coalesce(c.orders,0)::int as "orderCount",(coalesce(c.amount,0)-coalesce(r.amount,0))::float8 as "netMinor"
      from buckets b left join receipts c using(bucket) left join returned r using(bucket) order by b.bucket
  `;
}

export interface OrderQuery extends Page {
  keyword?: string;
  payState?: string;
  from?: string;
  to?: string;
}

/** 订单列表：服务端分页与筛选，带制作状态。 */
export async function orders(tx: Tx, actor: Actor, query: OrderQuery) {
  await platformAdmin(tx, actor, 'view.orders');
  const keyword = query.keyword?.trim();
  const like = keyword ? `%${keyword}%` : null;
  const rows = await tx`
    select o.id, o.order_no, o.org_id, o.pay_state, o.amount_minor, o.is_demo, o.created_at,
           o.plan_snapshot->>'name' as plan_name, g.name as organization,
           p.status as work_state, p.publish_slug
    from service_orders o
    join organizations g on g.id = o.org_id
    left join projects p on p.service_order_id = o.id
    where true
      ${like ? tx`and (o.order_no ilike ${like} or g.name ilike ${like} or o.plan_snapshot->>'name' ilike ${like})` : tx``}
      ${query.payState ? tx`and o.pay_state = ${query.payState}` : tx``}
      ${query.from ? tx`and (o.created_at at time zone 'Asia/Shanghai')::date >= ${query.from}::date` : tx``}
      ${query.to ? tx`and (o.created_at at time zone 'Asia/Shanghai')::date <= ${query.to}::date` : tx``}
    order by o.created_at desc
    limit ${query.pageSize} offset ${offset(query)}
  `;
  const [count] = await tx`
    select count(*)::int as total
    from service_orders o
    join organizations g on g.id = o.org_id
    where true
      ${like ? tx`and (o.order_no ilike ${like} or g.name ilike ${like} or o.plan_snapshot->>'name' ilike ${like})` : tx``}
      ${query.payState ? tx`and o.pay_state = ${query.payState}` : tx``}
      ${query.from ? tx`and (o.created_at at time zone 'Asia/Shanghai')::date >= ${query.from}::date` : tx``}
      ${query.to ? tx`and (o.created_at at time zone 'Asia/Shanghai')::date <= ${query.to}::date` : tx``}
  `;
  return {
    items: rows,
    page: query.page,
    pageSize: query.pageSize,
    total: count.total,
    hasNextPage: offset(query) + rows.length < count.total,
  };
}

/** 订单详情：订单 + 权益 + 支付记录 + 项目 + 版本 + 退款。 */
export async function orderDetail(tx: Tx, actor: Actor, id: string) {
  await platformAdmin(tx, actor, 'view.orders');
  const orderId = parseId(id);
  const [order] = await tx`
    select o.*, g.name as organization from service_orders o
    join organizations g on g.id = o.org_id where o.id = ${orderId}
  `;
  if (!order) throw new AppError('NOT_FOUND', 404);
  const payments = await tx`
    select 'attempt' as kind, a.id, a.provider, a.status, a.amount_minor, a.external_ref, a.created_at
    from payment_attempts a where a.order_id = ${orderId}
    union all
    select 'event' as kind, e.id, e.provider, 'VERIFIED' as status, null::int as amount_minor,
           e.event_id as external_ref, e.processed_at as created_at
    from payment_events e where e.order_id = ${orderId}
    order by created_at desc
  `;
  const [entitlement] = await tx`
    select remaining_revisions, max_products, max_posters, expires_at, revoked
    from project_entitlements where order_id = ${orderId}
  `;
  const [project] = await tx`
    select id, status, publish_slug, fact_version, published_revision, created_at
    from projects where service_order_id = ${orderId}
  `;
  const versions = project
    ? await tx`
        select revision, status, fact_version, created_at, approved_by
        from artifact_versions where project_id = ${project.id} order by revision desc limit 20
      `
    : [];
  const runs = project
    ? await tx`
        select id, role, status, attempt, error_class, usage, created_at, completed_at
        from agent_runs where project_id = ${project.id} order by created_at desc limit 30
      `
    : [];
  const refunds = await tx`
    select id, amount_minor, status, provider_ref, created_at, confirmed_at from refunds
    where order_id = ${orderId} order by created_at desc
  `;
  const changes = project
    ? await tx`
        select id, base_revision, target, status, instruction, created_at
        from change_requests where project_id = ${project.id} order by created_at desc limit 20
      `
    : [];
  return { order, entitlement: entitlement ?? null, payments, project: project ?? null, versions, runs, refunds, changes };
}

/**
 * 审批队列：全部来自真实业务表，不引入新的状态机。
 * 类型：支付核验 / 退款审批 / 制作放行 / 作品审核 / 任务失败
 */
export async function approvals(tx: Tx, actor: Actor) {
  await platformAdmin(tx, actor, 'view.approvals');
  const payments = await tx`
    select a.id, a.order_id, a.amount_minor, a.created_at, o.order_no, g.name as organization,
           o.plan_snapshot->>'name' as plan_name, r.details as customer_report
    from payment_attempts a
    join service_orders o on o.id = a.order_id
    join organizations g on g.id = o.org_id
    left join lateral (select details from manual_payment_reports where attempt_id = a.id order by created_at desc limit 1) r on true
    where a.provider = 'manual_verified' and a.status = 'PENDING' and o.pay_state = 'PENDING_CONFIRMATION'
    order by a.created_at desc limit 50
  `;
  const refunds = await tx`
    select r.id, r.order_id, r.amount_minor, r.created_at, r.status, o.order_no,
           g.name as organization, o.plan_snapshot->>'name' as plan_name
    from refunds r
    join service_orders o on o.id = r.order_id
    join organizations g on g.id = o.org_id
    where r.status = 'REQUESTED' order by r.created_at desc limit 50
  `;
  const releases = await tx`
    select o.id as order_id, o.order_no, o.amount_minor, o.created_at, g.name as organization,
           o.plan_snapshot->>'name' as plan_name
    from service_orders o
    join organizations g on g.id = o.org_id
    where o.pay_state = 'PAID' and not exists (select 1 from projects p where p.service_order_id = o.id)
    order by o.created_at desc limit 50
  `;
  const reviews = await tx`
    select p.id as project_id, p.fact_version, o.order_no, o.id as order_id, g.name as organization,
           p.created_at
    from projects p
    join service_orders o on o.id = p.service_order_id
    join organizations g on g.id = p.org_id
    where p.status = 'QA_REVIEW' order by p.created_at desc limit 50
  `;
  const failures = await tx`
    select r.id, r.project_id, r.role, r.error_class, r.created_at, r.usage, p.publish_slug
    from agent_runs r left join projects p on p.id = r.project_id
    where r.status = 'FAILED' order by r.created_at desc limit 20
  `;

  const items = [
    ...payments.map((row) => ({
      id: `pay:${row.id}`,
      kind: 'payment_review' as const,
      orderId: row.order_id,
      orderNo: row.order_no,
      projectId: null,
      organization: row.organization,
      amountMinor: row.amount_minor,
      submittedAt: row.created_at,
      status: 'pending' as const,
      reason: row.customer_report ?? '客户已提交付款说明，待核对真实入账',
      evidence: row.plan_name,
    })),
    ...refunds.map((row) => ({
      id: `refund:${row.id}`,
      kind: 'refund_review' as const,
      orderId: row.order_id,
      orderNo: row.order_no,
      projectId: null,
      organization: row.organization,
      amountMinor: row.amount_minor,
      submittedAt: row.created_at,
      status: 'pending' as const,
      reason: '客户申请退款',
      evidence: row.plan_name,
    })),
    ...releases.map((row) => ({
      id: `release:${row.order_id}`,
      kind: 'production_release' as const,
      orderId: row.order_id,
      orderNo: row.order_no,
      projectId: null,
      organization: row.organization,
      amountMinor: row.amount_minor,
      submittedAt: row.created_at,
      status: 'pending' as const,
      reason: '已确认付款，客户尚未开始制作',
      evidence: row.plan_name,
    })),
    ...reviews.map((row) => ({
      id: `review:${row.project_id}`,
      kind: 'work_review' as const,
      orderId: row.order_id,
      orderNo: row.order_no,
      projectId: row.project_id,
      organization: row.organization,
      amountMinor: null,
      submittedAt: row.created_at,
      status: 'pending' as const,
      reason: `资料版本 ${row.fact_version} 的作品待审核`,
      evidence: null,
    })),
    ...failures.map((row) => ({
      id: `agent:${row.id}`,
      kind: 'agent_failure' as const,
      orderId: null,
      orderNo: null,
      projectId: row.project_id,
      organization: null,
      amountMinor: null,
      submittedAt: row.created_at,
      status: 'pending' as const,
      reason: `${row.role} 任务失败：${row.error_class ?? '未知错误'}`,
      evidence: row.publish_slug,
    })),
  ].sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));

  return items;
}

export interface RunQuery extends Page {
  status?: string;
  role?: string;
}

/** AI 员工运行记录（跨租户只读）。 */
export async function agentRuns(tx: Tx, actor: Actor, query: RunQuery) {
  await platformAdmin(tx, actor, 'view.agents');
  const rows = await tx`
    select r.id, r.role,r.employee_key,r.stage, r.status, r.project_id, r.error_class, r.created_at, r.completed_at,
           r.usage, r.attempt, p.publish_slug, o.plan_snapshot->>'name' as plan_name
    from agent_runs r
    left join projects p on p.id = r.project_id
    left join service_orders o on o.id = p.service_order_id
    where true
      ${query.status ? tx`and r.status = ${query.status}` : tx``}
      ${query.role ? tx`and r.role = ${query.role}` : tx``}
    order by r.created_at desc
    limit ${query.pageSize} offset ${offset(query)}
  `;
  const [count] = await tx`
    select count(*)::int as total from agent_runs r
    where true
      ${query.status ? tx`and r.status = ${query.status}` : tx``}
      ${query.role ? tx`and r.role = ${query.role}` : tx``}
  `;
  return {
    items: rows.map((run) => ({
      id: run.id,
      role: run.role,
      employeeKey: run.employee_key,
      stage: run.stage,
      status: run.status,
      projectId: run.project_id,
      projectName: run.publish_slug ?? null,
      startedAt: run.created_at,
      completedAt: run.completed_at,
      model: null,
      tokens: run.usage?.total_tokens ?? null,
      costMinor: null,
      errorSummary: run.error_class,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: count.total,
    hasNextPage: offset(query) + rows.length < count.total,
  };
}

/** 作品审核队列：取项目最近一个已渲染版本。 */
export async function workReviews(tx: Tx, actor: Actor, query: Page) {
  await platformAdmin(tx, actor, 'view.reviews');
  const rows = await tx`
    select p.id as project_id, p.publish_slug, p.status as project_status, g.name as organization,
           v.revision, v.status as version_status, v.body, v.created_at
    from projects p
    join organizations g on g.id = p.org_id
    join lateral (
      select revision, status, body, created_at from artifact_versions
      where project_id = p.id order by revision desc limit 1
    ) v on true
    where p.status in ('QA_REVIEW','PUBLISHED','DELIVERED','ACCEPTED')
    order by v.created_at desc
    limit ${query.pageSize} offset ${offset(query)}
  `;
  const [count] = await tx`
    select count(*)::int as total from projects p
    where p.status in ('QA_REVIEW','PUBLISHED','DELIVERED','ACCEPTED')
  `;
  const base = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '';
  return {
    items: rows.map((row) => {
      const body = row.body ?? {};
      const poster = body.posters?.[0] ?? {};
      const copy = body.copy?.[0] ?? {};
      return {
        id: row.project_id,
        projectId: row.project_id,
        organization: row.organization,
        siteUrl: base && row.publish_slug ? `${base}/p/${row.publish_slug}` : null,
        posterUrl: null,
        posterWidth: poster.canvas?.width ?? null,
        posterHeight: poster.canvas?.height ?? null,
        qrTarget: poster.qr?.url ?? null,
        copyTitle: copy.title ?? null,
        copyBody: copy.body ?? null,
        hashtags: copy.hashtags ?? [],
        productName: poster.productName ?? body.site?.pages?.[0]?.title ?? null,
        price: poster.price ?? null,
        revision: row.revision,
        qaResult: row.version_status,
        clientConfirmed: ['PUBLISHED','DELIVERED','ACCEPTED'].includes(row.project_status),
      };
    }),
    page: query.page,
    pageSize: query.pageSize,
    total: count.total,
    hasNextPage: offset(query) + rows.length < count.total,
  };
}

/** 客户列表：按组织聚合，邮箱取自 Auth，做脱敏由前端负责。 */
export async function customers(tx: Tx, actor: Actor, query: Page & { keyword?: string }) {
  await platformAdmin(tx, actor, 'view.customers');
  const like = query.keyword ? `%${query.keyword}%` : null;
  const rows = await tx`
    select g.id, g.name, g.owner_user_id,
           (select count(*) from service_orders o where o.org_id = g.id)::int as order_count,
           (select count(*) from projects p where p.org_id = g.id)::int as project_count,
           (select min(o.created_at) from service_orders o where o.org_id = g.id) as first_order_at,
           (select max(o.created_at) from service_orders o where o.org_id = g.id) as last_order_at
    from organizations g
    where true ${like ? tx`and g.name ilike ${like}` : tx``}
    order by first_order_at desc nulls last
    limit ${query.pageSize} offset ${offset(query)}
  `;
  const [count] = await tx`
    select count(*)::int as total from organizations g
    where true ${like ? tx`and g.name ilike ${like}` : tx``}
  `;
  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: null,
      orderCount: row.order_count,
      projectCount: row.project_count,
      currentProject: null,
      createdAt: row.first_order_at,
      lastOrderAt: row.last_order_at,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: count.total,
    hasNextPage: offset(query) + rows.length < count.total,
  };
}

/** 审计日志：表不存在时返回空并标记，而不是 500。 */
export async function auditLogs(tx: Tx, actor: Actor, query: Page) {
  await platformAdmin(tx, actor, 'view.audit');
  const [exists] = await tx`select to_regclass('public.admin_audit_logs') as table`;
  if (!exists?.table) return { items: [], page: query.page, pageSize: query.pageSize, total: 0, hasNextPage: false, tableExists: false };
  const rows = await tx`
    select id, actor_email, action, target, result, reason, created_at
    from admin_audit_logs order by created_at desc
    limit ${query.pageSize} offset ${offset(query)}
  `;
  const [count] = await tx`select count(*)::int as total from admin_audit_logs`;
  return {
    items: rows.map((row) => ({
      id: row.id,
      actor: row.actor_email ?? '—',
      at: row.created_at,
      target: row.target,
      action: row.action,
      result: row.result,
      reason: row.reason,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total: count.total,
    hasNextPage: offset(query) + rows.length < count.total,
    tableExists: true,
  };
}

/** A fresh process heartbeat is separate from a task lease; status is evaluated on the server. */
export async function workerHealth(tx:Tx,actor:Actor){
 await platformAdmin(tx,actor,'view.agents');
 return tx`select id,version,started_at,last_seen_at,stopped_at,current_run_id,
 case when stopped_at is not null then 'stopped' when last_seen_at<now()-interval '45 seconds' then 'offline' else 'online' end as status
 from worker_instances order by started_at desc limit 50`;
}
