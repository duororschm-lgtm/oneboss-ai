/**
 * 管理员能力矩阵。
 *
 * 重要限制：后端 `platform_admins` 目前只有 `user_id` 一列（见
 * supabase/migrations/202611060001_core.sql），**没有角色字段**。
 * 因此这里只能做到「平台管理员 / 非管理员」的二分：
 * - 是管理员 → 按 owner 全量能力渲染；
 * - 不是     → 一律无权。
 *
 * 角色化能力（finance 只能看财务、reviewer 只能审作品）已列入缺口 A-07，
 * 在后端补上前，任何"按角色隐藏按钮"的说法都不成立。
 * 隐藏按钮不等于安全：服务端必须自行校验（任务书 §3）。
 */

export type AdminRole = 'owner' | 'finance' | 'operations' | 'reviewer' | 'unknown';

export type Capability =
  | 'view.dashboard'
  | 'view.orders'
  | 'view.finance'
  | 'view.approvals'
  | 'view.agents'
  | 'view.reviews'
  | 'view.customers'
  | 'view.plans'
  | 'view.audit'
  | 'act.payment'
  | 'act.refund'
  | 'act.release'
  | 'act.review';

const MATRIX: Record<AdminRole, Capability[]> = {
  owner: [
    'view.dashboard',
    'view.orders',
    'view.finance',
    'view.approvals',
    'view.agents',
    'view.reviews',
    'view.customers',
    'view.plans',
    'view.audit',
    'act.payment',
    'act.refund',
    'act.release',
    'act.review',
  ],
  finance: ['view.dashboard', 'view.orders', 'view.finance', 'view.approvals', 'act.payment', 'act.refund'],
  operations: ['view.dashboard', 'view.orders', 'view.approvals', 'view.agents', 'act.release'],
  reviewer: ['view.dashboard', 'view.reviews', 'view.orders', 'act.review'],
  unknown: [],
};

/** 后端补齐 A-07 之前，只能由 isAdmin 布尔推导角色。 */
export const resolveRole = (isAdmin: boolean): AdminRole => (isAdmin ? 'owner' : 'unknown');

export const capabilitiesFor = (role: AdminRole): ReadonlySet<Capability> =>
  new Set(MATRIX[role] ?? []);

export const can = (role: AdminRole, capability: Capability) =>
  (MATRIX[role] ?? []).includes(capability);

export const ROLE_LABEL: Record<AdminRole, string> = {
  owner: '超级管理员',
  finance: '财务管理员',
  operations: '运营管理员',
  reviewer: '内容审核员',
  unknown: '无权限',
};
