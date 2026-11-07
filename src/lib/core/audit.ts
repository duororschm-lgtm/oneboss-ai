/**
 * 管理员敏感操作的审计落库。
 *
 * 设计约束：
 * - 必须"尽力而为"：审计失败不能回滚已经完成的业务动作（收款/退款是资金操作）；
 * - 在同一个事务里，失败的语句会中止整个事务，所以先检查表是否存在再写；
 * - 只记录管理员动作，不记录客户输入。
 */
import type { Actor, Tx } from './db';

export interface AuditEntry {
  action: string;
  target: string;
  result: 'success' | 'failure';
  reason?: string | null;
  details?: Record<string, unknown>;
}

export async function recordAudit(tx: Tx, actor: Actor, entry: AuditEntry) {
  try {
    const [table] = await tx`select to_regclass('public.admin_audit_logs') as name`;
    if (!table?.name) return false;
    await tx`
      insert into admin_audit_logs(actor_user_id, action, target, result, reason, details)
      values(${actor.userId}, ${entry.action}, ${entry.target}, ${entry.result},
             ${entry.reason ?? null}, ${tx.json((entry.details ?? {}) as never)})
    `;
    return true;
  } catch {
    // 审计不可用时不影响业务结果；运维可通过表存在性判断是否漏记。
    return false;
  }
}
