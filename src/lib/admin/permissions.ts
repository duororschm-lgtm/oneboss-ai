/** Server-enforced role capabilities, shared by navigation and action buttons. */
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
export const resolveRole = (isAdmin: boolean, role?: AdminRole): AdminRole => (isAdmin ? role ?? 'owner' : 'unknown');

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
