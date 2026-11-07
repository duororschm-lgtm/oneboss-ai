import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { database, transaction, type Tx, type Actor } from './db';
import { assert, AppError } from './errors';
import { recordAudit } from './audit';
import { Brief, ChangeRequest, Fact, Id, Money } from '../../contracts';
export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export async function member(tx: Tx, actor: Actor, orgId: string, admin = false) {
  const [m] =
    await tx`select role from memberships where org_id=${orgId} and user_id=${actor.userId}`;
  assert(m && (!admin || ['admin', 'owner'].includes(m.role)), 'FORBIDDEN', 403);
}
export async function project(tx: Tx, actor: Actor, id: string) {
  const [p] = await tx`select * from projects where id=${Id.parse(id)} for update`;
  assert(p, 'NOT_FOUND', 404);
  await member(tx, actor, p.org_id);
  return p;
}
export async function entitlement(tx: Tx, p: Record<string, any>) {
  const [e] =
    await tx`select e.*,o.pay_state from project_entitlements e join service_orders o on o.id=e.order_id where e.order_id=${p.service_order_id} for update of e`;
  assert(
    e && !e.revoked && e.pay_state === 'PAID' && new Date(e.expires_at).getTime() > Date.now(),
    'ENTITLEMENT_REQUIRED',
    403,
  );
  return e;
}
export async function facts(tx: Tx, p: Record<string, any>) {
  const rows =
    await tx`select * from product_facts where project_id=${p.id} and version=${p.fact_version}`;
  return rows.map((f) => ({
    id: f.id,
    productId: f.product_id,
    key: f.key,
    value: f.value,
    source: f.source,
    verified: f.verified,
    version: f.version,
  }));
}
export async function idempotent(
  actor: Actor,
  key: string,
  route: string,
  body: unknown,
  orgId: string,
  fn: (tx: Tx) => Promise<unknown>,
  access: 'member' | 'platform' = 'member',
) {
  assert(/^[a-zA-Z0-9_-]{8,100}$/.test(key), 'IDEMPOTENCY_KEY_REQUIRED');
  return transaction(actor, async (tx) => {
    if (access === 'platform') await platformAdmin(tx, actor);
    else await member(tx, actor, orgId);
    // Serialize across requests/processes before reading the cached response.
    await tx`select pg_advisory_xact_lock(hashtextextended(${actor.userId + ':' + key},0))`;
    const digest = hash(JSON.stringify(body));
    const [old] =
      await tx`select * from api_idempotency where user_id=${actor.userId} and key=${key}`;
    if (old) {
      assert(old.route === route && old.request_hash === digest, 'IDEMPOTENCY_CONFLICT', 409);
      return old.response;
    }
    const result = await fn(tx);
    await tx`insert into api_idempotency(org_id,user_id,key,route,request_hash,response) values(${orgId},${actor.userId},${key},${route},${digest},${tx.json(result as any)})`;
    return result;
  });
}
export async function rateLimit(actor: Actor) {
  const bucket = Math.floor(Date.now() / 60000);
  const [r] =
    await database()`insert into rate_limits(user_id,bucket,count) values(${actor.userId},${bucket},1) on conflict(user_id,bucket) do update set count=rate_limits.count+1 returning count`;
  assert(r.count <= 60, 'RATE_LIMITED', 429);
}
export async function createOrganization(actor: Actor, name: string) {
  return transaction(actor, async (tx) => {
    const [o] =
      await tx`insert into organizations(name,owner_user_id) values(${z.string().min(1).max(100).parse(name)},${actor.userId}) returning *`;
    await tx`insert into memberships(org_id,user_id,role) values(${o.id},${actor.userId},'owner')`;
    return o;
  });
}
export async function createQuote(
  tx: Tx,
  orgId: string,
  planCode: string,
  addons: { code: string; qty: number }[] = [],
) {
  const [plan] = await tx`select * from service_plans where code=${planCode} and is_active`;
  assert(plan, 'PLAN_UNAVAILABLE');
  assert(
    addons.length <= 10 && new Set(addons.map((a) => a.code)).size === addons.length,
    'INVALID_ADDONS',
  );
  const items: {
    code: string;
    name: string;
    qty: number;
    unit_minor: number;
    total_minor: number;
  }[] = [];
  let total = plan.price_minor;
  for (const requested of addons) {
    assert(
      Number.isInteger(requested.qty) && requested.qty >= 1 && requested.qty <= 10,
      'INVALID_ADDON_QUANTITY',
    );
    const [addon] =
      await tx`select * from service_addons where code=${requested.code} and is_active`;
    assert(addon, 'ADDON_UNAVAILABLE');
    const amount = addon.price_minor * requested.qty;
    total += amount;
    items.push({
      code: addon.code,
      name: addon.name,
      qty: requested.qty,
      unit_minor: addon.price_minor,
      total_minor: amount,
    });
    const field = (
      {
        max_products: 'product_limit',
        max_posters: 'poster_count',
        remaining_revisions: 'revision_rounds',
      } as Record<string, string>
    )[addon.entitlement];
    plan[field] += requested.qty;
  }
  assert(
    plan.product_limit <= 20 && plan.poster_count <= 20 && plan.revision_rounds <= 20,
    'PLAN_LIMIT',
  );
  Money.parse(total);
  const snapshot = { ...plan, addons: items };
  const [q] =
    await tx`insert into quotes(org_id,plan_code,amount_minor,currency,plan_snapshot) values(${orgId},${plan.code},${total},${plan.currency},${tx.json(snapshot)}) returning *`;
  return q;
}
export async function createOrder(tx: Tx, orgId: string, quoteId: string, isDemo: boolean) {
  const [q] =
    await tx`select * from quotes where id=${Id.parse(quoteId)} and org_id=${orgId} and expires_at>now() for update`;
  assert(q, 'QUOTE_EXPIRED_OR_MISSING');
  const [o] =
    await tx`insert into service_orders(org_id,quote_id,amount_minor,currency,plan_snapshot,terms_snapshot,is_demo) values(${orgId},${q.id},${q.amount_minor},${q.currency},${tx.json(q.plan_snapshot)},${tx.json({ version: '2026-11-v1', service: '宣传网站、海报与文案制作，不承诺获客', refundPolicy: '人工审核，退款申请不代表到账', revisions: q.plan_snapshot.revision_rounds, hostingDays: q.plan_snapshot.hosting_days })},${isDemo}) returning *`;
  await tx`insert into service_order_items(org_id,order_id,sku,qty,unit_minor,total_minor) values(${orgId},${o.id},${q.plan_code},1,${q.plan_snapshot.price_minor},${q.plan_snapshot.price_minor})`;
  for (const item of q.plan_snapshot.addons ?? [])
    await tx`insert into service_order_items(org_id,order_id,sku,qty,unit_minor,total_minor) values(${orgId},${o.id},${item.code},${item.qty},${item.unit_minor},${item.total_minor})`;
  return o;
}
export async function order(tx: Tx, actor: Actor, id: string) {
  const [o] = await tx`select * from service_orders where id=${Id.parse(id)} for update`;
  assert(o, 'NOT_FOUND', 404);
  await member(tx, actor, o.org_id);
  return o;
}
export async function adminOrder(tx: Tx, actor: Actor, id: string) {
  await platformAdmin(tx, actor);
  const [o] = await tx`select * from service_orders where id=${Id.parse(id)} for update`;
  assert(o, 'NOT_FOUND', 404);
  return o;
}
export async function checkout(tx: Tx, actor: Actor, id: string, channel: string) {
  const o = await order(tx, actor, id);
  assert(['UNPAID', 'PENDING_CONFIRMATION'].includes(o.pay_state), 'ORDER_NOT_PAYABLE', 409);
  assert(['sandbox', 'manual_verified'].includes(channel), 'LIVE_PROVIDER_NOT_CONFIGURED', 503);
  assert(
    channel !== 'sandbox' || (o.is_demo && process.env.ALLOW_SANDBOX === 'true'),
    'SANDBOX_DISABLED',
    403,
  );
  assert(channel !== 'manual_verified' || !o.is_demo, 'DEMO_REQUIRES_SANDBOX');
  const [existing] =
    await tx`select * from payment_attempts where order_id=${o.id} and provider=${channel} and status='PENDING' order by created_at desc limit 1`;
  const attempt =
    existing ||
    (
      await tx`insert into payment_attempts(org_id,order_id,provider,amount_minor) values(${o.org_id},${o.id},${channel},${o.amount_minor}) returning *`
    )[0];
  await tx`update service_orders set pay_state='PENDING_CONFIRMATION' where id=${o.id}`;
  return {
    attempt,
    isDemo: o.is_demo,
    instructions:
      channel === 'sandbox'
        ? '模拟支付，不产生真实收款'
        : '等待管理员核对真实入账；上传截图不能自行确认付款',
  };
}
export async function reportManualPayment(
  tx: Tx,
  actor: Actor,
  id: string,
  attemptId: string,
  details: string,
) {
  const o = await order(tx, actor, id);
  assert(!o.is_demo, 'DEMO_REQUIRES_SANDBOX');
  assert(o.pay_state === 'PENDING_CONFIRMATION', 'PAYMENT_NOT_PENDING', 409);
  const [attempt] =
    await tx`select id from payment_attempts where id=${Id.parse(attemptId)} and order_id=${o.id} and provider='manual_verified' and status='PENDING'`;
  assert(attempt, 'ATTEMPT_MISSING');
  const [report] =
    await tx`insert into manual_payment_reports(org_id,order_id,attempt_id,user_id,details) values(${o.org_id},${o.id},${attempt.id},${actor.userId},${details}) returning id,created_at`;
  return {
    reportId: report.id,
    createdAt: report.created_at,
    payState: 'PENDING_CONFIRMATION',
    instructions: '已提交付款说明，等待管理员核对真实到账；尚未确认付款。',
  };
}
export const Confirmation = z
  .object({
    attemptId: Id,
    eventId: z.string().min(8).max(150),
    amountMinor: Money,
    currency: z.literal('CNY'),
    evidenceRef: z.string().min(8).max(200),
  })
  .strict();
