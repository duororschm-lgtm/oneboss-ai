import type { Actor, Tx } from './db';
import { member, project, platformAdmin } from './service';

/** Every query is tenant scoped; never derive access from a browser-selected organization. */
export async function accountWorkspace(tx: Tx, actor: Actor) {
  const organizations =
    await tx`select o.id,o.name,m.role from organizations o join memberships m on m.org_id=o.id where m.user_id=${actor.userId} order by o.id`;
  const ids = organizations.map((o) => o.id);
  return {
    isAdmin: !!(await tx`select user_id from platform_admins where user_id=${actor.userId}`)[0],
    organizations,
    orders:
      await tx`select o.*,p.id as project_id,p.status as work_state from service_orders o left join projects p on p.service_order_id=o.id where o.org_id=any(${ids}::uuid[]) order by o.created_at desc limit 100`,
    projects:
      await tx`select p.*,o.is_demo,o.plan_snapshot from projects p join service_orders o on o.id=p.service_order_id where p.org_id=any(${ids}::uuid[]) order by o.created_at desc limit 100`,
  };
}
export async function adminWorkspace(tx: Tx, actor: Actor) {
  await platformAdmin(tx, actor);
  return {
    orders:
      await tx`select o.id,o.order_no,o.org_id,o.pay_state,o.amount_minor,o.is_demo,o.created_at,o.plan_snapshot->>'name' as plan_name,g.name as organization from service_orders o join organizations g on g.id=o.org_id order by o.created_at desc limit 100`,
    refunds:
      await tx`select r.id,r.order_id,r.amount_minor,r.status,r.created_at,r.provider_ref,o.order_no,o.plan_snapshot->>'name' as plan_name from refunds r join service_orders o on o.id=r.order_id order by r.created_at desc limit 100`,
    manualAttempts:
      await tx`select a.id,a.order_id,a.amount_minor,a.created_at,o.order_no,o.plan_snapshot->>'name' as plan_name,left(o.id::text,8) as payment_memo,r.details as customer_report,r.created_at as reported_at from payment_attempts a join service_orders o on o.id=a.order_id left join lateral(select details,created_at from manual_payment_reports where attempt_id=a.id order by created_at desc limit 1) r on true where a.provider='manual_verified' and a.status='PENDING' and o.pay_state='PENDING_CONFIRMATION' order by a.created_at desc limit 100`,
  };
}

export async function projectWorkspace(tx: Tx, actor: Actor, id: string) {
  const p = await project(tx, actor, id);
  await member(tx, actor, p.org_id);
  const [order] =
    await tx`select id,order_no,is_demo,pay_state,plan_snapshot from service_orders where id=${p.service_order_id} and org_id=${p.org_id}`;
  const [entitlement] =
    await tx`select remaining_revisions,max_products,max_posters,is_demo,revoked,expires_at from project_entitlements where project_id=${p.id}`;
  const briefs =
    await tx`select revision,body,approved_at from creative_briefs where project_id=${p.id} order by revision desc limit 20`;
  const productIds = briefs[0]?.body.productIds as string[] | undefined;
  return {
    project: p,
    order,
    entitlement,
    products: (
      await tx`select id,name,description from products where project_id=${p.id} order by id`
    ).filter((product) => !productIds || productIds.includes(product.id)),
    facts:
      await tx`select id,product_id as "productId",key,value,source,verified,version from product_facts where project_id=${p.id} and version=${p.fact_version} order by key`,
    assets:
      await tx`select id,width,height,license_status,is_concept from media_assets where project_id=${p.id} order by id`,
    briefs,
    designs:
      await tx`select revision,body,approved_at from design_systems where project_id=${p.id} order by revision desc limit 20`,
    versions:
      await tx`select revision,fact_version,status,body,approved_by,created_at from artifact_versions where project_id=${p.id} order by revision desc limit 30`,
    runs: await tx`select id,role,status,attempt,error_class,usage,output,created_at,completed_at,(input->>'factVersion')::int as "factVersion" from agent_runs where project_id=${p.id} order by created_at desc limit 100`,
  };
}