export async function confirmPayment(
  tx: Tx,
  actor: Actor,
  id: string,
  input: z.infer<typeof Confirmation>,
  channel: 'sandbox' | 'manual_verified',
) {
  const o =
    channel === 'manual_verified' ? await adminOrder(tx, actor, id) : await order(tx, actor, id);
  if (channel !== 'manual_verified')
    assert(o.is_demo && process.env.ALLOW_SANDBOX === 'true', 'SANDBOX_DISABLED', 403);
  assert(channel !== 'manual_verified' || !o.is_demo, 'DEMO_REQUIRES_SANDBOX');
  assert(
    input.amountMinor === o.amount_minor && input.currency === o.currency,
    'PAYMENT_AMOUNT_MISMATCH',
  );
  const [a] =
    await tx`select * from payment_attempts where id=${input.attemptId} and order_id=${o.id} and provider=${channel} for update`;
  assert(a, 'ATTEMPT_MISSING');
  const digest = hash(JSON.stringify(input));
  const [event] =
    await tx`select * from payment_events where provider=${channel} and event_id=${input.eventId}`;
  if (event) {
    assert(event.order_id === o.id && event.payload_hash === digest, 'EVENT_CONFLICT', 409);
    return { orderId: o.id, payState: o.pay_state, isDemo: o.is_demo };
  }
  assert(
    ['UNPAID', 'PENDING_CONFIRMATION', 'PAID'].includes(o.pay_state),
    'ORDER_NOT_PAYABLE',
    409,
  );
  await tx`insert into payment_events(org_id,order_id,provider,event_id,payload_hash,verified_by) values(${o.org_id},${o.id},${channel},${input.eventId},${digest},${actor.userId})`;
  await tx`update payment_attempts set status='CONFIRMED',external_ref=coalesce(external_ref,${input.evidenceRef}) where id=${a.id}`;
  await tx`update service_orders set pay_state='PAID' where id=${o.id}`;
  const plan = o.plan_snapshot;
  await tx`insert into project_entitlements(order_id,org_id,remaining_revisions,max_products,max_posters,is_demo,expires_at) values(${o.id},${o.org_id},${plan.revision_rounds},${plan.product_limit},${plan.poster_count},${o.is_demo},now()+${plan.hosting_days}*interval '1 day') on conflict(order_id) do nothing`;
  if (channel === 'manual_verified')
    await recordAudit(tx, actor, {
      action: 'confirm-manual',
      target: o.order_no,
      result: 'success',
      reason: input.evidenceRef,
      details: { amountMinor: o.amount_minor, attemptId: a.id },
    });
  return { orderId: o.id, payState: 'PAID', isDemo: o.is_demo };
}
export async function createProject(tx: Tx, actor: Actor, orderId: string) {
  const o = await order(tx, actor, orderId);
  assert(o.pay_state === 'PAID', 'PAYMENT_REQUIRED', 403);
  const [e] = await tx`select * from project_entitlements where order_id=${o.id} for update`;
  assert(e && !e.revoked, 'ENTITLEMENT_REQUIRED', 403);
  const [p] =
    await tx`insert into projects(org_id,service_order_id) values(${o.org_id},${o.id}) on conflict(service_order_id) do update set service_order_id=excluded.service_order_id returning *`;
  await tx`update project_entitlements set project_id=${p.id} where order_id=${o.id}`;
  return p;
}
export async function requestRefund(tx: Tx, actor: Actor, id: string, amount: number) {
  const o = await order(tx, actor, id);
  assert(o.pay_state === 'PAID' || o.pay_state === 'PARTIALLY_REFUNDED', 'NOT_REFUNDABLE');
  const [{ total }] =
    await tx`select coalesce(sum(amount_minor),0)::int total from refunds where order_id=${o.id} and status!='REJECTED'`;
  assert(Money.parse(amount) > 0 && total + amount <= o.amount_minor, 'REFUND_AMOUNT_INVALID');
  const [p] = await tx`select status from projects where service_order_id=${o.id}`;
  const [r] =
    await tx`insert into refunds(org_id,order_id,amount_minor,requested_by) values(${o.org_id},${o.id},${amount},${actor.userId}) returning *`;
  await tx`update service_orders set pay_state='REFUND_PENDING' where id=${o.id}`;
  await tx`update project_entitlements set revoked=true where order_id=${o.id}`;
  return { id: r.id, status: r.status, amountMinor: r.amount_minor, manualReviewRequired: !!p };
}
export async function finalizeRefund(
  tx: Tx,
  actor: Actor,
  id: string,
  refundId: string,
  reference: string,
  confirmed: boolean,
) {
  const o = await adminOrder(tx, actor, id);
  const [r] =
    await tx`select * from refunds where id=${Id.parse(refundId)} and order_id=${o.id} for update`;
  assert(r && r.status === 'REQUESTED', 'REFUND_NOT_PENDING', 409);
  assert(reference.length >= 8 && reference.length <= 200, 'EVIDENCE_REQUIRED');
  await tx`update refunds set status=${confirmed ? 'CONFIRMED' : 'REJECTED'},provider_ref=${reference},confirmed_by=${actor.userId} where id=${r.id}`;
  const [{ total }] =
    await tx`select coalesce(sum(amount_minor),0)::int total from refunds where order_id=${o.id} and status='CONFIRMED'`;
  const state = total === o.amount_minor ? 'REFUNDED' : total > 0 ? 'PARTIALLY_REFUNDED' : 'PAID';
  await tx`update service_orders set pay_state=${state} where id=${o.id}`;
  await tx`update project_entitlements set revoked=${total > 0} where order_id=${o.id}`;
  await recordAudit(tx, actor, {
    action: confirmed ? 'finalize-refund-confirm' : 'finalize-refund-reject',
    target: o.order_no,
    result: 'success',
    reason: reference,
    details: { refundId: r.id, amountMinor: r.amount_minor },
  });
  return { payState: state, refundStatus: confirmed ? 'CONFIRMED' : 'REJECTED' };
}
export const Intake = z
  .object({
    products: z
      .array(
        z.object({
          id: Id,
          name: z.string().min(1).max(150),
          description: z.string().max(2000).default(''),
        }),
      )
      .min(1)
      .max(20),
    facts: z.array(Fact).max(100),
    brief: Brief,
  })
  .strict();
export async function saveIntake(tx: Tx, actor: Actor, id: string, input: z.infer<typeof Intake>) {
  const p = await project(tx, actor, id),
    e = await entitlement(tx, p);
  assert(
    input.products.length <= e.max_products &&
      input.brief.deliverables.posterCount <= e.max_posters,
    'PLAN_LIMIT',
  );
  assert(
    input.brief.projectId === p.id && input.brief.organizationId === p.org_id,
    'PROJECT_MISMATCH',
  );
  assert(input.brief.approval === 'pending', 'APPROVAL_REQUIRES_SEPARATE_ACTION');
  const productIds = new Set(input.products.map((x) => x.id));
  assert(productIds.size === input.products.length, 'DUPLICATE_PRODUCT');
  assert(new Set(input.facts.map((x) => x.id)).size === input.facts.length, 'DUPLICATE_FACT');
  assert(
    input.brief.productIds.every((x) => productIds.has(x)),
    'INVALID_PRODUCT_REF',
  );
  for (const item of input.products) {
    const [existing] = await tx`select project_id from products where id=${item.id}`;
    assert(!existing || existing.project_id === p.id, 'PRODUCT_CONFLICT', 409);
    await tx`insert into products(id,org_id,project_id,name,description) values(${item.id},${p.org_id},${p.id},${item.name},${item.description}) on conflict(id) do update set name=excluded.name,description=excluded.description`;
  }
  // Facts are immutable by version; customer-confirmed replacement creates a new complete snapshot.
  const [{ n }] = await tx`select count(*)::int n from creative_briefs where project_id=${p.id}`;
  const version = n ? p.fact_version + 1 : p.fact_version;
  const refs = new Set<string>();
  for (const f of input.facts) {
    assert(productIds.has(f.productId), 'INVALID_PRODUCT_REF');
    assert(
      f.source !== 'image_inferred' || !f.verified,
      'INFERRED_FACT_REQUIRES_CUSTOMER_CONFIRMATION',
    );
    const factId = randomUUID();
    refs.add(f.id);
    await tx`insert into product_facts(id,org_id,project_id,product_id,key,value,source,verified,version,confirmed_by) values(${factId},${p.org_id},${p.id},${f.productId},${f.key},${tx.json(f.value)},${f.source},${f.verified},${version},${f.verified ? actor.userId : null})`;
  }
  assert(
    input.brief.confirmedFacts.every((x) => refs.has(x)),
    'INVALID_FACT_REF',
  );
  const [assets] =
    await tx`select count(*)::int n from media_assets where project_id=${p.id} and id=any(${input.brief.assetRefs}::uuid[]) and license_status='customer_authorized'`;
  assert(assets.n === input.brief.assetRefs.length, 'INVALID_ASSET_REF');
  const storedFacts = await facts(tx, { ...p, fact_version: version });
  const brief = {
    ...input.brief,
    confirmedFacts: storedFacts.filter((x) => x.verified).map((x) => x.id),
  };
  const [{ revision }] =
    await tx`select coalesce(max(revision),0)+1 revision from creative_briefs where project_id=${p.id}`;
  const [b] =
    await tx`insert into creative_briefs(org_id,project_id,revision,body) values(${p.org_id},${p.id},${revision},${tx.json(brief)}) returning *`;
  await tx`update projects set fact_version=${version},status='BRIEF_APPROVAL' where id=${p.id}`;
  return { brief: b, facts: storedFacts, publishReady: storedFacts.every((x) => x.verified) };
}
export async function approveBrief(tx: Tx, actor: Actor, id: string, revision: number) {
  const p = await project(tx, actor, id);
  await entitlement(tx, p);
  const [b] =
    await tx`select * from creative_briefs where project_id=${p.id} order by revision desc limit 1`;
  assert(b && b.revision === revision, 'STALE_BRIEF', 409);
  await tx`update creative_briefs set approved_at=now(),body=jsonb_set(body,'{approval}','"approved"') where id=${b.id}`;
  await tx`update projects set status='DESIGN_APPROVAL' where id=${p.id}`;
  return { approved: true, revision };
}
export async function enqueue(
  tx: Tx,
  actor: Actor,
  id: string,
  role: string,
  input: Record<string, any>,
) {
  const p = await project(tx, actor, id);
  await entitlement(tx, p);
  const [{ spent }] = await tx`select count(*)::int spent from agent_runs where project_id=${p.id}`;
  assert(spent < 100, 'PROJECT_RUN_BUDGET_EXCEEDED', 429);
  const [r] =
    await tx`insert into agent_runs(org_id,project_id,role,input) values(${p.org_id},${p.id},${role},${tx.json({ ...input, factVersion: p.fact_version })}) returning id,status`;
  return r;
}
export async function requestChange(
  tx: Tx,
  actor: Actor,
  id: string,
  input: z.infer<typeof ChangeRequest>,
) {
  const p = await project(tx, actor, id),
    e = await entitlement(tx, p);
  assert(e.remaining_revisions > 0, 'NO_REVISIONS_LEFT', 403);
  const [base] =
    await tx`select * from artifact_versions where project_id=${p.id} and revision=${input.baseRevision}`;
  assert(
    base && ['APPROVED', 'PUBLISHED'].includes(base.status) && base.fact_version === p.fact_version,
    'INVALID_BASE_REVISION',
    409,
  );
  const [{ latest }] =
    await tx`select max(revision) latest from artifact_versions where project_id=${p.id} and status in ('APPROVED','PUBLISHED')`;
  assert(latest === input.baseRevision, 'STALE_REVISION', 409);
  const [c] =
    await tx`insert into change_requests(org_id,project_id,base_revision,instruction,target) values(${p.org_id},${p.id},${input.baseRevision},${input.instruction},${input.targetArtifacts}) returning *`;
  await tx`update project_entitlements set remaining_revisions=remaining_revisions-1 where order_id=${p.service_order_id}`;
  return enqueue(tx, actor, id, 'change', { changeId: c.id });
}

export async function platformAdmin(tx: Tx, actor: Actor) {
  const [a] = await tx`select user_id from platform_admins where user_id=${actor.userId}`;
  assert(a, 'PLATFORM_ADMIN_REQUIRED', 403);
}
